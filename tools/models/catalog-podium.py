"""Original paper catalog table; no archive photograph available or embedded.
Run: blender -b -t 2 -P tools/models/catalog-podium.py
Feet, Blender (x, -store_z, height); origin at floor under tabletop center.
First run python3 tools/models/catalog-podium-print.py (requires Pillow).
"""
import bpy, bmesh, math, json
import numpy as np
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[2]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.context.preferences.filepaths.save_version=0
scene=bpy.context.scene
scene.unit_settings.system='IMPERIAL';scene.unit_settings.scale_length=.3048
parts=[]
n=256;y,x=np.mgrid[:n,:n];rng=np.random.default_rng(200)
noise=rng.random((n,n));grain=.5+.18*np.sin(y*.7+np.sin(x*.05))+.12*noise

def image(name,rgb):
 im=bpy.data.images.new(name,width=n,height=n);im.colorspace_settings.name='Non-Color'
 a=np.ones((n,n,4),dtype=np.float32);a[:,:,:3]=rgb;im.pixels.foreach_set(a.ravel());im.pack();return im

def mat(name,color,r,metal=0,wood=False):
 m=bpy.data.materials.new(name);m.use_nodes=True;m.diffuse_color=(*color,1)
 ns=m.node_tree.nodes;ls=m.node_tree.links;p=ns['Principled BSDF'];p.inputs['Metallic'].default_value=metal
 h=grain if wood else noise
 def tex(im,socket):
  t=ns.new('ShaderNodeTexImage');t.image=im;ls.new(t.outputs['Color'],p.inputs[socket]);return t
 tex(image(name+'_albedo',np.array(color)[None,None,:]*(.91+.09*h[:,:,None])),'Base Color')
 tex(image(name+'_roughness',np.repeat((r+.035*(h-.5))[:,:,None],3,2)),'Roughness')
 dy,dx=np.gradient(h)
 t=ns.new('ShaderNodeTexImage');t.image=image(name+'_normal',np.stack((.5-dx*.18,.5-dy*.18,np.ones_like(h)),2))
 nm=ns.new('ShaderNodeNormalMap');nm.inputs['Strength'].default_value=.3;ls.new(t.outputs['Color'],nm.inputs['Color']);ls.new(nm.outputs[0],p.inputs['Normal'])
 return m
wood=mat('WarmAshLaminate',(.52,.39,.25),.46,wood=True)
edge=mat('CradleLaminate',(.63,.61,.53),.49)
vinyl=mat('BinderBookcloth',(.12,.19,.24),.72)
paper=mat('PaperEdges',(.83,.80,.70),.86)
steel=mat('BrushedNickel',(.55,.58,.60),.27,.85)
ink=mat('CatalogPrint',(.83,.80,.70),.86)
im=bpy.data.images.load(str(ROOT/'tools/models/catalog-podium-print.png'));im.pack()
p=ink.node_tree.nodes['Principled BSDF'];t=ink.node_tree.nodes.new('ShaderNodeTexImage');t.image=im;ink.node_tree.links.new(t.outputs['Color'],p.inputs['Base Color'])

def finish(o,name,m,bevel=.006):
 o.name=name;o.data.materials.append(m)
 bpy.ops.object.select_all(action='DESELECT');o.select_set(True);bpy.context.view_layer.objects.active=o
 bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
 if bevel:
  mod=o.modifiers.new('Eased manufactured edges','BEVEL');mod.width=bevel;mod.segments=3;bpy.ops.object.modifier_apply(modifier=mod.name)
 bm=bmesh.new();bm.from_mesh(o.data);bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=1e-6);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces))
 assert all(e.is_manifold for e in bm.edges),name
 bm.to_mesh(o.data);bm.free()
 bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT');bpy.ops.uv.smart_project(island_margin=.015);bpy.ops.object.mode_set(mode='OBJECT')
 parts.append(o);return o

def box(name,loc,dims,m,bevel=.006):
 bpy.ops.mesh.primitive_cube_add(size=1,location=loc);o=bpy.context.object;o.dimensions=dims;return finish(o,name,m,bevel)
# Fitted four-leg table, apron rails terminate against inside leg faces.
box('Tabletop_30in_work_height',(0,0,2.455),(3,2,.09),wood,.025)
for x in [-1.32,1.32]:
 for y in [-.82,.82]:
  box('Leg',(x,y,1.225),(.15,.15,2.37),wood,.012)
  box('FloorGlide',(x,y,.02),(.16,.16,.04),vinyl,.009)
for y in [-.82,.82]:box('LongApron',(0,y,2.24),(2.49,.12,.34),wood)
for x in [-1.32,1.32]:box('SideApron',(x,0,2.24),(.12,1.49,.34),wood)
# Incline frame in local coordinates. Rear wedge meets underside exactly.
a=math.radians(20);C=math.cos(a);S=math.sin(a);origin=Vector((0,0,2.81))
def tilted(name,loc,dims,m,bevel=.004):
 o=box(name,(0,0,0),dims,m,bevel);o.rotation_euler.x=a
 o.location=origin+Vector((loc[0],C*loc[1]-S*loc[2],S*loc[1]+C*loc[2]));return o
for sx in [-1.05,1.05]:
 # Vertical triangular side cheeks: top follows the cradle's lower face.
 ys=[-.68,.68];zs=[2.81+S*y-C*.03 for y in ys]
 vs=[(sx+dx,C*y+S*.03,z) for dx in [-.025,.025] for y,z in [(ys[0],2.5),(ys[1],2.5),(ys[1],zs[1]),(ys[0],zs[0])]]
 me=bpy.data.meshes.new('SupportProfile');me.from_pydata(vs,[],[(3,2,1,0),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)])
 o=bpy.data.objects.new('CradleSideSupport',me);scene.collection.objects.link(o);finish(o,'CradleSideSupport',edge,.003)
box('CradleRearBrace',(0,.57,2.69),(2.05,.06,.34),edge)
tilted('InclinedCradle',(0,0,0),(2.5,1.5,.06),edge)
tilted('RetainingLip',(0,-.727,.095),(2.5,.045,.19),edge)
# Binder bottom lies on cradle top (.03); paper lies on covers (.052).
for side in [-1,1]:
 tilted('BinderCover_L' if side<0 else 'BinderCover_R',(side*.605,0,.041),(1.16,1.39,.022),vinyl)
 tilted('PageBlock',(side*.605,.01,.099),(1.10,1.32,.094),paper,.007)
 # Stepped closed leaf meshes reveal individual thickness at the fore edge.
 for i in range(6):
  tilted('SeparateLeaf',(side*(.605+i*.0015),.01-i*.001,.149+i*.003),(1.10,1.32,.002),paper,.0004)
 # Curved top leaf: longitudinal cross-section turns upward near ring spine.
 vs=[]
 for yy in [-.65,.67]:
  for j in range(17):
   t=j/16;xx=side*(.055+1.1*t);zz=.169+.035*math.exp(-t*9)
   vs.append((xx,yy,zz))
 me=bpy.data.meshes.new('PrintedLeaf');me.from_pydata(vs,[],[tuple(reversed((j,j+1,j+18,j+17))) if side<0 else (j,j+1,j+18,j+17) for j in range(16)]);me.materials.append(ink)
 o=bpy.data.objects.new('PrintedCatalogPage',me);scene.collection.objects.link(o)
 uv=me.uv_layers.new()
 for p in me.polygons:
  for li in p.loop_indices:
   v=me.vertices[me.loops[li].vertex_index].co;u=(v.x*side-.055)/1.1 if side>0 else 1-(v.x*side-.055)/1.1;uv.data[li].uv=((u+(1 if side>0 else 0))/2,(v.y+.65)/1.32)
 o.rotation_euler.x=a;o.location=origin;parts.append(o)
tilted('BinderSpine',(0,0,.06),(.11,1.39,.06),vinyl)
tilted('RingMechanism',(0,0,.105),(.10,1.25,.03),steel)
for yy in [-.48,0,.48]:
 bpy.ops.mesh.primitive_torus_add(major_radius=.083,minor_radius=.009,major_segments=32,minor_segments=8)
 o=finish(bpy.context.object,'BindingRing',steel,0)
 o.rotation_euler.x=math.pi/2+a;o.location=origin+Vector((0,C*yy-S*.17,S*yy+C*.17))
 for p in o.data.polygons:p.use_smooth=True
anchors=[]
for name,loc in [('floor_origin',(0,0,0)),('catalog_rest',(0,0,2.81)),('reader_stance',(0,-2.8,0))]:
 o=bpy.data.objects.new(name,None);scene.collection.objects.link(o);o.location=loc;o['units']='feet';anchors.append(o)
scene['provenance']='Original unbranded design, estimated dimensions. videolog-podium original reference unavailable. No period-fidelity claim. Fictional printed titles.'
scene['construction']='30 inch table; 20 degree cradle; static paper lookup separate from electronic terminal. No post/disc variant.'
for area in bpy.context.screen.areas:
 if area.type=='VIEW_3D':area.spaces.active.region_3d.view_distance=6;area.spaces.active.region_3d.view_location=(0,0,1.6)
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'tools/models/catalog-podium.blend'),compress=True)
# Export-only material batching; editable source retains every named part.
bpy.ops.object.select_all(action='DESELECT')
for o in parts:o.select_set(True)
bpy.context.view_layer.objects.active=parts[0];bpy.ops.object.join();o=bpy.context.object;o.name='PaperCatalogPodium'
for a in anchors:a.select_set(True)
out=ROOT/'public/models/catalog-podium.glb'
bpy.ops.export_scene.gltf(filepath=str(out),export_format='GLB',use_selection=True,export_yup=True,export_extras=True,export_texcoords=True)
o.data.calc_loop_triangles();pts=[o.matrix_world@Vector(v) for v in o.bound_box]
metrics={'units':'feet','triangles':len(o.data.loop_triangles),'bytes':out.stat().st_size,'materialRoles':[m.name for m in o.data.materials],'boundsBlender':[[min(p[i] for p in pts) for i in range(3)],[max(p[i] for p in pts) for i in range(3)]],'closedPartsManifold':True,'intentionalOpenSurfaces':'two curved printed top leaves','inclineDegrees':20,'tableHeight':2.5}
(ROOT/'tools/models/catalog-podium-metrics.json').write_text(json.dumps(metrics,indent=2)+'\n')
print(metrics)
