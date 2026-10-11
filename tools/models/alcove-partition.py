"""Original generic alcove doorway trim and partition mouldings; Blender scripted mesh authoring.
Run: blender -b -t 2 -P tools/models/alcove-partition.py
Feet, Blender (x, -store_z, height) -> Y-up glTF (x, height, store_z). See docs/alcove-partition-model.md.
Doorway centre is the origin; the sales-floor wall face is -X, the room face +X (wall 0.34 ft thick).
"""
import bpy, bmesh, math, json
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[2]
bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
scene=bpy.context.scene
scene.unit_settings.system='IMPERIAL';scene.unit_settings.scale_length=.3048
T=.17        # half wall thickness
DW=1.5       # half door width
DH=6.8       # door head underside
def material(name,color,metal,rough):
 m=bpy.data.materials.new(name);m.diffuse_color=(*color,1);m.use_nodes=True
 p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*color,1);p.inputs['Metallic'].default_value=metal;p.inputs['Roughness'].default_value=rough
 return m
trim=material('AlcoveTrimTimber',(.62,.50,.36),0,.62)
brass=material('AlcoveBracketBrass',(.30,.22,.10),.72,.38)
parts=[]
def new(name,mat):
 me=bpy.data.meshes.new(name);o=bpy.data.objects.new(name,me);scene.collection.objects.link(o);me.materials.append(mat);parts.append(o);return o
def prism(bm,prof,axis,a,b):
 """Extrude a closed 2D profile along `axis` ('x'|'y'|'z') from a to b. prof = (u,v) in the other two axes, in x,y,z order."""
 def p(u,v,w):
  return {'x':(w,u,v),'y':(u,w,v),'z':(u,v,w)}[axis]
 lo=[bm.verts.new(p(u,v,a)) for u,v in prof];hi=[bm.verts.new(p(u,v,b)) for u,v in prof]
 n=len(prof)
 bm.faces.new(lo);bm.faces.new(hi[::-1])
 for i in range(n):bm.faces.new((lo[i],lo[(i+1)%n],hi[(i+1)%n],hi[i]))
def box(bm,x0,x1,y0,y1,z0,z1):
 prism(bm,[(y0,z0),(y1,z0),(y1,z1),(y0,z1)],'x',x0,x1)
def finish(o,bevel=None):
 bm=o.data
 bpy.context.view_layer.objects.active=o;bpy.ops.object.select_all(action='DESELECT');o.select_set(True)
 if bevel:
  b=o.modifiers.new('Eased timber edges','BEVEL');b.width=bevel;b.segments=2;b.limit_method='ANGLE'
  bpy.ops.object.modifier_apply(modifier=b.name)
def build(name,mat,fn,bevel=None):
 o=new(name,mat);bm=bmesh.new();fn(bm);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(o.data);bm.free();finish(o,bevel);return o

# ---- door surround: two faces, stepped casing; face f=-1 sales floor, f=+1 room ----
def surround(bm):
 for f in (-1,1):
  face=f*T
  def X(p):return face+f*p     # projection p outward from the wall face
  for s in (-1,1):
   # jamb casing: backband board + inner bead, extruded up from the plinth block to the head
   prof=[(X(0),s*1.5),(X(0),s*1.74),(X(.022),s*1.74),(X(.022),s*1.58),(X(.04),s*1.58),(X(.04),s*1.5)]
   prism(bm,prof,'z',.34,DH)
   # plinth block, proud of the casing and of the skirting
   box(bm,min(X(0),X(.045)),max(X(0),X(.045)),min(s*1.5,s*1.79),max(s*1.5,s*1.79),0,.34)
  # head casing across both jamb tops; room face carries a drip cap
  if f<0: hp=[(DH,0),(DH+.10,0),(DH+.10,.022),(DH+.04,.022),(DH+.04,.04),(DH,.04)]
  else:   hp=[(DH,0),(DH+.32,0),(DH+.32,.075),(DH+.28,.075),(DH+.25,.04),(DH+.23,.022),(DH+.04,.022),(DH+.04,.04),(DH,.04)]
  prism(bm,[(X(p),h) for h,p in hp],'y',-1.77,1.77)
surround_o=build('AlcoveDoorSurround',trim,surround,.005)

# ---- header cap above the sales-face sign board (sales face only) ----
def cap(bm):
 face=-T
 prof=[(face-p,h) for h,p in [(7.77,0),(7.77,.05),(7.80,.09),(7.86,.105),(7.905,.07),(7.905,0)]]
 prism(bm,prof,'y',-1.80,1.80)
cap_o=build('AlcoveHeaderCap',trim,cap,.004)

# ---- jamb linings finishing the partition returns inside the opening, mortised for the curtain rail ----
RX,RZ0,RZ1=.0925,6.737,6.863   # rail section plus clearance (rail is .18 x .12 centred on y=6.8)
def cutter(s):
 bm=bmesh.new();box(bm,-RX,RX,s*1.40,s*1.52,RZ0,RZ1);me=bpy.data.meshes.new('cut');bm.to_mesh(me);bm.free()
 o=bpy.data.objects.new('cut',me);scene.collection.objects.link(o);return o
def cut(o,s):
 c=cutter(s);m=o.modifiers.new('Rail mortise','BOOLEAN');m.operation='DIFFERENCE';m.solver='EXACT';m.object=c
 bpy.context.view_layer.objects.active=o;bpy.ops.object.modifier_apply(modifier=m.name);bpy.data.objects.remove(c,do_unlink=True)
def lining(bm):
 for s in (-1,1):box(bm,-T,T,min(s*1.485,s*1.5),max(s*1.485,s*1.5),0,DH)
lin=build('AlcoveJambLining',trim,lining)
for s in (-1,1):cut(lin,s)
# ---- brass rail brackets: frame cupping each rail end, four screw heads each ----
def bracket(bm):
 for s in (-1,1):box(bm,-.115,.115,min(s*1.473,s*1.485),max(s*1.473,s*1.485),6.68,6.92)
br=build('AlcoveRailBracket',brass,bracket,.003)
for s in (-1,1):cut(br,s)
def screws(bm):
 for s in (-1,1):
  for x in (-.06,.06):
   for h in (6.71,6.89):
    a,b=(s*1.465,s*1.473)
    n=8;r=.012
    prism(bm,[(x+r*math.cos(i*2*math.pi/n),h+r*math.sin(i*2*math.pi/n)) for i in range(n)],'y',min(a,b),max(a,b))
build('AlcoveBracketScrew',brass,screws)

# ---- unit-length mouldings (1 ft along local Z/store Z, wall face at x=0, projecting +X) ----
def skirting(bm):prism(bm,[(0,0),(.028,0),(.028,.43),(.022,.46),(.010,.47),(0,.47)],'y',-.5,.5)
build('AlcoveSkirting',trim,skirting,.003)
def crown(bm):prism(bm,[(0,-.30),(.015,-.30),(.015,-.27),(.040,-.20),(.062,-.09),(.065,0),(0,0)],'y',-.5,.5)
build('AlcoveCrown',trim,crown,.003)

# ---- finalize ----
metrics=[]
for o in parts:
 bpy.context.view_layer.objects.active=o;bpy.ops.object.select_all(action='DESELECT');o.select_set(True)
 bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
 bm=bmesh.new();bm.from_mesh(o.data);bmesh.ops.remove_doubles(bm,verts=bm.verts,dist=1e-5);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces))
 bad=[e for e in bm.edges if not e.is_manifold];assert not bad,(o.name,len(bad))
 bm.to_mesh(o.data);bm.free()
 bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT');bpy.ops.uv.smart_project(island_margin=.02);bpy.ops.object.mode_set(mode='OBJECT')
 o['units']='feet';o['role']=o.data.materials[0].name
 o.data.calc_loop_triangles()
 metrics.append(dict(part=o.name,triangles=len(o.data.loop_triangles),vertices=len(o.data.vertices),uv=True,manifold=True,dimensions=[round(d,4) for d in o.dimensions],material=o.data.materials[0].name))
bpy.ops.object.select_all(action='DESELECT')
for o in parts:o.select_set(True)
out=ROOT/'public/models/alcove-partition.glb'
bpy.ops.export_scene.gltf(filepath=str(out),export_format='GLB',use_selection=True,export_extras=True)
(ROOT/'docs/alcove-partition-cost.json').write_text(json.dumps(dict(parts=metrics,glbBytes=out.stat().st_size,textures=0),indent=2)+'\n')
for area in bpy.context.screen.areas:
 if area.type=='VIEW_3D':
  area.spaces.active.region_3d.view_distance=9;area.spaces.active.region_3d.view_location=Vector((0,0,3.4))
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'tools/models/alcove-partition.blend'))
print(json.dumps(metrics,indent=1))
