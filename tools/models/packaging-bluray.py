"""Original Blu-ray keepcase: short blue-tinted shell, header band, rounded
shoulders, hinge and a clear-wrap lip around the art seat. Scripted mesh
authoring (bmesh/pydata), Blender 5.1, feet, store axes (front +Z, spine -X).
Reuses tools/models/packaging.py helpers, art roles and glTF exporter.
Run: blender -b -t 2 --python tools/models/packaging-bluray.py
No artwork or textures. See docs/packaging-bluray-model.md for the contract.
"""
import bpy, math, json, importlib.util
from pathlib import Path
from mathutils import Euler
ROOT=Path(__file__).resolve().parents[2]
spec=importlib.util.spec_from_file_location('packaging_builder',ROOT/'tools/models/packaging.py')
f=importlib.util.module_from_spec(spec);spec.loader.exec_module(f)

# New lane 9: blue-tinted molded plastic. Appended after the nine shared lanes.
blue=bpy.data.materials.new('BlueShell');blue.use_nodes=True
blue.diffuse_color=(.04,.17,.42,1)
p=blue.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(.04,.17,.42,1);p.inputs['Roughness'].default_value=.24
f.roles.append(('BlueShell',(.04,.17,.42,1)));f.mats.append(blue)
BLUE=9

W,H,D=.445,.6227,.036   # 5.34 x 7.47 x 0.43 in nominal model units (DVD footprint width, shorter)
BORDER=.003             # molded rim / paper seat inset
BAND=.040               # header band height (top of the front cover)
R=.007                  # rounded shoulders

def box(name,x,y,z,w,h,d,role,uv=None):
 v=[(x+sx*w/2,y+sy*h/2,z+sz*d/2) for sx,sy,sz in [(-1,-1,-1),(1,-1,-1),(1,1,-1),(-1,1,-1),(-1,-1,1),(1,-1,1),(1,1,1),(-1,1,1)]]
 return f.mesh(name,v,[(3,2,1,0),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)],role)

def paper(detail):
 # Three open paper surfaces. The FRONT stops under the header band so the
 # cover art keeps its true aspect: the art face is (W-2b-b_open) x (H-2b-BAND).
 left=-W/2+BORDER*1.0;right=W/2-BORDER;front=D/2-.0016;back=-front
 bot=-H/2+BORDER;top=H/2-BORDER;arttop=top-BAND
 fr=f.mesh('Front-art-seat',[(right,bot,front),(left,bot,front),(left,arttop,front),(right,arttop,front)],[(0,1,2,3)],4)
 f.parts.remove(fr);f.parts.append(fr)
 # Shelf art is authored to the DVD face (0.445:0.667). The shorter art seat is
 # wider than that, so the UV window crops the art's top/bottom equally (cover
 # fit, no stretch): visible fraction k of the image height, centered.
 k=min(1,(.445/.667)/((right-left)/(arttop-bot)));lo=(1-k)/2
 for poly in fr.data.polygons:
  for li in poly.loop_indices:
   x,nz,y=fr.data.vertices[fr.data.loops[li].vertex_index].co
   fr.data.uv_layers.active.data[li].uv=((x-left)/(right-left),lo+k*(y-bot)/(arttop-bot))
 sp=f.mesh('Spine-insert',[(left,bot,back),(left,bot,front),(left,top,front),(left,top,back)],[(0,1,2,3)],1)
 for poly in sp.data.polygons:
  for li in poly.loop_indices:
   x,nz,y=sp.data.vertices[sp.data.loops[li].vertex_index].co;z=-nz
   sp.data.uv_layers.active.data[li].uv=((z-back)/(front-back),(y-bot)/(top-bot))
 bk=f.mesh('Back-insert',[(left,bot,back),(right,bot,back),(right,top,back),(left,top,back)],[(3,2,1,0)],5)
 for poly in bk.data.polygons:
  for li in poly.loop_indices:
   x,nz,y=bk.data.vertices[bk.data.loops[li].vertex_index].co
   bk.data.uv_layers.active.data[li].uv=((right-x)/(right-left),(y-bot)/(top-bot))
 # open surfaces: pin outward direction (+Z front, -X spine, -Z back)
 import bmesh
 for ob,want in ((fr,(0,-1,0)),(sp,(-1,0,0)),(bk,(0,1,0))):
  # Blender axes: store +Z -> Blender -Y
  if ob.data.polygons[0].normal.dot(want)<0:
   bm=bmesh.new();bm.from_mesh(ob.data);bmesh.ops.reverse_faces(bm,faces=list(bm.faces));bm.to_mesh(ob.data);bm.free()
 return arttop

def build(detail):
 n=5 if detail else 1
 arttop=paper(detail)
 # Two independent molded halves with eased face lip and a closure seam.
 for s in [1,-1]:
  z=s*D/2;seam=.0008
  levels=[(W-2*BORDER,H-2*BORDER,R*.5,z-s*.0016),(W-.003,H-.003,R,z),(W,H,R,z-s*.0018),
          (W,H,R,s*seam),(W-.003,H-.003,R,s*seam),(W-2*BORDER,H-2*BORDER,R*.5,z-s*.0028)]
  f.profile(('Lid' if s==1 else 'Base')+'-molded-shell',levels,BLUE,n)
 f.profile('Hinge-bridge',[(BORDER*1.1,H-2*R,BORDER*.4,-D*.44),(BORDER*1.1,H-2*R,BORDER*.4,D*.44)],BLUE,n,caps=True,offset=(-W/2+BORDER*.65,0,0))
 # Opaque dark tray visible only in the seam between the halves.
 f.profile('Tray-carrier',[(W-.005,H-.004,R,-D*.15),(W-.005,H-.004,R,D*.15)],7,n,caps=True)
 # Header band: raised blue strip above the art seat, full cover width.
 bandh=H/2-BORDER-arttop
 box('Header-band',BORDER*0+(-W/2+BORDER+W/2-BORDER)/2,arttop+bandh/2,D/2-.0016+.0005,W-2*BORDER,bandh,.0010,BLUE)
 # Clear-wrap lip: four thin bars framing the art seat (clear outer sleeve edge).
 lw=.0022;aw=W-2*BORDER;ah=arttop-(-H/2+BORDER);cy=(arttop+(-H/2+BORDER))/2;zz=D/2-.0016+.0004
 box('Clear-wrap-lip-bottom',0,-H/2+BORDER+lw/2,zz,aw,lw,.0008,6)
 box('Clear-wrap-lip-top',0,arttop-lw/2,zz,aw,lw,.0008,6)
 box('Clear-wrap-lip-left',-aw/2+lw/2,cy,zz,lw,ah-2*lw,.0008,6)
 box('Clear-wrap-lip-right',aw/2-lw/2,cy,zz,lw,ah-2*lw,.0008,6)
 if detail:
  # thumb recess latch at the opening and its two tabs
  f.profile('Recessed-closure',[(.007,H*.14,.003,-D*.14),(.007,H*.14,.003,D*.14)],BLUE,n,True,(W/2-.004,0,0))
  for y in [-H*.29,H*.29]:
   f.profile('Closure-tab',[(.006,.024,.002,-.002),(.006,.024,.002,.002)],BLUE,3,True,(W/2-.004,y,0))
  # tray grip teeth along the hinge side
  for i in range(14):
   y=-H*.34+i*(H*.68/13)
   f.profile('Hinge-tooth',[(.007,.003,.0004,-D*.17),(.007,.003,.0004,D*.14)],7,1,True,(-W/2+.012,y,0))
 else:
  f.profile('Recessed-closure',[(.007,H*.14,.003,-D*.14),(.007,H*.14,.003,D*.14)],BLUE,1,True,(W/2-.004,0,0))
 # Keep nominal X bounds exact: shell never wider than the paper fold plane.
 for ob in f.parts:
  if ob['role'] in ('PaperSpine','Opening','PaperFront','PaperBack'): continue
  for v in ob.data.vertices: v.co.x=max(v.co.x,-W/2+.00015)
  ob.data.update()

f.W,f.H,f.D=W,H,D
for detail in [False,True]:
 name='packaging-bluray-keepcase'+('-hero' if detail else '-stock')
 f.collection=bpy.data.collections.new(name);bpy.context.scene.collection.children.link(f.collection);f.parts=[]
 build(detail)
 f.export_current(name);f.collection.hide_viewport=True
for c in bpy.data.collections:
 if c.name.startswith('packaging-'):c.hide_render=c.hide_viewport=c.name!='packaging-bluray-keepcase-hero'
for screen in bpy.data.screens:
 for area in screen.areas:
  if area.type=='VIEW_3D':
   area.spaces.active.region_3d.view_location=(0,0,0);area.spaces.active.region_3d.view_distance=1.1
   area.spaces.active.region_3d.view_rotation=Euler((1.25,0,-.5)).to_quaternion();area.spaces.active.shading.color_type='MATERIAL'
bpy.context.scene.unit_settings.system='IMPERIAL';bpy.context.scene.unit_settings.scale_length=.3048
bpy.context.preferences.filepaths.save_version=0
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'tools/models/packaging-bluray.blend'))
(ROOT/'tools/models/packaging-bluray-metrics.json').write_text(json.dumps(f.records,indent=2)+'\n')
print(json.dumps(f.records,indent=2))
