"""Fit the waist and ankle transitions, and slim the heavy arm silhouette.
Edits only customer six's body. Original head mesh data stays unchanged.
"""
import bpy,bmesh,math,json
from mathutils import Vector
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
def smooth(x):x=max(0,min(1,x));return x*x*(3-2*x)
def apply(body,arm,folder):
 if body.get('joint_fit_v5'):return
 counts={'armVertices':0,'waistVertices':0,'ankleVertices':0}
 groups={g.index:g.name for g in body.vertex_groups};hips=arm.data.bones['Hips'].head_local.z
 def set_weights(v,weights):
  for g in list(v.groups):body.vertex_groups[g.group].remove([v.index])
  for name,w in weights.items():
   if w>1e-8:(body.vertex_groups.get(name) or body.vertex_groups.new(name=name)).add([v.index],w,'REPLACE')
 for v in body.data.vertices:
  ws={groups[g.group]:g.weight for g in v.groups}
  # Preserve hands and torso. Shape the sleeve/arm envelope progressively.
  for side in ['Left','Right']:
   influence=ws.get(side+'Arm',0)+ws.get(side+'ForeArm',0)
   if influence<.15:continue
   s=arm.data.bones[side+'Arm'].head_local;e=arm.data.bones[side+'ForeArm'].head_local;w=arm.data.bones[side+'Hand'].head_local
   axis=e-s;t=(v.co-s).dot(axis)/axis.length_squared
   if t<=1:center=s+axis*t
   else:
    axis=w-e;u=(v.co-e).dot(axis)/axis.length_squared;t=1+u;center=e+axis*u
   strength=smooth((influence-.15)/.65)*smooth((t-.02)/.22)*(1-smooth((t-1.62)/.36))
   if strength>0:
    v.co=center+(v.co-center)*(1-.22*strength);counts['armVertices']+=1
  # Both sides of the waist boundary follow the pelvis, rather than opposing
  # upper-leg and spine rotations. Fade back to anatomical binding outside it.
  z=v.co.z;band=smooth((z-(hips-8))/5)*(1-smooth((z-(hips+4))/7))
  if band>0 and abs(v.co.x)<20:
   replacement={n:w*(1-band) for n,w in ws.items()};replacement['Hips']=replacement.get('Hips',0)+band
   set_weights(v,replacement);counts['waistVertices']+=1
  # The trouser hem and boot collar share a continuous ankle transition.
  for side in ['Left','Right']:
   if ws.get(side+'Leg',0)+ws.get(side+'Foot',0)+ws.get(side+'ToeBase',0)<.55:continue
   a=arm.data.bones[side+'Foot'].head_local;toe=arm.data.bones[side+'ToeBase'].head_local;forward=toe-a;forward.z=0;forward.normalize();along=(v.co-a).dot(forward)
   h=v.co.z-a.z
   if -1<h<13 and along<6:
    foot=1-smooth((h+1)/12);band=smooth((h+1)/2)*(1-smooth((h-10)/3));target={side+'Leg':1-foot,side+'Foot':foot};replacement={n:w*(1-band) for n,w in ws.items()}
    for n,w in target.items():replacement[n]=replacement.get(n,0)+w*band
    set_weights(v,replacement);counts['ankleVertices']+=1
 # A fitted undershirt waist fills the shadowed opening under the vest.
 # Fit the hem to the measured lower-waist contour; keep it under the leather.
 from mathutils.bvhtree import BVHTree
 bvh=BVHTree.FromPolygons([v.co for v in body.data.vertices],[list(p.vertices) for p in body.data.polygons if abs(p.center.x)<21 and p.center.z>65])
 center=arm.data.bones['Hips'].head_local.copy();sample_z=hips-6;N=64;profile=[]
 for i in range(N):
  angle=i*math.tau/N;direction=Vector((math.cos(angle),math.sin(angle),0));origin=Vector((center.x,center.y,sample_z))+direction*60
  hit,normal,face,d=bvh.ray_cast(origin,-direction,100)
  if hit is None:raise RuntimeError('Waist garment contour misses body')
  radial=Vector((hit.x-center.x,hit.y-center.y,0));profile.append(radial-direction*.12)
 verts=[];faces=[];weights=[]
 for z in [hips-5,hips-2,hips+1,hips+4,hips+7]:
  for i,radial in enumerate(profile):
   taper=1-.03*max(0,(z-hips)/7);verts.append(Vector((center.x,center.y,z))+radial*taper);weights.append({'Hips':1})
 for j in range(4):
  for i in range(N):faces.append((j*N+i,j*N+(i+1)%N,(j+1)*N+(i+1)%N,(j+1)*N+i))
 me=bpy.data.meshes.new('Customer 06 tucked undershirt waist');me.from_pydata(verts,[],faces);me.update();o=bpy.data.objects.new(me.name,me);bpy.data.collections['Casual outfit'].objects.link(o);o.parent=arm;o.matrix_world=body.matrix_world.copy()
 material=bpy.data.materials.new('Customer 06 tucked maroon cotton');material.use_nodes=True;bs=material.node_tree.nodes['Principled BSDF'];bs.inputs['Base Color'].default_value=(.16,.027,.042,1);bs.inputs['Roughness'].default_value=.9;bs.inputs['Specular IOR Level'].default_value=.12;me.materials.append(material)
 o.vertex_groups.new(name='Hips');o.vertex_groups['Hips'].add(list(range(len(verts))),1,'REPLACE');mod=o.modifiers.new('Shared waist skin','ARMATURE');mod.object=arm;mod=o.modifiers.new('Cotton hem thickness','SOLIDIFY');mod.thickness=.12
 for poly in me.polygons:poly.use_smooth=True
 body.data.update();body['joint_fit_v5']=True
 for v in body.data.vertices:
  total=sum(g.weight for g in v.groups)
  for g in list(v.groups):body.vertex_groups[g.group].add([v.index],g.weight/total,'REPLACE')
 # Refresh tattoo placement and weights after arm fitting.
 import runpy
 runpy.run_path(str(ROOT/'tools/models/customer-six-tattoo.py'))['apply'](body,arm,folder)
 (folder/'joint-fit.json').write_text(json.dumps({'version':5,**counts,'armRadiusReductionMaximum':.22,'waist':'shared pelvis envelope through shirt/waistband transition','ankle':'shared calf-foot envelope through trouser hem and boot collar','headUnmodified':True},indent=2)+'\n')
if __name__=='__main__':
 folder=ROOT/'tools/models/cast/customer-06';bpy.ops.wm.open_mainfile(filepath=str(folder/'character.blend'));a=bpy.data.objects['Armature'];body=bpy.data.objects['customer-06 body']
 for o in [a,a.parent]:o.animation_data_clear()
 from mathutils import Matrix
 for b in a.pose.bones:b.matrix_basis=Matrix.Identity(4)
 bpy.context.view_layer.update();apply(body,a,folder);bpy.context.preferences.filepaths.save_version=0;bpy.ops.wm.save_as_mainfile(filepath=str(folder/'character.blend'))
