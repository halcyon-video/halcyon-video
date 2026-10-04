"""Clerk motion candidate. Blender authoring, anatomical rescale, finger skinning,
baked contact poses and standard glTF clips. Original source remains untouched."""
import bpy, math, json, sys
from pathlib import Path
from mathutils import Vector, Matrix, Quaternion
ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'scratch/clerk-motion';OUT.mkdir(parents=True,exist_ok=True)
if '--reuse-geometry' in sys.argv:
 bpy.ops.wm.open_mainfile(filepath=str(ROOT/'tools/models/video-clerk-motion.blend'))
 scene=bpy.context.scene;scene.render.fps=30
 arm=bpy.data.objects['Armature'];body=bpy.data.objects['Clerk A with polo'];ox=bpy.data.objects['Clerk A with Oxford']
 anchor=arm.parent;case=bpy.data.objects['Clerk rental case'];label=bpy.data.objects['Rental case insert']
 extras=[o for o in bpy.data.objects if o.type=='MESH' and o not in [body,ox,case,label] and not o.name.startswith('Review ')]
 for o in bpy.data.objects:o.animation_data_clear()
 for b in arm.pose.bones:b.matrix_basis=Matrix.Identity(4)
 anchor.location=(0,0,0);bpy.context.view_layer.update()
 fingers={(side,f):[f'{side}{f}{j}' for j in [1,2,3]] for side in ['Left','Right'] for f in ['Index','Middle','Ring','Little','Thumb']}
 cloth_report={'reusedAuthoredGeometry':True}
else:
 bpy.ops.wm.open_mainfile(filepath=str(ROOT/'tools/models/video-clerk.blend'))
 scene=bpy.context.scene;scene.render.fps=30
 arm=bpy.data.objects['Armature'];body=bpy.data.objects['Clerk A with polo'];ox=bpy.data.objects['Clerk A with Oxford']
 anchor=arm.parent;anchor.location=(0,0,0)
 case=bpy.data.objects['Clerk rental case'];label=bpy.data.objects['Rental case insert']
 extras=[o for o in bpy.data.objects if o.type=='MESH' and o not in [body,ox,case,label]]
 for o in [ox,*extras]:o.hide_set(False)
 arm.animation_data_clear()
 for b in arm.pose.bones:b.matrix_basis=Matrix.Identity(4)
 bpy.context.view_layer.update()
 # Ten percent shorter leg region; ten percent longer torso; head size retained.
 def shape(p):
  p=p.copy();z=p.z
  p.z=z*.90 if z<80 else 72+(z-80)*1.10 if z<115 else z-4.5
  return p
 for o in [body,ox,*extras]:
  for v in o.data.vertices:v.co=shape(v.co)
  o.data.update()
 bpy.context.view_layer.objects.active=arm;bpy.ops.object.mode_set(mode='EDIT')
 for b in arm.data.edit_bones:b.head=shape(b.head);b.tail=shape(b.tail)
 bpy.ops.object.mode_set(mode='OBJECT')
 # Refine the source garment before skinning and motion sampling.
 import runpy
 cloth_report=runpy.run_path(str(ROOT/'tools/models/clerk-cloth.py'))['refine_cloth'](arm,body,ox,extras)
 bpy.context.view_layer.objects.active=arm
 # Preserve original skin and digit geometry; add three phalanges per finger.
 hand_frames={s:arm.data.bones[s+'Hand'].matrix_local.copy() for s in ['Left','Right']}
 fingers={};segments={}
 bpy.ops.object.mode_set(mode='EDIT')
 for side,sgn in [('Left',1),('Right',-1)]:
  M=hand_frames[side]
  for fi,(finger,z,end) in enumerate([('Index',4.1,18),('Middle',1.3,20),('Ring',-1.4,19),('Little',-4,16.8)]):
   pts=[Vector((0,y,z)) for y in [8.8,12.5,15.7,end]];names=[]
   for j in range(3):
    n=f'{side}{finger}{j+1}';b=arm.data.edit_bones.new(n);b.head=M@pts[j];b.tail=M@pts[j+1];b.parent=arm.data.edit_bones[names[-1] if names else side+'Hand'];b.align_roll(M.to_3x3()@Vector((0,0,1)));names.append(n)
   fingers[side,finger]=names;segments[side,finger]=pts
  pts=[Vector((sgn*2.5,3.8,2.0)),Vector((sgn*5.3,7,2.4)),Vector((sgn*6,10,2.3)),Vector((sgn*6,12.5,2.1))];names=[]
  for j in range(3):
   n=f'{side}Thumb{j+1}';b=arm.data.edit_bones.new(n);b.head=M@pts[j];b.tail=M@pts[j+1];b.parent=arm.data.edit_bones[names[-1] if names else side+'Hand'];b.align_roll(M.to_3x3()@Vector((0,0,1)));names.append(n)
  fingers[side,'Thumb']=names;segments[side,'Thumb']=pts
 bpy.ops.object.mode_set(mode='OBJECT')
 for o in [body,ox]:
  for names in fingers.values():
   for name in names:o.vertex_groups.new(name=name)
  for v in o.data.vertices:
   side='Left' if v.co.x>0 else 'Right';sgn=1 if side=='Left' else -1
   ws={o.vertex_groups[g.group].name:g.weight for g in v.groups}
   hw=ws.get(side+'Hand',0)
   if hw<.45:continue
   p=hand_frames[side].inverted()@v.co
   thumb=p.x*sgn>2.9 and p.y>4
   f='Thumb' if thumb else min(['Index','Middle','Ring','Little'],key=lambda f:abs(p.z-segments[side,f][0].z))
   pts=segments[side,f];names=fingers[side,f]
   start=4.8 if thumb else 8.7;blend=max(0,min(1,(p.y-start)/2))
   if blend<=0:continue
   # Smooth distribution across joints rather than rigid face islands.
   centres=[(pts[i].y+pts[i+1].y)*.5 for i in range(3)]
   vals=[max(0,1-abs(p.y-c)/3.7) for c in centres]
   if sum(vals)==0:vals[-1]=1
   total=sum(vals)
   o.vertex_groups[side+'Hand'].add([v.index],hw*(1-blend),'REPLACE')
   for n,w in zip(names,vals):o.vertex_groups[n].add([v.index],hw*blend*w/total,'REPLACE')
# Read Quaternius's licensed authored walking action for motion reference.
existing=set(bpy.data.objects)
refpath=ROOT/'tools/models/clerk-motion-reference.glb'
bpy.ops.import_scene.gltf(filepath=str(refpath))
ref=next(o for o in bpy.data.objects if o not in existing and o.type=='ARMATURE')
ref.animation_data_create();refwalk=next(a for a in bpy.data.actions if a.name=='Walk_Loop')
ref.animation_data.action=refwalk;ref.animation_data.action_slot=refwalk.slots[0]
mapnames={'Hips':'pelvis','Spine02':'spine_01','Spine01':'spine_02','Spine':'spine_03','neck':'neck_01','Head':'Head'}
for side,short in [('Left','l'),('Right','r')]:
 for dst,src in [('Shoulder','clavicle'),('Arm','upperarm'),('ForeArm','lowerarm'),('Hand','hand'),('UpLeg','thigh'),('Leg','calf'),('Foot','foot'),('ToeBase','ball')]:mapnames[side+dst]=src+'_'+short
# Source rest and motion directions in world axes, captured before removal.
walk_samples=[]
for fi in range(41):
 rf=refwalk.frame_range[0]+(refwalk.frame_range[1]-refwalk.frame_range[0])*fi/40;scene.frame_set(int(rf),subframe=rf%1)
 sample={}
 for dst,src in mapnames.items():
  b=ref.pose.bones[src];r=ref.data.bones[src]
  posed=(ref.matrix_world@b.matrix).to_quaternion();rest=(ref.matrix_world@r.matrix_local).to_quaternion()
  sample[dst]=(posed@rest.inverted(),(ref.matrix_world.to_3x3()@(b.tail-b.head)).normalized())
 walk_samples.append(sample)
for o in list(bpy.data.objects):
 if o not in existing:bpy.data.objects.remove(o,do_unlink=True)
# Studio interaction geometry, in the same armature-space centimetres.
def box(name,loc,dims,color):
 existing=bpy.data.objects.get(name)
 if existing:return existing
 bpy.ops.mesh.primitive_cube_add(size=1);o=bpy.context.object;o.name=name;o.parent=arm;o.location=loc;o.scale=dims
 bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
 m=bpy.data.materials.new(name);m.diffuse_color=(*color,1);m.use_nodes=True;m.node_tree.nodes.get('Principled BSDF').inputs['Base Color'].default_value=(*color,1);m.node_tree.nodes.get('Principled BSDF').inputs['Roughness'].default_value=.8;o.data.materials.append(m)
 bevel=o.modifiers.new('Soft manufactured edges','BEVEL');bevel.width=.5;bevel.segments=2
 return o
shelf=box('Review shelf',(0,-42,110),(65,24,2),(.19,.26,.32))
keyboard=box('Review keyboard',(0,-31,77),(32,12,2),(.18,.20,.21))
# Case made vertical, gripped on its two narrow sides. Existing source mesh retained.
case.rotation_mode=label.rotation_mode='QUATERNION'
for o in [case,label]:o.animation_data_clear()
rest={b.name:b.matrix_local.copy() for b in arm.data.bones}
def update():bpy.context.view_layer.update()
def aim(name,direction):
 b=arm.pose.bones[name];m=b.matrix.copy();q=(m.to_3x3()@Vector((0,1,0))).rotation_difference(Vector(direction))
 b.matrix=Matrix.Translation(m.translation)@q.to_matrix().to_4x4()@m.to_3x3().to_4x4();update()
def rot(name,angle,axis):
 b=arm.pose.bones[name];b.matrix=b.matrix@Matrix.Rotation(angle,4,axis);update()
def reset():
 arm.animation_data_clear();anchor.animation_data_clear();anchor.location=(0,0,0);anchor.rotation_euler=(0,0,0)
 for b in arm.pose.bones:b.matrix_basis=Matrix.Identity(4);b.rotation_mode='QUATERNION'
 update()
def hand_curl(side,value):
 sign=-1 if side=='Left' else 1
 for f in ['Index','Middle','Ring','Little','Thumb']:
  for i,n in enumerate(fingers[side,f]):
   arm.pose.bones[n].rotation_quaternion=Quaternion((0,0,1),sign*value*([.65,.9,.7][i] if f!='Thumb' else [.25,.4,.35][i]))
 update()
def neutral(t=0):
 reset()
 for side,s in [('Left',1),('Right',-1)]:
  aim(side+'Arm',(s*.43,.025,-1));aim(side+'ForeArm',(s*.06,-.15,-1));aim(side+'Hand',(s*.14,-.06,-1))
  aim(side+'UpLeg',(s*.10,0,-1));aim(side+'Leg',(s*.025,0,-1));hand_curl(side,.20)
 rot('Spine02',.013*math.sin(t*math.tau),'Y');rot('Head',.02*math.sin(t*math.tau),'Z')
# Two-link reach authoring with a measured outward/downward elbow guide.
# This fixes the imported rig's asymmetric IK pole rolls, without stretching skin.
constraints=[]
def wrist(side,point,finger_dir,palm_normal,elbow_width=45):
 s=1 if side=='Left' else -1
 upper=arm.pose.bones[side+'Arm'];lower=arm.pose.bones[side+'ForeArm']
 shoulder=upper.head.copy();target=Vector(point);v=target-shoulder
 L1=arm.data.bones[side+'Arm'].length;L2=arm.data.bones[side+'ForeArm'].length
 d=min(v.length,L1+L2-.15);axis=v.normalized()
 pole=Vector((s*elbow_width,10,75))-shoulder;bend=(pole-axis*pole.dot(axis)).normalized()
 along=(L1*L1-L2*L2+d*d)/(2*d);height=math.sqrt(max(0,L1*L1-along*along))
 elbow=shoulder+axis*along+bend*height
 aim(side+'Arm',elbow-shoulder);aim(side+'ForeArm',target-elbow)
 y=Vector(finger_dir).normalized();x=Vector(palm_normal);x=(x-y*x.dot(y)).normalized();z=x.cross(y).normalized()
 b=arm.pose.bones[side+'Hand'];b.matrix=Matrix.Translation(b.head)@Matrix((x,y,z)).transposed().to_4x4();update()
def smooth(a,b,t):
 t=max(0,min(1,t));return a+(b-a)*(t*t*(3-2*t))
def lerp(a,b,t):return Vector(a).lerp(Vector(b),t)
DUR={'idle':3.2,'walk':1.3,'stockHigh':4.4,'stockMid':4.2,'stockLow':4.8,'talk':3.2,'type':2.4}
def pose(anim,u):
 for c in constraints:c.influence=0
 neutral(u)
 shelf.location.z={'stockHigh':112,'stockMid':84,'stockLow':46}.get(anim,84)
 shelf.hide_render=not anim.startswith('stock');keyboard.hide_render=anim!='type'
 case.hide_render=label.hide_render=not anim.startswith('stock')
 if anim=='walk':
  reset()
  # Preserve the clerk's connected rest spine and clavicles. The previous
  # world-matrix transfer imported incompatible pelvic/spinal bends and moved
  # shoulder and hip joint heads away from their parents.
  ph=u*math.tau
  aim('Hips',(.012*math.sin(ph),0,1))
  rot('Hips',math.radians(1.2)*math.cos(ph),'Y')
  for side,s in [('Left',1),('Right',-1)]:
   # Keep the forward contact leg extended. The old independent thigh
   # attenuation erased its reach while retaining the rearward shin bend.
   step=u*math.tau+(0 if s==1 else math.pi)
   thigh=math.radians(3+36*math.cos(step))
   knee=math.radians(4+30*max(0,-math.sin(step))**2)
   shin=thigh-knee
   aim(side+'UpLeg',(s*.045,-math.sin(thigh),-math.cos(thigh)))
   aim(side+'Leg',(s*.020,-math.sin(shin),-math.cos(shin)))
   # Heel-first contact at the forward step, toe-off behind the body.
   delta=Quaternion((1,0,0),-math.radians(8)*math.cos(step))
   foot=arm.pose.bones[side+'Foot'];foot.matrix=Matrix.Translation(foot.head)@delta.to_matrix().to_4x4()@rest[side+'Foot'].to_3x3().to_4x4();update()
   arm.pose.bones[side+'ToeBase'].matrix_basis=Matrix.Identity(4);update()
   swing=math.cos(ph+(0 if s==1 else math.pi))
   aim(side+'Arm',(s*.40,.15*swing,-1));aim(side+'ForeArm',(s*.05,-.12+.12*swing,-1));aim(side+'Hand',(s*.10,-.12+.12*swing,-1));hand_curl(side,.20)
 elif anim.startswith('stock'):
  # Place -> release -> withdraw -> regrip -> retrieve; case stays seated
  # between release and regrip, so looping never moves an unsupported prop.
  rise=smooth(0,1,(u-.08)/.24)*(1-smooth(0,1,(u-.84)/.16));withdraw=smooth(0,1,(u-.44)/.14)*(1-smooth(0,1,(u-.64)/.14))
  z=shelf.location.z+10.2
  # Lift clear before crossing the shelf edge; reverse this sequence to retrieve.
  if u<=.84:
   lift=smooth(0,1,(u-.04)/.14);push=smooth(0,1,(u-.18)/.10);seat=smooth(0,1,(u-.28)/.04)
   centre=Vector((0,smooth(-23,-33,push),85+(z+3-85)*lift-3*seat))
  else:
   lift=smooth(0,1,(u-.84)/.04);pull=smooth(0,1,(u-.88)/.06);lower=smooth(0,1,(u-.94)/.06)
   centre=Vector((0,smooth(-33,-23,pull),z+3*lift+(85-z-3)*lower))
  if anim=='stockLow':
   crouch=smooth(0,1,(u-.04)/.14)*(1-smooth(0,1,(u-.94)/.06))
   aim('LeftUpLeg',(.10,-1.60*crouch,-1));aim('RightUpLeg',(-.10,-1.60*crouch,-1))
   aim('LeftLeg',(.02,1.60*crouch,-1));aim('RightLeg',(-.02,1.60*crouch,-1))
   aim('Spine02',(0,-.60*crouch,1))
   for side in ['Left','Right']:
    for part in ['Foot','ToeBase']:
     bone=arm.data.bones[side+part];aim(side+part,bone.tail_local-bone.head_local)
  anchor.location.z=0;update();ev=body.evaluated_get(bpy.context.evaluated_depsgraph_get());anchor.location.z=-min((ev.matrix_world@v.co).z for v in ev.data.vertices);update()
  ground_cm=anchor.location.z/arm.matrix_world.to_scale().z
  centre.z-=ground_cm; shelf.location.z-=ground_cm
  rot('Spine',-.065*rise,'X');rot('Head',-.09*rise if anim=='stockHigh' else .09*rise,'X')
  case.location=centre;case.rotation_quaternion=Quaternion((1,0,0),math.pi/2)
  label.location=centre+Vector((0,1.55,0));label.rotation_quaternion=case.rotation_quaternion
  for side,s in [('Left',1),('Right',-1)]:
   # The palm reaches the case; the wrist stays behind it and the fingers
   # continue forward from the forearm, rather than standing vertically.
   contact=centre+Vector((s*9.1,1.0,0))
   home=Vector((s*25,-10,80))
   palm=contact.lerp(home,withdraw)
   # Solve to the palm with the forearm plus palm length as one rigid link.
   # This keeps the wrist neutral through the whole lift and withdrawal.
   shoulder=arm.pose.bones[side+'Arm'].head.copy()
   L1=arm.data.bones[side+'Arm'].length;L2=arm.data.bones[side+'ForeArm'].length
   v=palm-shoulder;d=min(v.length,L1+L2+8.8-.15);axis=v.normalized()
   pole=Vector((s*32,8,min(100,palm.z-12)))-shoulder
   bend=(pole-axis*pole.dot(axis)).normalized()
   along=(L1*L1-(L2+8.8)**2+d*d)/(2*d)
   elbow=shoulder+axis*along+bend*math.sqrt(max(0,L1*L1-along*along))
   direction=(palm-elbow).normalized()
   aim(side+'Arm',elbow-shoulder);aim(side+'ForeArm',direction)
   hand=arm.pose.bones[side+'Hand'];y=direction;x=Vector((-1,0,0));x=(x-y*x.dot(y)).normalized();z=x.cross(y).normalized()
   hand.matrix=Matrix.Translation(hand.head)@Matrix((x,y,z)).transposed().to_4x4();update()
   hand_curl(side,.75*(1-smooth(0,1,(u-.37)/.06)+smooth(0,1,(u-.78)/.06))+.15)
 elif anim=='talk':
  wave=(1-math.cos(u*math.tau))*.5
  wrist('Left',(25,-16-8*wave,88+7*wave),(.25,-.25,1),(0,-1,0));hand_curl('Left',.15)
  rot('Head',.055*math.sin(u*math.tau),'Z')
 elif anim=='type':
  for side,s in [('Left',1),('Right',-1)]:
   wrist(side,(s*10,-22,82),(0,-1,-.1),(0,0,-s))
   for fi,f in enumerate(['Index','Middle','Ring','Little']):
    for j,n in enumerate(fingers[side,f]):arm.pose.bones[n].rotation_quaternion=Quaternion((0,0,1),(-s)*(.12+.18*max(0,math.sin(u*math.tau*4+fi+(0 if s==1 else 2))))*(1 if j==0 else .5))
   update()
 # Ground the actual deformed shoes, including crouching. No whole-body bounce.
 anchor.location.z=0;update();ev=body.evaluated_get(bpy.context.evaluated_depsgraph_get());anchor.location.z=-min((ev.matrix_world@v.co).z for v in ev.data.vertices);update()
 # Bake constraint evaluation into bones before saving samples.
 matrices={b.name:b.matrix.copy() for b in arm.pose.bones}
 for c in constraints:c.influence=0
 for b in arm.pose.bones:b.matrix=matrices[b.name];update()
 return {'wrist':{s:list(arm.pose.bones[s+'Hand'].head) for s in ['Left','Right']},'case':list(case.location)}

if '--probe' in sys.argv:
 scene.render.resolution_x=600;scene.render.resolution_y=700;scene.cycles.samples=12
 cam=scene.camera;cam.data.ortho_scale=5.8;cam.location=(5,-9,4);cam.rotation_euler=(Vector((0,-.2,2.5))-cam.location).to_track_quat('-Z','Y').to_euler()
 for anim,u in [('walk',0),('walk',.75),('stockHigh',.33),('stockMid',.33),('stockLow',.33)]:
  pose(anim,u);scene.render.filepath=str(OUT/(anim+'-'+str(u)+'-probe.png'));bpy.ops.render.render(write_still=True)
 sys.exit(0)

# Sample all motions before attaching any actions: evaluation is deterministic.
samples={};report={'cloth':cloth_report,'proportions':{'legScale':.90,'torsoScale':1.10},'fingerBones':30,'clips':{},'source':'Authored heel-to-chest walking cycle and contact actions; Quaternius reference retained for provenance'}
for anim,duration in DUR.items():
 count=round(duration*30);frames=[]
 for fi in range(count+1):
  telemetry=pose(anim,fi/count)
  frames.append({'bones':{b.name:(b.location.copy(),b.rotation_quaternion.copy(),b.scale.copy()) for b in arm.pose.bones},'anchor':anchor.location.copy(),'case':(case.location.copy(),case.rotation_quaternion.copy()),'label':(label.location.copy(),label.rotation_quaternion.copy()),'shelf':shelf.location.copy()})
 samples[anim]=frames;report['clips'][anim]={'frames':count+1,'duration':duration,'first':telemetry}
 print('SAMPLED',anim,flush=True)
for c in constraints:arm.pose.bones['LeftForeArm' if c==constraints[0] else 'RightForeArm'].constraints.remove(c)
# NLA tracks of the same name merge armature, case and floor anchor in glTF.
for o in [arm,anchor,case,label,shelf]:o.animation_data_clear()
for anim,frames in samples.items():
 for o in [arm,anchor,case,label,shelf]:
  o.animation_data_create();o.animation_data.action=bpy.data.actions.new(anim+' '+o.name)
  if o in [case,label]:o.rotation_mode='QUATERNION'
 for fi,frame in enumerate(frames):
  for b in arm.pose.bones:
   b.location,b.rotation_quaternion,b.scale=frame['bones'][b.name]
   for path in ['location','rotation_quaternion','scale']:b.keyframe_insert(path,frame=fi,group=b.name)
  anchor.location=frame['anchor'];anchor.keyframe_insert('location',frame=fi)
  for o,key in [(case,'case'),(label,'label')]:
   o.location,o.rotation_quaternion=frame[key];o.keyframe_insert('location',frame=fi);o.keyframe_insert('rotation_quaternion',frame=fi)
  shelf.location=frame['shelf'];shelf.keyframe_insert('location',frame=fi)
 for o in [arm,anchor,case,label,shelf]:
  a=o.animation_data.action;a.use_fake_user=True
  tr=o.animation_data.nla_tracks.new();tr.name=anim;st=tr.strips.new(anim,0,a);st.action_frame_end=len(frames)-1
  o.animation_data.action=None;tr.mute=True
# Remove imported source actions which aren't part of this export.
scene.frame_start=0;scene.frame_end=max(len(fs)-1 for fs in samples.values())
for o in [case,label,shelf,keyboard]:o.hide_render=False
for o in [arm,anchor,case,label,shelf]:
 for tr in o.animation_data.nla_tracks:tr.mute=tr.name!='idle'
scene.frame_set(0)
keep={strip.action for o in [arm,anchor,case,label,shelf] for track in o.animation_data.nla_tracks for strip in track.strips}
for action in list(bpy.data.actions):
 if action not in keep:bpy.data.actions.remove(action)
for o in [case,label,shelf,keyboard]:o.hide_render=True
bpy.ops.file.pack_all();bpy.context.preferences.filepaths.save_version=0
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'tools/models/video-clerk-motion.blend'))
# Bake the existing cloth pigment boundaries using Blender's native EMIT bake.
# Flat polygon colours otherwise dye hem triangles and lose the original seams.
for im in bpy.data.images:
 if im.size[0]>2048:im.scale(2048,2048)
def bake_cloth(o,style):
 originals=list(o.data.materials)
 source_uv=o.data.uv_layers.active.name
 baked_uv=source_uv
 if style=='oxford':
  baked_uv='Oxford review atlas'
  o.data.uv_layers.new(name=baked_uv);o.data.uv_layers.active=o.data.uv_layers[baked_uv];o.data.uv_layers[baked_uv].active_render=True
  bpy.ops.object.select_all(action='DESELECT');o.hide_set(False);o.hide_render=False;o.select_set(True);bpy.context.view_layer.objects.active=o
  bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT');bpy.ops.uv.smart_project(island_margin=.004);bpy.ops.object.mode_set(mode='OBJECT')
 image=bpy.data.images.new('Clerk '+style+' baked colour',width=2048,height=2048,alpha=True)
 for i,source in enumerate(originals):
  m=source.copy();o.data.materials[i]=m;nodes=m.node_tree.nodes;links=m.node_tree.links
  # The shader still reads the original UVs while the target bake uses its
  # own atlas; new sleeve topology must not overwrite a source texture island.
  for tex_node in list(nodes):
   if tex_node.type=='TEX_IMAGE' and not tex_node.inputs['Vector'].is_linked:
    source_map=nodes.new('ShaderNodeUVMap');source_map.uv_map=source_uv;links.new(source_map.outputs['UV'],tex_node.inputs['Vector'])
  output=next(n for n in nodes if n.type=='OUTPUT_MATERIAL')
  surface=output.inputs['Surface'].links[0].from_node
  if surface.type=='BSDF_PRINCIPLED':
   emission=nodes.new('ShaderNodeEmission')
   color=surface.inputs['Base Color']
   if color.is_linked:links.new(color.links[0].from_socket,emission.inputs['Color'])
   else:emission.inputs['Color'].default_value=color.default_value
   links.new(emission.outputs[0],output.inputs['Surface'])
  target=nodes.new('ShaderNodeTexImage');target.image=image;nodes.active=target
 bpy.ops.object.select_all(action='DESELECT');o.hide_set(False);o.hide_render=False;o.select_set(True);bpy.context.view_layer.objects.active=o
 scene.render.engine='CYCLES';scene.cycles.samples=1
 bpy.ops.object.bake(type='EMIT',margin=4,use_clear=True)
 m=bpy.data.materials.new('Baked '+style+' colour');m.use_nodes=True
 bs=m.node_tree.nodes.get('Principled BSDF');bs.inputs['Roughness'].default_value=.85
 tex=m.node_tree.nodes.new('ShaderNodeTexImage');tex.image=image;uv_map=m.node_tree.nodes.new('ShaderNodeUVMap');uv_map.uv_map=baked_uv;m.node_tree.links.new(uv_map.outputs['UV'],tex.inputs['Vector']);m.node_tree.links.new(tex.outputs['Color'],bs.inputs['Base Color'])
 o.data.materials.clear();o.data.materials.append(m)
 for poly in o.data.polygons:poly.material_index=0
 image.pack()
for o,style in [(body,'polo'),(ox,'oxford')]:bake_cloth(o,style)
# Separate cuffs/buttons use their source flat pigment, which maps directly to PBR.
for o in extras+[case,label]:
 for m in o.data.materials:
  if not m.use_nodes:continue
  rgb=m.node_tree.nodes.get('Cloth colour')
  if rgb:
   color=tuple(rgb.outputs[0].default_value);m.node_tree.nodes.clear();out=m.node_tree.nodes.new('ShaderNodeOutputMaterial');bs=m.node_tree.nodes.new('ShaderNodeBsdfPrincipled');bs.inputs['Base Color'].default_value=color;bs.inputs['Roughness'].default_value=.85;m.node_tree.links.new(bs.outputs[0],out.inputs['Surface'])
for style in ['polo','oxford']:
 bpy.ops.object.select_all(action='DESELECT')
 for o in [arm,anchor,case,label,shelf,keyboard]+([body] if style=='polo' else [ox,*extras]):o.hide_set(False);o.select_set(True)
 for o in [arm,anchor,case,label,shelf]:
  for tr in o.animation_data.nla_tracks:tr.mute=False
 bpy.ops.export_scene.gltf(filepath=str(OUT/f'clerk-{style}.glb'),use_selection=True,export_format='GLB',export_animation_mode='NLA_TRACKS',export_nla_strips=True,export_frame_range=False,export_force_sampling=True,export_optimize_animation_keep_anim_object=True,export_skins=True,export_anim_slide_to_zero=True)
report['weights']={o.name:{'vertices':len(o.data.vertices),'maxError':max(abs(1-sum(g.weight for g in v.groups)) for v in o.data.vertices)} for o in [body,ox]}
(OUT/'rig-report.json').write_text(json.dumps(report,indent=2));print('MOTION_EXPORT_COMPLETE',flush=True)
