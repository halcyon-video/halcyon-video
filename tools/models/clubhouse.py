"""Original corner club millwork, not a measured historical replica.
Blender coordinates (X,-store Z, height), feet; standard glTF exporter.
"""
from pathlib import Path
import bpy, bmesh, math, json, re
ROOT=Path(__file__).resolve().parents[2]
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
# Source preview follows the public color canon; runtime remains themeable.
canon=(ROOT/'src/logo-spec.ts').read_text()
def linear_hex(hex):
 rgb=[int(hex[i:i+2],16)/255 for i in (1,3,5)]
 return tuple(v/12.92 if v<=.04045 else ((v+.055)/1.055)**2.4 for v in rgb)
def canonical(name):return linear_hex(re.search(r"export const "+name+r" = '(#[0-9a-fA-F]{6})'",canon).group(1))
roles={}
for name,color in [('FramePaint',canonical('HALCYON_BLUE')),('HeaderPaint',canonical('HALCYON_BLUE')),('PanelLaminate',linear_hex('#eeeae0')),('EdgePaint',canonical('HALCYON_CREAM')),('CabinetLaminate',linear_hex('#282722')),('WallPoster',linear_hex('#ffffff'))]:
 m=bpy.data.materials.new(name);m.diffuse_color=(*color,1);m.use_nodes=True;bsdf=m.node_tree.nodes['Principled BSDF'];bsdf.inputs['Base Color'].default_value=(*color,1);bsdf.inputs['Roughness'].default_value=.72 if 'Laminate' in name else .76;roles[name]=m
parts=[]
def slab(name,poly,lo,hi,role,bevel=.012,cutters=None):
 n=len(poly);vs=[(x,-z,y) for y in [lo,hi] for x,z in poly]
 fs=[tuple(reversed(range(n))),tuple(range(n,2*n))]+[(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)]
 me=bpy.data.meshes.new(name);me.from_pydata(vs,[],fs);me.update()
 o=bpy.data.objects.new(name,me);bpy.context.collection.objects.link(o);o.data.materials.append(roles[role]);parts.append(o)
 bm=bmesh.new();bm.from_mesh(me);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(me);bm.free()
 bpy.context.view_layer.objects.active=o;o.select_set(True)
 if cutters:
  for c in cutters:
   mod=o.modifiers.new('Boolean','BOOLEAN');mod.operation='DIFFERENCE';mod.object=c;mod.solver='EXACT'
   bpy.ops.object.modifier_apply(modifier=mod.name)
   bpy.data.objects.remove(c, do_unlink=True)
  bm=bmesh.new();bm.from_mesh(me);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(me);bm.free()
 if bevel > 0:
  mod=o.modifiers.new('Eased finished edges','BEVEL');mod.width=bevel;mod.segments=2;bpy.ops.object.modifier_apply(modifier=mod.name)
 bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT');bpy.ops.uv.smart_project(island_margin=.025);bpy.ops.object.mode_set(mode='OBJECT')
 o.select_set(False);return o
def create_cutter(name,poly,lo,hi):
 n=len(poly);vs=[(x,-z,y) for y in [lo,hi] for x,z in poly]
 fs=[tuple(reversed(range(n))),tuple(range(n,2*n))]+[(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)]
 me=bpy.data.meshes.new(name);me.from_pydata(vs,[],fs);me.update()
 o=bpy.data.objects.new(name,me);bpy.context.collection.objects.link(o)
 bm=bmesh.new();bm.from_mesh(me);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(me);bm.free()
 return o
def box_cutter(name,x,z,w,d,lo,hi):return create_cutter(name,[(x-w/2,z-d/2),(x+w/2,z-d/2),(x+w/2,z+d/2),(x-w/2,z+d/2)],lo,hi)
def box(name,x,z,w,d,lo,hi,role,bevel=.012,cutters=None):return slab(name,[(x-w/2,z-d/2),(x+w/2,z-d/2),(x+w/2,z+d/2),(x-w/2,z+d/2)],lo,hi,role,bevel,cutters)

# Joined perimeter fascia is a single closed U-shaped extrusion with mitered turns.
outer=[(-7,-7),(7,-7),(7,1),(1,7),(-7,7)]
inner=[(-6.65,-6.65),(6.65,-6.65),(6.65,.855),(.855,6.65),(-6.65,6.65)]
# Ring faces use matching corner topology, then beveled edge joins.
def ring(name,lo,hi,role):
 n=5;poly=outer+inner;vs=[(x,-z,y) for y in [lo,hi] for x,z in poly];fs=[]
 for i in range(n):
  j=(i+1)%n;fs += [(i,j,j+n,i+n),(i+10,i+15,j+15,j+10),(i,i+10,j+10,j),(i+n,j+n,j+15,i+15)]
 me=bpy.data.meshes.new(name);me.from_pydata(vs,[],fs);me.update();o=bpy.data.objects.new(name,me);bpy.context.collection.objects.link(o);o.data.materials.append(roles[role]);parts.append(o)
 bm=bmesh.new();bm.from_mesh(me);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));assert all(e.is_manifold for e in bm.edges);bm.to_mesh(me);bm.free()
 bpy.context.view_layer.objects.active=o;o.select_set(True);bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT');bpy.ops.uv.smart_project(island_margin=.015);bpy.ops.object.mode_set(mode='OBJECT');o.select_set(False)
ring('Mitered broad fascia',9.15,12.7,'HeaderPaint');ring('Upper fascia cap',13.08,13.5,'HeaderPaint');ring('Upper accent band',12.7,13.08,'EdgePaint');ring('Lintel lower return',8.5,9.15,'FramePaint')
box('Rear liner',0,-6.9,13.5,.2,0,9.15,'PanelLaminate')
box('Left liner',-6.9,0,.2,14,0,9.15,'PanelLaminate')
# Open flanking windows: unified continuous millwork via boolean diff.
for side in ['front','right']:
 def face(name,u,v,w,d,lo,hi,role,cutters=None):
  return box(side+' '+name,u if side=='front' else v,v if side=='front' else u,w if side=='front' else d,d if side=='front' else w,lo,hi,role,cutters=cutters)
 c_d = 1.0; c_w = 5.0
 cutter = box_cutter(side+' window cutter', -3.2 if side=='front' else 6.9, 6.9 if side=='front' else -3.2, c_w if side=='front' else c_d, c_d if side=='front' else c_w, 4.5, 8.72)
 face('wall',-3.2,6.9,7.4,.25,.12,9.15,'FramePaint',cutters=[cutter])
 face('low accent',-3.2,7.03,7.4,.05,4.05,4.45,'EdgePaint')
# Entrance jambs support the diagonal header without a sill/trip edge.
for x,z in [(.75,6.85),(6.85,.75)]:box('Entry jamb',x,z,.5,.5,0,8.5,'FramePaint')
# TV console: triangular wedge nestled into the corner apex (-6.65, -6.65).
poly_horiz = [(-6.65, -6.65), (-3.15, -6.65), (-6.65, -3.15)]
for y in [.18,1.15,2.18]:slab('Console horizontal', poly_horiz, y, y+.12, 'CabinetLaminate')
poly_toe = [(-6.65, -6.65), (-3.45, -6.65), (-6.65, -3.45)]
slab('Console recessed toe', poly_toe, 0, .18, 'CabinetLaminate')
slab('Console left side', [(-6.65, -6.65), (-6.53, -6.65), (-6.53, -3.27), (-6.65, -3.15)], .18, 2.18, 'CabinetLaminate')
slab('Console rear side', [(-6.65, -6.65), (-6.65, -6.53), (-3.27, -6.53), (-3.15, -6.65)], .18, 2.18, 'CabinetLaminate')

# Wall posters mounted along the kids clubhouse interior walls at authentic youth movie proportions.
box('Poster L1', -6.79, 0.0, 0.02, 2.25, 3.34, 6.66, 'WallPoster', 0.0)
box('Poster L2', -6.79, 3.5, 0.02, 2.25, 3.34, 6.66, 'WallPoster', 0.0)
box('Poster R1', 0.0, -6.79, 2.25, 0.02, 3.34, 6.66, 'WallPoster', 0.0)
box('Poster R2', 3.5, -6.79, 2.25, 0.02, 3.34, 6.66, 'WallPoster', 0.0)
# Fitted right-window sill and inner jamb liners; keep the eye-level opening.
box('Right window sill',6.98,-3.05,.56,6.85,4.45,4.57,'PanelLaminate')
for z in [-6.47,.37]:box('Right window reveal',6.9,z,.3,.08,4.57,8.72,'EdgePaint',.006)
# Low family shelving, shallow slanted trays with integral raised lips.
for side in ['front','right']:
 def shelf(name,x,z,w,d,lo,hi,role):return box(side+' '+name,x if side=='front' else z,z if side=='front' else x,w if side=='front' else d,d if side=='front' else w,lo,hi,role)
 for center in [-5.1,-1.4]:
  for x in [center-1.8,center+1.8]:shelf('shelf upright',x,7.6,.1,1.2,.08,4.3,'PanelLaminate')
  shelf('shelf back',center,7.08,3.5,.12,.08,4.3,'PanelLaminate')
  shelf('recessed plinth',center,7.5,3.5,.9,0,.25,'FramePaint')
  for y in [.45,2.1,3.75]:
   shelf('tray',center,7.6,3.5,1.2,y,y+.08,'PanelLaminate')
   shelf('retaining lip',center,8.17,3.5,.06,y+.08,y+.18,'EdgePaint')
# The upper construction fits the dropped lid, retaining low shelf/chair scale.
# 4.5 -> 13.5 is remapped to 4.5 -> 10.6 feet; all joints share this datum.
for o in parts:
 for v in o.data.vertices:
  if v.co.z>4.5:v.co.z=4.5+(v.co.z-4.5)*(6.1/9)
# Align the upper stripe to the wall's 13.5 - 2.7 - .5 datum.
# Keep the entry/window geometry and overall soffit height unchanged.
for o in parts:
 if o.name in ['Mitered broad fascia','Upper accent band','Upper fascia cap']:
  lo,hi={'Mitered broad fascia':(7.6516666667,9.6333333333),
    'Upper accent band':(9.6333333333,9.9666666667),
    'Upper fascia cap':(9.9666666667,10.3)}[o.name]
  oldlo=min(v.co.z for v in o.data.vertices);oldhi=max(v.co.z for v in o.data.vertices)
  for v in o.data.vertices:v.co.z=lo+(v.co.z-oldlo)*(hi-lo)/(oldhi-oldlo)
ring('Soffit fitted return',10.3,10.6,'PanelLaminate')
# Physical box-projected UVs: the same ten repeats per foot as the store's
# equipment finish, after the final height mapping (packed UVs stretched it).
for o in parts:
 uv=o.data.uv_layers.active or o.data.uv_layers.new(name='UVMap')
 for face in o.data.polygons:
  axis=max(range(3),key=lambda i:abs(face.normal[i]))
  for li in face.loop_indices:
   v=o.data.vertices[o.data.loops[li].vertex_index].co
   uv.data[li].uv=(((-v.y) if axis==0 else v.x)*10, ((-v.y) if axis==2 else v.z)*10)
# Source retains individual named construction parts. Export batches by finish role.
for name,xyz in [('floor_origin',(0,0,0)),('tv_support',(-5.6,-2,2.3)),('header',(4,4,8.97)),('entry',(4,4,0))]:
 o=bpy.data.objects.new(name,None);o.location=(xyz[0],-xyz[1],xyz[2]);bpy.context.collection.objects.link(o)
bpy.context.scene.unit_settings.system='IMPERIAL';bpy.context.scene.unit_settings.scale_length=.3048
bpy.context.preferences.filepaths.save_version=0
(ROOT/'tools/models').mkdir(parents=True,exist_ok=True);(ROOT/'public/models').mkdir(parents=True,exist_ok=True)
# Editable source previews the same fine molded finish as the runtime.
# glTF uses the role-based runtime micrograin maps; no proprietary images.
for m in roles.values():
 nodes=m.node_tree.nodes;links=m.node_tree.links
 coord=nodes.new('ShaderNodeTexCoord');noise=nodes.new('ShaderNodeTexNoise');noise.inputs['Scale'].default_value=128
 links.new(coord.outputs['UV'],noise.inputs['Vector'])
 bump=nodes.new('ShaderNodeBump');bump.inputs['Distance'].default_value=.0003
 links.new(noise.outputs['Fac'],bump.inputs['Height']);links.new(bump.outputs['Normal'],nodes['Principled BSDF'].inputs['Normal'])
for screen in bpy.data.screens:
 for area in screen.areas:
  if area.type=='VIEW_3D':area.spaces.active.shading.type='MATERIAL'
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'tools/models/clubhouse.blend'))
# Runtime supplies the shared deterministic finish maps on these named roles.
for m in roles.values():
 for link in list(m.node_tree.links):
  if link.to_node.type=='BSDF_PRINCIPLED' and link.to_socket.name=='Normal':m.node_tree.links.remove(link)

exports=[]
role_parts={role:[o for o in parts if o.data.materials[0].name==role] for role in roles}
for role in roles:
 bpy.ops.object.select_all(action='DESELECT')
 for o in role_parts[role]:
  o.select_set(True);bpy.context.view_layer.objects.active=o
 bpy.ops.object.join();o=bpy.context.object;o.name=role;exports.append(o)
bpy.ops.object.select_all(action='DESELECT')
for o in exports:o.select_set(True)
path=ROOT/'public/models/clubhouse.glb'
bpy.ops.export_scene.gltf(filepath=str(path),export_format='GLB',use_selection=True,export_yup=True)
metrics={'bytes':path.stat().st_size,'triangles':sum(sum(len(p.vertices)-2 for p in o.data.polygons) for o in exports),'draws':len(exports),'roles':list(roles),'height':10.6,'envelope':[15.2,15.2],'uv':True}
(ROOT/'public/models/clubhouse.geometry.json').write_text(json.dumps(metrics,indent=2)+'\n');print(metrics)
