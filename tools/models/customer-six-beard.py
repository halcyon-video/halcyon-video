"""A simple dark beard region fitted to the immutable original face.
Includes the upper lip while keeping the smiling lips and neck clear.
"""
import bpy,math,json
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]

def apply(arm,folder):
 head=bpy.data.objects['Customer 06 original head and face'];o=bpy.data.objects['Customer 06 fitted thick stubble'];hme=head.data
 # Duplicate only the facial surface. Neither the original face nor its albedo changes.
 selected=[p for p in hme.polygons if p.material_index==0 and p.center.y<2.0 and 129.5<p.center.z<141.2 and abs(p.center.x)<12.0]
 indices=sorted({i for p in selected for i in p.vertices});remap={old:new for new,old in enumerate(indices)}
 verts=[tuple(hme.vertices[i].co+hme.vertices[i].normal*.028) for i in indices]
 new=bpy.data.meshes.new('Customer 06 fitted beard area');new.from_pydata(verts,[],[tuple(remap[i] for i in p.vertices) for p in selected]);new.update()
 uv=new.uv_layers.new(name='UVMap')
 for p,source in zip(new.polygons,selected):
  for k,old in zip(p.loop_indices,source.loop_indices):uv.data[k].uv=hme.uv_layers.active.data[old].uv
  p.use_smooth=source.use_smooth
 o.data=new;o.matrix_world=head.matrix_world.copy();o.visible_shadow=False;o.vertex_groups.clear()
 for group in head.vertex_groups:o.vertex_groups.new(name=group.name)
 for i,old in enumerate(indices):
  for g in hme.vertices[old].groups:o.vertex_groups[g.group].add([i],g.weight,'REPLACE')
 # Face-projected coordinates keep a clean outline across the facial facets.
 # Lift the rear underside boundary to the jaw instead of painting the neck.
 def pigment_height(v):return v.z-.85*max(0,v.y+5)
 xmin=min(v.co.x for v in new.vertices);xmax=max(v.co.x for v in new.vertices);zmin=min(pigment_height(v.co) for v in new.vertices);zmax=max(pigment_height(v.co) for v in new.vertices)
 for loop in new.loops:
  v=new.vertices[loop.vertex_index].co;uv.data[loop.index].uv=(.02+.96*(v.x-xmin)/(xmax-xmin),.02+.96*(pigment_height(v)-zmin)/(zmax-zmin))
 # Author one even pigment region, without UV-island bake seams or hair noise.
 # Its outline includes the upper lip and curves around the existing smile.
 import numpy as np
 def smooth(value,width=.25):
  t=np.clip(value/width,0,1);return t*t*(3-2*t)
 x=xmin+((np.arange(1024,dtype=np.float32)+.5)/1024-.02)/.96*(xmax-xmin);x=x[None,:]
 z=zmin+((np.arange(1024,dtype=np.float32)+.5)/1024-.02)/.96*(zmax-zmin);z=z[:,None];ax=np.abs(x)
 lower=smooth(136.75+.052*ax*ax-z)
 cheeks=smooth(ax-4.45,.5)*smooth(138.1+.08*np.maximum(0,ax-5)-z)
 top=138.72-.045*ax-.12*np.maximum(0,1-ax);bottom=137.58+.034*ax*ax
 moustache=smooth(5.3-ax,.4)*smooth(top-z,.18)*smooth(z-bottom,.18)
 corners=smooth(ax-4.0,.25)*smooth(5.35-ax,.3)*smooth(138.58-z,.18)
 alpha=.72*smooth(z-131.35,.5)*smooth(10.45-ax,.4)*np.maximum(np.maximum(np.maximum(lower,cheeks),moustache),corners)
 pixels=np.empty((1024,1024,4),dtype=np.float32);pixels[:,:,:3]=(.028,.012,.006);pixels[:,:,3]=alpha
 texture=bpy.data.images.new('Customer 06 simple beard area',width=1024,height=1024,alpha=True);texture.pixels.foreach_set(pixels.ravel());texture.filepath_raw=str(folder/'stubble.png');texture.file_format='PNG';texture.save();texture.pack()
 m=bpy.data.materials.new('Customer 06 simple dark beard');m.use_nodes=True;new.materials.append(m);n=m.node_tree.nodes;l=m.node_tree.links;n.clear()
 output=n.new('ShaderNodeOutputMaterial');bs=n.new('ShaderNodeBsdfPrincipled');bs.inputs['Roughness'].default_value=1;bs.inputs['Specular IOR Level'].default_value=0
 tex=n.new('ShaderNodeTexImage');tex.image=texture;l.new(tex.outputs['Color'],bs.inputs['Base Color']);l.new(tex.outputs['Alpha'],bs.inputs['Alpha']);l.new(bs.outputs[0],output.inputs['Surface']);m.surface_render_method='DITHERED'
 o['beard_finish']='Simple connected dark beard and upper-lip moustache with visible lips'
 (folder/'beard-check.json').write_text(json.dumps({'finish':o['beard_finish'],'mouthCornersConnected':True,'cornerRange':[4.0,5.35],'uniformCoverage':.72,'follicleNoise':False,'headMeshUnmodified':True,'faceSurfaceOffset':.028,'beardFaces':len(new.polygons)},indent=2)+'\n')

if __name__=='__main__':
 folder=ROOT/'tools/models/cast/customer-06';bpy.ops.wm.open_mainfile(filepath=str(folder/'character.blend'));apply(bpy.data.objects['Armature'],folder)
 bpy.context.preferences.filepaths.save_version=0;bpy.ops.file.pack_all();bpy.ops.wm.save_as_mainfile(filepath=str(folder/'character.blend'))
 s=bpy.context.scene;s.cycles.device='CPU';s.cycles.samples=16;s.render.resolution_x=768;s.render.resolution_y=768;s.camera.data.ortho_scale=1.8;s.camera.location.z=5.17
 a=bpy.data.objects['Armature'];anchor=a.parent
 for obj in [a,anchor]:
  for tr in obj.animation_data.nla_tracks:tr.mute=tr.name!='idle'
 s.frame_set(0)
 for name,angle in [('front',0),('three-quarter',math.pi/4),('profile',math.pi/2)]:
  anchor.rotation_euler.z=angle;bpy.context.view_layer.update();s.render.filepath=str(ROOT/'scratch/customer-six-neck-beard'/f'beard-{name}.png');bpy.ops.render.render(write_still=True)
