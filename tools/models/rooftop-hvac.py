"""Original generic 1980s rooftop package; feet, X width / -Y depth / Z up.
Reference and intentional departures: docs/rooftop-hvac-model.md.
Run: blender -b -P tools/models/rooftop-hvac.py
"""
import json, math
from pathlib import Path
import bpy, bmesh
ROOT = Path(__file__).resolve().parents[2]
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
bpy.context.scene.unit_settings.system = 'IMPERIAL'
bpy.context.scene.unit_settings.scale_length = .3048
MATERIALS = []
for name, color, rough, metal in [
 ('HVACCabinet', (.49,.47,.39,1), .72,.25),
 ('HVACCoil', (.055,.064,.067,1), .86,.35),
 ('HVACHardware', (.22,.25,.27,1), .48,.75),
 ('HVACCurb', (.16,.18,.19,1), .83,.35),
]:
 m=bpy.data.materials.new(name); m.diffuse_color=color; m.use_nodes=True
 bs=m.node_tree.nodes.get('Principled BSDF')
 bs.inputs['Base Color'].default_value=color
 bs.inputs['Roughness'].default_value=rough
 bs.inputs['Metallic'].default_value=metal
 MATERIALS.append(m)
def mesh(name, verts, faces, role):
    data = bpy.data.meshes.new(name)
    # Store X, height, depth -> Blender X, -depth, height -> glTF Y up.
    data.from_pydata([(x, -z, y) for x, y, z in verts], [], faces)
    data.materials.append(MATERIALS[role])
    data.update()
    bm = bmesh.new()
    bm.from_mesh(data)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(data)
    bm.free()
    obj = bpy.data.objects.new(name, data)
    bpy.context.collection.objects.link(obj)
    # Physical, four-foot texture tiles; no wall or shadow baked into UVs.
    uv = data.uv_layers.new(name='SurfaceFeet')
    for poly in data.polygons:
        axis = max(range(3), key=lambda k: abs(poly.normal[k]))
        axes = [k for k in range(3) if k != axis]
        for li in poly.loop_indices:
            v = data.vertices[data.loops[li].vertex_index].co
            uv.data[li].uv = (v[axes[0]] / 4, v[axes[1]] / 4)
    return obj


def extrude_profile(name, profile, x0, x1, role):
    n = len(profile)
    verts = [(x, y, z) for x in [x0, x1] for z, y in profile]
    faces = [tuple(reversed(range(n))), tuple(range(n, 2*n))]
    faces += [(j, (j+1) % n, (j+1) % n+n, j+n) for j in range(n)]
    return mesh(name, verts, faces, role)


def tube(name, a, b, radius, role=2):
    from mathutils import Vector
    a, b = Vector(a), Vector(b)
    direction = (b-a).normalized()
    up = Vector((0, 1, 0)) if abs(direction.y) < .9 else Vector((0, 0, 1))
    u = direction.cross(up).normalized()
    v = direction.cross(u).normalized()
    verts = [tuple(p + radius*(u*math.cos(k*math.tau/8) + v*math.sin(k*math.tau/8)))
             for p in [a, b] for k in range(8)]
    faces = [tuple(reversed(range(8))), tuple(range(8, 16))]
    faces += [(k, (k+1) % 8, (k+1) % 8+8, k+8) for k in range(8)]
    return mesh(name, verts, faces, role)


def box(name, center, size, role, bevel=0):
 x,y,z=center; w,h,d=[v/2 for v in size]
 o=extrude_profile(name,[(z-d,y-h),(z+d,y-h),(z+d,y+h),(z-d,y+h)],x-w,x+w,role)
 if bevel:
  bpy.context.view_layer.objects.active=o
  mod=o.modifiers.new('Folded edge easing','BEVEL'); mod.width=bevel; mod.segments=1
  bpy.ops.object.modifier_apply(modifier=mod.name)
 return o

# Four flashed curb walls: open underneath with actual downshot collars.
for z in [-1.48,1.48]:
 box('Curb long wall',(0,.6,z),(6.05,1.2,.09),3)
 box('Flashing long apron',(0,.035,z),(6.25,.07,.40),3)
for x in [-2.98,2.98]:
 box('Curb end wall',(x,.6,0),(.09,1.2,2.87),3)
 box('Flashing end apron',(x,.035,0),(.38,.07,2.87),3)
for x,w,name in [(.1,1.7,'Return'),(2,1.25,'Supply')]:
 for z in [-1.1,1.1]: box(name+' duct collar',(x,.76,z),(w,.88,.04),2)
 for s in [-1,1]: box(name+' duct end',(x+s*w/2,.76,0),(.04,.88,2.2),2)
for z in [-1.70,1.70]: box('Base channel',(0,1.25,z),(6.42,.22,.18),2,.018)
# Bottom sheet terminates at the two downshot openings, not across them.
for z in [-1.455,1.455]: box('Base pan edge',(0,1.37,z),(6.42,.06,.67),3)
for x,w in [(-1.98,2.46),(1.1625,.425),(2.9175,.585)]:
 box('Base pan cross member',(x,1.37,0),(w,.06,2.24),3)
# Coil bay at left; two full-height service panels along each long side.
for z in [-1.76,1.76]:
 for x,w in [(.1,1.78),(2.03,2.02)]:
  box('Folded service panel',(x,2.55,z),(w,2.28,.06),0,.016)
  box('Recessed panel pull',(x+.5,2.7,z+( .045 if z>0 else -.045)),(.08,.32,.06),2,.014)
 for i in range(24):
  box('Condenser fin %02d'%i,(-2.99+i*.088,2.5,z*.975),(.023,1.94,.035),1)
 for y in [1.54,3.46]: box('Coil frame',(-1.98,y,z),(2.22,.10,.07),0,.012)
 for i in range(7): box('Coil guard',(-1.98,1.68+i*.275,z),(2.18,.027,.035),2)
box('Coil end backing',(-3.14,2.5,0),(.025,1.94,3.36),1)
for i in range(12): box('End grille blade',(-3.20,1.53+i*.175,0),(.065,.035,3.36),2)
box('Service end',(3.18,2.55,0),(.06,2.28,3.52),0,.016)
for x in [-3.17,-.86,3.17]:
 for z in [-1.76,1.76]: box('Corner folded post',(x,2.55,z),(.09,2.28,.10),0,.015)
box('Service lid',(1.17,3.73,0),(4.08,.10,3.64),0,.025)
# Square-to-circle pressed fan deck, with a genuinely open recessed throat.
n=48; cx=-2.04; radius=1.04
verts=[]
for y,inner in [(3.78,False),(3.78,True),(3.42,True),(3.70,False)]:
 for k in range(n):
  a=k*math.tau/n; c,s=math.cos(a),math.sin(a)
  if inner: x,z=c*radius,s*radius
  else:
   t=min(1.19/max(abs(c),1e-9),1.82/max(abs(s),1e-9)); x,z=c*t,s*t
  verts.append((cx+x,y,z))
faces=[]
for ring in range(4):
 for k in range(n): faces.append((ring*n+k,ring*n+(k+1)%n,((ring+1)%4)*n+(k+1)%n,((ring+1)%4)*n+k))
mesh('Pressed fan deck and recessed throat',verts,faces,0)
tube('Fan motor',(cx,3.03,0),(cx,3.50,0),.18,2)
for k in range(4):
 a=k*math.tau/4
 # Pitched paddle, a closed tapered prism.
 points=[(.15,-.10,3.43),(.83,-.19,3.31),(.94,.15,3.40),(.24,.12,3.49)]
 vs=[(cx+r*math.cos(a)-t*math.sin(a),h+dy,r*math.sin(a)+t*math.cos(a)) for dy in [0,.035] for r,t,h in points]
 mesh('Pitched fan blade',vs,[(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)],2)
for r in [.22,.43,.64,.85,1.03]:
 # Continuous welded wire rings, not overlapping capped tube segments.
 vs=[(cx+(r+.012*math.cos(j*math.tau/6))*math.cos(k*math.tau/32),
      3.81+.012*math.sin(j*math.tau/6),
      (r+.012*math.cos(j*math.tau/6))*math.sin(k*math.tau/32))
     for k in range(32) for j in range(6)]
 fs=[(k*6+j,((k+1)%32)*6+j,((k+1)%32)*6+(j+1)%6,k*6+(j+1)%6)
     for k in range(32) for j in range(6)]
 o=mesh('Concentric welded fan guard',vs,fs,2)
 for poly in o.data.polygons: poly.use_smooth=True
for k in range(8):
 a=k*math.tau/8
 tube('Guard spoke',(cx,3.81,0),(cx+1.06*math.cos(a),3.81,1.06*math.sin(a)),.014,2)
# Rear-side electrical enclosure, condensate trap and capped service coupling.
box('Electrical disconnect',(1.85,2.35,-1.88),(.60,.76,.22),2,.025)
tube('Electrical conduit',(1.85,1.2,-1.91),(1.85,1.97,-1.91),.038,2)
for a,b in [((2.7,1.65,-1.77),(2.7,1.65,-2.02)),((2.7,1.65,-2.02),(2.7,.85,-2.02)),((2.7,.85,-2.02),(2.35,.85,-2.02)),((2.35,.85,-2.02),(2.35,1.05,-2.02))]: tube('Condensate trap',a,b,.045,2)
box('Blank service data plate',(3.223,2.8,.75),(.012,.23,.42),2)
for name,p in [('Supply downshot',(2,.3,0)),('Return downshot',(.1,.3,0)),('Power inlet',(1.85,1.2,-1.91)),('Drain outlet',(2.35,1.05,-2.02))]:
 o=bpy.data.objects.new(name,None);bpy.context.collection.objects.link(o);o.location=(p[0],-p[2],p[1]);o.empty_display_size=.18
# Group by material for four draw calls; editable names retained as vertex groups.
metrics={'units':'feet','textures':0,'meshes':[]}
for mat in MATERIALS:
 objects=[o for o in bpy.context.scene.objects if o.type=='MESH' and o.data.materials[0]==mat]
 bpy.ops.object.select_all(action='DESELECT')
 for o in objects:
  vg=o.vertex_groups.new(name=o.name);vg.add(list(range(len(o.data.vertices))),1,'REPLACE');o.select_set(True)
 bpy.context.view_layer.objects.active=objects[0];bpy.ops.object.join();o=objects[0];o.name=mat.name
 bm=bmesh.new();bm.from_mesh(o.data);bad=sum(not e.is_manifold for e in bm.edges);bm.free();assert bad==0,(o.name,bad)
 o.data.calc_loop_triangles();metrics['meshes'].append({'name':o.name,'triangles':len(o.data.loop_triangles),'nonManifoldEdges':bad})
coords=[o.matrix_world@v.co for o in bpy.context.scene.objects if o.type=='MESH' for v in o.data.vertices]
metrics['blenderBounds']=[[min(v[i] for v in coords) for i in range(3)],[max(v[i] for v in coords) for i in range(3)]]
for area in bpy.context.screen.areas:
 if area.type=='VIEW_3D':
  from mathutils import Vector
  region=area.spaces.active.region_3d
  region.view_distance=12; region.view_location=(0,0,1.9)
  region.view_rotation=Vector((8,-10,7)).to_track_quat('Z','Y')
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'tools/models/rooftop-hvac.blend'))
path=ROOT/'public/models/rooftop-hvac.glb'
bpy.ops.export_scene.gltf(filepath=str(path),export_format='GLB',export_yup=True,export_apply=True)
metrics['bytes']=path.stat().st_size
(ROOT/'tools/models/rooftop-hvac-metrics.json').write_text(json.dumps(metrics,indent=2)+'\n')
print(json.dumps(metrics))
