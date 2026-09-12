"""Original generic snap-frame construction for #239, scripted Blender mesh authoring.
Run: blender -b -t 2 -P tools/models/coming-soon-letterboard.py
Existing scene dimensions, not an authenticated replica of unavailable owner photos.
Feet; board centered, front +Z in Three; Blender mapping (x,-z,y).
"""
import bpy, bmesh, math, json
from pathlib import Path
from mathutils import Quaternion
ROOT=Path(__file__).resolve().parents[2]
W,H,D,FW=28/12,42/12,1.4/12,.875/12
LEAN=math.radians(11)
LIFT=.018
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
bpy.context.preferences.filepaths.save_version=0
bpy.context.scene.unit_settings.system='IMPERIAL'
bpy.context.scene.unit_settings.scale_length=.3048
mats={}
for name,color,rough,metal in [
 ('LetterboardAluminium',(.54,.57,.59,1),.34,.72),
 ('LetterboardBacking',(.009,.015,.028,1),.55,.02),
 ('LetterboardLiveFace',(.009,.015,.028,1),.52,.02),
 ('LetterboardContact',(.018,.019,.021,1),.85,0),
]:
 m=bpy.data.materials.new(name);m.diffuse_color=color;m.use_nodes=True
 p=m.node_tree.nodes['Principled BSDF'];p.inputs['Base Color'].default_value=color;p.inputs['Roughness'].default_value=rough;p.inputs['Metallic'].default_value=metal;mats[name]=m

def mesh(name,vs,fs,roles,face_roles=None):
 me=bpy.data.meshes.new(name);me.from_pydata([(x,-z,y) for x,y,z in vs],[],fs);me.update()
 o=bpy.data.objects.new(name,me);bpy.context.collection.objects.link(o)
 for r in roles:me.materials.append(mats[r])
 if face_roles:
  for p,r in zip(me.polygons,face_roles):p.material_index=r
 bm=bmesh.new();bm.from_mesh(me);bmesh.ops.recalc_face_normals(bm,faces=bm.faces)
 assert all(e.is_manifold for e in bm.edges),name
 bm.to_mesh(me);bm.free()
 bpy.context.view_layer.objects.active=o;o.select_set(True)
 bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT');bpy.ops.uv.smart_project(island_margin=.02);bpy.ops.object.mode_set(mode='OBJECT');o.select_set(False)
 o['units']='feet';o['provenance']='Original generic construction; scene envelope from coming-soon-letterboard.ts; hidden details inferred'
 return o

# Swept folded section, with eased crown and real rear return; diagonal end
# planes mate exactly at the corners. Each extrusion is a closed manifold solid.
profile=[(0,-D/2),(.027,-D/2),(.027,-D/2+.009),(.010,-D/2+.009),
 (.010,D/2-.009),(FW-.006,D/2-.009),(FW,D/2+.002),
 (FW-.004,D/2+.010),(FW-.015,D/2+.016),(.014,D/2+.016),(.003,D/2+.010),(0,D/2)]
corners=[(-1,-1),(1,-1),(1,1),(-1,1)]
for i,label in enumerate(['Bottom','Right','Top','Left']):
 a,b=corners[i],corners[(i+1)%4];n=len(profile)
 vs=[(sx*(W/2-t),sy*(H/2-t),z) for sx,sy in [a,b] for t,z in profile]
 fs=[(j,(j+1)%n,n+(j+1)%n,n+j) for j in range(n)]+[tuple(reversed(range(n))),tuple(range(n,2*n))]
 mesh('Snap rail '+label,vs,fs,['LetterboardAluminium'])

# One connected grooved panel with a thin back sheet. A permanent fine physical
# pitch supports changing letter rows; the existing live texture stays replaceable.
ys=[-H/2+.028,H/2-.028]
for i in range(1,84):
 y=-H/2+i*.5/12
 for dy in [-.003,-.001,.001,.003]:
  if ys[0]<y+dy<ys[1]:ys.append(y+dy)
ys=sorted(ys)
vs=[]
for y in ys:
 phase=((y+H/2)/(.5/12))%1
 z=D/2-(.0015 if min(phase,1-phase)<.05 else 0)
 vs.extend([(-W/2+.028,y,z),(W/2-.028,y,z)])
n=len(ys);back=len(vs)
vs += [(-W/2+.028,ys[0],-D/2+.010),(W/2-.028,ys[0],-D/2+.010),
       (W/2-.028,ys[-1],-D/2+.010),(-W/2+.028,ys[-1],-D/2+.010)]
fs=[(2*i,2*i+1,2*i+3,2*i+2) for i in range(n-1)]
roles=[0]*len(fs)
fs += [(back,back+3,back+2,back+1),(back,back+1,1,0),(2*n-2,2*n-1,back+2,back+3),
       tuple([back]+[2*i for i in range(n)]+[back+3]),tuple([back+1,back+2]+[2*i+1 for i in reversed(range(n))])]
roles += [1]*5
panel=mesh('Grooved insert and rear sheet',vs,fs,['LetterboardLiveFace','LetterboardBacking'],roles)
# Same full-board mapping as the procedural BoxGeometry face. No shrinking,
# cropping, baked copy, or dependency on one particular feed's row count.
uv=panel.data.uv_layers.active.data
for p in panel.data.polygons:
 if p.material_index==0:
  for li in p.loop_indices:
   v=panel.data.vertices[panel.data.loops[li].vertex_index].co
   uv[li].uv=(v.x/W+.5,v.z/H+.5)

# Wedge sole's underside is level AFTER the established eleven-degree lean.
# It fills the gap below the raised carcass, resting exactly at ledge Y=3.54.
def prism(name,x0,x1,yz,role):
 n=len(yz);vs=[(x,y,z) for x in [x0,x1] for y,z in yz]
 fs=[(i,(i+1)%n,n+(i+1)%n,n+i) for i in range(n)]+[tuple(reversed(range(n))),tuple(range(n,2*n))]
 return mesh(name,vs,fs,[role])
z0,z1=-D/2,D/2
bottom=lambda z:-H/2-LIFT/math.cos(LEAN)-math.tan(LEAN)*z
prism('Level counter contact sole',-W/2+.04,W/2-.04,[(bottom(z0),z0),(bottom(z1),z1),(-H/2,z1),(-H/2,z0)],'LetterboardContact')
# Two rear buffers terminate on the actual world glass plane z=8.54.
# They are inferred supports, not hardware claimed visible in a reference.
for x in [-.85,.85]:
 y0,y1=H/2-.14,H/2-.06
 glass=lambda y:-(.79-(y+H/2)*math.sin(LEAN))/math.cos(LEAN)
 prism('Rear glass contact '+('L' if x<0 else 'R'),x-.045,x+.045,[(y0,-D/2+.01),(y0,glass(y0)),(y1,glass(y1)),(y1,-D/2+.01)],'LetterboardContact')
for o in bpy.context.scene.objects:
 o.modifiers.new('Runtime triangulation','TRIANGULATE')
for area in bpy.context.screen.areas:
 if area.type=='VIEW_3D':
  r=area.spaces.active.region_3d;r.view_distance=5;r.view_rotation=Quaternion((.90,.38,.08,.18)).normalized()
bpy.context.scene['dimensions']='28 x 42 inch envelope; 1.4 inch carcass; .875 inch frame'
bpy.context.scene['placement']='Center pivot; runtime +.018 ft lift; lean -11 degrees; counter sole Y=3.54; rear tips Z=8.54'
source=ROOT/'tools/models/coming-soon-letterboard.blend';out=ROOT/'public/models/coming-soon-letterboard.glb'
bpy.ops.wm.save_as_mainfile(filepath=str(source))
bpy.ops.export_scene.gltf(filepath=str(out),export_format='GLB',export_apply=True,export_yup=True)
metrics={'bytes':out.stat().st_size,'textures':0,'parts':[]}
for o in bpy.context.scene.objects:
 deps=bpy.context.evaluated_depsgraph_get();me=o.evaluated_get(deps).to_mesh();me.calc_loop_triangles()
 metrics['parts'].append({'name':o.name,'triangles':len(me.loop_triangles),'materials':[m.name for m in me.materials],'uv':len(me.uv_layers)>0})
 o.evaluated_get(deps).to_mesh_clear()
metrics['triangles']=sum(p['triangles'] for p in metrics['parts'])
out.with_suffix('.json').write_text(json.dumps(metrics,indent=2)+'\n')
print(json.dumps(metrics))
