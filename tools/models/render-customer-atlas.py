"""Render grounded cast idle/walking sprites from checked editable rigs.
Clerk B keeps its existing working cells; customer browse repeats idle.
"""
import bpy,sys,math,shutil
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2];args=sys.argv[sys.argv.index('--')+1:];slug=args[0]
def option(name,default):return Path(args[args.index(name)+1]).resolve() if name in args else default
source=option('--source-dir',ROOT/'tools/models/cast'/slug)
render=option('--render-dir',ROOT/'scratch/cast-render'/slug)
if not (slug.startswith('customer-') or slug=='clerk-b'):raise RuntimeError('Select a cast identity')
bpy.ops.wm.open_mainfile(filepath=str(source/'character.blend'))
scene=bpy.context.scene;arm=bpy.data.objects['Armature'];anchor=arm.parent
scene.render.resolution_x=256;scene.render.resolution_y=384;scene.render.resolution_percentage=100
scene.cycles.samples=8;scene.cycles.use_denoising=True;scene.cycles.device='CPU'
styles=['polo','oxford'] if slug=='clerk-b' else ['casual']
cloth=[m for m in bpy.data.materials if m.name in ['Uniform primary','Oxford pale primary']]
trim=[m for m in bpy.data.materials if m.name=='Uniform secondary']
for style in styles:
 if slug=='clerk-b':
  for collection in ['Polo outfit','Oxford outfit']:
   for obj in bpy.data.collections[collection].objects:obj.hide_render=collection!=style.title()+' outfit';obj.hide_set(False)
  for m in cloth+trim:m.node_tree.nodes.get('Principled BSDF').inputs['Base Color'].default_value=(.72,.72,.72,1)
 for passname in (['color','livery'] if slug=='clerk-b' else ['color']):
  out=render/style/passname;out.mkdir(parents=True,exist_ok=True);backup=[]
  if passname=='livery':
   for m in bpy.data.materials:
    if not m.use_nodes:continue
    nodes=m.node_tree.nodes;links=m.node_tree.links;output=next((n for n in nodes if n.type=='OUTPUT_MATERIAL'),None)
    if not output:continue
    previous=output.inputs['Surface'].links[0].from_socket if output.inputs['Surface'].links else None
    em=nodes.new('ShaderNodeEmission');em.inputs[0].default_value=(1,0,0,1) if m in cloth else (0,1,0,1) if m in trim else (0,0,0,1);links.new(em.outputs[0],output.inputs['Surface']);backup.append((m,output,previous,em))
   scene.cycles.samples=1;scene.cycles.use_denoising=False
  for row in range(8 if slug=='customer-06' else 5):
   col=0
   for clip,count in [('idle',2),('walk',4)]:
    for obj in [arm,anchor]:
     for track in obj.animation_data.nla_tracks:track.mute=track.name!=clip
    track=next(t for t in arm.animation_data.nla_tracks if t.name==clip);end=track.strips[0].frame_end
    for frame in range(count):
     time=frame/count*end;scene.frame_set(int(time),subframe=time%1);anchor.rotation_euler.z=row*math.pi/4;bpy.context.view_layer.update()
     for old in out.glob(f'{row:02d}-{col:02d}_*.png'):old.unlink()
     scene.render.filepath=str(out/f'{row:02d}-{col:02d}.png');bpy.ops.render.render(write_still=True);col+=1
   if slug!='clerk-b':
    for f in range(2):shutil.copyfile(out/f'{row:02d}-{f:02d}.png',out/f'{row:02d}-{f+6:02d}.png')
  for m,output,previous,em in backup:
   if previous:m.node_tree.links.new(previous,output.inputs['Surface'])
   m.node_tree.nodes.remove(em)
  scene.cycles.samples=8;scene.cycles.use_denoising=True
