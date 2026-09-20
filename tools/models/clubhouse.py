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
for name,color in [('FramePaint',canonical('HALCYON_BLUE')),('HeaderPaint',canonical('HALCYON_BLUE')),('PanelLaminate',linear_hex('#eeeae0')),('ShelfLaminate',linear_hex('#f8f2e8')),('ShelfEdge',linear_hex('#d6d0c5')),('Baseboard',linear_hex('#262626')),('EdgePaint',canonical('HALCYON_WHITE')),('CabinetLaminate',linear_hex('#282722')),('WallPoster',linear_hex('#ffffff'))]:
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
  mod=o.modifiers.new('Eased finished edges','BEVEL');mod.width=bevel;mod.segments=1;bpy.ops.object.modifier_apply(modifier=mod.name)
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
# Outer edge extends to (-7.2, -7.2) to meet store walls without gaps.
outer=[(-7.2,-7.2),(7.025,-7.2),(7.025,1),(1,7.025),(-7.2,7.025)]
inner_corner=8.025-math.sqrt(2)*.25-6.775
inner=[(-6.8,-6.8),(6.775,-6.8),(6.775,inner_corner),(inner_corner,6.775),(-6.8,6.775)]
# Ring faces use matching corner topology, then beveled edge joins.
def ring(name,lo,hi,role):
 n=5;poly=outer+inner;vs=[(x,-z,y) for y in [lo,hi] for x,z in poly];fs=[]
 for i in range(n):
  j=(i+1)%n;fs += [(i,j,j+n,i+n),(i+10,i+15,j+15,j+10),(i,i+10,j+10,j),(i+n,j+n,j+15,i+15)]
 me=bpy.data.meshes.new(name);me.from_pydata(vs,[],fs);me.update();o=bpy.data.objects.new(name,me);bpy.context.collection.objects.link(o);o.data.materials.append(roles[role]);parts.append(o)
 bm=bmesh.new();bm.from_mesh(me);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));assert all(e.is_manifold for e in bm.edges);bm.to_mesh(me);bm.free()
 bpy.context.view_layer.objects.active=o;o.select_set(True);bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT');bpy.ops.uv.smart_project(island_margin=.015);bpy.ops.object.mode_set(mode='OBJECT');o.select_set(False)
ring('Mitered broad fascia',9.15,12.7,'HeaderPaint');ring('Upper fascia cap',13.08,13.5,'HeaderPaint');ring('Upper accent band',12.7,13.08,'EdgePaint');ring('Lintel lower return',8.5,9.15,'FramePaint')
# Solid wall-contiguous millwork liners extending to store corner walls at -7.2
box('Rear liner',-0.1,-7.0,14.2,0.4,0,9.15,'PanelLaminate')
box('Left liner',-7.0,-0.1,0.4,14.2,0,9.15,'PanelLaminate')
# Open flanking windows: unified continuous millwork via boolean diff.
for side in ['front','right']:
 def face(name,u,v,w,d,lo,hi,role,cutters=None):
  return box(side+' '+name,u if side=='front' else v,v if side=='front' else u,w if side=='front' else d,d if side=='front' else w,lo,hi,role,cutters=cutters)
 c_d = 1.0; c_w = 5.0
 cutter = box_cutter(side+' window cutter', -3.2 if side=='front' else 6.9, 6.9 if side=='front' else -3.2, c_w if side=='front' else c_d, c_d if side=='front' else c_w, 3.5, 8.72)
 face('wall',-3.2,6.9,7.4,.25,.12,9.15,'FramePaint',cutters=[cutter])
 # Pin 179: uninterrupted blue millwork; no low accent strip.
# Entrance jambs support the diagonal header without a sill/trip edge.
for x,z,w,d in [(.75,6.9,.5,.25),(6.9,.75,.25,.5)]:box('Entry jamb',x,z,w,d,0,8.5,'FramePaint')
# Front/right fascia, window wall and jamb share both exposed quarter-foot planes.
for side in ['front','right']:
 axis=1 if side=='front' else 0
 def store_coordinate(v):return -v.co.y if axis==1 else v.co.x
 side_wall=next(o for o in parts if o.name==side+' wall')
 coords=[store_coordinate(v) for v in side_wall.data.vertices]
 assert abs(min(coords)-6.775)<1e-5 and abs(max(coords)-7.025)<1e-5
 jamb=next(o for o in parts if o.name.startswith('Entry jamb') and
   abs(sum(store_coordinate(v) for v in o.data.vertices)/len(o.data.vertices)-6.9)<1e-5)
 coords=[store_coordinate(v) for v in jamb.data.vertices]
 assert abs(min(coords)-6.775)<1e-5 and abs(max(coords)-7.025)<1e-5
 assert outer[3 if side=='front' else 1][axis]==7.025
 assert inner[3 if side=='front' else 1][axis]==6.775
print('FLUSH BODY: exposed front/right wall, jamb and all fascia rings share6.775..7.025; rear/left liners and fascia share-7.2..-6.8')
# TV console: triangular wedge nestled into the corner apex (-6.8, -6.8) against solid liners.
poly_horiz = [(-6.8, -6.8), (-3.15, -6.8), (-6.8, -3.15)]
for y in [.18,1.15,2.18]:slab('Console horizontal', poly_horiz, y, y+.12, 'CabinetLaminate')
poly_toe = [(-6.8, -6.8), (-3.45, -6.8), (-6.8, -3.45)]
slab('Console recessed toe', poly_toe, 0, .18, 'CabinetLaminate')
slab('Console left side', [(-6.8, -6.8), (-6.68, -6.8), (-6.68, -3.27), (-6.8, -3.15)], .18, 2.18, 'CabinetLaminate')
slab('Console rear side', [(-6.8, -6.8), (-6.8, -6.68), (-3.27, -6.68), (-3.15, -6.8)], .18, 2.18, 'CabinetLaminate')

# Deeper corner console supports the complete rotated television footprint.
for o in parts:
 if o.name.startswith('Console '):
  for v in o.data.vertices:
   v.co.x=-6.8+(v.co.x+6.8)*1.5
   v.co.y=6.8+(v.co.y-6.8)*1.5

# Wall posters mounted along the kids clubhouse interior walls at authentic youth movie proportions.
# Fitted right-window sill and inner jamb liners; keep the eye-level opening.
box('Right window sill',6.9,-3.2,.25,5,3.45,3.5,'FramePaint')
# The opening has the same blue paint as its continuous surrounding wall.
# Matching low shelves on both faces of each flanking wall.
for side in ['front','right']:
 for inward in [False,True]:
  center_z=6.15 if inward else 7.6
  facing=-1 if inward else 1
  def shelf(name,x,z,w,d,lo,hi,role):return box(side+(' inner ' if inward else ' outer ')+name,x if side=='front' else z,z if side=='front' else x,w if side=='front' else d,d if side=='front' else w,lo,hi,role)
  for center in ([-4.95,-1.4] if inward else [-5.1,-1.4]):
   width=3.4 if inward and center==-4.95 else 3.7
   for x in [center-width/2+.05,center+width/2-.05]:shelf('shelf upright',x,center_z,.1,1.2,.08,3.4,'ShelfLaminate')
   shelf('shelf back',center,center_z-facing*.52,width-.2,.12,.08,3.4,'ShelfLaminate')
   shelf('recessed plinth',center,center_z-facing*.1,width-.2,.9,0,.25,'FramePaint')
   for y in [0.5,1.38,2.26]:
    shelf('tray',center,center_z,width-.2,1.2,y,y+.08,'ShelfLaminate')
    shelf('retaining lip',center,center_z+facing*.57,width-.2,.06,y+.08,y+.18,'ShelfEdge')
# The upper construction fits the dropped lid, retaining low shelf/chair scale.
# 4.5 -> 13.5 is remapped to 4.5 -> 10.6 feet; all joints share this datum.
for o in parts:
 for v in o.data.vertices:
  if v.co.z>4.5:v.co.z=4.5+(v.co.z-4.5)*(6.1/9)
# Align the upper stripe to the wall's 13.5 - 2.7 - .5 datum.
# Keep the entry/window geometry and overall soffit height unchanged.
for o in parts:
 if o.name in ['Mitered broad fascia','Upper accent band','Upper fascia cap']:
  lo,hi={'Mitered broad fascia':(7.6516666667,9.9333333333),
    'Upper accent band':(9.9333333333,10.2666666667),
    'Upper fascia cap':(10.2666666667,10.6)}[o.name]
  oldlo=min(v.co.z for v in o.data.vertices);oldhi=max(v.co.z for v in o.data.vertices)
  for v in o.data.vertices:v.co.z=lo+(v.co.z-oldlo)*(hi-lo)/(oldhi-oldlo)
# Continuous skirting follows the inside wall faces and stops at the doorway.
box('Inside rear skirting',-.03,-6.765,13.53,.07,0,.32,'Baseboard',.006)
box('Inside left skirting',-6.765,-.03,.07,13.53,0,.32,'Baseboard',.006)
box('Inside front skirting',-3.2,6.735,7.4,.07,0,.32,'Baseboard',.006)
box('Inside right skirting',6.735,-3.2,.07,7.4,0,.32,'Baseboard',.006)
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
for name,xyz in [('floor_origin',(0,0,0)),('tv_support',(-4.9,-4.9,2.3)),('header',(4,4,8.97)),('entry',(4,4,0))]:
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
 if not role_parts[role]:continue
 for o in role_parts[role]:
  o.select_set(True);bpy.context.view_layer.objects.active=o
 bpy.ops.object.join();o=bpy.context.object;o.name=role;exports.append(o)
bpy.ops.object.select_all(action='DESELECT')
for o in exports:o.select_set(True)
path=ROOT/'public/models/clubhouse.glb'
bpy.ops.export_scene.gltf(filepath=str(path),export_format='GLB',use_selection=True,export_yup=True)
metrics={'bytes':path.stat().st_size,'triangles':sum(sum(len(p.vertices)-2 for p in o.data.polygons) for o in exports),'draws':len(exports),'roles':[role for role in roles if role_parts[role]],'height':10.6,'envelope':[15.2,15.2],'uv':True}
(ROOT/'public/models/clubhouse.geometry.json').write_text(json.dumps(metrics,indent=2)+'\n');print(metrics)
