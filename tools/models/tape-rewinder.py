"""Original generic tape rewinder based on the existing procedural envelope.
Run: blender -b -t 2 --python tools/models/tape-rewinder.py
Feet; local +Z front, Y up. Not a manufacturer replica. No external assets.
"""
import math
from pathlib import Path
import bpy
import bmesh
ROOT=Path(__file__).resolve().parents[2]
bpy.context.preferences.filepaths.save_version=0
bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
MATS={}
for name,color,rough in [('RewinderBody',(.006,.006,.006,1),.34),('RewinderTrim',(.004,.04,.35,1),.45),('RewinderRubber',(.012,.012,.012,1),.8)]:
 m=bpy.data.materials.new(name);m.diffuse_color=color;m.use_nodes=True
 p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=color;p.inputs['Roughness'].default_value=rough
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

# Feet terminate at the original countertop plane, within the old footprint.
for x in [-.34,.34]:
 for z in [-.15,.15]: lathe('Non-slip foot',[(0,.03),(.008,.034),(.02,.03)],'RewinderRubber',center=(x,0,z),n=16)
rings('Eased colored base moulding',[(.012,roundrect(.82,.40,.045)),(.02,roundrect(.88,.46,.045)),(.028,roundrect(.88,.46,.045)),(.038,roundrect(.858,.438,.04))],'RewinderTrim')
rings('Tapered ABS lower shell',[(.038,roundrect(.858,.438,.04)),(.055,roundrect(.872,.452,.045)),(.172,roundrect(.86,.44,.05)),(.193,roundrect(.825,.413,.048)),(.198,roundrect(.80,.395,.043))],'RewinderBody')
# The lid is one welded annular solid with inner aperture walls, not bars.
# Keep the original 0.34 by 0.30 window and y=.248 logo plane.
outer=roundrect(.64,.414,.025)
inner=[(u-.1,v) for u,v in roundrect(.344,.304,.004)]
sections=[(.204,outer),(.235,outer),(.248,roundrect(.62,.394,.023)),(.248,inner),(.202,inner),(.202,outer),(.204,outer)]
lid=rings('Opening lid with recessed window return',sections,'RewinderBody',center=(-.02,0,0),cap=False)
# Fine seam below the lid follows its complete outline.
rings('Lid seam gasket',[(.199,roundrect(.642,.416,.025)),(.203,roundrect(.642,.416,.025))],'RewinderRubber',center=(-.02,0,0))
# Gasket must leave window clear: its top remains BELOW the existing well/reel.
for x in [-.22,.18]:
 rings('Rear hinge barrel',[(.178,roundrect(.095,.033,.014)),(.225,roundrect(.095,.033,.014))],'RewinderBody',center=(x,0,-.208))
rings('Front latch catch',[(.178,roundrect(.115,.022,.006)),(.2,roundrect(.115,.027,.006)),(.219,roundrect(.10,.023,.006))],'RewinderBody',center=(-.02,0,.212))
# The operating slider remains on the right shoulder; shallow fitted top cap.
rings('Eject slider track',[(.193,roundrect(.055,.28,.012)),(.198,roundrect(.055,.28,.012))],'RewinderRubber',center=(.365,0,0))
rings('Eject thumb slider',[(.198,roundrect(.047,.095,.01)),(.22,roundrect(.043,.09,.009))],'RewinderBody',center=(.365,0,.07))
for x in [-.391,-.37,-.349]:
 rings('Shoulder cooling flute',[(.189,roundrect(.011,.285,.004)),(.201,roundrect(.011,.285,.004))],'RewinderRubber',center=(x,0,0))
for ob in list(bpy.context.scene.objects):
 if ob.type!='MESH':continue
 bm=bmesh.new();bm.from_mesh(ob.data);bmesh.ops.remove_doubles(bm,verts=bm.verts,dist=.000001);bmesh.ops.recalc_face_normals(bm,faces=bm.faces)
 assert all(e.is_manifold for e in bm.edges),ob.name
 bm.to_mesh(ob.data);bm.free()
 ob['units']='feet';ob['provenance']='Original generic Halcyon construction; no external imagery or mesh'
 ob.modifiers.new('Export triangulation','TRIANGULATE')
for area in bpy.context.screen.areas:
 if area.type=='VIEW_3D':area.spaces.active.region_3d.view_distance=1.7;area.spaces.active.region_3d.view_location=(0,0,.12)
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'tools/models/tape-rewinder.blend'))
bpy.ops.object.select_all(action='SELECT');bpy.context.view_layer.objects.active=lid;bpy.ops.object.convert(target='MESH');bpy.ops.object.join();bpy.context.object.name='Tape rewinder shell assembly'
out=ROOT/'public/models/tape-rewinder.glb'
bpy.ops.export_scene.gltf(filepath=str(out),export_format='GLB',export_yup=True,export_apply=True,export_materials='EXPORT')
bpy.context.object.data.calc_loop_triangles()
print('REWINDER_METRICS',len(bpy.context.object.data.loop_triangles),len(bpy.context.object.data.materials),out.stat().st_size,list(bpy.context.object.dimensions))
