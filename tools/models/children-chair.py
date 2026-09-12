"""Original small molded-plastic chair; scripted Blender mesh authoring.
Feet, Blender (X,Y,Z) -> store (X,Z,-Y); front is Blender -Y/store +Z.
Run blender -b -t 2 -P tools/models/children-chair.py. No reference pixels.
"""
import bpy, bmesh, math, json, struct
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[2]
bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
scene=bpy.context.scene;scene.unit_settings.system='IMPERIAL';scene.unit_settings.scale_length=.3048
mat=bpy.data.materials.new('ChairPlastic');mat.diffuse_color=(.78,.64,.30,1);mat.use_nodes=True
bs=mat.node_tree.nodes.get('Principled BSDF');bs.inputs['Base Color'].default_value=mat.diffuse_color;bs.inputs['Roughness'].default_value=.4
inputs=bpy.data.collections.new('Editable construction surfaces');scene.collection.children.link(inputs)
parts=[]
def mesh(name,v,f):
 m=bpy.data.meshes.new(name);m.from_pydata(v,[],f);m.update();o=bpy.data.objects.new(name,m);scene.collection.objects.link(o);parts.append(o);return o
def apply(o,mod):
 bpy.context.view_layer.objects.active=o;o.select_set(True);bpy.ops.object.modifier_apply(modifier=mod.name);o.select_set(False)
# Continuous seat/back centreline. Flat supporting basin rises through a generous
# lumbar radius into an upright slightly raked back; rounded front and top edges.
# y, z, half-width. Thickness .06 ft (0.72 in) is an original design assumption.
profile=[(-.55,.89,.46),(-.53,.922,.51),(-.46,.934,.545),(-.30,.922,.55),(-.08,.915,.55),(.12,.921,.55),(.28,.95,.54),(.37,1.04,.535),(.405,1.18,.535),(.44,1.40,.54),(.48,1.66,.535),(.49,1.765,.52),(.49,1.805,.47)]
v=[];f=[];N=17
for y,z,w in profile:
 for i in range(N):
  u=-1+2*i/(N-1)
  # Concavity gently cradles seat and back without a flat rectangular slab.
  back=max(0,min(1,(z-1.02)/.3));v.append((u*w,y-.065*u*u*back,z+.028*u*u*(1-back)))
for j in range(len(profile)-1):
 for i in range(N-1):a=j*N+i;f.append((a,a+1,a+1+N,a+N))
o=mesh('Continuous rounded seat and upright back',v,f)
mod=o.modifiers.new('Smooth molded shell curvature','SUBSURF');mod.levels=2;apply(o,mod)
mod=o.modifiers.new('Physical shell thickness 0.06 feet','SOLIDIFY');mod.thickness=.06;mod.offset=-1;apply(o,mod)
mod=o.modifiers.new('Rolled safe perimeter','BEVEL');mod.width=.024;mod.segments=3;apply(o,mod)
# Four gently splayed, rounded rectangular solid leg profiles broaden into the
# shell. No underside ribs, screw bosses, brand marks or unverified fittings.
for sx in [-1,1]:
 for sy in [-1,1]:
  v=[];f=[];rings=[(.02,.485,.415,.073),(.055,.485,.415,.088),(.18,.475,.402,.084),(.64,.435,.353,.089),(.84,.419,.338,.123),(.925,.407,.325,.15)]
  for z,x,y,r in rings:
   for i in range(16):
    a=2*math.pi*i/16;c=math.cos(a);s=math.sin(a)
    v.append((sx*x+math.copysign(abs(c)**.62,c)*r,sy*y+math.copysign(abs(s)**.62,s)*r,z))
  f.append(tuple(reversed(range(16))));f.append(tuple(range((len(rings)-1)*16,len(rings)*16)))
  for j in range(len(rings)-1):
   for i in range(16):a=j*16+i;b=j*16+(i+1)%16;f.append((a,b,b+16,a+16))
  o=mesh(f'Integral leg {sx} {sy}',v,f)
  mod=o.modifiers.new('Soft leg profiles','SUBSURF');mod.levels=2;apply(o,mod)
# Retain all editable inputs; weld the visible molding as one continuous solid.
for o in parts:
 copy=o.copy();copy.data=o.data.copy();inputs.objects.link(copy)
inputs.hide_viewport=True;inputs.hide_render=True
bpy.ops.object.select_all(action='DESELECT')
for o in parts:o.select_set(True)
bpy.context.view_layer.objects.active=parts[0];bpy.ops.object.join();o=bpy.context.object;o.name='One-piece molded chair'
mod=o.modifiers.new('Fused integral leg transitions','REMESH');mod.mode='VOXEL';mod.voxel_size=.012;mod.use_smooth_shade=True;apply(o,mod)
mod=o.modifiers.new('Smooth injection-molded fillets','SMOOTH');mod.factor=1.2;mod.iterations=5;apply(o,mod)
mod=o.modifiers.new('Optimized curved surface','DECIMATE');mod.ratio=.06;apply(o,mod)
# Ground datum exactly at the lowest support after surface relaxation.
zmin=min(v.co.z for v in o.data.vertices)
for vert in o.data.vertices:vert.co.z-=zmin
bm=bmesh.new();bm.from_mesh(o.data);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));assert all(e.is_manifold for e in bm.edges),'molding must be closed';bm.to_mesh(o.data);bm.free()
for p in o.data.polygons:p.use_smooth=True
o.data.materials.append(mat);o.select_set(True);bpy.context.view_layer.objects.active=o
bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT');bpy.ops.uv.smart_project(island_margin=.025);bpy.ops.object.mode_set(mode='OBJECT');o.data.uv_layers[0].name='PlasticSurfaceUV'
for name,pos in [('floor_origin',(0,0,0)),('seat_support',(0,-.08,.915-zmin)),('back_top',(0,.49,1.805-zmin))]:
 a=bpy.data.objects.new(name,None);scene.collection.objects.link(a);a.location=pos;a['units']='feet';a.select_set(True)
scene['description']='Original generic child chair. Dimensions LOW historical confidence; not a measured replica. No hidden ribs.'
for area in bpy.context.screen.areas:
 if area.type=='VIEW_3D':area.spaces.active.region_3d.view_distance=3.5;area.spaces.active.region_3d.view_location=Vector((0,0,.9))
(ROOT/'public/models').mkdir(parents=True,exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'tools/models/children-chair.blend'))
path=ROOT/'public/models/children-chair.glb'
bpy.ops.export_scene.gltf(filepath=str(path),export_format='GLB',use_selection=True,export_yup=True,export_extras=True)
b=path.read_bytes();g=json.loads(b[20:20+struct.unpack_from('<I',b,12)[0]])
mins=[min(v.co[i] for v in o.data.vertices) for i in range(3)];maxs=[max(v.co[i] for v in o.data.vertices) for i in range(3)]
metrics={'bytes':len(b),'triangles':sum(g['accessors'][p['indices']]['count']//3 for m in g['meshes'] for p in m['primitives']),'drawsPerChair':sum(len(m['primitives']) for m in g['meshes']),'materials':[m['name'] for m in g['materials']],'images':len(g.get('images',[])),'blenderBoundsFeet':[mins,maxs],'storeDimensionsFeet':[maxs[0]-mins[0],maxs[2]-mins[2],maxs[1]-mins[1]],'allPrimitivesHaveUV':all('TEXCOORD_0' in p['attributes'] for m in g['meshes'] for p in m['primitives']),'manifold':True,'seatSupportFeet':.915-zmin}
(ROOT/'public/models/children-chair.geometry.json').write_text(json.dumps(metrics,indent=2)+'\n');print(metrics)
