"""Reproducible Halcyon cast authoring: Meshy bases, welded skin binding,
shared captured-motion retargeting, editable garments, and directional sprites.
Run in Blender with -- <cast-id> [--render]. See docs/store-cast.md.
"""
import bpy,bmesh,math,json,sys,runpy
from pathlib import Path
from mathutils import Vector,Matrix
ROOT=Path(__file__).resolve().parents[2]
args=sys.argv[sys.argv.index('--')+1:];slug=args[0]
def option(name,default):
 return Path(args[args.index(name)+1]).resolve() if name in args else default
SRC=option('--source-dir',ROOT/'tools/models/cast'/slug)
OUT=option('--render-dir',ROOT/'scratch/cast-render'/slug);OUT.mkdir(parents=True,exist_ok=True)
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
bpy.ops.import_scene.gltf(filepath=str(SRC/'source.glb'))
arm=next(o for o in bpy.context.scene.objects if o.type=='ARMATURE')
body=max((o for o in bpy.context.scene.objects if o.type=='MESH' and o.vertex_groups),key=lambda o:len(o.data.vertices))
for o in list(bpy.context.scene.objects):
 if o.type=='MESH' and o!=body:bpy.data.objects.remove(o,do_unlink=True)
arm.animation_data_clear();body.name=slug+' body'
for b in arm.pose.bones:b.matrix_basis=Matrix.Identity(4)
bpy.context.view_layer.objects.active=arm
bpy.ops.object.mode_set(mode='EDIT')
for b in arm.data.edit_bones:
 b.length/=100
 children=[c for c in b.children if c.name!='headfront']
 if children:b.tail=children[0].head
 if b.name in ['headfront','head_end']:b.use_deform=False
 if b.name.endswith('Hand'):b.length=9
 if b.name.endswith('ToeBase'):b.length=5
bpy.ops.object.mode_set(mode='OBJECT')
# Welding UV splits makes deformation continuous without destroying per-loop UVs.
bm=bmesh.new();bm.from_mesh(body.data);before=len(bm.verts)
bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=.0001);bm.to_mesh(body.data);bm.free()
source_weights=[]
for v in body.data.vertices:
 weights={}
 for g in v.groups:
  name=body.vertex_groups[g.group].name
  if name in ['headfront','head_end']:name='Head'
  weights[name]=weights.get(name,0)+g.weight
 source_weights.append(weights)
body.vertex_groups.clear()
for m in list(body.modifiers):
 if m.type=='ARMATURE':body.modifiers.remove(m)
bpy.ops.object.select_all(action='DESELECT');body.select_set(True);arm.select_set(True);bpy.context.view_layer.objects.active=arm
world=body.matrix_world.copy();bpy.ops.object.parent_set(type='ARMATURE_AUTO',keep_transform=True);body.matrix_world=world
fallback_vertices=0
for v in body.data.vertices:
 if not v.groups or sum(g.weight for g in v.groups)<1e-8:
  fallback_vertices+=1
  for name,weight in source_weights[v.index].items():
   group=body.vertex_groups.get(name) or body.vertex_groups.new(name=name);group.add([v.index],weight,'REPLACE')
 total=sum(g.weight for g in v.groups)
 if total<1e-8:raise RuntimeError(f'{slug}: unweighted vertex {v.index}')
 for g in list(v.groups):body.vertex_groups[g.group].add([v.index],g.weight/total,'REPLACE')
anchor=bpy.data.objects.new(slug+' floor anchor',None);bpy.context.collection.objects.link(anchor)
for o in list(bpy.context.scene.objects):
 if o!=anchor and o.parent is None:o.parent=anchor
# All sheets share a 6.4-foot canvas; per-character height remains distinct.
heights={'clerk-b':5.65,'customer-01':5.25,'customer-02':5.65,'customer-03':5.05,'customer-04':5.65,'customer-05':5.85,'customer-06':5.90,'customer-07':5.05,'customer-08':5.40,'customer-09':5.80,'customer-10':5.50}
anchor.scale=(heights[slug]/body.dimensions.z,)*3
scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=8;scene.cycles.use_denoising=True
prefs=bpy.context.preferences.addons['cycles'].preferences
try:
 prefs.compute_device_type='CUDA';prefs.get_devices()
 for device in prefs.devices:device.use=device.type=='CUDA'
 scene.cycles.device='GPU' if any(device.type=='CUDA' for device in prefs.devices) else 'CPU'
except Exception as e:print('CPU_RENDER',str(e))
scene.render.film_transparent=True;scene.render.image_settings.file_format='PNG';scene.render.image_settings.color_mode='RGBA'
scene.view_settings.view_transform='Standard';scene.view_settings.look='None';scene.world.color=(.45,.45,.45);scene.render.fps=30
for name,loc,power,size in [('Key',(-3,-5,8),360,5),('Fill',(4,-3,4.5),180,5),('Rim',(-1,3,7),250,4)]:
 d=bpy.data.lights.new(name,'AREA');d.energy=power;d.shape='DISK';d.size=size;o=bpy.data.objects.new(name,d);bpy.context.collection.objects.link(o);o.location=loc;o.rotation_euler=(Vector((0,0,2.8))-o.location).to_track_quat('-Z','Y').to_euler()
d=bpy.data.cameras.new('Cast sprite camera');cam=bpy.data.objects.new('Cast sprite camera',d);bpy.context.collection.objects.link(cam);cam.location=(0,-12,3.18);cam.rotation_euler=(math.pi/2,0,0);d.type='ORTHO';d.ortho_scale=6.4;scene.camera=cam
original=body.data.materials[0];original.name=slug+' fixed skin hair and clothes'
for n in original.node_tree.nodes:
 if n.type=='BSDF_PRINCIPLED':n.inputs['Roughness'].default_value=.85;n.inputs['Specular IOR Level'].default_value=.12
outfits={'casual':[body]};cloth_materials=[];trim_materials=[]
if slug=='clerk-b':
 import numpy as np
 tex=next(n.image for n in original.node_tree.nodes if n.type=='TEX_IMAGE');pixels=np.empty(tex.size[0]*tex.size[1]*4,dtype=np.float32);tex.pixels.foreach_get(pixels);pixels=pixels.reshape(tex.size[1],tex.size[0],4);uv=body.data.uv_layers.active.data
 def material(name,color):
  m=bpy.data.materials.new(name);m.diffuse_color=(*color,1);m.use_nodes=True;bs=m.node_tree.nodes.get('Principled BSDF');bs.inputs['Base Color'].default_value=(*color,1);bs.inputs['Roughness'].default_value=.85;return m
 polo=material('Uniform primary',(.12,.31,.29));trim=material('Uniform secondary',(.88,.82,.63));oxmat=material('Oxford pale primary',(.69,.82,.75));cloth_materials=[polo,oxmat];trim_materials=[trim]
 body.data.materials.append(polo);body.data.materials.append(trim)
 # Pigment and anatomical range keep shirt recolouring off the face and khakis.
 hip=arm.data.bones['Hips'].head_local.z;neck=arm.data.bones['neck'].head_local.z
 for p in body.data.polygons:
  c=sum((body.data.vertices[v].co for v in p.vertices),Vector())/len(p.vertices);t=sum((uv[i].uv for i in p.loop_indices),Vector((0,0)))/len(p.loop_indices);rgb=pixels[min(tex.size[1]-1,max(0,int(t.y*tex.size[1]))),min(tex.size[0]-1,max(0,int(t.x*tex.size[0]))),:3]
  if hip*.96<c.z<neck*1.03:
   if rgb[1]>rgb[0]*1.20 and rgb[2]>rgb[0]*1.15:p.material_index=1
   elif min(rgb)>.40 and (max(rgb)-min(rgb))/max(rgb)<.32 and (c.z>neck*.90 or abs(c.x)>arm.data.bones['LeftArm'].head_local.x*1.2):p.material_index=2
 ox=body.copy();ox.data=body.data.copy();bpy.context.collection.objects.link(ox);ox.name='Clerk B Oxford';ox.data.materials[1]=oxmat;ox.data.materials[2]=oxmat;ox.data.materials.append(oxmat)
 for p in ox.data.polygons:
  weights={}
  for vi in p.vertices:
   for g in ox.data.vertices[vi].groups:
    n=ox.vertex_groups[g.group].name;weights[n]=weights.get(n,0)+g.weight/len(p.vertices)
  if any(weights.get(side+'ForeArm',0)+weights.get(side+'Arm',0)>.6 and weights.get(side+'Hand',0)<.15 for side in ['Left','Right']):p.material_index=3
 # Ease the sleeve surface around the forearm, retaining the source topology.
 for v in ox.data.vertices:
  ws={ox.vertex_groups[g.group].name:g.weight for g in v.groups}
  for side in ['Left','Right']:
   if ws.get(side+'ForeArm',0)>.6 and ws.get(side+'Hand',0)<.15:
    e=arm.data.bones[side+'ForeArm'].head_local;w=arm.data.bones[side+'Hand'].head_local;axis=w-e;t=(v.co-e).dot(axis)/axis.length_squared
    if .05<t<.94:
     radial=v.co-(e+axis*t)
     if radial.length>0:v.co+=radial.normalized()*.55*min(1,t/.15)*min(1,(.94-t)/.1)
 ox.data.update()
 extras=[]
 def cloth_mesh(name,verts,faces,mat):
  me=bpy.data.meshes.new(name);me.from_pydata(verts,[],faces);me.update();o=bpy.data.objects.new(name,me);bpy.context.collection.objects.link(o);o.parent=arm;o.data.materials.append(mat)
  for bone in ['Spine02','Spine01','Spine']:o.vertex_groups.new(name=bone)
  for v in me.vertices:
   nearest=min(['Spine02','Spine01','Spine'],key=lambda n:abs(v.co.z-arm.data.bones[n].head_local.z));o.vertex_groups[nearest].add([v.index],1,'REPLACE')
  mod=o.modifiers.new('Uniform skin','ARMATURE');mod.object=arm;extras.append(o);return o
 def surface(x,z):
  hit,p,normal,index=ox.ray_cast(Vector((x,-100,z)),Vector((0,1,0)))
  if not hit:raise RuntimeError('Oxford detail misses cloth')
  return (x,p.y-.35,z)
 verts=[];faces=[]
 for i in range(18):
  z=hip+(neck-hip)*(.02+.84*i/17)
  for x in [-.9,.9]:verts.append(surface(x,z))
  if i:faces.append(((i-1)*2,(i-1)*2+1,i*2+1,i*2))
 cloth_mesh('Oxford button placket',verts,faces,oxmat)
 z=hip+(neck-hip)*.64;outline=[(4,z+3),(10,z+3),(10,z-3),(7,z-4),(4,z-3)];cloth_mesh('Oxford chest pocket',[surface(x,y) for x,y in outline],[tuple(reversed(range(5)))],oxmat)
 # Real shirt buttons follow the placket surface and bend with the torso.
 for i in range(5):
  z=hip+(neck-hip)*(.15+.14*i);x,y,z=surface(0,z)
  verts=[(x,y-.18,z)]+[(x+math.cos(j*math.tau/12)*.48,y-.22,z+math.sin(j*math.tau/12)*.48) for j in range(12)]
  cloth_mesh('Oxford button '+str(i),verts,[(0,1+j,1+(j+1)%12) for j in range(12)],trim)
 outfits={'polo':[body],'oxford':[ox,*extras]}
case=None
if slug=='clerk-b':
 m=bpy.data.materials.new('Clerk B rental case');m.diffuse_color=(.035,.04,.045,1);m.use_nodes=True;m.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value=m.diffuse_color
 bpy.ops.mesh.primitive_cube_add(size=1);case=bpy.context.object;case.name='Rental case';case.parent=arm;case.scale=(13,2.7,18);bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);case.data.materials.append(m)
 bevel=case.modifiers.new('Moulded case edges','BEVEL');bevel.width=.35;bevel.segments=2;case.hide_render=True
# The existing retargeter supplies captured upright idle/walk for every identity.
def update():bpy.context.view_layer.update()
def reset():
 arm.animation_data_clear()
 for b in arm.pose.bones:b.matrix_basis=Matrix.Identity(4)
 update()
def aim(name,direction):
 b=arm.pose.bones[name];mat=b.matrix.copy();q=(mat.to_3x3()@Vector((0,1,0))).rotation_difference(Vector(direction));b.matrix=Matrix.Translation(mat.translation)@q.to_matrix().to_4x4()@mat.to_3x3().to_4x4();update()
captured=runpy.run_path(str(ROOT/'tools/models/clerk-captured-motion.py'))
clips,apply=captured['make_retarget'](arm,reset,aim,lambda side,amount:None,update,ROOT)
walk='walkSteady' if slug in ['clerk-b','customer-02','customer-04','customer-06','customer-08','customer-10'] else 'walkCompact'
def pose(kind,u):
 anchor.location=(0,0,0);anchor.rotation_euler=(0,0,0)
 apply(walk if kind=='walk' else 'idle',u)
 if kind=='browse':
  arm.pose.bones['Head'].rotation_mode='QUATERNION';arm.pose.bones['Head'].rotation_quaternion=Matrix.Rotation(.10*math.sin(u*math.tau),4,'Z').to_quaternion()
 if kind in ['talk','stockHigh','stockMid','stockLow','type']:
  for side,sign in [('Left',1),('Right',-1)]:
   if kind=='talk' and side=='Right':continue
   aim(side+'Arm',(sign*.12,-.65,-.65));aim(side+'ForeArm',(-sign*.55,-1,.15 if kind!='type' else -.05));aim(side+'Hand',(-sign*.1,-1,0))
  if kind=='stockHigh':
   aim('RightArm',(-.16,-.68,.68));aim('RightForeArm',(0,-1,.25));aim('RightHand',(0,-1,0))
  if kind=='stockLow':
   for side,sign in [('Left',1),('Right',-1)]:aim(side+'UpLeg',(sign*.1,-.55,-.8));aim(side+'Leg',(sign*.025,.4,-.9))
   aim('Spine02',(0,-.15,1))
 update();objects=[o for o in arm.children if o.type=='MESH' and not o.hide_render and o!=case];points=[ev.matrix_world@ev.data.vertices[i].co for o in objects for ev in [o.evaluated_get(bpy.context.evaluated_depsgraph_get())] for i in {i for p in ev.data.polygons for i in p.vertices}];anchor.location.z=-min(v.z for v in points);update()
 if case:
  case.hide_render=not kind.startswith('stock')
  right=arm.pose.bones['RightHand'];palm=right.matrix@Vector((0,7,0))
  if kind!='stockHigh':palm=(palm+arm.pose.bones['LeftHand'].matrix@Vector((0,7,0)))*.5
  case.location=palm+Vector((0,1.5,7));case.rotation_euler=(0,0,0)
 return {'minZ':min(v.z for v in points)+anchor.location.z,'maxZ':max(v.z for v in points)+anchor.location.z,'width':max(v.x for v in points)-min(v.x for v in points)}
def outfit(name):
 for style,objects in outfits.items():
  for o in objects:o.hide_render=style!=name;o.hide_set(False)
# Save two reusable genuine armature actions, sampled from the licensed captures.
for kind in ['idle','walk']:
 samples=[]
 for f in range(41):
  pose(kind,f/40);samples.append(([tuple(b.location) for b in arm.pose.bones],[tuple(b.rotation_quaternion) for b in arm.pose.bones],tuple(anchor.location)))
 action=bpy.data.actions.new(slug+' '+kind);action.use_fake_user=True;arm.animation_data_create();arm.animation_data.action=action
 # Capture matrices already contain the rig's local channels. Pose bones default
 # to quaternion mode on imported Meshy rigs.
 for f,(locs,rots,rootloc) in enumerate(samples):
  for b,loc,rot in zip(arm.pose.bones,locs,rots):
   b.rotation_mode='QUATERNION';b.location=loc;b.rotation_quaternion=rot;b.keyframe_insert('location',frame=f+1);b.keyframe_insert('rotation_quaternion',frame=f+1)
 arm.animation_data_clear()
pose('idle',0);outfit(next(iter(outfits)));scene.frame_start=1;scene.frame_end=41
bpy.context.preferences.filepaths.save_version=0
for name,objects in outfits.items():
 col=bpy.data.collections.new(name.title()+' outfit');scene.collection.children.link(col)
 for o in objects:
  for old in list(o.users_collection):old.objects.unlink(o)
  col.objects.link(o)
if slug=='customer-06':
 runpy.run_path(str(ROOT/'tools/models/customer-six-wardrobe.py'))['apply'](body,arm,SRC)
 tattoo=runpy.run_path(str(ROOT/'tools/models/customer-six-tattoo.py'))['apply'](body,arm,SRC);outfits['casual'].append(tattoo)
bpy.ops.object.select_all(action='DESELECT');arm.select_set(True);bpy.context.view_layer.objects.active=arm;arm.show_in_front=True
for screen in bpy.data.screens:
 for area in screen.areas:
  if area.type=='VIEW_3D':area.spaces.active.region_3d.view_distance=9;area.spaces.active.region_3d.view_location=(0,0,3);area.spaces.active.region_3d.view_rotation=cam.rotation_euler.to_quaternion()
bpy.ops.file.pack_all();bpy.ops.wm.save_as_mainfile(filepath=str(SRC/'character.blend'))
report={'id':slug,'sourceVertices':before,'weldedVertices':len(body.data.vertices),'triangles':sum(len(p.vertices)-2 for p in body.data.polygons),'deformBones':sum(b.use_deform for b in arm.data.bones),'retainedSourceWeightVertices':fallback_vertices,'unweighted':sum(not v.groups for v in body.data.vertices),'maxWeightError':max(abs(sum(g.weight for g in v.groups)-1) for v in body.data.vertices),'heightFeet':heights[slug],'walkSource':clips[walk]['source'],'uvLayers':len(body.data.uv_layers),'outfits':list(outfits),'poses':{}}
scene.render.resolution_x=256;scene.render.resolution_y=384;scene.render.resolution_percentage=100
for name,kind,u,angle in [('front','idle',0,0),('side','idle',0,90),('back','idle',0,180),('walk-contact','walk',0,90),('walk-passing','walk',.25,90),('browse','browse',.5,45)]+([('stock-high','stockHigh',0,45),('stock-mid','stockMid',0,45),('stock-low','stockLow',0,90)] if slug=='clerk-b' else []):
 outfit(next(iter(outfits)));report['poses'][name]=pose(kind,u);anchor.rotation_euler.z=math.radians(angle);scene.render.filepath=str(OUT/(name+'.png'));bpy.ops.render.render(write_still=True)
if slug=='clerk-b':
 outfit('oxford');pose('idle',0);scene.render.filepath=str(OUT/'oxford-front.png');bpy.ops.render.render(write_still=True)
 outfit('oxford');pose('talk',.5);anchor.rotation_euler.z=math.pi/4;scene.render.filepath=str(OUT/'oxford-talk.png');bpy.ops.render.render(write_still=True)
(SRC/'metrics.json').write_text(json.dumps(report,indent=2))
if '--render' not in args:sys.exit(0)
# Preserve a conservative sprite contract: 5 directions, 8 customer columns or
# the clerk's existing 16 columns. Customers need no per-frame 3D geometry.
anims=[('idle',2),('walk',4),('browse',2)] if slug!='clerk-b' else [('idle',2),('walk',4),('stockHigh',2),('stockMid',2),('stockLow',2),('talk',2),('type',2)]
cell=256;scene.render.resolution_x=cell;scene.render.resolution_y=int(cell*1.5)
for style in outfits:
 outfit(style)
 for passname in (['color','livery'] if slug=='clerk-b' else ['color']):
  if slug=='clerk-b':
   for m in cloth_materials+trim_materials:m.node_tree.nodes.get('Principled BSDF').inputs['Base Color'].default_value=(.72,.72,.72,1)
  backup=[]
  if passname=='livery':
   for m in bpy.data.materials:
    if not m.use_nodes:continue
    n=m.node_tree.nodes;l=m.node_tree.links;out=next((x for x in n if x.type=='OUTPUT_MATERIAL'),None)
    if not out:continue
    previous=out.inputs['Surface'].links[0].from_socket if out.inputs['Surface'].links else None;em=n.new('ShaderNodeEmission');em.inputs[0].default_value=(1,0,0,1) if m in cloth_materials else (0,1,0,1) if m in trim_materials else (0,0,0,1);l.new(em.outputs[0],out.inputs['Surface']);backup.append((m,out,previous,em))
   scene.cycles.samples=1;scene.cycles.use_denoising=False
  dest=OUT/style/passname;dest.mkdir(parents=True,exist_ok=True)
  for row in range(8 if slug=='customer-06' else 5):
   col=0
   for anim,count in anims:
    for f in range(count):
     pose(anim,f/count);anchor.rotation_euler.z=row*math.pi/4;scene.render.filepath=str(dest/f'{row:02d}-{col:02d}.png');bpy.ops.render.render(write_still=True);col+=1
  for m,out,previous,em in backup:
   if previous:m.node_tree.links.new(previous,out.inputs['Surface'])
   m.node_tree.nodes.remove(em)
  scene.cycles.samples=8;scene.cycles.use_denoising=True
