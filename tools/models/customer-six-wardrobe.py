"""Customer six: preserve the identity; rebuild sewn, collarless clothing.
Scripted Blender mesh authoring in the existing character's rig coordinates.
"""
import bpy,bmesh,math,json,hashlib
from pathlib import Path
from mathutils import Vector,Matrix
ROOT=Path(__file__).resolve().parents[2]

def apply(body,arm,folder):
 if body.get('clean_wardrobe_v2'):return
 col=bpy.data.collections['Casual outfit']
 def weight(v):return {body.vertex_groups[g.group].name:g.weight for g in v.groups}
 protected=[];keep=[]
 for p in body.data.polygons:
  ws={}
  for i in p.vertices:
   for n,w in weight(body.data.vertices[i]).items():ws[n]=ws.get(n,0)+w/len(p.vertices)
  head=p.material_index==0 and ws.get('Head',0)+ws.get('neck',0)>.35
  hand=p.material_index==0 and max(ws.get('LeftHand',0),ws.get('RightHand',0))>.4
  if head or hand:keep.append(p.index)
  if head:protected.append(p.index)
 def signature(indices):
  uv=body.data.uv_layers.active.data
  data=[[(tuple(body.data.vertices[body.data.loops[i].vertex_index].co),tuple(uv[i].uv),sorted(weight(body.data.vertices[body.data.loops[i].vertex_index]).items())) for i in body.data.polygons[p].loop_indices] for p in indices]
  return hashlib.sha256(repr(data).encode()).hexdigest()
 head_hash=signature(protected);head_faces=len(protected)
 bm=bmesh.new();bm.from_mesh(body.data);bm.faces.ensure_lookup_table()
 bmesh.ops.delete(bm,geom=[f for f in bm.faces if f.index not in set(keep)],context='FACES')
 bmesh.ops.delete(bm,geom=[v for v in bm.verts if not v.link_faces],context='VERTS');bm.to_mesh(body.data);bm.free()
 # Clear the prior wardrobe extras; the fitted face stubble stays untouched.
 for o in list(col.objects):
  if o not in [body] and o.name!='Customer 06 fitted thick stubble':bpy.data.objects.remove(o,do_unlink=True)
 def mat(name,rgb,rough=.8,metal=0):
  m=bpy.data.materials.new(name);m.use_nodes=True;bs=m.node_tree.nodes['Principled BSDF'];bs.inputs['Base Color'].default_value=(*rgb,1);bs.inputs['Roughness'].default_value=rough;bs.inputs['Metallic'].default_value=metal;bs.inputs['Specular IOR Level'].default_value=.18;return m
 leather=mat('Customer 06 classic brown leather',(.16,.066,.029),.6)
 shirt=mat('Customer 06 clean maroon cotton',(.22,.022,.047))
 denim=mat('Customer 06 clean brown denim',(.11,.065,.038))
 skin=bpy.data.materials['Customer 06 exposed upper arms'] if bpy.data.materials.get('Customer 06 exposed upper arms') else mat('Customer 06 exposed upper arms',(.34,.19,.09))
 sole=mat('Customer 06 black brown outsole',(.018,.012,.009))
 metal=mat('Customer 06 aged brass hardware',(.5,.28,.08),.35,.75)
 def mesh(name,verts,faces,material,weights):
  me=bpy.data.meshes.new(name);me.from_pydata(verts,[],faces);me.update();o=bpy.data.objects.new(name,me);col.objects.link(o);o.parent=arm;o.matrix_world=body.matrix_world.copy();me.materials.append(material)
  for n in {n for ws in weights for n in ws}:o.vertex_groups.new(name=n)
  for i,ws in enumerate(weights):
   total=sum(ws.values())
   for n,w in ws.items():o.vertex_groups[n].add([i],w/total,'REPLACE')
  mod=o.modifiers.new('Continuous normalized skin','ARMATURE');mod.object=arm
  for p in me.polygons:p.use_smooth=True
  return o
 def torso_weights(z):
  names=['Hips','Spine02','Spine01','Spine'];pts=[arm.data.bones[n].head_local.z for n in names]
  if z<=pts[0]:return {names[0]:1}
  for i in range(3):
   if z<=pts[i+1]:
    t=(z-pts[i])/(pts[i+1]-pts[i]);return {names[i]:1-t,names[i+1]:t}
  return {names[-1]:1}
 def width(z):
  profile=[(84,13.2,7.0),(92,13.5,7.4),(103,14.6,8.4),(113,16.0,8.5),(120,16.4,7.0),(126,5.5,4.6)]
  for (z0,x0,y0),(z1,x1,y1) in zip(profile,profile[1:]):
   if z<=z1:
    t=max(0,(z-z0)/(z1-z0));return x0+(x1-x0)*t,y0+(y1-y0)*t
  return profile[-1][1:]
 def torso(name,levels,material):
  N=64;vs=[];fs=[];ws=[]
  for z in levels:
   x,y=width(z)
   for i in range(N):
    a=i*math.tau/N;vs.append((x*math.cos(a),4+y*math.sin(a),z));ws.append(torso_weights(z))
  for j in range(len(levels)-1):
   for i in range(N):fs.append((j*N+i,j*N+(i+1)%N,(j+1)*N+(i+1)%N,(j+1)*N+i))
  return mesh(name,vs,fs,material,ws)
 torso('Customer 06 clean crew neck shirt',[80,84,89,94,101,108,114,119,122,125],shirt)
 def tube(name,centers,radii,material,weights,N=32,cap=True):
  vs=[];fs=[];ws=[]
  for j,(c,r) in enumerate(zip(centers,radii)):
   axis=(centers[min(j+1,len(centers)-1)]-centers[max(0,j-1)]).normalized();front=Vector((0,-1,0));front=(front-axis*front.dot(axis)).normalized();side=front.cross(axis).normalized()
   for i in range(N):
    a=i*math.tau/N;vs.append(c+r*(side*math.cos(a)+front*math.sin(a)));ws.append(weights[j])
  for j in range(len(centers)-1):
   for i in range(N):fs.append((j*N+i,j*N+(i+1)%N,(j+1)*N+(i+1)%N,(j+1)*N+i))
  if cap:fs.extend([tuple(reversed(range(N))),tuple((len(centers)-1)*N+i for i in range(N))])
  return mesh(name,vs,fs,material,ws)
 arms=[]
 for side in ['Left','Right']:
  s=arm.data.bones[side+'Arm'].head_local;e=arm.data.bones[side+'ForeArm'].head_local;w=arm.data.bones[side+'Hand'].head_local
  centers=[];radii=[];ws=[]
  for t in [0,.08,.3,.5,.72,.9,1,1.1,1.25,1.5,1.75,1.92,2.03]:
   c=s+(e-s)*t if t<=1 else e+(w-e)*(t-1);centers.append(c)
   radius=5.0-.8*max(0,min(t,1)) if t<=1 else 4.2-1.45*(t-1);radii.append(radius)
   blend=max(0,min(1,(t-.75)/.5));hand=max(0,min(1,(t-1.8)/.2));ws.append({side+'Arm':(1-blend)*(1-hand),side+'ForeArm':blend*(1-hand),side+'Hand':hand})
  arms.append(tube(side+' continuous exposed arm',centers,radii,skin,ws))
  sleeve=tube(side+' clean short sleeve',[s+(e-s)*t for t in [-.20,-.10,0,.2,.39,.44]],[.8,4.0,5.7,5.6,5.4,5.4],shirt,[{side+'Arm':1}]*6,cap=False)
  sol=sleeve.modifiers.new('Turned cotton hem thickness','SOLIDIFY');sol.thickness=.24
 tube('Customer 06 smooth neck join',[arm.data.bones['neck'].head_local+Vector((0,0,z)) for z in [-1,3,7,10]],[4.1,4.1,4.1,4.3],skin,[{'neck':1}]*4)
 torso('Customer 06 crew neck rib binding',[124.8,125.6],shirt)
 # One leather shell: open front, a deep V, armhole cutouts and shoulder bridges.
 N=64;R=20;vs=[];fs=[];ws=[];gap=.17
 for j in range(R):
  t=j/(R-1)
  for i in range(N+1):
   a=-math.pi/2+gap+(math.tau-2*gap)*i/N
   front=max(0,-math.sin(a));edge=abs(i-N/2)/(N/2)
   top=123-16*(max(0,(front-.52)/.48)**1.3)*(max(0,(edge-.62)/.38)**1.1)
   z=80+(top-80)*t;x,y=width(z);vs.append(((x+.7)*math.cos(a),4+(y+.7)*math.sin(a),z));ws.append(torso_weights(z))
 for j in range(R-1):
  t=(j+.5)/(R-1)
  for i in range(N):
   a=-math.pi/2+gap+(math.tau-2*gap)*(i+.5)/N
   side_dist=min(abs(math.atan2(math.sin(a),math.cos(a))),abs(math.atan2(math.sin(a-math.pi),math.cos(a-math.pi))))
   if (side_dist/.42)**2+((t-.76)/.205)**2<1:continue
   k=j*(N+1)+i;fs.append((k,k+1,k+N+2,k+N+1))
 vest=mesh('Customer 06 classic collarless V neck vest',vs,fs,leather,ws)
 sol=vest.modifiers.new('Sewn leather edge thickness','SOLIDIFY');sol.thickness=.34
 # Welt pockets and small dark snaps sit directly on the leather panels.
 for sign in [-1,1]:
  verts=[]
  for z in [98.4,99.1]:
   for x in [sign*5.2,sign*11.0]:
    rx,ry=width(z);y=4-(ry+.7)*math.sqrt(max(0,1-(x/(rx+.7))**2))-.10;verts.append((x,y,z))
  mesh(('Left' if sign>0 else 'Right')+' vest welt pocket',verts,[(0,1,3,2)],leather,[torso_weights(v[2]) for v in verts])
 for z in [90,97,104]:
  rx,ry=width(z);x=(rx+.7)*math.sin(gap)+.7;y=4-(ry+.7)*math.sqrt(1-(x/(rx+.7))**2)-.12
  vs=[(x,y-.08,z)]+[(x+.38*math.cos(i*math.tau/12),y,z+.38*math.sin(i*math.tau/12)) for i in range(12)]
  mesh('Vest snap '+str(z),vs,[(0,i+1,(i+1)%12+1) for i in range(12)],sole,[torso_weights(z)]*len(vs))
 # Construct and weld a trouser pelvis and two shaped legs using Blender voxel remesh.
 pants=[torso('Customer 06 trouser waistband',[84,86,90],denim)]
 for side in ['Left','Right']:
  hip=arm.data.bones[side+'UpLeg'].head_local;knee=arm.data.bones[side+'Leg'].head_local;ankle=arm.data.bones[side+'Foot'].head_local
  levels=[(28,5.8),(34,6.0),(42,6.2),(48,6.7),(56,7.0),(65,7.6),(74,8.1),(82,8.1)]
  centers=[]
  for z,r in levels:
   a,b=(ankle,knee) if z<knee.z else (knee,hip);p=a+(b-a)*((z-a.z)/(b.z-a.z));p.z=z;centers.append(p)
  pants.append(tube(side+' trouser leg construction',centers,[r for z,r in levels],denim,[{'Hips':1}]*len(levels)))
 # Closed hip bridge connects to the top third of both leg surfaces.
 pelvis=torso('Customer 06 trouser hip bridge',[69,73,78,84,89],denim)
 bm=bmesh.new();bm.from_mesh(pelvis.data);bmesh.ops.holes_fill(bm,edges=[e for e in bm.edges if e.is_boundary],sides=0);bm.to_mesh(pelvis.data);bm.free();pants.append(pelvis)
 for o in pants:o.modifiers.clear()
 bpy.ops.object.select_all(action='DESELECT')
 for o in pants:o.select_set(True)
 bpy.context.view_layer.objects.active=pants[0];bpy.ops.object.join();pants=pants[0]
 rem=pants.modifiers.new('Weld sewn crotch and hip seams','REMESH');rem.mode='VOXEL';rem.voxel_size=.65;bpy.ops.object.modifier_apply(modifier=rem.name)
 sm=pants.modifiers.new('Ease garment construction','SMOOTH');sm.factor=.65;sm.iterations=3;bpy.ops.object.modifier_apply(modifier=sm.name)
 dec=pants.modifiers.new('Controlled trouser polygon budget','DECIMATE');dec.ratio=.22;bpy.ops.object.modifier_apply(modifier=dec.name)
 pants.name='Customer 06 continuous welded trousers';pants.data.validate(verbose=True);pants.data.update()
 bm=bmesh.new();bm.from_mesh(pants.data);bmesh.ops.delete(bm,geom=[f for f in bm.faces if all(e.is_boundary for e in f.edges)],context='FACES');bmesh.ops.delete(bm,geom=[v for v in bm.verts if not v.link_faces],context='VERTS');bmesh.ops.holes_fill(bm,edges=[e for e in bm.edges if e.is_boundary],sides=4);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(pants.data);bm.free()
 pants.vertex_groups.clear()
 for n in ['Hips','LeftUpLeg','RightUpLeg','LeftLeg','RightLeg']:pants.vertex_groups.new(name=n)
 for v in pants.data.vertices:
  side='Left' if v.co.x>=0 else 'Right';z=v.co.z;knee=arm.data.bones[side+'Leg'].head_local.z
  leg=max(0,min(1,(knee+7-z)/14));hip=max(0,min(1,(z-73)/13))
  for n,w in {'Hips':hip,side+'UpLeg':(1-hip)*(1-leg),side+'Leg':(1-hip)*leg}.items():
   if w:pants.vertex_groups[n].add([v.index],w,'REPLACE')
 for p in pants.data.polygons:p.use_smooth=True
 mod=pants.modifiers.new('Continuous trouser skin','ARMATURE');mod.object=arm
 # Boot pieces follow the actual foot rigidly; the shaft joins the trouser hem.
 for side,sign in [('Left',1),('Right',-1)]:
  ankle=arm.data.bones[side+'Foot'].head_local;cx=ankle.x;cy=ankle.y
  def boot_surface(name,rings,m):
   N=32;verts=[];faces=[]
   for z,x,front,back in rings:
    for i in range(N):
     a=i*math.tau/N;verts.append((cx+x*math.cos(a),cy+math.sin(a)*(front if math.sin(a)<0 else back),z))
   for j in range(len(rings)-1):
    for i in range(N):faces.append((j*N+i,j*N+(i+1)%N,(j+1)*N+(i+1)%N,(j+1)*N+i))
   faces.extend([tuple(reversed(range(N))),tuple((len(rings)-1)*N+i for i in range(N))]);
   weights=[]
   for v in verts:
    blend=max(0,min(1,(v[2]-14)/14)) if 'shaft' in name else 0
    weights.append({side+'Foot':1-blend,side+'Leg':blend})
   return mesh(side+' '+name,verts,faces,m,weights)
  boot_surface('boot outsole',[(0,5.9,17.8,6.8),(2.5,6.1,18,7),(3.1,5.9,17.8,6.8)],sole)
  boot_surface('boot leather vamp',[(3,5.7,17.4,6.6),(5.5,5.9,17,6.6),(8,5.6,15,6.4),(11.5,5.2,10,6.1),(14,5.2,6.3,6.1)],leather)
  boot_surface('low harness boot shaft',[(10,5.2,6.3,6),(16,5.5,6.3,6),(24,5.9,6.3,6.2),(32,6,6.3,6.2)],leather)
  boot_surface('boot harness band',[(12.5,5.7,7.1,6.7),(14.7,5.7,7.1,6.7)],leather)
  for link in range(5):
   center=Vector((cx+sign*6.2,cy+link*.85,14-link*1.25));r=1.65 if link==0 else .85;verts=[];faces=[]
   for j in range(20):
    a=j*math.tau/20
    for k in range(6):
     b=k*math.tau/6;verts.append(center+Vector((.18*math.sin(b),math.cos(a)*(r+.18*math.cos(b)),math.sin(a)*(r+.18*math.cos(b)))))
   for j in range(20):
    for k in range(6):faces.append((j*6+k,((j+1)%20)*6+k,((j+1)%20)*6+(k+1)%6,j*6+(k+1)%6))
   mesh(side+' boot brass '+str(link),verts,faces,metal,[{side+'Foot':1}]*len(verts))
 # Join arms to the preserved main mesh: hand calibration and tattoo use this skin.
 bpy.ops.object.select_all(action='DESELECT');body.select_set(True)
 for o in arms:o.select_set(True)
 bpy.context.view_layer.objects.active=body;bpy.ops.object.join();body['clean_wardrobe_v2']=True
 # The decal source uses geometric surface selection for the rebuilt forearm.
 import runpy
 runpy.run_path(str(ROOT/'tools/models/customer-six-tattoo.py'))['apply'](body,arm,folder)
 report={'version':2,'preservedHeadFaces':head_faces,'preservedHeadSourceHash':head_hash,'construction':'new smooth arms and short crew-neck sleeves; collarless open V-neck leather vest with actual armholes, shoulder bridges and sewn edges; welded trousers; foot-weighted low harness boots','collar':False,'objects':{o.name:len(o.data.vertices) for o in col.objects if o.type=='MESH'}}
 folder.joinpath('wardrobe-check.json').write_text(json.dumps(report,indent=2)+'\n')

if __name__=='__main__':
 folder=ROOT/'tools/models/cast/customer-06';bpy.ops.wm.open_mainfile(filepath=str(folder/'character.blend'))
 arm=bpy.data.objects['Armature'];body=bpy.data.objects['customer-06 body']
 for o in [arm,arm.parent]:o.animation_data_clear()
 for b in arm.pose.bones:b.matrix_basis=Matrix.Identity(4)
 bpy.context.view_layer.update();apply(body,arm,folder)
 bpy.context.preferences.filepaths.save_version=0;bpy.ops.file.pack_all();bpy.ops.wm.save_as_mainfile(filepath=str(folder/'character.blend'))
