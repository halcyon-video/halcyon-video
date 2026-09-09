"""Original closed packaging, scripted mesh authoring; Blender 5.1, feet.
Run blender -b -t 2 --python tools/models/packaging.py
No artwork/textures. See docs/packaging-models.md for nominal references.
Each solid is an authored welded profile; paper display surfaces are open.
"""
import bpy, bmesh, math, json
from pathlib import Path
from mathutils import Euler
ROOT=Path(__file__).resolve().parents[2]
bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
for m in list(bpy.data.materials): bpy.data.materials.remove(m)
roles=[('Opening',(.025,.025,.028,1)),('PaperSpine',(.68,.67,.62,1)),('Top',(.02,.02,.02,1)),('Shell',(.024,.026,.03,1)),('PaperFront',(.7,.69,.65,1)),('PaperBack',(.7,.69,.65,1)),('ClearRim',(.48,.54,.59,1)),('Tray',(.014,.017,.019,1)),('PaperEdge',(.72,.7,.64,1))]
mats=[]
for n,c in roles:
 m=bpy.data.materials.new(n);m.diffuse_color=c;m.use_nodes=True
 p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=c;p.inputs['Roughness'].default_value=.19 if n=='ClearRim' else .48
 mats.append(m)
white_mat=mats[3].copy();white_mat.name='WhiteShell';white_mat.diffuse_color=(.87,.86,.82,1);white_mat.node_tree.nodes.get('Principled BSDF').inputs['Base Color'].default_value=(.87,.86,.82,1)
collection=None;parts=[];records={}
def mesh(name,v,f,role,uvrole=None):
 # author in store XYZ, convert to Blender X,-Z,Y (glTF reverses conversion)
 me=bpy.data.meshes.new(name);me.from_pydata([(x,-z,y) for x,y,z in v],[],f);me.update()
 ob=bpy.data.objects.new(name,me);collection.objects.link(ob);parts.append(ob)
 ob.data.materials.append(mats[role]);ob['role']=roles[role][0]
 bm=bmesh.new();bm.from_mesh(me)
 if not any(e.is_boundary for e in bm.edges): bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces))
 bm.to_mesh(me);bm.free()
 uv=me.uv_layers.new(name='CaseUV')
 for poly in me.polygons:
  for li in poly.loop_indices:
   x,nz,y=me.vertices[me.loops[li].vertex_index].co;z=-nz
   r=role if uvrole is None else uvrole
   if r==4: u,vv=x/W+.5,y/H+.5
   elif r==5: u,vv=.5-x/W,y/H+.5
   elif r==1: u,vv=z/D+.5,y/H+.5
   elif r==0: u,vv=.5-z/D,y/H+.5
   else:u,vv=x/W+.5,z/D+.5
   uv.data[li].uv=(u,vv)
 return ob

def outline(w,h,r,n):
 pts=[]
 for cx,cy,start in [(w/2-r,h/2-r,0),(-w/2+r,h/2-r,90),(-w/2+r,-h/2+r,180),(w/2-r,-h/2+r,270)]:
  for k in range(n+1):
   a=math.radians(start+k*90/n);pts.append((cx+r*math.cos(a),cy+r*math.sin(a)))
 return pts

def profile(name,levels,role,n=3,caps=False,offset=(0,0,0)):
 # closed section swept round rounded rectangle. last-to-first closes ring.
 verts=[]
 for w,h,r,z in levels:
  verts += [(x+offset[0],y+offset[1],z+offset[2]) for x,y in outline(w,h,max(r,.00003),n)]
 count=len(verts)//len(levels); faces=[]
 for j in range(len(levels)-1 if caps else len(levels)):
  q=(j+1)%len(levels)
  for i in range(count): faces.append((j*count+i,j*count+(i+1)%count,q*count+(i+1)%count,q*count+i))
 if caps:faces += [tuple(range(count-1,-1,-1)),tuple((len(levels)-1)*count+i for i in range(count))]
 return mesh(name,verts,faces,role)

def panel(name,w,h,z,role,inset=0):
 # art UV fills inset seat, preserving face handedness.
 v=[(-w/2,-h/2,z),(w/2,-h/2,z),(w/2,h/2,z),(-w/2,h/2,z)]
 ob=mesh(name,v,[(0,1,2,3)] if z>0 else [(3,2,1,0)],role)
 # open surfaces cannot be reoriented by volume. Pin outward direction.
 if z<0:
  for p in ob.data.polygons:
   if p.normal.y<0:
    bm=bmesh.new();bm.from_mesh(ob.data);bmesh.ops.reverse_faces(bm,faces=list(bm.faces));bm.to_mesh(ob.data);bm.free()
 for p in ob.data.polygons:
  for li in p.loop_indices:
   x,nz,y=ob.data.vertices[ob.data.loops[li].vertex_index].co
   ob.data.uv_layers.active.data[li].uv=((x/w+.5) if role==4 else (.5-x/w),y/h+.5)
 return ob

def side_art(name,x,z0,z1,h,role):
 v=[(x,-h/2,z0),(x,-h/2,z1),(x,h/2,z1),(x,h/2,z0)]
 ob=mesh(name,v,[(0,1,2,3)] if x<0 else [(3,2,1,0)],role)
 for poly in ob.data.polygons:
  for li in poly.loop_indices:
   xx,nz,y=ob.data.vertices[ob.data.loops[li].vertex_index].co;z=-nz
   u=(z-z0)/(z1-z0)
   ob.data.uv_layers.active.data[li].uv=(u if x<0 else 1-u,y/h+.5)
 return ob

def shell(family,detail):
 n=5 if detail else 1
 white=family=='vhs-white'; jewel=family.startswith('jewel');fat=family=='jewel-fat'
 r=.010 if white else (.0009 if jewel else .004)
 border=.009 if white else (.004 if jewel else .003)
 rim=6 if jewel else 3
 seam=.0006 if jewel else .001
 # Each half is an independent closed molded rim, with eased face lip and
 # paper seat. Paired flanges leave a genuine closure seam at the opening.
 for s in [1,-1]:
  z=s*D/2
  levels=[(W-2*border,H-2*border,r*.5,z-s*.0018),
          (W-.003,H-.003,r,z), (W,H,r,z-s*.002),
          (W,H,r,s*D*.32 if jewel else s*seam), (W-.003,H-.003,r,s*D*.32 if jewel else s*seam),
          (W-2*border,H-2*border,r*.5,z-s*.003)]
  profile(('Lid' if s==1 else 'Base')+'-molded-rim',levels,rim,n)
  panel('Booklet' if s==1 else 'Back-inlay',W-2*border,H-2*border,z-s*.0016,4 if s==1 else 5)
 # Spine and opposing opening artwork remain independently oriented.
 side_art('Spine-inlay',-W/2,-D/2+.003,D/2-.003,H-2*r,1)
 if jewel:side_art('Opening-inlay',W/2,-D/2+.003,D/2-.003,H-2*r,0)
 # Spine bridge is recessed behind the two folds. On white VHS this is a
 # wide living hinge, while the optical mold gets narrower hinge returns.
 profile('Hinge-bridge',[(border*1.1,H-2*r,r*.3,-D*.44),(border*1.1,H-2*r,r*.3,D*.44)],3 if not jewel else 7,n,caps=True,offset=(-W/2+border*.65,0,0))
 if jewel:
  # Opaque tray and booklet-edge layers show in the top/bottom gap. No
  # hidden discs/hubs: these closed objects do not expose their interiors.
  for z,thick,role in ([(-D*.12,D*.40,7),(D*.23,.0012,8),(-D*.30,.0012,8)] if not fat else [(0,D*.34,7),(D*.32,.0012,8),(-D*.32,.0012,8)]):
   profile('Tray-carrier' if role==7 else 'Paper-seat-edge',[(W-.005,H-.004,r,z-thick/2),(W-.005,H-.004,r,z+thick/2)],role,n,caps=True)
  if detail:
   # Hinge arms have a rounded closed profile; spaced lugs and tray ribs
   # meet their carrier at the ends, never overlap the artwork planes.
   for y in [-H*.43,H*.43]:
    for s in [1,-1] if fat else [1]:
     profile('Hinge-lug',[(.014,.022,.003,s*D*.12),(.014,.022,.003,s*D*.39)],6,4,True,(-W/2+.007,y,0))
   for i in range(22):
    y=-H*.37+i*(H*.74/21)
    profile('Tray-grip-tooth',[(.008,.003,.0004,-D*.17),(.008,.003,.0004,D*.14)],7,1,True,(-W/2+.012,y,0))
 else:
  # Opening thumb recess is cut into an inset latch, between the halves.
  profile('Recessed-closure',[(.007,H*.14,.003,-D*.14),(.007,H*.14,.003,D*.14)],3,n,True,(W/2-.004,0,0))
  if detail:
   for y in [-H*.29,H*.29]:
    profile('Closure-tab',[(.006,.024,.002,-.002),(.006,.024,.002,.002)],3,3,True,(W/2-.004,y,0))

 # The insert overlays the spine bridge. Recess the closed physical side
 # walls below that paper seat, rather than burying the print under plastic.
 # Paper defines the exact nominal X bounds; no added width or Z fighting.
 for ob in parts:
  if ob['role'] in ['PaperSpine','Opening']: continue
  for v in ob.data.vertices:
   v.co.x=max(v.co.x,-W/2+.00015)
   if jewel:v.co.x=min(v.co.x,W/2-.00015)
  ob.data.update()

def sleeve(detail):
 # One continuous thin-walled rectangular tube, open at both ends.
 # Cross-section follows outer shell then inner return. Paper thickness .018in.
 t=.0015;n=2 if detail else 1
 # Sweep along Y by expressing each cross section directly.
 outer=[(-W/2,-D/2),(W/2,-D/2),(W/2,D/2),(-W/2,D/2),(-W/2,-D*.14),(-W/2,-D*.20)]
 inner=[(-W/2+2*t,-D/2+t),(W/2-t,-D/2+t),(W/2-t,D/2-t),(-W/2+t,D/2-t),(-W/2+t,-D*.14),(-W/2+2*t,-D*.20)]
 count=len(outer);v=[(x,y,z) for y in [-H/2,H/2] for loop in [outer,inner] for x,z in loop]
 f=[];roles_side=[5,0,4,1,1,1]
 for i in range(count):
  j=(i+1)%count;f.append((i,j,2*count+j,2*count+i))
 f += [(count+i,3*count+i,3*count+(i+1)%count,count+(i+1)%count) for i in range(count)]
 f += [(i,count+i,count+(i+1)%count,(i+1)%count) for i in range(count)]
 f += [(2*count+i,2*count+(i+1)%count,3*count+(i+1)%count,3*count+i) for i in range(count)]
 ob=mesh('Folded-paperboard-sleeve-with-glue-lap',v,f,8)
 for m in mats:ob.data.materials.append(m)
 for p in ob.data.polygons:
  role=roles_side[p.index] if p.index<count else 8;p.material_index=role+1
  for li in p.loop_indices:
   x,nz,y=ob.data.vertices[ob.data.loops[li].vertex_index].co;z=-nz
   u=x/W+.5 if role==4 else .5-x/W if role==5 else z/D+.5 if role==1 else .5-z/D
   ob.data.uv_layers.active.data[li].uv=(u,y/H+.5)
 # A recessed cassette end silhouette, with a stepped ridge, stays inside
 # the open mouth and does not turn the sleeve into a solid block.
 profile('Recessed-tape',[(W-.008,H-.014,.003,-D/2+.004),(W-.008,H-.014,.003,D/2-.004)],7,1,True)

families={'jewel-single':(.4666667,.4083333,.0333333),'jewel-fat':(.4666667,.4083333,.06),'vhs-white':(5.5/12,8.75/12,1.25/12),'vhs-rental':(.403,.727,.104),'dvd-keepcase':(.445,.667,.045),'vhs-slipcase':(.365,.667,.092)}
for family,(W,H,D) in families.items():
 for detail in [False,True]:
  name='packaging-'+family+('-hero' if detail else '-stock');collection=bpy.data.collections.new(name);bpy.context.scene.collection.children.link(collection);parts=[]
  if family=='vhs-slipcase':sleeve(detail)
  else:shell(family,detail)
  if family=='vhs-white':
   for ob in parts:
    for i,mat in enumerate(ob.data.materials):
     if mat==mats[3]:ob.data.materials[i]=white_mat
  # Verify source mesh topology, UVs and orientation before exporting.
  tris=0;solids=0
  for ob in parts:
   bm=bmesh.new();bm.from_mesh(ob.data)
   if not any(e.is_boundary for e in bm.edges):
    assert all(e.is_manifold for e in bm.edges),ob.name
    assert bm.calc_volume(signed=True)>0,ob.name
    solids+=1
   assert all(f.calc_area()>1e-12 for f in bm.faces),ob.name
   bm.free();ob.data.calc_loop_triangles();tris+=len(ob.data.loop_triangles)
  bpy.ops.object.select_all(action='DESELECT')
  for ob in parts:ob.select_set(True)
  bpy.context.view_layer.objects.active=parts[0]
  path=ROOT/'public/models'/f'{name}.glb'
  bpy.ops.export_scene.gltf(filepath=str(path),export_format='GLB',use_selection=True,export_yup=True,export_extras=True,export_texcoords=True,export_normals=True,export_materials='EXPORT',export_cameras=False,export_lights=False)
  records[name]={'bytes':path.stat().st_size,'triangles':tris,'parts':len(parts),'closedSolids':solids,'dimensionsFeet':[W,H,D],'textures':0}
  collection.hide_viewport=True
for c in bpy.data.collections:
 if c.name.startswith('packaging-'):
  c.hide_render = c.hide_viewport = c.name != 'packaging-jewel-single-hero'
for ob in bpy.context.selected_objects:ob.select_set(False)
primary=bpy.data.collections['packaging-jewel-single-hero']
for ob in primary.objects:ob.select_set(True)
bpy.context.view_layer.objects.active=primary.objects[0]
for screen in bpy.data.screens:
 for area in screen.areas:
  if area.type=='VIEW_3D':
   area.spaces.active.region_3d.view_location=(0,0,0)
   area.spaces.active.region_3d.view_distance=1.05
   area.spaces.active.region_3d.view_rotation=Euler((1.3,0,-.5)).to_quaternion()
   area.spaces.active.shading.color_type='MATERIAL'
bpy.context.scene.unit_settings.system='IMPERIAL'
bpy.context.scene.unit_settings.scale_length=.3048
bpy.context.preferences.filepaths.save_version=0
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'tools/models/packaging.blend'))
(ROOT/'tools/models/packaging-costs.json').write_text(json.dumps(records,indent=2)+'\n')
print(json.dumps(records,indent=2))
