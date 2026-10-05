"""Render production customer sprites directly from the checked editable rig.
The existing clerk-sheet tool assembles the cells; WebP is a delivery encoding.
"""
import bpy,sys,math
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2];slug=sys.argv[-1]
if not slug.startswith('customer-'):raise RuntimeError('Select a customer identity')
bpy.ops.wm.open_mainfile(filepath=str(ROOT/'tools/models/cast'/slug/'character.blend'))
scene=bpy.context.scene;arm=bpy.data.objects['Armature'];anchor=arm.parent
scene.render.resolution_x=256;scene.render.resolution_y=384;scene.render.resolution_percentage=100
scene.cycles.samples=8;scene.cycles.use_denoising=True;scene.cycles.device='CPU'
out=ROOT/'scratch/cast-render'/slug/'casual/color';out.mkdir(parents=True,exist_ok=True)
for row in range(8 if slug=='customer-06' else 5):
 col=0
 for clip,count in [('idle',2),('walk',4),('idle',2)]:
  for obj in [arm,anchor]:
   for track in obj.animation_data.nla_tracks:track.mute=track.name!=clip
  track=next(t for t in arm.animation_data.nla_tracks if t.name==clip);end=track.strips[0].frame_end
  for frame in range(count):
   time=frame/count*end;scene.frame_set(int(time),subframe=time%1);anchor.rotation_euler.z=row*math.pi/4;bpy.context.view_layer.update()
   scene.render.filepath=str(out/f'{row:02d}-{col:02d}.png');bpy.ops.render.render(write_still=True);col+=1
