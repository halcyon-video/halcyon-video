"""Original generic 1990s glazed oak table. Feet; Blender X,Y,Z -> store X,Z,-Y.
Run: blender -b -t 2 -P tools/models/coffee-table.py
Existing ambientCG WoodFloor043 scan supplies oak grain; see surface NOTES.md.
"""
import bpy, bmesh, math, json, struct
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[2]
bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)

def mat(name,color,rough):
 m=bpy.data.materials.new(name);m.diffuse_color=(*color,1);m.use_nodes=True
 p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*color,1);p.inputs['Roughness'].default_value=rough
 return m
wood=mat('TableOak',(.48,.29,.13),.62)
glass=mat('TableGlazing',(.22,.32,.28),.16)
rubber=mat('TableResilientSeats',(.09,.09,.085),.83)
brass=mat('TableBrassPins',(.48,.31,.12),.3);brass.node_tree.nodes.get('Principled BSDF').inputs['Metallic'].default_value=.7
# Portable PBR textures, with photographic grain normal and roughness.
for kind,socket in [('color','Base Color'),('normal','Normal'),('roughness','Roughness')]:
 im=bpy.data.images.load(str(ROOT/f'public/textures/surfaces/table-wood/{kind}.png'))
 if kind!='color': im.colorspace_settings.name='Non-Color'
 im.scale(512,512);im.pack();n=wood.node_tree.nodes.new('ShaderNodeTexImage');n.image=im
 p=wood.node_tree.nodes.get('Principled BSDF')
 if kind=='normal':
  normal=wood.node_tree.nodes.new('ShaderNodeNormalMap');normal.inputs['Strength'].default_value=.35;wood.node_tree.links.new(n.outputs['Color'],normal.inputs['Color']);wood.node_tree.links.new(normal.outputs['Normal'],p.inputs[socket])
 else:wood.node_tree.links.new(n.outputs['Color'],p.inputs[socket])
# Subtle polish variation/normal relief shared by glass, brass and resilient feet.
import random
rng=random.Random(215)
for role in [glass,rubber,brass]:
 im=bpy.data.images.new(role.name+'MicroRoughness',width=64,height=64);im.colorspace_settings.name='Non-Color'
 base=role.node_tree.nodes.get('Principled BSDF').inputs['Roughness'].default_value
 pix=[]
 for i in range(64*64):
  v=base+rng.uniform(-.025,.025);pix.extend((v,v,v,1))
 im.pixels=pix;im.pack();n=role.node_tree.nodes.new('ShaderNodeTexImage');n.image=im;role.node_tree.links.new(n.outputs['Color'],role.node_tree.nodes.get('Principled BSDF').inputs['Roughness'])
parts=[]
def finish(o,name,m,bevel=.004):
 o.name=name;o.data.materials.append(m);bpy.context.view_layer.objects.active=o
 if bevel:
  mod=o.modifiers.new('Eased finished edges','BEVEL');mod.width=bevel;mod.segments=2;bpy.ops.object.modifier_apply(modifier=mod.name)
 bm=bmesh.new();bm.from_mesh(o.data);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));assert all(e.is_manifold for e in bm.edges),name;bm.to_mesh(o.data);bm.free()
 # Physical planar UVs, grain follows the longest local part axis.
 uv=o.data.uv_layers.new(name='SurfaceGrain')
 for poly in o.data.polygons:
  axis=max(range(3),key=lambda i:abs(poly.normal[i]));axes=[i for i in range(3) if i!=axis]
  for li in poly.loop_indices:
   co=o.data.vertices[o.data.loops[li].vertex_index].co
   if name.startswith('TaperedOakLeg') and axis!=2:
    # Long-grain runs up the leg; keep this narrow member within one board.
    uv.data[li].uv=(co.z/3.5, (co[axes[0]]-o.data.vertices[0].co[axes[0]])/3.5+.52)
   else:uv.data[li].uv=(co[axes[0]]/3.5+.5,co[axes[1]]/3.5+.5)
 parts.append(o);return o

def box(name,pos,size,m,bevel=.004):
 bpy.ops.mesh.primitive_cube_add(size=1,location=pos);o=bpy.context.object;o.scale=size;bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);return finish(o,name,m,bevel)
# Four mitered rails, rabbet formed in the section (not floating support strips).
# Profile goes from outer apron to top rim, then steps under 3/8-inch glazing.
profile=[(1.75,1.73),(1.75,2.0125),(1.45,2.0125),(1.45,1.975),(1.40,1.975),(1.40,1.925),(1.58,1.925),(1.58,1.73)]
for side in range(4):
 verts=[]
 for end in [-1,1]:
  for r,z in profile:verts.append((end*(r-.0015),r,z))
 n=len(profile);faces=[tuple(reversed(range(n))),tuple(range(n,2*n))]+[(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)]
 mesh=bpy.data.meshes.new('Routed rail section');mesh.from_pydata(verts,[],faces);mesh.update();o=bpy.data.objects.new('Rail',mesh);bpy.context.collection.objects.link(o);o.rotation_euler.z=side*math.pi/2;finish(o,'OakMiterRail_'+str(side),wood,.002)
# Tapered solid legs, inset shoulder under apron; flush circular joinery plugs.
for x in [-1.56,1.56]:
 for y in [-1.56,1.56]:
  verts=[(x+sx*w,y+sy*w,z) for z,w in [(.045,.09),(1.73,.14)] for sx,sy in [(-1,-1),(1,-1),(1,1),(-1,1)]]
  mesh=bpy.data.meshes.new('Tapered solid leg');mesh.from_pydata(verts,[],[(3,2,1,0),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)]);mesh.update();o=bpy.data.objects.new('Leg',mesh);bpy.context.collection.objects.link(o);finish(o,f'TaperedOakLeg_{x}_{y}',wood,.008)
  box(f'FloorGlide_{x}_{y}',(x,y,.0225),(.18,.18,.045),rubber,.009)
  box(f'GlazingSeat_{x}_{y}',(x*.91,y*.91,1.98),(.09,.09,.01),rubber,.003)
  bpy.ops.mesh.primitive_cylinder_add(vertices=12,radius=.023,depth=.008,location=(x,math.copysign(1.746,y),1.83),rotation=(math.pi/2,0,0));finish(bpy.context.object,f'FlushBrassJointPin_{x}_{y}',brass,.001)
box('PolishedGlazing_10mm',(0,0,1.99875),(2.89,2.89,.0275),glass,.004)
# Floor origin and published static support height; no animated components.
for name,pos in [('mount_tabletop',(0,0,2.0125)),('mount_cases',(.15,-.52,2.0125)),('mount_due_note',(.66,-.68,2.0125))]:
 o=bpy.data.objects.new(name,None);bpy.context.collection.objects.link(o);o.location=pos;o['units']='feet'
bpy.context.scene.unit_settings.system='IMPERIAL';bpy.context.scene.unit_settings.scale_length=.3048
for area in bpy.context.screen.areas:
 if area.type=='VIEW_3D':area.spaces.active.region_3d.view_distance=6;area.spaces.active.region_3d.view_location=Vector((0,0,1))
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'tools/models/coffee-table.blend'))
# Runtime batches by material role; editable physical parts remain in source.
part_count=len(parts)
groups=[[o for o in parts if o.data.materials[0]==m] for m in [wood,glass,rubber,brass]]
for group in groups:
 bpy.ops.object.select_all(action='DESELECT')
 for o in group:o.select_set(True)
 bpy.context.view_layer.objects.active=group[0];
 if len(group)>1:bpy.ops.object.join()
 group[0].name=group[0].data.materials[0].name+'Assembly'
bpy.ops.object.select_all(action='SELECT')
path=ROOT/'public/models/coffee_table.glb'
bpy.ops.export_scene.gltf(filepath=str(path),export_format='GLB',use_selection=True,export_yup=True,export_extras=True)
b=path.read_bytes();j=json.loads(b[20:20+struct.unpack_from('<I',b,12)[0]])
metrics={'bytes':len(b),'triangles':sum(j['accessors'][p['indices']]['count']//3 for m in j['meshes'] for p in m['primitives']),'primitives':sum(len(m['primitives']) for m in j['meshes']),'materials':[m['name'] for m in j['materials']],'images':len(j.get('images',[])),'dimensionsFeet':[3.5,2.0125,3.5],'manifoldParts':part_count,'allPrimitivesHaveUV':all('TEXCOORD_0' in p['attributes'] for m in j['meshes'] for p in m['primitives'])}
(ROOT/'tools/models/coffee-table-metrics.json').write_text(json.dumps(metrics,indent=2)+'\n');print(metrics)
