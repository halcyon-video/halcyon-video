"""Original generic late-1980s hatchback. Run: blender -b -P tools/models/car-hatchback.py
Feet; X width, -Y nose, Z up. Runtime keeps the established nine-foot lot scale.
Reference study/provenance: docs/car-hatchback-model.md. No imported geometry.
"""
import bpy,bmesh,math,json
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[2]
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
M={}
for name,color,metal,rough in [('BodyPaint',(.12,.23,.28),.35,.32),('RubberTrim',(.022,.027,.029),0,.8),('WindowGlass',(.025,.045,.055),.05,.22),('WheelMetal',(.43,.47,.48),.65,.35),('Headlamp',(.85,.85,.67),.1,.25),('TailLamp',(.5,.025,.016),.1,.28),('AmberLens',(.85,.26,.02),.1,.28),('InteriorCloth',(.09,.105,.11),0,.95)]:
 m=bpy.data.materials.new(name);m.diffuse_color=(*color,1);m.use_nodes=True;p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*color,1);p.inputs['Metallic'].default_value=metal;p.inputs['Roughness'].default_value=rough;M[name]=m
# Lightly translucent tint lets the seat and dashboard silhouettes read.
M['WindowGlass'].node_tree.nodes.get('Principled BSDF').inputs['Alpha'].default_value=.78
M['WindowGlass'].surface_render_method='DITHERED'
def mesh(name,v,f,mat):
 me=bpy.data.meshes.new(name);me.from_pydata(v,[],f);me.update();o=bpy.data.objects.new(name,me);bpy.context.collection.objects.link(o);me.materials.append(M[mat]);return o
def solid(name,poly,delta,mat):
 n=len(poly);v=poly+[tuple(Vector(p)+Vector(delta)) for p in poly];return mesh(name,v,[tuple(range(n-1,-1,-1)),tuple(range(n,2*n))]+[(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)],mat)
def box(name,c,d,mat,bevel=.025):
 x,y,z=c;a,b,h=[v/2 for v in d];o=solid(name,[(x-a,y-b,z-h),(x+a,y-b,z-h),(x+a,y+b,z-h),(x-a,y+b,z-h)],(0,0,d[2]),mat)
 if bevel:mod=o.modifiers.new('Small formed edge','BEVEL');mod.width=bevel;mod.segments=1
 return o
def window(name,p,normal):
 # Joined frame ring with a real inset return and separate recessed glazing.
 center=sum((Vector(v) for v in p),Vector())/len(p);inner=[center+(Vector(v)-center)*.88 for v in p];n=len(p);nv=Vector(normal)*.045
 v=[tuple(Vector(a)) for a in p]+[tuple(a) for a in inner]+[tuple(a-nv) for a in inner]
 f=[(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)]+[(n+i,n+(i+1)%n,2*n+(i+1)%n,2*n+i) for i in range(n)]
 mesh(name+' gasket and reveal',v,f,'RubberTrim');solid(name+' inset glass',[tuple(a-nv) for a in inner],tuple(-nv*.2),'WindowGlass')
# Continuous side skin outline with true open wheel arches, not black disks.
for s,side in [(-1,'Left'),(1,'Right')]:
 contour=[(-4.35,.55)]
 for cy in [-2.65,2.65]:
  contour.append((cy-.83,.55))
  for i in range(13):
   a=math.pi-i*math.pi/12;contour.append((cy+.83*math.cos(a),.73+.83*math.sin(a)))
  contour.append((cy+.83,.55))
 contour += [(4.35,.55),(4.35,1.8),(3.9,1.96),(-3.7,1.96),(-4.35,1.72)]
 solid(side+' pressed body side with arch cutouts',[(s*1.89,y,z) for y,z in contour],(-s*.09,0,0),'BodyPaint')
 for cy in [-2.65,2.65]:
  v=[]
  for x,r in [(s*1.895,.83),(s*1.93,.87),(s*1.79,.83)]:
   for i in range(13):
    a=math.pi-i*math.pi/12;v.append((x,cy+r*math.cos(a),.73+r*math.sin(a)))
  mesh(side+f' arch lip and inner well {cy}',v,[(j*13+i,j*13+i+1,(j+1)*13+i+1,(j+1)*13+i) for j in range(2) for i in range(12)],'RubberTrim')
 # Side cabin surface is subdivided into framed front and quarter glass.
 def sidepoint(y,z):return (s*(1.88-(z-1.96)*.25),y,z)
 window(side+' front door window',[sidepoint(-1.9,2.01),sidepoint(-.74,3.19),sidepoint(.48,3.19),sidepoint(.48,2.01)],(s,0,.25))
 window(side+' rear quarter window',[sidepoint(.65,2.01),sidepoint(.65,3.19),sidepoint(2.52,3.19),sidepoint(3.56,2.01)],(s,0,.25))
 for y in [-1.95,.56,3.6]:
  ztop=3.24 if y==.56 else 2.06
  box(side+' door shut line '+str(y),(s*1.895,y,1.26),(.012,.022,1.31),'RubberTrim',0)
 box(side+' door handle',(s*1.94,.14,1.77),(.09,.38,.09),'RubberTrim')
 box(side+' protective rubbing strip',(s*1.918,0,1.3),(.035,3.5,.09),'RubberTrim',.008)
 box(side+' mirror stem',(s*1.94,-1.68,2.10),(.18,.12,.08),'RubberTrim',.01)
 box(side+' mirror housing',(s*2.05,-1.63,2.18),(.28,.26,.22),'RubberTrim',.05)
 box(side+' mirror reflective face',(s*2.05,-1.49,2.18),(.20,.018,.14),'WheelMetal',.015)
# Main upper panels and roof have thickness. Pillars share exact window edges.
solid('Sloping hood',[(-1.89,-4.35,1.72),(1.89,-4.35,1.72),(1.88,-1.95,1.96),(-1.88,-1.95,1.96)],(0,0,-.06),'BodyPaint')
solid('Roof pressing',[(-1.56,-.84,3.27),(1.56,-.84,3.27),(1.56,2.62,3.27),(-1.56,2.62,3.27)],(0,0,.08),'BodyPaint')
window('Windshield',[(-1.85,-1.95,1.98),(1.85,-1.95,1.98),(1.55,-.84,3.27),(-1.55,-.84,3.27)],(0,-.76,.65))
window('Rear hatch glass',[(1.85,3.65,1.98),(-1.85,3.65,1.98),(-1.55,2.62,3.27),(1.55,2.62,3.27)],(0,.78,.62))
for s in [-1,1]:
 for name,coords in [('A pillar',[(-1.95,1.96),(-.84,3.35),(-.68,3.35),(-1.75,1.96)]),('B pillar',[(.47,1.96),(.47,3.35),(.66,3.35),(.66,1.96)]),('C pillar',[(2.49,3.35),(2.67,3.35),(3.8,1.96),(3.5,1.96)])]:
  solid(str(s)+name,[(s*(1.88-(z-1.96)*.25),y,z) for y,z in coords],(-s*.06,0,0),'BodyPaint')
solid('Hatch lower pressing',[(-1.89,3.65,1.96),(1.89,3.65,1.96),(1.89,4.35,1.8),(-1.89,4.35,1.8)],(0,0,-.08),'BodyPaint')
for y,name in [(-4.35,'Front'),(4.35,'Rear')]:
 box(name+' fascia',(0,y,1.18),(3.77,.07,1.12),'BodyPaint',.035)
 box(name+' rubber bumper',(0,y, .72),(3.88,.30,.30),'RubberTrim',.06)
 box(name+' blank plate',(0,y+(-.051 if y<0 else .051),1.13),(.73,.03,.27),'WheelMetal',.015)
 for s in [-1,1]:
  box(name+' lamp '+str(s),(s*1.34,y+(-.06 if y<0 else .06),1.54),(.8,.09,.30),'Headlamp' if y<0 else 'TailLamp',.025)
  box(name+' indicator '+str(s),(s*1.69,y+(-.115 if y<0 else .115),1.55),(.15,.035,.27),'AmberLens',.012)
 if y<0:
  box('Grille recess',(0,-4.40,1.53),(1.76,.03,.31),'RubberTrim',.01)
  for z in [1.43,1.52,1.61]:box('Grille horizontal blade',(0,-4.425,z),(1.7,.025,.025),'WheelMetal',0)
box('Rear hatch wiper',(0,3.39,2.33),(1.0,.055,.045),'RubberTrim',.01)
box('Underbody pan',(0,0,.55),(2.95,7.95,.16),'RubberTrim')
# Revolved tire cross sections: tread shoulder, sidewall, recessed steel hub.
for s in [-1,1]:
 for cy in [-2.65,2.65]:
  for name,profile,mat in [('tire',[(1.6,.44),(1.59,.61),(1.65,.70),(1.72,.73),(1.94,.73),(2.00,.65),(2.00,.44)],'RubberTrim'),('steel wheel',[(1.98,0),(1.98,.43),(2.012,.45),(2.035,.39),(2.02,.28),(2.055,.24),(2.06,0)],'WheelMetal')]:
   v=[(s*x,cy+r*math.cos(i*math.tau/24),.73+r*math.sin(i*math.tau/24)) for x,r in profile for i in range(24)]
   n=len(profile);f=[(j*24+i,j*24+(i+1)%24,((j+1)%n)*24+(i+1)%24,((j+1)%n)*24+i) for j in range(n) for i in range(24)]
   mesh(f'{s} {cy} {name}',v,f,mat)
box('Dashboard silhouette',(0,-1.38,1.92),(3.2,.59,.25),'InteriorCloth')
for x in [-.78,.78]:
 box('Front seat cushion '+str(x),(x,-.1,1.03),(1.13,1.15,.24),'InteriorCloth',.08)
 box('Front seat back '+str(x),(x,.40,1.55),(1.13,.23,1.1),'InteriorCloth',.09)
 box('Front headrest '+str(x),(x,.4,2.2),(.61,.22,.30),'InteriorCloth',.06)
box('Rear bench silhouette',(0,2.02,1.27),(2.9,.8,.7),'InteriorCloth',.08)
# Clean normals and per-part UV islands; open arch returns and window reveals intentional.
for o in list(bpy.context.scene.objects):
 if o.type!='MESH':continue
 bpy.context.view_layer.objects.active=o;o.select_set(True)
 for mod in list(o.modifiers):bpy.ops.object.modifier_apply(modifier=mod.name)
 bm=bmesh.new();bm.from_mesh(o.data);bmesh.ops.remove_doubles(bm,verts=bm.verts,dist=1e-6);bmesh.ops.delete(bm,geom=[e for e in bm.edges if e.is_wire],context='EDGES');bmesh.ops.recalc_face_normals(bm,faces=bm.faces)
 assert all(f.calc_area()>1e-9 for f in bm.faces),o.name
 if 'gasket and reveal' not in o.name and 'arch lip' not in o.name:
  assert all(e.is_manifold for e in bm.edges),o.name
 bm.to_mesh(o.data);bm.free()
 bpy.ops.object.select_all(action='DESELECT');o.select_set(True);bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT');bpy.ops.uv.smart_project(island_margin=.025);bpy.ops.object.mode_set(mode='OBJECT');o.select_set(False)
 o['units']='feet';o['provenance']='Original scripted generic hatchback; study only: 1987 Golf brochure';o['role']=o.data.materials[0].name
for area in bpy.context.screen.areas:
 if area.type=='VIEW_3D':area.spaces.active.region_3d.view_distance=13;area.spaces.active.region_3d.view_location=(0,0,1.5)
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'tools/models/car-hatchback.blend'))
# Batch static physical parts by material for eight runtime draws, keep source separate.
for mat in M.values():
 bpy.ops.object.select_all(action='DESELECT');obs=[o for o in bpy.context.scene.objects if o.type=='MESH' and o.data.materials[0]==mat]
 for o in obs:o.select_set(True)
 bpy.context.view_layer.objects.active=obs[0];bpy.ops.object.join();bpy.context.object.name='Hatchback_'+mat.name
bpy.ops.object.select_all(action='SELECT')
bpy.ops.export_scene.gltf(filepath=str(ROOT/'public/models/car_hatchback.glb'),export_format='GLB',export_yup=True,export_apply=True)
