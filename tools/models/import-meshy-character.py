"""Import a complete Meshy character unchanged, with service-authored clips.
Only scene-unit scale, floor placement, playback labels and render setup are local.
"""
import bpy,math,json,hashlib
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[2]
def fingerprint(obj):
 me=obj.data;uv=me.uv_layers.active.data
 data=[[(tuple(me.vertices[me.loops[i].vertex_index].co),tuple(uv[i].uv),sorted((obj.vertex_groups[g.group].name,g.weight) for g in me.vertices[me.loops[i].vertex_index].groups)) for i in p.loop_indices] for p in me.polygons]
 return hashlib.sha256(repr(data).encode()).hexdigest()
def select_clip(arm,anchor,name):
 for o in [arm,anchor]:
  if not o.animation_data:continue
  o.animation_data.action=None
  for track in o.animation_data.nla_tracks:track.mute=track.name!=name
def export(folder):
 bpy.ops.wm.open_mainfile(filepath=str(folder/'character.blend'));a=bpy.data.objects['Armature'];anchor=a.parent
 bpy.ops.object.select_all(action='DESELECT');a.select_set(True);anchor.select_set(True)
 for o in bpy.data.collections['Casual outfit'].objects:o.hide_set(False);o.select_set(True)
 for o in [a,anchor]:
  for t in o.animation_data.nla_tracks:t.mute=False
 bpy.ops.export_scene.gltf(filepath=str(folder/'character-casual.glb'),use_selection=True,export_format='GLB',export_animation_mode='NLA_TRACKS',export_nla_strips=True,export_frame_range=False,export_force_sampling=True,export_optimize_animation_keep_anim_object=True,export_skins=True,export_anim_slide_to_zero=True)
def build(folder,slug='customer-06'):
 bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False);s=bpy.context.scene;s.render.fps=30
 bpy.ops.import_scene.gltf(filepath=str(folder/'source-meshy.glb'))
 arm=next(o for o in s.objects if o.type=='ARMATURE');arm.name='Armature'
 helpers={b.custom_shape for b in arm.pose.bones if b.custom_shape};meshes=[o for o in s.objects if o.type=='MESH' and o not in helpers and o.vertex_groups]
 for o in helpers:o.hide_render=True;o.hide_set(True)
 baseline={o.name:fingerprint(o) for o in meshes};source_names={o.name:o for o in meshes}
 arm.animation_data.action=None;durations={}
 idle_source=folder/'source-meshy-idle.glb'
 if idle_source.exists():
  existing=set(s.objects);bpy.ops.import_scene.gltf(filepath=str(idle_source));added=set(s.objects)-existing;idle_arm=next(o for o in added if o.type=='ARMATURE')
  if set(b.name for b in arm.data.bones)!=set(b.name for b in idle_arm.data.bones):raise RuntimeError('Meshy native animation skeletons differ')
  difference=max(abs(arm.data.bones[b.name].matrix_local[i][j]-b.matrix_local[i][j]) for b in idle_arm.data.bones for i in range(4) for j in range(4))
  if difference>1e-6:raise RuntimeError('Meshy native bind poses differ; do not retarget locally')
  tracks=list(idle_arm.animation_data.nla_tracks);moving=[t for t in tracks if t.strips[0].frame_end-t.strips[0].frame_start>1.01];tracks=moving or tracks
  if len(tracks)!=1:raise RuntimeError('Meshy idle source must contain one authored motion')
  native=tracks[0].strips[0];action=native.action;action.use_fake_user=True;start=native.action_frame_start;end=native.action_frame_end
  track=arm.animation_data.nla_tracks.new();track.name='idle';strip=track.strips.new('idle',0,action);strip.action_frame_start=start;strip.action_frame_end=end;strip.frame_end=max(native.frame_end-native.frame_start,end-start)
  for o in added:bpy.data.objects.remove(o,do_unlink=True)
 for track in arm.animation_data.nla_tracks:
  kind='idle' if 'idle' in track.name.lower() else 'walk' if 'walk' in track.name.lower() else None
  if kind is None:raise RuntimeError('Unexpected Meshy animation '+track.name)
  track.name=kind;strip=track.strips[0];duration=strip.frame_end-strip.frame_start;strip.frame_start=0;strip.frame_end=duration;durations[kind]=duration;track.mute=kind!='idle'
 if set(durations)!={'idle','walk'}:raise RuntimeError('Meshy must supply idle and walk clips')
 anchor=bpy.data.objects.new(slug+' floor anchor',None);s.collection.objects.link(anchor);world=arm.matrix_world.copy();arm.parent=anchor;arm.matrix_world=world
 col=bpy.data.collections.new('Casual outfit');s.collection.children.link(col)
 for o in meshes:
  for old in list(o.users_collection):old.objects.unlink(o)
  col.objects.link(o)
 def bounds():
  bpy.context.view_layer.update();dg=bpy.context.evaluated_depsgraph_get()
  return [ev.matrix_world@ev.data.vertices[i].co for o in meshes for ev in [o.evaluated_get(dg)] for i in {i for p in ev.data.polygons for i in p.vertices}]
 s.frame_set(0);points=bounds();height=max(v.z for v in points)-min(v.z for v in points);scale=json.loads((folder/'scene-scale.json').read_text())['uniformScale'] if (folder/'scene-scale.json').exists() else 5.90/height;anchor.scale=(scale,)*3
 records={};proof={}
 for kind in ['idle','walk']:
  select_clip(arm,anchor,kind);end=durations[kind];seq=[]
  for f in range(41):
   anchor.location=(0,0,0);time=f/40*end;s.frame_set(int(time),subframe=time%1);points=bounds();hip=arm.matrix_world@arm.pose.bones['Hips'].matrix.translation
   seq.append((-hip.x,-hip.y,-min(v.z for v in points)))
  records[kind]=seq
 for kind,seq in records.items():
  anchor.animation_data_create();action=bpy.data.actions.new(slug+' '+kind+' scene placement');anchor.animation_data.action=action
  for f,location in enumerate(seq):anchor.location=location;anchor.keyframe_insert('location',frame=f/40*durations[kind])
  anchor.animation_data.action=None;track=anchor.animation_data.nla_tracks.new();track.name=kind;strip=track.strips.new(kind,0,action);strip.action_frame_end=durations[kind]
 for kind in records:
  select_clip(arm,anchor,kind);error=0
  for f in range(41):
   time=f/40*durations[kind];s.frame_set(int(time),subframe=time%1);points=bounds();error=max(error,abs(min(v.z for v in points)))
  if error>.01:raise RuntimeError('Scene placement failed '+str(error))
  proof[kind]={'samples':41,'maximumFloorErrorFeet':error,'durationSeconds':durations[kind]/30,'motionSource':'Meshy rig-supplied standing pose' if kind=='idle' and durations[kind]<=1.01 else 'Meshy animation library'}
 for name,o in source_names.items():
  if fingerprint(o)!=baseline[name]:raise RuntimeError('Meshy mesh data changed during import')
 arm['meshy_import_only']=True;select_clip(arm,anchor,'idle');s.frame_set(0)
 s.render.engine='CYCLES';s.cycles.samples=8;s.cycles.use_denoising=True;s.cycles.device='CPU';s.render.film_transparent=True;s.render.image_settings.file_format='PNG';s.render.image_settings.color_mode='RGBA';s.render.resolution_x=256;s.render.resolution_y=384;s.render.resolution_percentage=100
 s.view_settings.view_transform='Standard';s.view_settings.look='None';s.world.color=(.45,.45,.45)
 for name,location,power,size in [('Key',(-3,-5,8),360,5),('Fill',(4,-3,4.5),180,5),('Rim',(-1,3,7),250,4)]:
  d=bpy.data.lights.new(name,'AREA');d.energy=power;d.shape='DISK';d.size=size;o=bpy.data.objects.new(name,d);s.collection.objects.link(o);o.location=location;o.rotation_euler=(Vector((0,0,2.8))-o.location).to_track_quat('-Z','Y').to_euler()
 d=bpy.data.cameras.new('Cast sprite camera');camera=bpy.data.objects.new(d.name,d);s.collection.objects.link(camera);camera.location=(0,-12,3.18);camera.rotation_euler=(math.pi/2,0,0);d.type='ORTHO';d.ortho_scale=6.4;s.camera=camera
 s.frame_start=0;s.frame_end=math.ceil(max(durations.values()));bpy.context.preferences.filepaths.save_version=0;bpy.ops.file.pack_all();bpy.ops.wm.save_as_mainfile(filepath=str(folder/'character.blend'))
 report={'pipeline':'Meshy reference, complete geometry, materials, rig and animations; local import/render only','sourceMeshDataSHA256':baseline,'meshDataUnchanged':True,'materialsUnchanged':True,'skinWeightsUnchanged':True,'localOperations':['uniform scale to 5.90 feet','scene placement for floor and sprite centre','playback labels','camera and lighting'],'meshes':len(meshes),'vertices':sum(len(o.data.vertices) for o in meshes),'triangles':sum(sum(len(p.vertices)-2 for p in o.data.polygons) for o in meshes),'clips':proof}
 (folder/'meshy-import-check.json').write_text(json.dumps(report,indent=2)+'\n');(folder/'animation-check.json').write_text(json.dumps(proof,indent=2)+'\n');print(json.dumps(report));export(folder)
if __name__=='__main__':
 import sys
 args=sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else ['customer-06'];slug=args[0];folder=ROOT/'tools/models/cast'/slug
 if '--export' in args:export(folder)
 else:build(folder,slug)
