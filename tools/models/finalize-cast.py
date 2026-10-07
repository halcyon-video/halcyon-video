"""Export the authored cast as reusable skinned GLBs with grounded captured clips.
Run after build-cast.py; does not modify the shipped sprite pixels.
"""
import bpy,json,sys,runpy
from pathlib import Path
from mathutils import Matrix,Vector
ROOT=Path(__file__).resolve().parents[2]
args=sys.argv[sys.argv.index('--')+1:];slug=args[0]
folder=Path(args[args.index('--source-dir')+1]).resolve() if '--source-dir' in args else ROOT/'tools/models/cast'/slug
if slug=='customer-06':
 if not (folder/'source-meshy.glb').exists():raise RuntimeError('Customer six requires the complete Meshy source')
 runpy.run_path(str(ROOT/'tools/models/import-meshy-character.py'))['export'](folder)
 sys.exit(0)
bpy.ops.wm.open_mainfile(filepath=str(folder/'character.blend'))
arm=bpy.data.objects['Armature'];anchor=arm.parent;body=bpy.data.objects.get(slug+' body')
if body is None:raise RuntimeError('No primary character body')
scene=bpy.context.scene
# Plain garment details still receive editable UVs for future material work.
for obj in bpy.context.scene.objects:
 if obj.type=='MESH' and not obj.data.uv_layers:
  obj.hide_set(False);bpy.ops.object.select_all(action='DESELECT');obj.select_set(True);bpy.context.view_layer.objects.active=obj
  bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT');bpy.ops.uv.smart_project(island_margin=.02);bpy.ops.object.mode_set(mode='OBJECT')
for o in [arm,anchor]:o.animation_data_clear()
def update():bpy.context.view_layer.update()
def reset():
 arm.animation_data_clear()
 for b in arm.pose.bones:b.matrix_basis=Matrix.Identity(4)
 update()
def aim(name,direction):
 b=arm.pose.bones[name];mat=b.matrix.copy();q=(mat.to_3x3()@Vector((0,1,0))).rotation_difference(Vector(direction));b.matrix=Matrix.Translation(mat.translation)@q.to_matrix().to_4x4()@mat.to_3x3().to_4x4();update()
mod=runpy.run_path(str(ROOT/'tools/models/clerk-captured-motion.py'));clips,apply=mod['make_retarget'](arm,reset,aim,lambda side,n:None,update,ROOT)
walk='walkSteady' if slug in ['clerk-b','customer-02','customer-04','customer-06','customer-08','customer-10'] else 'walkCompact'
def floor_height():
 objects=[o for o in bpy.data.collections[('Polo' if slug=='clerk-b' else 'Casual')+' outfit'].objects if o.type=='MESH']
 return min((ev.matrix_world@ev.data.vertices[i].co).z for o in objects for ev in [o.evaluated_get(bpy.context.evaluated_depsgraph_get())] for i in {i for p in ev.data.polygons for i in p.vertices})
recorded={}
for kind in ['idle','walk']:
 seq=[]
 for f in range(41):
  anchor.location=(0,0,0);anchor.rotation_euler=(0,0,0);apply(walk if kind=='walk' else 'idle',f/40)
  anchor.location.z=-floor_height();update()
  seq.append(({b.name:(tuple(b.location),tuple(b.rotation_quaternion),tuple(b.scale)) for b in arm.pose.bones},tuple(anchor.location)))
 recorded[kind]=seq
for o in [arm,anchor]:o.animation_data_clear()
for kind,seq in recorded.items():
 endFrame=clips[walk if kind=='walk' else 'idle']['duration']*30
 for obj in [arm,anchor]:
  obj.animation_data_create();action=bpy.data.actions.new(slug+' '+kind+(' rig' if obj==arm else ' ground'));obj.animation_data.action=action
  for f,(bones,loc) in enumerate(seq):
   frame=f/40*endFrame
   if obj==arm:
    for name,(location,rotation,scale) in bones.items():
     b=arm.pose.bones[name];b.rotation_mode='QUATERNION';b.location=location;b.rotation_quaternion=rotation;b.scale=scale
     for prop in ['location','rotation_quaternion','scale']:b.keyframe_insert(prop,frame=frame)
   else:anchor.location=loc;anchor.keyframe_insert('location',frame=frame)
  obj.animation_data.action=None;track=obj.animation_data.nla_tracks.new();track.name=kind;strip=track.strips.new(kind,0,action);strip.action_frame_end=endFrame;track.mute=True
# Validate animated deformed bounds at every baked sample, in both clips.
proof={}
for kind in recorded:
 for obj in [arm,anchor]:
  for tr in obj.animation_data.nla_tracks:tr.mute=tr.name!=kind
 floors=[];hand_checks=[]
 for f in range(41):
  frame=f/40*clips[walk if kind=='walk' else 'idle']['duration']*30
  scene.frame_set(int(frame),subframe=frame%1);update();floors.append(floor_height())
  calibration=json.loads(arm['hand_calibration'])
  for side,sign in [('Left',1),('Right',-1)]:
   hand=arm.pose.bones[side+'Hand'];axis=(hand.tail-hand.head).normalized();normal=hand.matrix.to_3x3()@Vector(calibration[side]['palmNormalLocal']);normal=(normal-axis*normal.dot(axis)).normalized()
   medial=Vector((-sign,-.12,0));medial=(medial-axis*medial.dot(axis)).normalized()
   hand_checks.append(normal.dot(medial))
 proof[kind]={'samples':41,'maximumFloorErrorFeet':max(abs(z) for z in floors),'minimumPalmMedialAlignment':min(hand_checks)}
 if proof[kind]['minimumPalmMedialAlignment']<.65:raise RuntimeError(f'{slug} {kind} palm faces away from thigh')
 if proof[kind]['maximumFloorErrorFeet']>.01:raise RuntimeError(f'{slug} {kind} failed grounding {proof[kind]}')
for obj in [arm,anchor]:
 for tr in obj.animation_data.nla_tracks:tr.mute=tr.name!='idle'
scene.frame_set(0);scene.frame_start=0;scene.frame_end=90
bpy.context.preferences.filepaths.save_version=0;bpy.ops.file.pack_all();bpy.ops.wm.save_as_mainfile(filepath=str(folder/'character.blend'))
styles=['polo','oxford'] if slug=='clerk-b' else ['casual']
for style in styles:
 bpy.ops.object.select_all(action='DESELECT');arm.select_set(True);anchor.select_set(True)
 for obj in bpy.data.collections[style.title()+' outfit'].objects:obj.hide_set(False);obj.select_set(True)
 for obj in [arm,anchor]:
  for tr in obj.animation_data.nla_tracks:tr.mute=False
 bpy.ops.export_scene.gltf(filepath=str(folder/('character-'+style+'.glb')),use_selection=True,export_format='GLB',export_animation_mode='NLA_TRACKS',export_nla_strips=True,export_frame_range=False,export_force_sampling=True,export_optimize_animation_keep_anim_object=True,export_skins=True,export_anim_slide_to_zero=True)
proof['exports']={style:(folder/('character-'+style+'.glb')).stat().st_size for style in styles}
(folder/'animation-check.json').write_text(json.dumps(proof,indent=2));print(json.dumps({'id':slug,**proof}))
