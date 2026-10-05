"""Editable brown vest, short sleeves, jeans, stubble and harness boots.
Works on the preserved skinned base. The original reference stays provenance.
"""
import bpy,bmesh,math,json,numpy as np
from pathlib import Path
from mathutils import Vector,Matrix
ROOT=Path(__file__).resolve().parents[2]

def apply(body,arm,folder):
 if body.get('brown_wardrobe'):return
 body['brown_wardrobe']=True
 image=next(n.image for n in body.data.materials[0].node_tree.nodes if n.type=='TEX_IMAGE')
 pixels=np.empty(image.size[0]*image.size[1]*4,dtype=np.float32);image.pixels.foreach_get(pixels);pixels=pixels.reshape(image.size[1],image.size[0],4)
 uv=body.data.uv_layers.active.data
 def color(p):
  t=sum((uv[i].uv for i in p.loop_indices),Vector((0,0)))/len(p.loop_indices)
  return pixels[min(image.size[1]-1,max(0,int(t.y*image.size[1]))),min(image.size[0]-1,max(0,int(t.x*image.size[0]))),:3]
 def mat(name,rgb,texture=False,rough=.85):
  m=bpy.data.materials.new(name);m.use_nodes=True;bs=m.node_tree.nodes.get('Principled BSDF');bs.inputs['Base Color'].default_value=(*rgb,1);bs.inputs['Roughness'].default_value=rough;bs.inputs['Specular IOR Level'].default_value=.12
  if texture:
   tex=m.node_tree.nodes.new('ShaderNodeTexImage');tex.image=image;bw=m.node_tree.nodes.new('ShaderNodeRGBToBW');scale=m.node_tree.nodes.new('ShaderNodeMath');scale.operation='MULTIPLY_ADD';scale.inputs[1].default_value=.38;scale.inputs[2].default_value=.62;mix=m.node_tree.nodes.new('ShaderNodeMixRGB');mix.blend_type='MULTIPLY';mix.inputs[0].default_value=1;mix.inputs[2].default_value=(*rgb,1)
   m.node_tree.links.new(tex.outputs['Color'],bw.inputs[0]);m.node_tree.links.new(bw.outputs[0],scale.inputs[0]);m.node_tree.links.new(scale.outputs[0],mix.inputs[1]);m.node_tree.links.new(mix.outputs[0],bs.inputs['Base Color'])
  return m
 leather=mat('Customer 06 brown leather vest',(.19,.075,.032),True)
 shirt=mat('Customer 06 maroon T shirt',(.23,.035,.060),True)
 denim=mat('Customer 06 brown denim jeans',(.16,.095,.060),True)
 skin=mat('Customer 06 exposed upper arms',(.58,.34,.17))
 boot=mat('Customer 06 brown boot leather',(.21,.085,.036),False,.65)
 sole=mat('Customer 06 dark boot soles',(.025,.020,.016))
 brass=mat('Customer 06 boot ring and chain',(.62,.38,.12),False,.35);brass.node_tree.nodes.get('Principled BSDF').inputs['Metallic'].default_value=.8
 for m in [leather,shirt,denim,skin]:body.data.materials.append(m)
 hip=arm.data.bones['Hips'].head_local.z;neck=arm.data.bones['neck'].head_local.z
 denim_verts=set();arm_verts={};shoe_faces=[];beard_faces=[];skin_samples=[]
 for p in body.data.polygons:
  c=sum((body.data.vertices[v].co for v in p.vertices),Vector())/len(p.vertices);r,g,b=color(p)
  ws={}
  for vi in p.vertices:
   for w in body.data.vertices[vi].groups:
    n=body.vertex_groups[w.group].name;ws[n]=ws.get(n,0)+w.weight/len(p.vertices)
  blue=b>r*1.10 and b>g*1.03
  if r>g*1.15 and g>b*1.20 and max(ws.get('LeftForeArm',0),ws.get('RightForeArm',0))>.5:skin_samples.append((r,g,b))
  if blue and hip*.91<c.z<neck*1.12:
   side='Left' if c.x>0 else 'Right';shoulder=arm.data.bones[side+'Arm'].head_local;elbow=arm.data.bones[side+'ForeArm'].head_local;axis=elbow-shoulder;t=(c-shoulder).dot(axis)/axis.length_squared
   if ws.get(side+'Arm',0)+ws.get(side+'ForeArm',0)>.45 and t>.09:
    p.material_index=2 if t<.44 else 4
    if t>.40:
     for vi in p.vertices:arm_verts[vi]=side
   else:p.material_index=1
  elif c.z<hip*.98 and g>r*.90 and g>b*1.04 and not blue:
   p.material_index=3;denim_verts.update(p.vertices)
  elif c.z<18:
   shoe_faces.append(p.index)
  # Lower face only: skin pigment prevents painting hair and eyes. The stubble
  # follows the original facial mesh and leaves the mouth's expression intact.
  if r>g*1.15 and g>b*1.2 and c.y<7 and abs(c.x)<11 and 130<c.z<138 and (c.z<135.7+abs(c.x)*.22 or abs(c.x)<4) and p.normal.y<-.05:
   beard_faces.append(tuple(p.vertices))
 if skin_samples:
  rgb=np.median(np.array(skin_samples),axis=0);linear=np.where(rgb<=.04045,rgb/12.92,((rgb+.055)/1.055)**2.4);skin.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value=(*linear,1)
 for vi,side in arm_verts.items():
  v=body.data.vertices[vi];s=arm.data.bones[side+'Arm'].head_local;e=arm.data.bones[side+'ForeArm'].head_local;w=arm.data.bones[side+'Hand'].head_local
  a=e-s;t=(v.co-s).dot(a)/a.length_squared
  a2=w-e;u=(v.co-e).dot(a2)/a2.length_squared
  centre=s+a*t if t<1 else e+a2*u
  radial=v.co-centre;radius=4.7 if t<1 else 4.4*(1-u)+3.0*u
  blend=min(1,max(0,(t-.40)/.20))
  if radial.length>0:v.co=centre+radial.normalized()*(radial.length*(1-blend)+radius*blend)
 # Ease out the rolled cuff topology without opening the continuous skin.
 bm=bmesh.new();bm.from_mesh(body.data);bm.verts.ensure_lookup_table();affected=[bm.verts[i] for i in arm_verts]
 for iteration in range(8):bmesh.ops.smooth_vert(bm,verts=affected,factor=.55,use_axis_x=True,use_axis_y=True,use_axis_z=True)
 bm.to_mesh(body.data);bm.free()
 for vi in denim_verts:
  v=body.data.vertices[vi]
  if v.co.z<40:
   side='Left' if v.co.x>0 else 'Right';ankle=arm.data.bones[side+'Foot'].head_local;knee=arm.data.bones[side+'Leg'].head_local
   t=max(0,min(1,(v.co.z-6)/34));z=22+18*t
   axis=knee-ankle;centre=ankle+axis*((z-ankle.z)/axis.z);radial=Vector((v.co.x-centre.x,v.co.y-centre.y,0));radius=5.9+(radial.length-5.9)*t
   v.co=Vector((centre.x,centre.y,z))+radial.normalized()*radius
 body.data.update()
 cn=[tuple(n.vector) for n in body.data.corner_normals]
 for p in body.data.polygons:
  if p.material_index in [2,4]:
   p.use_smooth=True
   for li in p.loop_indices:cn[li]=(0,0,0)
 body.data.normals_split_custom_set(cn)
 def mesh(name,verts,faces,material,weights):
  me=bpy.data.meshes.new(name);me.from_pydata(verts,[],faces);me.update();o=bpy.data.objects.new(name,me);bpy.data.collections['Casual outfit'].objects.link(o);o.parent=arm;o.data.materials.append(material)
  for bone in {n for ws in weights for n in ws}:o.vertex_groups.new(name=bone)
  for i,ws in enumerate(weights):
   for n,w in ws.items():o.vertex_groups[n].add([i],w,'REPLACE')
  mod=o.modifiers.new('Customer skin attachment','ARMATURE');mod.object=arm
  for p in me.polygons:p.use_smooth=True
  return o
 # Fitted stubble with transparent speckling, no added beard silhouette.
 ids=sorted({v for p in beard_faces for v in p});lookup={v:i for i,v in enumerate(ids)}
 stubble=mat('Customer 06 short dense beard',(.055,.028,.018))
 nodes=stubble.node_tree.nodes;links=stubble.node_tree.links;noise=nodes.new('ShaderNodeTexNoise');noise.inputs['Scale'].default_value=250
 ramp=nodes.new('ShaderNodeValToRGB');ramp.color_ramp.elements[0].position=.30;ramp.color_ramp.elements[0].color=(.25,.25,.25,1);ramp.color_ramp.elements[1].position=.60;ramp.color_ramp.elements[1].color=(.55,.55,.55,1);links.new(noise.outputs['Fac'],ramp.inputs[0]);links.new(ramp.outputs['Color'],nodes.get('Principled BSDF').inputs['Alpha']);stubble.surface_render_method='DITHERED'
 mesh('Customer 06 fitted thick stubble',[body.data.vertices[i].co+body.data.vertices[i].normal*.025 for i in ids],[tuple(lookup[i] for i in p) for p in beard_faces],stubble,[{body.vertex_groups[g.group].name:g.weight for g in body.data.vertices[i].groups} for i in ids])
 # Replace the sneaker surface with complete boot construction.
 bm=bmesh.new();bm.from_mesh(body.data);bm.faces.ensure_lookup_table();bmesh.ops.delete(bm,geom=[bm.faces[i] for i in set(shoe_faces)],context='FACES');bmesh.ops.delete(bm,geom=[v for v in bm.verts if not v.link_faces],context='VERTS');bm.to_mesh(body.data);bm.free()
 for side,sign in [('Left',1),('Right',-1)]:
  ankle=arm.data.bones[side+'Foot'].head_local;cx=ankle.x;cy=ankle.y
  def ring_surface(name,rings,material):
   verts=[];faces=[];weights=[];N=32
   for z,width,front,back in rings:
    for i in range(N):
     a=i*math.tau/N;x=math.cos(a)*width;y=math.sin(a)*(back if math.sin(a)>0 else front);verts.append((cx+x,cy+y,z));blend=max(0,min(.65,(z-13)/17));weights.append({side+'Foot':1-blend,side+'Leg':blend})
   for j in range(len(rings)-1):
    for i in range(N):faces.append((j*N+i,j*N+(i+1)%N,(j+1)*N+(i+1)%N,(j+1)*N+i))
   faces.extend([tuple(reversed(range(N))),tuple((len(rings)-1)*N+i for i in range(N))]);return mesh(name,verts,faces,material,weights)
  ring_surface(side+' boot sole',[(1.1,6.0,21,7),(3.1,6.3,21.3,7.2),(4.0,6.0,20.8,6.9)],sole)
  ring_surface(side+' fitted boot vamp',[(4.0,5.8,20.5,6.5),(6,6.0,20.2,6.5),(9,5.6,17.8,6.2),(12,5.2,11,6),(14,5.1,7,6)],boot)
  ring_surface(side+' low boot shaft',[(9,5.1,6.8,5.8),(16,5.4,6.5,6),(25,5.7,6.3,6.1),(30,5.8,6.3,6.2)],boot)
  ring_surface(side+' boot harness strap',[(12.7,5.8,7.8,6.7),(15.0,5.8,7.8,6.7)],leather)
  verts=[(cx+x,cy+y,z) for z in [0,3.2] for x,y in [(-5.3,0),(5.3,0),(5.3,6.8),(-5.3,6.8)]]
  mesh(side+' stacked boot heel',verts,[(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)],sole,[{side+'Foot':1}]*8)
  # Oval metal links lie on the outside of each ankle, alternating planes.
  for link in range(6):
   centre=Vector((cx+sign*6.4,cy+link*.95,13.6-link*1.55));R=2.25 if link==0 else 1.05;verts=[];faces=[]
   for j in range(20):
    a=j*math.tau/20
    for k in range(6):
     b=k*math.tau/6;tube=.28 if link==0 else .18;r=R+tube*math.cos(b)
     p=Vector((tube*math.sin(b),math.cos(a)*r,math.sin(a)*r))
     if link%2:p=Vector((p.y*.65,p.x,p.z))
     verts.append(centre+p)
   for j in range(20):
    for k in range(6):faces.append((j*6+k,((j+1)%20)*6+k,((j+1)%20)*6+(k+1)%6,j*6+(k+1)%6))
   mesh(side+' boot '+('side ring' if link==0 else 'chain link '+str(link)),verts,faces,brass,[{side+'Foot':1}]*len(verts))
 folder.joinpath('wardrobe-check.json').write_text(json.dumps({'stubbleFaces':len(beard_faces),'reshapedSleeveVertices':len(arm_verts),'jeanVertices':len(denim_verts),'replacedSneakerFaces':len(shoe_faces),'construction':'short shirt sleeves, exposed arms, low leather boot, separate outsole, ankle shaft, harness, outside ring and five linked metal loops'},indent=2))

if __name__=='__main__':
 folder=ROOT/'tools/models/cast/customer-06';bpy.ops.wm.open_mainfile(filepath=str(folder/'character.blend'))
 arm=bpy.data.objects['Armature'];body=bpy.data.objects['customer-06 body']
 for o in [arm,arm.parent]:o.animation_data_clear()
 for b in arm.pose.bones:b.matrix_basis=Matrix.Identity(4)
 bpy.context.view_layer.update();apply(body,arm,folder)
 bpy.context.preferences.filepaths.save_version=0;bpy.ops.file.pack_all();bpy.ops.wm.save_as_mainfile(filepath=str(folder/'character.blend'))
