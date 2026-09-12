"""Original generic bead curtain parts; Blender scripted mesh authoring.
Run: blender -b -t 2 -P tools/models/alcove-curtain.py
Numerical feet, Z-up source -> Y-up glTF. See docs/alcove-curtain-model.md.
"""
import bpy, bmesh, math, json
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[2]
bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
scene=bpy.context.scene
scene.unit_settings.system='IMPERIAL';scene.unit_settings.scale_length=.3048

def material(name,color,metal,rough):
 m=bpy.data.materials.new(name);m.diffuse_color=(*color,1);m.use_nodes=True
 p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*color,1);p.inputs['Metallic'].default_value=metal;p.inputs['Roughness'].default_value=rough
 return m
amber=material('BeadAmberAcrylic',(.43,.19,.055),0,.27)
cord=material('StrandBraidedCord',(.16,.09,.035),0,.9)
metal=material('AttachmentAgedBrass',(.30,.22,.10),.72,.38)
railmat=material('CurtainSupportWood',(.13,.065,.025),0,.68)
parts=[]
def mesh(name,v,f,mat):
 me=bpy.data.meshes.new(name);me.from_pydata(v,[],f);me.update();o=bpy.data.objects.new(name,me);scene.collection.objects.link(o);me.materials.append(mat);parts.append(o);return o

def lathe(name,profile,mat,n=8):
 # Closed section includes bore: no coincident axial poles or hidden caps.
 v=[(r*math.cos(i*2*math.pi/n),r*math.sin(i*2*math.pi/n),h) for r,h in profile for i in range(n)]
 f=[(j*n+i,j*n+(i+1)%n,((j+1)%len(profile))*n+(i+1)%n,((j+1)%len(profile))*n+i) for j in range(len(profile)) for i in range(n)]
 return mesh(name,v,f,mat)
barrel=lathe('AlcoveBeadBarrel',[(.009,-.049),(.031,-.049),(.047,-.030),(.05,0),(.047,.030),(.031,.049),(.009,.049)],amber)
facet=lathe('AlcoveBeadFacet',[(.009,-.051),(.023,-.051),(.05,0),(.023,.051),(.009,.051)],amber)
knot=lathe('AlcoveCordKnot',[(.004,-.009),(.012,-.006),(.014,.003),(.010,.009),(.004,.009)],cord,6)
# Unit cord centred on origin; runtime stretches only its height.
bpy.ops.mesh.primitive_cylinder_add(vertices=6,radius=.0045,depth=1)
c=bpy.context.object;c.name='AlcoveCord';c.data.materials.append(cord);parts.append(c)
# Eased wooden mounting strip, 36 in wide; its upper half seats in existing header.
bpy.ops.mesh.primitive_cube_add(size=1,location=(0,0,6.80))
r=bpy.context.object;r.name='AlcoveSupportRail';r.dimensions=(.18,3,.12)
bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
r.data.materials.append(railmat);parts.append(r)
b=r.modifiers.new('Eased timber edges','BEVEL');b.width=.012;b.segments=2;bpy.ops.object.modifier_apply(modifier=b.name)
# Closed eye and shank. Eye lies in store XY; cord threads its lower inner edge.
bpy.ops.mesh.primitive_torus_add(major_segments=12,minor_segments=4,major_radius=.026,minor_radius=.007,location=(0,0,6.678),rotation=(math.pi/2,0,0))
e=bpy.context.object;e.name='AlcoveEyelet';e.data.materials.append(metal);parts.append(e)
bpy.ops.mesh.primitive_cylinder_add(vertices=8,radius=.009,depth=.095,location=(0,0,6.744))
s=bpy.context.object;s.data.materials.append(metal)
bpy.context.view_layer.objects.active=e
union=e.modifiers.new('Continuous forged eye and shank','BOOLEAN');union.operation='UNION';union.solver='EXACT';union.object=s
bpy.ops.object.modifier_apply(modifier=union.name);bpy.data.objects.remove(s,do_unlink=True)
# Prototype origins must be zero so runtime instance translations preserve attachment height.
for o in parts:
 bpy.context.view_layer.objects.active=o;bpy.ops.object.select_all(action='DESELECT');o.select_set(True)
 bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
 bm=bmesh.new();bm.from_mesh(o.data);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));assert all(e.is_manifold for e in bm.edges),o.name;bm.to_mesh(o.data);bm.free()
 bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT');bpy.ops.uv.smart_project(island_margin=.02);bpy.ops.object.mode_set(mode='OBJECT')
 o['units']='feet';o['role']=o.data.materials[0].name
bpy.ops.object.select_all(action='DESELECT')
for o in parts:o.select_set(True)
bpy.ops.export_scene.gltf(filepath=str(ROOT/'public/models/alcove-curtain.glb'),export_format='GLB',use_selection=True,export_extras=True)
metrics=[]
for o in parts:
 o.data.calc_loop_triangles();metrics.append(dict(part=o.name,triangles=len(o.data.loop_triangles),vertices=len(o.data.vertices),uv=True,manifold=True,dimensions=list(o.dimensions),material=o.data.materials[0].name))
(ROOT/'docs/alcove-curtain-cost.json').write_text(json.dumps(dict(parts=metrics,glbBytes=(ROOT/'public/models/alcove-curtain.glb').stat().st_size,textures=0),indent=2)+'\n')
# Editable assembly preview: linked mesh copies excluded from runtime export.
preview=bpy.data.collections.new('ASSEMBLY PREVIEW (linked parts; runtime instances)');scene.collection.children.link(preview)
def copy(o,name,x,y,z,scale=1):
 q=bpy.data.objects.new(name,o.data);preview.objects.link(q);q.location=(x,-z,y);q.scale.z=scale
for i in range(15):
 # JS remainder semantics, including negative values.
 wob=lambda k:math.fmod(math.sin(i*12.9898+k*78.233)*43758.5453,1)
 dx=wob(1)*.07;drop=.05+abs(wob(2))*.5;z=-1.5+(i+.5)*.2
 heights=[6.8-.12-drop-b*.125 for b in range(52) if 6.8-.12-drop-b*.125>=.05]
 for b,h in enumerate(heights):copy(facet if b%4==2 else barrel,f'Strand_{i:02d}_Bead_{b:02d}',dx,h,z)
 low=heights[-1]-.062;copy(c,f'Strand_{i:02d}_Cord',dx,(6.652+low)/2,z,6.652-low)
 copy(e,f'Strand_{i:02d}_Eye',dx,0,z)
 copy(knot,f'Strand_{i:02d}_TopKnot',dx,6.638,z)
 copy(knot,f'Strand_{i:02d}_EndKnot',dx,heights[-1]-.056,z)
for o in [barrel,facet,c,e,knot]:o.hide_set(True);o.hide_render=True
for area in bpy.context.screen.areas:
 if area.type=='VIEW_3D':
  area.spaces.active.region_3d.view_distance=10;area.spaces.active.region_3d.view_location=Vector((0,0,3.4))
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'tools/models/alcove-curtain.blend'))
