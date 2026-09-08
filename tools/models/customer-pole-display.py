"""Original generic customer VFD, scripted mesh authoring (not an exact replica).
Run: blender -b -t 2 --python tools/models/customer-pole-display.py
Store feet: X right, Y up, +Z customer. Blender: (x, -z, y).
"""
import math
from pathlib import Path
import bpy
import bmesh
from mathutils import Vector
ROOT = Path(__file__).resolve().parents[2]
bpy.context.preferences.filepaths.save_version = 0
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
MATS = {}
for name, color, rough, metal in [
 ('VFDHousing', (.88,.86,.80,1), .48, 0),
 ('VFDPole', (.72,.72,.68,1), .32, .45),
 ('VFDRubber', (.025,.031,.030,1), .78, 0),
 ('VFDRecess', (.012,.019,.016,1), .34, 0),
 ('VFDFasteners', (.23,.24,.22,1), .35, .65)]:
 m=bpy.data.materials.new(name); m.diffuse_color=color; m.use_nodes=True
 p=m.node_tree.nodes.get('Principled BSDF'); p.inputs['Base Color'].default_value=color
 p.inputs['Roughness'].default_value=rough; p.inputs['Metallic'].default_value=metal
 MATS[name]=m

def mesh(name, verts, faces, mat):
 me=bpy.data.meshes.new(name); me.from_pydata([(x,-z,y) for x,y,z in verts],[],faces); me.update()
 ob=bpy.data.objects.new(name,me); bpy.context.collection.objects.link(ob); me.materials.append(MATS[mat])
 bm=bmesh.new(); bm.from_mesh(me); bmesh.ops.recalc_face_normals(bm,faces=bm.faces); bm.to_mesh(me); bm.free()
 bpy.context.view_layer.objects.active=ob; ob.select_set(True)
 bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT'); bpy.ops.uv.smart_project(angle_limit=1.15,island_margin=.025); bpy.ops.object.mode_set(mode='OBJECT'); ob.select_set(False)
 return ob

def roundrect(w,h,r,n=4):
 pts=[]
 for cx,cy,a in [(w/2-r,h/2-r,0),(-w/2+r,h/2-r,90),(-w/2+r,-h/2+r,180),(w/2-r,-h/2+r,270)]:
  for j in range(n+1):
   t=math.radians(a+j*90/n); pts.append((cx+r*math.cos(t),cy+r*math.sin(t)))
 return pts

def rings(name, sections, mat, axis='y', center=(0,0,0), cap=True):
 verts=[]
 for level,profile in sections:
  for u,v in profile:
   p=(u,level,v) if axis=='y' else (u,v,level)
   verts.append(tuple(p[i]+center[i] for i in range(3)))
 n=len(sections[0][1]); faces=[]
 for j in range(len(sections)-1):
  for i in range(n): faces.append((j*n+i,j*n+(i+1)%n,(j+1)*n+(i+1)%n,(j+1)*n+i))
 if cap: faces += [tuple(reversed(range(n))),tuple((len(sections)-1)*n+i for i in range(n))]
 return mesh(name,verts,faces,mat)

def lathe(name, profile, mat, center=(0,0,0), n=24):
 return rings(name,[(y,[(r*math.cos(i*2*math.pi/n),r*math.sin(i*2*math.pi/n)) for i in range(n)]) for y,r in profile],mat,center=center)

rings('Weighted base - eased moulded cover',[(.01,roundrect(.40,.30,.055)),(.025,roundrect(.42,.32,.065)),(.064,roundrect(.38,.28,.055)),(.074,roundrect(.33,.23,.045))],'VFDHousing')
rings('Non-slip sole',[(0,roundrect(.37,.27,.045)),(.012,roundrect(.39,.29,.05))],'VFDRubber')
lathe('Lower hollow-routed pole sleeve',[(.074,.044),(.09,.042),(.55,.042)],'VFDHousing')
lathe('Telescoping inner pole',[(.53,.028),(.925,.028),(.944,.037)],'VFDPole')
lathe('Adjustment collar with rolled grip',[(.50,.043),(.508,.051),(.535,.051),(.545,.044)],'VFDRubber')
lathe('Swivel neck',[(.923,.046),(.952,.052),(.976,.044)],'VFDHousing')
# A continuously welded shell: tapered rear, split-line step, front rim,
# then a real return into the dark lens aperture. The back is capped;
# the lens opening stays open for the separate runtime texture plane.
sections=[(-.13,roundrect(.94,.29,.045)),(-.12,roundrect(1.00,.34,.048)),(-.045,roundrect(1.08,.39,.04)),(-.039,roundrect(1.074,.384,.04)),(-.031,roundrect(1.10,.40,.04)),(.074,roundrect(1.10,.40,.04)),(.096,roundrect(1.066,.37,.032)),(.096,roundrect(.995,.303,.012)),(.079,roundrect(.995,.303,.012))]
case=rings('Tapered case and recessed lens lip',sections,'VFDHousing',axis='z',center=(0,1.14,0),cap=False)
# Close only the rear, leaving an intentional front aperture.
me=case.data; bm=bmesh.new(); bm.from_mesh(me)
boundaries=[e for e in bm.edges if e.is_boundary and all(v.co.y>.129 for v in e.verts)]
bmesh.ops.holes_fill(bm,edges=boundaries,sides=0); bmesh.ops.recalc_face_normals(bm,faces=bm.faces); bm.to_mesh(me); bm.free()
rings('Lens recess gasket',[(.078,roundrect(.993,.302,.012)),(.086,roundrect(.993,.302,.012)),(.086,roundrect(.982,.292,.009)),(.078,roundrect(.982,.292,.009)),(.078,roundrect(.993,.302,.012))],'VFDRecess',axis='z',center=(0,1.14,0),cap=False)
# Cable exits towards clerk behind the weighted foot, never into customer aisle.
curve=bpy.data.curves.new('Cable through rear strain relief','CURVE'); curve.dimensions='3D'; curve.use_fill_caps=True; curve.resolution_u=8; curve.bevel_depth=.009; curve.bevel_resolution=1; curve.resolution_u=8
s=curve.splines.new('BEZIER'); pts=[(0,.046,-.135),(0,.034,-.18),(.035,.018,-.205),(.15,.011,-.22),(.23,.011,-.20)]; s.bezier_points.add(len(pts)-1)
for p,(x,y,z) in zip(s.bezier_points,pts): p.co=(x,-z,y); p.handle_left_type=p.handle_right_type='AUTO'
ob=bpy.data.objects.new('Rear cable route',curve); bpy.context.collection.objects.link(ob); curve.materials.append(MATS['VFDRubber']); bpy.context.view_layer.objects.active=ob; ob.select_set(True); bpy.ops.object.convert(target='MESH'); ob.select_set(False)
# A low counter-entry grommet seats the cable end, rather than a loose live lead.
lathe('Counter cable entry grommet',[(0,.025),(.004,.031),(.014,.031),(.017,.023)],'VFDRubber',center=(.23,0,-.20),n=16)
# Rear screw heads and recessed service seam are genuine separate hardware.
for x in [-.39,.39]:
 rings('Rear captive screw',[( -.132,[(.012*math.cos(i*math.pi/6),.012*math.sin(i*math.pi/6)) for i in range(12)]),(-.136,[(.010*math.cos(i*math.pi/6),.010*math.sin(i*math.pi/6)) for i in range(12)])],'VFDFasteners',axis='z',center=(x,1.14,0))
# Triangulation and material UV checks apply to source and runtime alike.
for ob in list(bpy.context.scene.objects):
 if ob.type!='MESH': continue
 bm=bmesh.new(); bm.from_mesh(ob.data)
 bmesh.ops.remove_doubles(bm,verts=bm.verts,dist=.000001)
 bmesh.ops.recalc_face_normals(bm,faces=bm.faces)
 boundary=sum(e.is_boundary for e in bm.edges)
 assert boundary == (20 if ob == case else 0), (ob.name, boundary)
 assert not any(len(e.link_faces)>2 for e in bm.edges), ob.name
 bm.to_mesh(ob.data); bm.free()
 bpy.context.view_layer.objects.active=ob; ob.select_set(True)
 if not ob.data.uv_layers:
  bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT'); bpy.ops.uv.smart_project(); bpy.ops.object.mode_set(mode='OBJECT')
 ob.select_set(False)
 ob['units']='feet'; ob['provenance']='Original generic design, no external art or mesh'
 mod=ob.modifiers.new('Export triangulation','TRIANGULATE')
# Source retains named physical components, UVs, material roles and modifiers.
bpy.context.scene.unit_settings.system='NONE'
for area in bpy.context.screen.areas:
 if area.type=='VIEW_3D': area.spaces.active.region_3d.view_distance=2.6; area.spaces.active.region_3d.view_location=(0,0,.68)
source=ROOT/'tools/models/customer-pole-display.blend'; bpy.ops.wm.save_as_mainfile(filepath=str(source))
# One exported object, five material batches; source parts stay editable.
bpy.ops.object.select_all(action='SELECT'); bpy.context.view_layer.objects.active=case; bpy.ops.object.convert(target='MESH'); bpy.ops.object.join(); bpy.context.object.name='Customer VFD assembly'
out=ROOT/'public/models/customer-pole-display.glb'
bpy.ops.export_scene.gltf(filepath=str(out),export_format='GLB',export_yup=True,export_apply=True,export_materials='EXPORT',export_extras=False)
ob=bpy.context.object; ob.data.calc_loop_triangles()
print('VFD_METRICS',{'triangles':len(ob.data.loop_triangles),'materials':len(ob.data.materials),'bytes':out.stat().st_size,'bounds_blender':list(ob.dimensions),'source':source.name})
