"""Short granular facial hair with faded cheek and jaw edges.
Preserves original face vertices, original head UVs and skin binding.
"""
import bpy,bmesh,math,json
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
def apply(arm,folder):
 o=bpy.data.objects['Customer 06 fitted thick stubble'];me=o.data
 m=me.materials[0];m=m.copy();m.name='Customer 06 fine dark stubble';me.materials.clear();me.materials.append(m);m.use_nodes=True;n=m.node_tree.nodes;l=m.node_tree.links;n.clear()
 output=n.new('ShaderNodeOutputMaterial');bs=n.new('ShaderNodeBsdfPrincipled');bs.inputs['Base Color'].default_value=(.026,.012,.008,1);bs.inputs['Roughness'].default_value=1;bs.inputs['Specular IOR Level'].default_value=.02;l.new(bs.outputs[0],output.inputs['Surface'])
 coord=n.new('ShaderNodeTexCoord');grain=n.new('ShaderNodeTexVoronoi');grain.voronoi_dimensions='3D';grain.feature='F1';grain.distance='EUCLIDEAN';grain.inputs['Scale'].default_value=115;l.new(coord.outputs['Generated'],grain.inputs['Vector'])
 ramp=n.new('ShaderNodeValToRGB');ramp.color_ramp.elements[0].position=.26;ramp.color_ramp.elements[0].color=(.95,.95,.95,1);ramp.color_ramp.elements[1].position=.47;ramp.color_ramp.elements[1].color=(0,0,0,1);l.new(grain.outputs['Distance'],ramp.inputs[0])
 # Fade polygon boundary discontinuities, especially around cheeks and mouth.
 bm=bmesh.new();bm.from_mesh(me);bm.verts.ensure_lookup_table();boundary={v.index for e in bm.edges if e.is_boundary for v in e.verts};neighbors={v.index:[e.other_vert(v).index for e in v.link_edges] for v in bm.verts};bm.free()
 distance={i:0 for i in boundary};front=set(boundary)
 for step in range(1,5):
  nxt={j for i in front for j in neighbors[i] if j not in distance}
  for j in nxt:distance[j]=step
  front=nxt
 color=me.color_attributes.get('Stubble edge coverage') or me.color_attributes.new(name='Stubble edge coverage',type='FLOAT_COLOR',domain='CORNER')
 for loop in me.loops:
  v=me.vertices[loop.vertex_index];edge=min(1,(distance.get(v.index,5)+.15)/2.2)
  # The neck gets little pigment; the chin remains visibly textured, not plated.
  headweight=sum(g.weight for g in v.groups if o.vertex_groups[g.group].name=='Head');neckfade=max(0,min(1,(headweight-.22)/.48));coverage=edge*neckfade
  color.data[loop.index].color=(coverage,coverage,coverage,1)
 attribute=n.new('ShaderNodeVertexColor');attribute.layer_name=color.name;mix=n.new('ShaderNodeMath');mix.operation='MULTIPLY';l.new(ramp.outputs['Color'],mix.inputs[0]);l.new(attribute.outputs['Color'],mix.inputs[1]);l.new(mix.outputs[0],bs.inputs['Alpha']);m.surface_render_method='DITHERED'
 # Bake the procedural coverage into an actual RGBA material for GLB parity.
 import numpy as np
 bake=bpy.data.images.new('Customer 06 stubble coverage bake',width=1024,height=1024,alpha=True);bake.colorspace_settings.name='Non-Color';target=n.new('ShaderNodeTexImage');target.image=bake;n.active=target
 emission=n.new('ShaderNodeEmission');l.new(mix.outputs[0],emission.inputs['Color']);l.new(emission.outputs[0],output.inputs['Surface'])
 bpy.ops.object.select_all(action='DESELECT');o.hide_set(False);o.select_set(True);bpy.context.view_layer.objects.active=o;scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=1;scene.render.bake.margin=8;bpy.ops.object.bake(type='EMIT')
 pixels=np.empty(1024*1024*4,dtype=np.float32);bake.pixels.foreach_get(pixels);pixels=pixels.reshape(-1,4);alpha=pixels[:,0].copy();pixels[:,:3]=(.026,.012,.008);pixels[:,3]=alpha
 texture=bpy.data.images.new('Customer 06 baked fine stubble',width=1024,height=1024,alpha=True);texture.pixels.foreach_set(pixels.ravel());texture.filepath_raw=str(folder/'stubble.png');texture.file_format='PNG';texture.save();texture.pack()
 n.clear();output=n.new('ShaderNodeOutputMaterial');bs=n.new('ShaderNodeBsdfPrincipled');bs.inputs['Roughness'].default_value=1;bs.inputs['Specular IOR Level'].default_value=.02;tex=n.new('ShaderNodeTexImage');tex.image=texture;l.new(tex.outputs['Color'],bs.inputs['Base Color']);l.new(tex.outputs['Alpha'],bs.inputs['Alpha']);l.new(bs.outputs[0],output.inputs['Surface']);m.surface_render_method='DITHERED'
 o['beard_finish']='Short dark follicles; feathered cheeks, mouth and neck; no solid chin mask' 
 (folder/'beard-check.json').write_text(json.dumps({'finish':o['beard_finish'],'follicleScale':115,'coverageThresholds':[.26,.47],'boundaryFadeRings':2.2,'headMeshUnmodified':True},indent=2)+'\n')
if __name__=='__main__':
 folder=ROOT/'tools/models/cast/customer-06';bpy.ops.wm.open_mainfile(filepath=str(folder/'character.blend'));apply(bpy.data.objects['Armature'],folder)
 bpy.context.preferences.filepaths.save_version=0;bpy.ops.file.pack_all();bpy.ops.wm.save_as_mainfile(filepath=str(folder/'character.blend'))
 s=bpy.context.scene;s.cycles.device='CPU';s.cycles.samples=32;s.render.resolution_x=768;s.render.resolution_y=768;s.camera.data.ortho_scale=1.8;s.camera.location.z=5.17;a=bpy.data.objects['Armature'];anchor=a.parent
 for obj in [a,anchor]:
  for tr in obj.animation_data.nla_tracks:tr.mute=tr.name!='idle'
 s.frame_set(0)
 for name,angle in [('front',0),('three-quarter',math.pi/4),('profile',math.pi/2)]:
  anchor.rotation_euler.z=angle;bpy.context.view_layer.update();s.render.filepath=str(ROOT/'scratch/customer-six-seams'/f'beard-after-{name}.png');bpy.ops.render.render(write_still=True)
