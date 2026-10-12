"""Original asymmetric wall-bank visible casework, feet; preserve current live CRT faces.
Blender (X,-store Z,height) exports runtime (X,height,store Z). Origin is bank centre
at back-wall surface. Existing screen/scan/glass/black bezels remain runtime-owned.
Run Blender with --python-exit-code 1 and this script's absolute path.
"""
import bpy,bmesh,math,json
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
def material(name,color,rough,metal):
 m=bpy.data.materials.new(name);m.diffuse_color=(*color,1);m.use_nodes=True;p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*color,1);p.inputs['Roughness'].default_value=rough;p.inputs['Metallic'].default_value=metal;return m
M={'HousingAmber':material('HousingAmber',(.56,.30,.018),.72,.05),'RecessHardware':material('RecessHardware',(.006,.006,.006),.5,.1),'WallFasteners':material('WallFasteners',(.38,.40,.42),.42,.8)}
def finish(o,role,bevel=.005):
 bpy.ops.object.select_all(action='DESELECT');o.select_set(True);bpy.context.view_layer.objects.active=o
 o.data.materials.append(M[role])
 if bevel:
  mod=o.modifiers.new('Formed edge easing','BEVEL');mod.width=bevel;mod.segments=1;bpy.ops.object.modifier_apply(modifier=mod.name)
 bm=bmesh.new();bm.from_mesh(o.data);bmesh.ops.remove_doubles(bm,verts=bm.verts,dist=1e-7);bmesh.ops.recalc_face_normals(bm,faces=bm.faces)
 assert all(e.is_manifold for e in bm.edges),o.name
 assert all(f.calc_area()>1e-10 for f in bm.faces),o.name
 bm.to_mesh(o.data);bm.free()
 bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT');bpy.ops.uv.smart_project(island_margin=.02);bpy.ops.object.mode_set(mode='OBJECT')
 o['units']='feet';o['material_role']=role;o['provenance']='Original visible asymmetric wall-bank casework; current runtime outline retained';return o

def mesh(name,vertices,faces):
 me=bpy.data.meshes.new(name);me.from_pydata(vertices,[],faces);me.update();o=bpy.data.objects.new(name,me);bpy.context.collection.objects.link(o);return o

def sheet(name,vertices,faces,role,thickness=.035):
 o=mesh(name,vertices,faces);bpy.ops.object.select_all(action='DESELECT');o.select_set(True);bpy.context.view_layer.objects.active=o
 mod=o.modifiers.new('Real folded sheet thickness','SOLIDIFY');mod.thickness=thickness;mod.offset=-1;mod.use_even_offset=True;bpy.ops.object.modifier_apply(modifier=mod.name)
 return finish(o,role)

def p(x,y,z):return (x,-z,y)
BL=(-5.2865,-1.88475);BR=(5.2865,-1.53025);TR=(5.6135,1.66025);TL=(-5.6135,2.01475)
left=lambda y:BL[0]+(TL[0]-BL[0])*(y-BL[1])/(TL[1]-BL[1])
right=lambda y:BR[0]+(TR[0]-BR[0])*(y-BR[1])/(TR[1]-BR[1])
top=lambda x:TL[1]+(TR[1]-TL[1])*(x-TL[0])/(TR[0]-TL[0])
bottom=lambda x:BL[1]+(BR[1]-BL[1])*(x-BL[0])/(BR[0]-BL[0])
# Continuous developed front pressing: no triangles bridge any live picture.
cuts=[-4.57,-2.43,-1.07,1.07,2.43,4.57]
rows=[[(x,bottom(x)) for x in [BL[0],*cuts,BR[0]]],[(x,-.8075) for x in [left(-.8075),*cuts,right(-.8075)]],[(x,.8075) for x in [left(.8075),*cuts,right(.8075)]],[(x,top(x)) for x in [TL[0],*cuts,TR[0]]]]
vertices=[p(x,y,.5) for row in rows for x,y in row];faces=[]
for j in range(3):
 for i in range(7):
  if j==1 and i in [1,3,5]:continue
  faces.append((j*8+i,j*8+i+1,(j+1)*8+i+1,(j+1)*8+i))
sheet('Pierced asymmetric front pressing',vertices,faces,'HousingAmber',.04)
# The outer skins meet the exact asymmetric outline, with no full back slab.
for name,a,b,reverse in [('Upper folded skin',TL,TR,True),('Lower folded skin',BL,BR,False)]:
 if reverse:a=(a[0]+.007,top(a[0]+.007));b=(b[0]-.007,top(b[0]-.007))
 face=(0,1,2,3);sheet(name,[p(*a,0),p(*b,0),p(*b,.5),p(*a,.5)],[tuple(reversed(face)) if reverse else face],'HousingAmber')
for side,ends,boundary in [(-1,(BL[1],TL[1]),left),(1,(BR[1],TR[1]),right)]:
 ys=[ends[0]+.007,-.6,-.5,-.25,-.15,.15,.25,.5,.6,ends[1]-.007];zs=[0,.08,.42,.5]
 vertices=[p(boundary(y),y,z) for y in ys for z in zs];faces=[]
 for j in range(len(ys)-1):
  for i in range(3):
   if i==1 and j in [1,3,5,7]:continue
   f=(j*4+i,j*4+i+1,(j+1)*4+i+1,(j+1)*4+i);faces.append(tuple(reversed(f)) if side>0 else f)
 sheet(('Left' if side<0 else 'Right')+' pierced end return',vertices,faces,'HousingAmber',.03)
# Open rear perimeter flange against the wall, never a slab across CRT rays.
outer=[BL,BR,TR,TL];inner=[(x*.97,y*.93) for x,y in outer];vertices=[p(x,y,0) for x,y in outer+inner]
faces=[(i+4,(i+1)%4+4,(i+1)%4,i) for i in range(4)]
sheet('Open wall attachment flange',vertices,faces,'HousingAmber',.025)
# Three matching open cassette supports fit behind the existing pierced bezels.
for centre in [-3.5,0,3.5]:
 outer=[(centre-1.15,-.8875),(centre+1.15,-.8875),(centre+1.15,.8875),(centre-1.15,.8875)]
 inner=[(centre-1.07,-.8075),(centre+1.07,-.8075),(centre+1.07,.8075),(centre-1.07,.8075)]
 v=[p(x,y,z) for z in [.20,.46] for x,y in outer+inner];f=[]
 for i in range(4):
  j=(i+1)%4;f += [(i,j,j+8,i+8),(i+4,i+12,j+12,j+4),(i,i+4,j+4,j),(i+8,j+8,j+12,i+12)]
 finish(mesh('Open inset cassette support '+str(centre),v,f),'RecessHardware')
for x in [-5.03,5.03]:
 for y in [-1.27,1.27]:
  bpy.ops.mesh.primitive_cylinder_add(vertices=8,radius=.025,depth=.020,location=p(x,y,.486));o=bpy.context.object;o.rotation_euler.x=math.pi/2
  bpy.ops.object.transform_apply(location=False,rotation=True,scale=True);o.name='Visible casework fastener';finish(o,'WallFasteners',.002)
# Editable physical pieces remain separate. Batch only the runtime export.
audit=[]
for o in bpy.context.scene.objects:
 if o.type=='MESH':o.data.calc_loop_triangles();audit.append({'part':o.name,'role':o.data.materials[0].name,'triangles':len(o.data.loop_triangles),'uv':bool(o.data.uv_layers)})
(ROOT/'scratch').mkdir(exist_ok=True);(ROOT/'scratch/wall-bank-source-audit.json').write_text(json.dumps(audit,indent=2))
for area in bpy.context.screen.areas:
 if area.type=='VIEW_3D':area.spaces.active.region_3d.view_distance=15;area.spaces.active.region_3d.view_location=(0,-.25,0)
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'tools/models/tv-wall-bank.blend'))
for role,m in M.items():
 obs=[o for o in bpy.context.scene.objects if o.type=='MESH' and o.data.materials[0]==m]
 bpy.ops.object.select_all(action='DESELECT')
 for o in obs:o.select_set(True)
 bpy.context.view_layer.objects.active=obs[0];bpy.ops.object.join();bpy.context.object.name='WallBank_'+role
bpy.ops.object.select_all(action='SELECT');bpy.ops.export_scene.gltf(filepath=str(ROOT/'public/models/tv-wall-bank.glb'),export_format='GLB',export_yup=True,export_apply=True)
