"""Original generic depicted-product reel. blender -b -P tools/models/projection-reel.py
Feet; XY flange plane, Z spindle; glTF Y-up. No period-replica claim.
"""
import bpy, bmesh, math, json
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'public/models/projection-reel'
OUT.mkdir(parents=True,exist_ok=True)
bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
scene=bpy.context.scene
scene.unit_settings.system='IMPERIAL'; scene.unit_settings.scale_length=.3048

def material(name,color,metal,rough):
 m=bpy.data.materials.new(name); m.diffuse_color=(*color,1); m.use_nodes=True
 p=m.node_tree.nodes.get('Principled BSDF'); p.inputs['Base Color'].default_value=(*color,1); p.inputs['Metallic'].default_value=metal; p.inputs['Roughness'].default_value=rough
 return m
al=material('StampedAluminum',(.46,.49,.53),.8,.29)
hubmat=material('HubMachinedMetal',(.25,.28,.32),.85,.24)
film=material('OptionalWoundFilm',(.055,.028,.017),.05,.43)
parts=[]
# Revolved closed profiles: shared vertices across each seam; real inner bore.
def lathe(name,profile,mat,n=128):
 verts=[(r*math.cos(2*math.pi*i/n),r*math.sin(2*math.pi*i/n),z) for r,z in profile for i in range(n)]
 faces=[]
 for j in range(len(profile)):
  for i in range(n): faces.append((j*n+i,j*n+(i+1)%n,((j+1)%len(profile))*n+(i+1)%n,((j+1)%len(profile))*n+i))
 mesh=bpy.data.meshes.new(name);mesh.from_pydata(verts,[],faces);mesh.update()
 obj=bpy.data.objects.new(name,mesh);scene.collection.objects.link(obj);obj.data.materials.append(mat);parts.append(obj)
 return obj
# 15 inch diameter, 1.65 inch overall; 35 mm nominal film clearance.
for side in [-1,1]:
 z=side*.064
 # Structured annular grid. Omit the window cells and bridge their boundary
 # edges: five actual holes, without Boolean triangulation slivers.
 n=160
 radii=[.042,.13,.15,.20,.54,.605,.621,.625]
 top=[.012,.012,.006,.006,.006,.006,.009,.003]
 bottom=[-.004,-.004,-.004,-.004,-.004,-.004,-.001,.001]
 verts=[(r*math.cos(2*math.pi*i/n),r*math.sin(2*math.pi*i/n),z+side*levels[j])
        for levels in [bottom,top] for j,r in enumerate(radii) for i in range(n)]
 layer=len(radii)*n; faces=[]; edges={}
 for j in range(len(radii)-1):
  for i in range(n):
   if j==3 and 5<=i%32<27:continue
   q=(j*n+i,j*n+(i+1)%n,(j+1)*n+(i+1)%n,(j+1)*n+i)
   faces.append(q);faces.append(tuple(v+layer for v in reversed(q)))
   for k in range(4):
    edge=(q[k],q[(k+1)%4]);key=tuple(sorted(edge))
    edges[key]=None if key in edges else edge
 for e in edges.values():
  if e is not None:
   a,b=e;faces.append((a,b,b+layer,a+layer))
 me=bpy.data.meshes.new('Pierced flange grid');me.from_pydata(verts,[],faces);me.update()
 # Coincident rolled lip vertices are welded at the profile's outer tip.
 bm=bmesh.new();bm.from_mesh(me);bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=.000001)
 bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(me);bm.free()
 flange=bpy.data.objects.new(('Rear' if side<0 else 'Front')+'StampedFlange',me)
 scene.collection.objects.link(flange);flange.data.materials.append(al);parts.append(flange)
 bevel=flange.modifiers.new('Deburred stamped edges','BEVEL');bevel.width=.001;bevel.segments=2
 bpy.context.view_layer.objects.active=flange;bpy.ops.object.modifier_apply(modifier=bevel.name)
lathe('BoredCentralHub',[(.042,-.073),(.13,-.073),(.13,-.054),(.16,-.050),(.16,.050),(.13,.054),(.13,.080),(.042,.080)],hubmat,96)
# Film pack is removable and excluded from empty-reel alpha poses/export default.
pack=lathe('OptionalFilmPack',[(.162,-.057),(.48,-.057),(.48,.057),(.162,.057)],film)
pack.hide_render=True;pack.hide_set(True)
metrics=[]
for o in parts:
 bpy.ops.object.select_all(action='DESELECT');o.hide_set(False);o.select_set(True);bpy.context.view_layer.objects.active=o
 bm=bmesh.new();bm.from_mesh(o.data);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(o.data)
 assert all(e.is_manifold for e in bm.edges),o.name
 bm.free()
 bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT');bpy.ops.uv.smart_project(island_margin=.02);bpy.ops.object.mode_set(mode='OBJECT')
 for p in o.data.polygons:p.use_smooth=True
 norm=o.modifiers.new('Weighted surface normals','WEIGHTED_NORMAL');norm.keep_sharp=True
 bpy.ops.object.modifier_apply(modifier=norm.name)
 o.data.calc_loop_triangles()
 metrics.append({'part':o.name,'triangles':len(o.data.loop_triangles),'vertices':len(o.data.vertices),'material':o.data.materials[0].name,'uv':bool(o.data.uv_layers),'manifold':True})
bpy.ops.object.select_all(action='DESELECT')
for o in parts:o.select_set(True)
bpy.ops.export_scene.gltf(filepath=str(OUT.parent/'projection-reel-wound.glb'),export_format='GLB',use_selection=True,export_extras=True)
pack.select_set(False)
bpy.ops.export_scene.gltf(filepath=str(OUT.parent/'projection-reel.glb'),export_format='GLB',use_selection=True,export_extras=True)
pack.hide_render=True;pack.hide_set(True)
scene.render.engine='CYCLES';scene.cycles.samples=32
scene.render.resolution_x=512;scene.render.resolution_y=512;scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG';scene.render.image_settings.color_mode='RGBA';scene.render.film_transparent=True
scene.world.color=(.22,.22,.22)
scene.view_settings.view_transform='AgX'
for name,pos,power,size in [('Key',(1,-2,3),180,3),('Fill',(-2,1,2),120,2),('Rear',(1,2,-2),150,2)]:
 bpy.ops.object.light_add(type='AREA',location=pos);l=bpy.context.object;l.name=name;l.data.energy=power;l.data.shape='DISK';l.data.size=size;l.rotation_euler=(-l.location).to_track_quat('-Z','Y').to_euler()
bpy.ops.object.camera_add();camera=bpy.context.object;camera.name='AlphaPoseCamera';camera.data.type='ORTHO';camera.data.ortho_scale=1.62;scene.camera=camera

def pose(name,loc,target=(0,0,0)):
 camera.location=loc;camera.rotation_euler=(Vector(target)-camera.location).to_track_quat('-Z','Y').to_euler()
 scene.render.filepath=str(OUT/(name+'.png'));bpy.ops.render.render(write_still=True)
pose('front',(0,0,3));pose('three-quarter',(1,-1.1,2.5));pose('side',(3,-1,.5));pose('rear',(1,.4,-3))
clones=[]
for o in parts[:3]:
 c=o.copy();c.data=o.data;scene.collection.objects.link(c);c.location=(.1,.16,-.19);clones.append(c)
pose('stacked',(1,-1,2.4))
for o in clones:bpy.data.objects.remove(o,do_unlink=True)
pack.hide_render=False;pose('wound',(1,-1,2.4));pack.hide_render=True
camera.location=(1,-1,2.4);camera.rotation_euler=(-camera.location).to_track_quat('-Z','Y').to_euler()
bpy.ops.object.select_all(action='DESELECT')
for o in parts[:3]:o.select_set(True)
bpy.context.view_layer.objects.active=parts[0]
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'tools/models/projection-reel.blend'))
(OUT.parent/'projection-reel-metrics.json').write_text(json.dumps({'units':'feet','nominalDiameter':1.25,'overallDepth':.156,'parts':metrics,'glbBytes':(OUT.parent/'projection-reel.glb').stat().st_size},indent=2)+'\n')
