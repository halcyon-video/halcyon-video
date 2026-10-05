"""Fit the original black-ink skull decal to customer 06's anatomical left forearm.
The surface follows the body's skin weights; no character shape is regenerated.
"""
import bpy,json,math
import numpy as np
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[2]

def apply(body,arm,folder):
 name='Customer 06 left forearm flaming skull'
 old=bpy.data.objects.get(name)
 if old:bpy.data.objects.remove(old,do_unlink=True)
 elbow=arm.data.bones['LeftForeArm'].head_local;wrist=arm.data.bones['LeftHand'].head_local
 axis=wrist-elbow;length=axis.length;up=-axis.normalized()
 facing=Vector((0,-1,0));facing=(facing-up*facing.dot(up)).normalized();right=up.cross(facing).normalized()
 center=elbow+axis*.72;width=length*.34;height=length*.52
 image=next(n.image for n in body.data.materials[0].node_tree.nodes if n.type=='TEX_IMAGE')
 pixels=np.empty(image.size[0]*image.size[1]*4,dtype=np.float32);image.pixels.foreach_get(pixels);pixels=pixels.reshape(image.size[1],image.size[0],4)
 source_uv=body.data.uv_layers.active.data
 faces=[]
 for p in body.data.polygons:
  c=sum((body.data.vertices[v].co for v in p.vertices),Vector())/len(p.vertices)
  t=(c-elbow).dot(axis)/axis.length_squared
  weights={}
  for vi in p.vertices:
   for g in body.data.vertices[vi].groups:
    n=body.vertex_groups[g.group].name;weights[n]=weights.get(n,0)+g.weight/len(p.vertices)
  uv_center=sum((source_uv[li].uv for li in p.loop_indices),Vector((0,0)))/len(p.loop_indices)
  r,g,b=pixels[min(image.size[1]-1,max(0,int(uv_center.y*image.size[1]))),min(image.size[0]-1,max(0,int(uv_center.x*image.size[0]))),:3]
  exposed_skin=r>g*1.10 and g>b*1.15
  if weights.get('LeftForeArm',0)>.5 and .20<t<1.01 and p.normal.dot(facing)>.15 and exposed_skin:
   faces.append(tuple(p.vertices))
 del pixels
 ids=sorted({v for p in faces for v in p});index={v:i for i,v in enumerate(ids)}
 verts=[body.data.vertices[v].co+body.data.vertices[v].normal*.035 for v in ids]
 mesh=bpy.data.meshes.new(name);mesh.from_pydata(verts,[],[tuple(index[v] for v in p) for p in faces]);mesh.update()
 obj=bpy.data.objects.new(name,mesh);bpy.data.collections['Casual outfit'].objects.link(obj)
 obj.parent=arm;obj.matrix_world=body.matrix_world.copy()
 for g in body.vertex_groups:obj.vertex_groups.new(name=g.name)
 for old_id,new_id in index.items():
  for g in body.data.vertices[old_id].groups:obj.vertex_groups[g.group].add([new_id],g.weight,'REPLACE')
 mod=obj.modifiers.new('Same skin weights as left forearm','ARMATURE');mod.object=arm
 uv=mesh.uv_layers.new(name='Forearm tattoo')
 for p in mesh.polygons:
  p.use_smooth=True
  for li in p.loop_indices:
   d=mesh.vertices[mesh.loops[li].vertex_index].co-center
   uv.data[li].uv=(.5+d.dot(right)/width,.5+d.dot(up)/height)
 mat=bpy.data.materials.new('Black ink flaming skull');mat.use_nodes=True;nodes=mat.node_tree.nodes;links=mat.node_tree.links
 bs=nodes.get('Principled BSDF');bs.inputs['Base Color'].default_value=(.008,.008,.008,1);bs.inputs['Roughness'].default_value=.85;bs.inputs['Specular IOR Level'].default_value=.12
 tex=nodes.new('ShaderNodeTexImage');tex.image=bpy.data.images.load(str(folder/'flaming-skull.png'),check_existing=True);tex.extension='CLIP'
 links.new(tex.outputs['Alpha'],bs.inputs['Alpha']);mat.surface_render_method='DITHERED';mesh.materials.append(mat)
 obj['anatomical_side']='left';obj['design']='Original generated flaming skull; black pigment, transparent negative space'
 result={'side':'left','vertices':len(ids),'triangles':sum(len(p)-2 for p in faces),'widthFeet':width*body.matrix_world.to_scale().x,'heightFeet':height*body.matrix_world.to_scale().x,'sourceVertexIds':ids}
 (folder/'tattoo-placement.json').write_text(json.dumps(result,indent=2)+'\n')
 return obj

if __name__=='__main__':
 folder=ROOT/'tools/models/cast/customer-06';bpy.ops.wm.open_mainfile(filepath=str(folder/'character.blend'))
 body=bpy.data.objects['customer-06 body'];arm=bpy.data.objects['Armature'];apply(body,arm,folder)
 bpy.context.preferences.filepaths.save_version=0;bpy.ops.file.pack_all();bpy.ops.wm.save_as_mainfile(filepath=str(folder/'character.blend'))
 scene=bpy.context.scene;scene.cycles.device='CPU';scene.cycles.samples=12;scene.render.resolution_x=512;scene.render.resolution_y=768
 out=ROOT/'scratch/customer-six-tattoo';out.mkdir(parents=True,exist_ok=True)
 for row in [0,1,7]:
  arm.parent.rotation_euler.z=row*math.pi/4;scene.frame_set(0);scene.render.filepath=str(out/f'preview-{row}.png');bpy.ops.render.render(write_still=True)
