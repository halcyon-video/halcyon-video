# Original Halcyon clerk: Meshy image-derived base and walk; Blender bound rig,
# fitted Oxford, independent uniform materials, and deterministic sprite rendering.
# Provenance and reproduction: docs/video-clerk-model.md.
import bpy,bmesh,math,sys,json,numpy as np
from pathlib import Path
from mathutils import Vector,Matrix
ROOT=Path(__file__).resolve().parents[2]
R=ROOT/'tools/models'
OUT=ROOT/'scratch/clerk-render'
OUT.mkdir(parents=True,exist_ok=True)
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
bpy.ops.import_scene.gltf(filepath=str(R/'video-clerk-source.glb'))
arm=next(o for o in bpy.context.scene.objects if o.type=='ARMATURE')
body=next(o for o in bpy.context.scene.objects if o.type=='MESH' and len(o.vertex_groups)>0)
for o in list(bpy.context.scene.objects):
 if o.type=='MESH' and o!=body:bpy.data.objects.remove(o,do_unlink=True)
walk=arm.animation_data.action;walk.use_fake_user=True
arm.animation_data_clear()
bpy.context.view_layer.objects.active=arm;arm.select_set(True)
bpy.ops.object.mode_set(mode='EDIT')
for b in arm.data.edit_bones:b.length/=100
bpy.ops.object.mode_set(mode='OBJECT')
root=bpy.data.objects.new('Clerk A floor anchor',None);bpy.context.collection.objects.link(root)
for o in list(bpy.context.scene.objects):
 if o!=root and o.parent is None:o.parent=root
root.scale=(1/.3048,)*3
scene=bpy.context.scene
scene.render.engine='CYCLES';scene.cycles.samples=12;scene.cycles.use_denoising=True
scene.render.film_transparent=True;scene.render.resolution_x=384;scene.render.resolution_y=576;scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG';scene.render.image_settings.color_mode='RGBA'
scene.view_settings.view_transform='Standard';scene.view_settings.look='None';scene.world.color=(.45,.45,.45)
for name,loc,power,size in [('Key',(-3,-5,8),360,5),('Fill',(4,-3,4.5),180,5),('Rim',(-1,3,7),250,4)]:
 d=bpy.data.lights.new(name,'AREA');d.energy=power;d.shape='DISK';d.size=size;o=bpy.data.objects.new(name,d);bpy.context.collection.objects.link(o);o.location=loc;o.rotation_euler=(Vector((0,0,2.8))-o.location).to_track_quat('-Z','Y').to_euler()
d=bpy.data.cameras.new('Sprite camera');cam=bpy.data.objects.new('Sprite camera',d);bpy.context.collection.objects.link(cam)
cam.location=(0,-12,2.8);cam.rotation_euler=(math.pi/2,0,0);d.type='ORTHO';d.ortho_scale=5.7;scene.camera=cam

def aim(name,direction):
 b=arm.pose.bones[name];mat=b.matrix.copy();q=(mat.to_3x3()@Vector((0,1,0))).rotation_difference(Vector(direction))
 b.matrix=Matrix.Translation(mat.translation)@q.to_matrix().to_4x4()@mat.to_3x3().to_4x4();bpy.context.view_layer.update()
def pose(kind,frame=0):
 arm.animation_data_clear();root.location=(0,0,0);root.rotation_euler=(0,0,0)
 for b in arm.pose.bones:b.matrix_basis=Matrix.Identity(4)
 bpy.context.view_layer.update()
 if kind=='walk':
  arm.animation_data_create();arm.animation_data.action=walk
  arm.animation_data.action_slot=walk.slots[0];scene.frame_set(frame)
 else:
  for side,sgn in [('Left',1),('Right',-1)]:
   aim(side+'Arm',(sgn*.12,-.03,-1));aim(side+'ForeArm',(sgn*.03,-.13,-1))
   aim(side+'UpLeg',(sgn*.08,0,-1));aim(side+'Leg',(sgn*.02,0,-1))
  if kind=='reach':
   aim('RightArm',(-.18,-.35,.92));aim('RightForeArm',(-.02,-.2,1))
  if kind=='talk':
   aim('LeftArm',(.24,-.35,-.82));aim('LeftForeArm',(.38,-.80,.35))
 bpy.context.view_layer.update();dg=bpy.context.evaluated_depsgraph_get();ev=body.evaluated_get(dg)
 points=[ev.matrix_world@v.co for v in ev.data.vertices]
 root.location.z=-min(v.z for v in points)
 bpy.context.view_layer.update()
 return {'pose':kind,'frame':frame,'floor_adjustment':root.location.z,'bounds':[[min(v[i] for v in points) for i in range(3)],[max(v[i] for v in points) for i in range(3)]]}

arm.animation_data_clear()
for b in arm.pose.bones:b.matrix_basis=Matrix.Identity(4)
bpy.context.view_layer.update()
arm.animation_data_clear()
for b in arm.pose.bones:b.matrix_basis=Matrix.Identity(4)
bpy.context.view_layer.objects.active=arm
bpy.ops.object.mode_set(mode='EDIT')
for b in arm.data.edit_bones:
 children=[c for c in b.children if c.name not in ['headfront']]
 if children:b.tail=children[0].head
 if b.name in ['headfront','head_end']:b.use_deform=False
 if b.name.endswith('Hand'):b.length=10
 if b.name.endswith('ToeBase'):b.length=7
bpy.ops.object.mode_set(mode='OBJECT')
body.vertex_groups.clear()
bm=bmesh.new();bm.from_mesh(body.data);before=len(bm.verts);bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=.0001);bm.to_mesh(body.data);bm.free()
for m in list(body.modifiers):
 if m.type=='ARMATURE':body.modifiers.remove(m)
bpy.ops.object.select_all(action='DESELECT');body.select_set(True);arm.select_set(True);bpy.context.view_layer.objects.active=arm
before_world=body.matrix_world.copy()
bpy.ops.object.parent_set(type='ARMATURE_AUTO',keep_transform=True)
body.matrix_world=before_world
bpy.context.view_layer.update()
print('BODY_MATRIX_AFTER_BIND',list(map(list,body.matrix_world)))
print('BINDING',json.dumps({'before_vertices':before,'after_vertices':len(body.data.vertices),'unweighted':sum(not v.groups for v in body.data.vertices),'groups':len(body.vertex_groups)}))

for v in body.data.vertices:
 weights=[(g.group,g.weight) for g in v.groups];total=sum(w for _,w in weights)
 if total<=0:raise RuntimeError('Character has an unweighted vertex')
 for gi,weight in weights:body.vertex_groups[gi].add([v.index],weight/total,'REPLACE')
original=body.data.materials[0];original.name='Skin hair khakis shoes and badge'
texture=next(n.image for n in original.node_tree.nodes if n.type=='TEX_IMAGE')
pixels=np.array(texture.pixels[:],dtype=np.float32).reshape(texture.size[1],texture.size[0],4)
uv=body.data.uv_layers.active.data
roles=[];primary_pixels=[]
for poly in body.data.polygons:
 c=sum((body.data.vertices[v].co for v in poly.vertices),Vector())/len(poly.vertices)
 t=sum((uv[i].uv for i in poly.loop_indices),Vector((0,0)))/len(poly.loop_indices)
 rgb=pixels[min(texture.size[1]-1,max(0,int(t.y*texture.size[1]))),min(texture.size[0]-1,max(0,int(t.x*texture.size[0]))),:3]
 teal=(rgb[1]>rgb[0]*1.3 and rgb[2]>rgb[0]*1.15) or (88<c.z<111 and abs(c.x)<14 and max(rgb)<.75)
 cream=min(rgb)>.45 and rgb[1]>rgb[0]*.8 and (max(rgb)-min(rgb))/max(rgb)<.45
 role=1 if teal and 82<c.z<120 else 2 if cream and ((111<c.z<121 and abs(c.x)<11) or (98<c.z<112 and abs(c.x)>15)) else 0
 roles.append(role)
 if role==1:primary_pixels.append(rgb)

def cloth(name,gain,colour,textured=True):
 m=bpy.data.materials.new(name);m.use_nodes=True;n=m.node_tree.nodes;n.clear();l=m.node_tree.links
 out=n.new('ShaderNodeOutputMaterial');bs=n.new('ShaderNodeBsdfPrincipled');bs.inputs['Roughness'].default_value=.85;bs.inputs['Specular IOR Level'].default_value=.12;l.new(bs.outputs['BSDF'],out.inputs['Surface'])
 rgb=n.new('ShaderNodeRGB');rgb.name='Cloth colour';rgb.outputs[0].default_value=(*colour,1)
 if textured:
  tex=n.new('ShaderNodeTexImage');tex.image=texture;bw=n.new('ShaderNodeRGBToBW');l.new(tex.outputs['Color'],bw.inputs[0]);scale=n.new('ShaderNodeMath');scale.operation='MULTIPLY';scale.inputs[1].default_value=gain;l.new(bw.outputs[0],scale.inputs[0]);mix=n.new('ShaderNodeMixRGB');mix.blend_type='MULTIPLY';mix.inputs[0].default_value=1;contrast=n.new('ShaderNodeMath');contrast.operation='MULTIPLY_ADD';contrast.inputs[1].default_value=.22;contrast.inputs[2].default_value=.78;l.new(scale.outputs[0],contrast.inputs[0]);l.new(contrast.outputs[0],mix.inputs[1]);l.new(rgb.outputs[0],mix.inputs[2]);l.new(mix.outputs[0],bs.inputs['Base Color'])
 else:l.new(rgb.outputs[0],bs.inputs['Base Color'])
 # Use the actual pigment boundary inside triangles at the shirt hem. Assigning
 # one colour to a straddling triangle would incorrectly dye the khakis.
 if textured and 'primary cloth' in name:
  hsv=n.new('ShaderNodeSeparateColor');hsv.mode='HSV';l.new(tex.outputs['Color'],hsv.inputs[0])
  def compare(value,operation,threshold):
   node=n.new('ShaderNodeMath');node.operation=operation;node.inputs[1].default_value=threshold;l.new(value,node.inputs[0]);return node.outputs[0]
  lo=compare(hsv.outputs[0],'GREATER_THAN',.38);hi=compare(hsv.outputs[0],'LESS_THAN',.65);sat=compare(hsv.outputs[1],'GREATER_THAN',.15)
  both=n.new('ShaderNodeMath');both.operation='MULTIPLY';l.new(lo,both.inputs[0]);l.new(hi,both.inputs[1])
  cov=n.new('ShaderNodeMath');cov.name='Coverage';cov.operation='MULTIPLY';l.new(both.outputs[0],cov.inputs[0]);l.new(sat,cov.inputs[1])
  coloured=n.new('ShaderNodeMixRGB');l.new(cov.outputs[0],coloured.inputs[0]);l.new(tex.outputs['Color'],coloured.inputs[1]);l.new(mix.outputs[0],coloured.inputs[2]);l.new(coloured.outputs[0],bs.inputs['Base Color'])
 return m
primary_rgb=np.array(primary_pixels);primary_linear=np.where(primary_rgb<=.04045,primary_rgb/12.92,((primary_rgb+.055)/1.055)**2.4)
primary_gain=1/float(np.median(primary_linear@np.array([.2126,.7152,.0722])))
print('PRIMARY_GAIN',primary_gain)
polo=cloth('Polo primary cloth',primary_gain,(.05,.24,.22));trim=cloth('Polo secondary collar and cuffs',1,(.9,.82,.57))
oxford=cloth('Oxford pale primary cloth',primary_gain,(.65,.83,.76));oxcollar=cloth('Oxford collar',1,(.65,.83,.76));oxplain=cloth('Oxford fitted sleeve pocket and placket',1,(.65,.83,.76),False)
body.data.materials.append(polo);body.data.materials.append(trim)
for poly,role in zip(body.data.polygons,roles):poly.material_index=role
body.name='Clerk A with polo'
ox=body.copy();ox.data=body.data.copy();bpy.context.collection.objects.link(ox);ox.name='Clerk A with Oxford'
ox.data.materials[1]=oxford;ox.data.materials[2]=oxcollar
# Fit the Oxford directly to the continuous shoulder/arm surface. The original
# body supplies the seam; no detached tube or open shoulder edge is introduced.
ox.data.materials.append(oxplain)
for p in ox.data.polygons:
 c=sum((ox.data.vertices[v].co for v in p.vertices),Vector())/len(p.vertices)
 side='Left' if c.x>0 else 'Right';e=arm.data.bones[side+'ForeArm'].head_local;w=arm.data.bones[side+'Hand'].head_local
 fore=(w-e).normalized()
 arm_weight=sum(sum(g.weight for g in ox.data.vertices[v].groups if ox.vertex_groups[g.group].name in [side+'Arm',side+'ForeArm']) for v in p.vertices)/len(p.vertices)
 if arm_weight>.30 and (c-w).dot(fore)<.8:
  p.material_index=3
for v in ox.data.vertices:
 side='Left' if v.co.x>0 else 'Right';s0=arm.data.bones[side+'Arm'].head_local;e=arm.data.bones[side+'ForeArm'].head_local;w=arm.data.bones[side+'Hand'].head_local
 up=e-s0;fore=w-e;t=(v.co-s0).dot(up)/up.length_squared;u=(v.co-e).dot(fore)/fore.length_squared
 weights={ox.vertex_groups[g.group].name:g.weight for g in v.groups}
 aw=weights.get(side+'Arm',0)+weights.get(side+'ForeArm',0)
 if aw<.5 or abs(v.co.x)<17 or v.co.z<84:continue
 if .18<t<1.03 and u<.05:
  centre=s0+up*t;radial=v.co-centre
  if radial.length>9:continue
  target=6.0*(1-t)+4.8*t
  blend=min(1,(t-.18)/.16)*min(1,(1.03-t)/.13)
  if radial.length>0:v.co=centre+radial.normalized()*(radial.length*(1-blend)+target*blend)
 elif .05<=u<.98:
  centre=e+fore*u;radial=v.co-centre
  if radial.length>7:continue
  if radial.length>0:v.co+=radial.normalized()*.7*min(1,u/.15)*min(1,(.98-u)/.08)
ox.data.update()
# Recalculate normals only on the fitted sleeve surface; preserve face/hair normals.
cn=[tuple(n.vector) for n in ox.data.corner_normals]
for poly in ox.data.polygons:
 if poly.material_index==3:
  for li in poly.loop_indices:cn[li]=(0,0,0)
ox.data.normals_split_custom_set(cn)
print('CLOTH_VERTEX_DISPLACEMENT_MAX_CM',max((a.co-b.co).length for a,b in zip(body.data.vertices,ox.data.vertices)))

extras=[]
def skinned_mesh(name,verts,faces,weights,mat):
 me=bpy.data.meshes.new(name);me.from_pydata(verts,[],faces);me.update();o=bpy.data.objects.new(name,me);bpy.context.collection.objects.link(o);o.parent=arm;o.data.materials.append(mat)
 for group in sorted({g for weights_i in weights for g in weights_i}):o.vertex_groups.new(name=group)
 for i,ws in enumerate(weights):
  for g,w in ws.items():o.vertex_groups[g].add([i],w,'REPLACE')
 mod=o.modifiers.new('Same clerk skeleton','ARMATURE');mod.object=arm
 for f in me.polygons:f.use_smooth=True
 extras.append(o);return o
for side in ['Left','Right']:
 s=arm.data.bones[side+'Arm'].head_local.copy();e=arm.data.bones[side+'ForeArm'].head_local.copy();w=arm.data.bones[side+'Hand'].head_local.copy();up=(e-s).normalized();fore=(w-e).normalized()
 rings=[]
 # Only the wrist cuff is a separate fitted garment piece.
 for t,r in [(.86,3.7),(.90,3.8),(.99,3.8),(1.015,3.6),(1.015,3.25)]:rings.append((e.lerp(w,t),fore,r,{side+'ForeArm':1}))
 verts=[];faces=[];weights=[];N=24
 for i,(c,axis,r,ws) in enumerate(rings):
  # Blend across the elbow so the sleeve bends continuously with the body.



  tangent=Vector((0,-1,0));tangent=(tangent-axis*tangent.dot(axis)).normalized();cross=axis.cross(tangent).normalized()
  for j in range(N):
   angle=math.tau*j/N;v=c+r*(math.cos(angle)*tangent+math.sin(angle)*cross);verts.append(tuple(v));weights.append(ws)
  if i:
   for j in range(N):faces.append(((i-1)*N+j,(i-1)*N+(j+1)%N,i*N+(j+1)%N,i*N+j))
 skinned_mesh(side+' Oxford wrist cuff',verts,faces,weights,oxplain)
# Follow the actual shirt surface for fitted front details.
def surface(x,z,lift=.45):
 hit,loc,normal,idx=body.ray_cast(Vector((x,-60,z)),Vector((0,1,0)))
 if not hit:raise RuntimeError(f'No shirt surface for fitted detail at {x}, {z}')
 return (x,loc.y-lift,z)
verts=[];faces=[]
for i in range(15):
 z=85+i*(26/14)
 for x in [-1.3,1.3]:verts.append(surface(x,z))
 if i:faces.append(((i-1)*2,(i-1)*2+1,i*2+1,i*2))
weights=[{'Spine02':1} if v[2]<96 else {'Spine01':1} if v[2]<106 else {'Spine':1} for v in verts]
skinned_mesh('Oxford full button placket',verts,faces,weights,oxplain)
# Five-point stitched chest pocket, laid over the shirt rather than floating.
outline=[(4,107),(10,107),(10,101),(7,100),(4,101)]
verts=[surface(x,z,.7) for x,z in outline]
pocket=skinned_mesh('Oxford chest pocket',verts,[tuple(reversed(range(5)))],[{'Spine01':.7,'Spine':.3}]*5,oxplain)
bevel=pocket.modifiers.new('Pocket cloth thickness','SOLIDIFY');bevel.thickness=.18
button=cloth('Oxford buttons',1,(.88,.90,.84),False)
for z in [88,93,98,103,108]:
 c=Vector(surface(0,z,.9));verts=[tuple(c)]+[tuple(c+Vector((math.cos(i*math.tau/12)*.36,-.1,math.sin(i*math.tau/12)*.36))) for i in range(12)]
 faces=[(0,i+1,(i+1)%12+1) for i in range(12)];weights=[{'Spine02':1} if z<96 else {'Spine01':1} if z<106 else {'Spine':1}]*13
 skinned_mesh('Oxford button '+str(z),verts,faces,weights,button)

def outfit(style):
 body.hide_render=style!='polo';ox.hide_render=style!='oxford'
 for o in extras:o.hide_render=style!='oxford'

scene.world.use_nodes=True
scene.world.node_tree.nodes['Background'].inputs['Color'].default_value=(.65,.65,.65,1)
scene.world.node_tree.nodes['Background'].inputs['Strength'].default_value=.45
scene.render.resolution_x=256;scene.render.resolution_y=384;scene.cycles.samples=10
# A real, small rental case for shelf-working poses.
case_mat=cloth('Rental case',1,(.045,.05,.06),False)
label_mat=cloth('Rental insert',1,(.62,.66,.60),False)
def case_box(name,dimensions,mat):
 bpy.ops.mesh.primitive_cube_add(size=1);o=bpy.context.object;o.name=name;o.parent=arm
 o.scale=dimensions;bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
 o.data.materials.append(mat);bev=o.modifiers.new('Moulded case edges','BEVEL');bev.width=.32;bev.segments=2
 return o
case=case_box('Clerk rental case',(13,18,2.7),case_mat)
label=case_box('Rental case insert',(11.7,16.7,.15),label_mat)

def final_pose(anim,frame=0):
 if anim=='walk':pose('walk',[1,7,13,19][frame])
 elif anim=='stockHigh':
  pose('reach')
  if frame:aim('RightArm',(-.18,-.45,.85));aim('RightForeArm',(-.02,-.35,.93))
  aim('RightHand',(0,-.8,.55))
 elif anim in ['stockMid','type','stockLow']:
  pose('idle')
  if anim=='stockLow':
   aim('Spine02',(0,-.15,1))
   for side,sign in [('Left',1),('Right',-1)]:
    aim(side+'UpLeg',(sign*.12,-.58,-.8));aim(side+'Leg',(sign*.03,.4,-.9))
  for side,sign in [('Left',1),('Right',-1)]:
   aim(side+'Arm',(sign*.04,-.65,-.74) if anim=='stockLow' else (sign*.04,-.65,-.6) if anim=='type' else (sign*.04,-.8,-.4))
   aim(side+'ForeArm',(-sign*.45,-.9,-.20+frame*.08) if anim=='stockLow' else (-sign*.35,-1,.04+frame*.05) if anim=='type' else (-sign*.45,-1,.1+frame*.1))
   aim(side+'Hand',(-sign*.1,-1,-.05))
   if anim=='type':
    hand=arm.pose.bones[side+'Hand'];hand.matrix=hand.matrix@Matrix.Rotation(sign*math.pi/2,4,'Y');bpy.context.view_layer.update()
 elif anim=='talk':
  pose('talk')
  if frame:aim('LeftForeArm',(.50,-.8,.50))
 else:
  pose('idle')
  if frame:arm.pose.bones['Head'].rotation_mode='QUATERNION';arm.pose.bones['Head'].rotation_quaternion=Matrix.Rotation(.025,4,'Z').to_quaternion()
 root.location.z=0;bpy.context.view_layer.update()
 ev=body.evaluated_get(bpy.context.evaluated_depsgraph_get())
 root.location.z=-min((ev.matrix_world@v.co).z for v in ev.data.vertices)
 bpy.context.view_layer.update()
 hand=arm.pose.bones['RightHand'];rot=hand.matrix.to_quaternion()
 case.location=hand.head+rot@Vector((0,8,1.3));case.rotation_mode='QUATERNION';case.rotation_quaternion=rot
 label.location=case.location+rot@Vector((0,0,-1.5));label.rotation_mode='QUATERNION';label.rotation_quaternion=rot
 case.hide_render=label.hide_render=not anim.startswith('stock')

def save_source():
 outfit('polo');final_pose('idle')
 for o in extras:
  bpy.ops.object.select_all(action='DESELECT');o.select_set(True);bpy.context.view_layer.objects.active=o
  bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT');bpy.ops.uv.smart_project(island_margin=.02);bpy.ops.object.mode_set(mode='OBJECT')
 # Native collections make both garments easy to locate and switch in Blender.
 for name,objects in [('Polo uniform',[body]),('Oxford uniform',[ox,*extras])]:
  collection=bpy.data.collections.new(name);scene.collection.children.link(collection)
  for o in objects:
   for old in list(o.users_collection):old.objects.unlink(o)
   collection.objects.link(o)
   o.hide_set(name=='Oxford uniform')
 bpy.ops.object.select_all(action='DESELECT');arm.select_set(True);bpy.context.view_layer.objects.active=arm;arm.show_in_front=True
 for screen in bpy.data.screens:
  for area in screen.areas:
   if area.type=='VIEW_3D':
    area.spaces.active.region_3d.view_distance=8
    area.spaces.active.region_3d.view_location=(0,0,2.6)
    area.spaces.active.region_3d.view_rotation=cam.rotation_euler.to_quaternion()
 bpy.ops.file.pack_all();bpy.context.preferences.filepaths.save_version=0
 bpy.ops.wm.save_as_mainfile(filepath=str(R/'video-clerk.blend'))
 for o in [ox,*extras]:o.hide_set(False)

args=sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else []
# All vertices, including both garment variants, must have normalized weights.
for o in [body,ox,*extras]:
 for v in o.data.vertices:
  total=sum(g.weight for g in v.groups)
  if abs(total-1)>1e-5:raise RuntimeError(f'Unnormalized skin weights in {o.name}: {total}')
save_source()
if '--source-only' in args:sys.exit(0)
if '--render' in args:
 # Neutral cloth plus independent red/green coverage supports arbitrary brands.
 for m in [polo,trim,oxford,oxcollar,oxplain]:m.node_tree.nodes['Cloth colour'].outputs[0].default_value=(.72,.72,.72,1)
 dirs=['front','frontSide','side','backSide','back'];anims=[('idle',2),('walk',4),('stockHigh',2),('stockMid',2),('stockLow',2),('talk',2),('type',2)]
 metadata=[]
 for row,direction in enumerate(dirs):
  col=0
  for anim,count in anims:
   for frame in range(count):
    metadata.append({'row':row,'col':col,'direction':direction,'animation':anim,'frame':frame,'file':f'{row:02d}-{col:02d}_{direction}_{anim}{frame}.png'});col+=1
 for pass_name in ['color','livery']:
  if pass_name=='livery':
   for m in bpy.data.materials:
    m.use_nodes=True;nodes=m.node_tree.nodes;links=m.node_tree.links
    output=next((n for n in nodes if n.type=='OUTPUT_MATERIAL'),None) or nodes.new('ShaderNodeOutputMaterial');em=nodes.new('ShaderNodeEmission')
    role=(1,0,0,1) if m in [polo,oxford,oxcollar,oxplain] else (0,1,0,1) if m==trim else (0,0,0,1)
    em.inputs['Color'].default_value=role
    if nodes.get('Coverage'):
     mask=nodes.new('ShaderNodeMixRGB');mask.inputs[1].default_value=(0,0,0,1);mask.inputs[2].default_value=role
     links.new(nodes['Coverage'].outputs[0],mask.inputs[0]);links.new(mask.outputs[0],em.inputs['Color'])
    links.new(em.outputs[0],output.inputs['Surface'])
   scene.cycles.samples=2;scene.cycles.use_denoising=False
  for style in ['polo','oxford']:
   dest=OUT/style/pass_name;dest.mkdir(parents=True,exist_ok=True);outfit(style)
   for entry in metadata:
    final_pose(entry['animation'],entry['frame']);root.rotation_euler.z=entry['row']*math.pi/4
    scene.render.filepath=str(dest/entry['file']);bpy.ops.render.render(write_still=True)
 (OUT/'frames.json').write_text(json.dumps(metadata,indent=2))
else:
 scene.render.resolution_x=384;scene.render.resolution_y=576
 for name,style,anim,angle in [('polo-idle','polo','idle',0),('polo-walk','polo','walk',90),('oxford-idle','oxford','idle',0),('oxford-reach','oxford','stockHigh',45),('oxford-low','oxford','stockLow',90),('polo-type','polo','type',45)]:
  outfit(style);final_pose(anim,0);root.rotation_euler.z=math.radians(angle);scene.render.filepath=str(OUT/(name+'.png'));bpy.ops.render.render(write_still=True)
