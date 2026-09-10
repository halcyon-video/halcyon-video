"""Bake geometric phone occlusion using Cycles; preserves source geometry.
blender -b -t 2 --python tools/models/bake-telephone-surfaces.py -- source.blend output.glb
The temporary receiver plane becomes a runtime worktop aoMap, never visible art.
"""
import bpy, sys
from pathlib import Path
source, target = map(Path, sys.argv[sys.argv.index('--')+1:])
bpy.ops.wm.open_mainfile(filepath=str(source))
bpy.ops.object.select_all(action='SELECT')
bpy.context.view_layer.objects.active=next(o for o in bpy.context.selected_objects if o.type=='MESH')
bpy.ops.object.convert(target='MESH'); bpy.ops.object.join()
phone=bpy.context.object; phone.name='Corded telephone assembly'
bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT')
bpy.ops.uv.smart_project(island_margin=.012); bpy.ops.object.mode_set(mode='OBJECT')
scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=256;scene.render.bake.margin=4
scene.world=scene.world or bpy.data.worlds.new('World');scene.world.light_settings.distance=.35
# AO is exported through glTF's occlusion input, never multiplied into base color.
group=bpy.data.node_groups.new('glTF Material Output','ShaderNodeTree')
group.interface.new_socket(name='Occlusion',in_out='INPUT',socket_type='NodeSocketFloat')
def image(name,size):
 im=bpy.data.images.new(name,size,size,alpha=False);im.colorspace_settings.name='Non-Color';return im
def bake(obj,im):
 bpy.ops.object.select_all(action='DESELECT');obj.select_set(True);bpy.context.view_layer.objects.active=obj
 for mat in obj.data.materials:
  n=mat.node_tree.nodes.new('ShaderNodeTexImage');n.image=im;mat.node_tree.nodes.active=n
 bpy.ops.object.bake(type='AO')
 im.pack()
 return n
# Supporting worktop participates in the phone's underside occlusion.
bpy.ops.mesh.primitive_plane_add(size=1.5,location=(0,0,0));plane=bpy.context.object;plane.name='TelephoneContactBake'
m=bpy.data.materials.new('TelephoneContactBake');m.use_nodes=True;plane.data.materials.append(m)
ao=image('TelephoneOcclusion',512);bake(phone,ao)
for mat in phone.data.materials:
 nodes=mat.node_tree.nodes;tex=next(n for n in nodes if n.type=='TEX_IMAGE' and n.image==ao)
 output=nodes.new('ShaderNodeGroup');output.node_tree=group;mat.node_tree.links.new(tex.outputs['Color'],output.inputs['Occlusion'])
 bsdf=nodes.get('Principled BSDF');name=mat.name.lower()
 bsdf.inputs['Roughness'].default_value=.82 if 'rubber' in name else .30 if 'handset' in name else .43 if 'keys' in name else .40
contact=image('TelephoneWorktopOcclusion',256);tex=bake(plane,contact)
m.node_tree.links.new(tex.outputs['Color'],m.node_tree.nodes['Principled BSDF'].inputs['Base Color'])
bpy.ops.object.select_all(action='SELECT')
bpy.ops.export_scene.gltf(filepath=str(target),export_format='GLB',export_apply=True,export_yup=True)
print('BAKED',target,target.stat().st_size)
