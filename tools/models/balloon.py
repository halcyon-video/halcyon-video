"""Original generic latex balloon, scripted mesh authoring. No external assets.
Feet, Blender Z up -> glTF Y up. Rebuild: blender -b -t 2 -P tools/models/balloon.py
"""
import bpy, bmesh, math, random, json, struct
from mathutils import Vector
from pathlib import Path
R=Path(__file__).resolve().parents[2]
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
# Two compact, packed, periodic surface maps: latex bloom and twisted cotton relief.
def material(name,color,rough,cord=False):
 m=bpy.data.materials.new(name);m.diffuse_color=(*color,1);m.use_nodes=True
 p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*color,1);p.inputs['Roughness'].default_value=rough
 p.inputs['IOR'].default_value=1.46 if not cord else 1.5
 if not cord:p.inputs['Coat Weight'].default_value=.22;p.inputs['Coat Roughness'].default_value=.24
 rng=random.Random(183+int(cord));n=128
 height=[[rng.random()*.06 if not cord else .45*math.sin((x/8+y/16)*math.tau)+rng.random()*.08 for x in range(n)] for y in range(n)]
 for kind in ['normal','roughness']:
  im=bpy.data.images.new(name+'_'+kind,width=n,height=n);im.colorspace_settings.name='Non-Color';pixels=[]
  for y in range(n):
   for x in range(n):
    if kind=='normal':
     v=Vector(((height[y][(x-1)%n]-height[y][(x+1)%n])*.3,(height[(y-1)%n][x]-height[(y+1)%n][x])*.3,1)).normalized();pixels.extend((v.x*.5+.5,v.y*.5+.5,v.z*.5+.5,1))
    else:
     v=rough+(height[y][x]-.075)*.08;pixels.extend((v,v,v,1))
  im.pixels=pixels;im.pack();tex=m.node_tree.nodes.new('ShaderNodeTexImage');tex.image=im
  if kind=='normal':
   normal=m.node_tree.nodes.new('ShaderNodeNormalMap');m.node_tree.links.new(tex.outputs['Color'],normal.inputs['Color']);m.node_tree.links.new(normal.outputs['Normal'],p.inputs['Normal'])
  else:m.node_tree.links.new(tex.outputs['Color'],p.inputs['Roughness'])
 return m
latex=material('BalloonLatex',(.8,.8,.8),.28);cord=material('BalloonCord',(.72,.69,.61),.76,True)
parts=[]
def mesh(name,verts,faces,uvs,mat,closed=True,uv_scale=1):
 me=bpy.data.meshes.new(name);me.from_pydata(verts,[],faces);me.update();o=bpy.data.objects.new(name,me);bpy.context.collection.objects.link(o);me.materials.append(mat)
 bm=bmesh.new();bm.from_mesh(me);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));assert all(e.is_manifold for e in bm.edges) if closed else True;bm.to_mesh(me);bm.free()
 uv=me.uv_layers.new(name='SurfaceUV')
 for p in me.polygons:
  p.use_smooth=True
  us=[uvs[me.loops[li].vertex_index][0] for li in p.loop_indices]
  for li in p.loop_indices:
   u,v=uvs[me.loops[li].vertex_index];uv.data[li].uv=((u+1 if max(us)-min(us)>.5 and u<.5 else u)*uv_scale,v*uv_scale)
 parts.append(o);return o
# Continuous lathed shell: open inner mouth, rolled lip, pinched neck, pear body.
# Inner return makes the visible mouth a real recess; inflated shell ends closed.
profile=[(.011,1.449),(.011,1.418),(.016,1.402),(.029,1.399),(.034,1.406),(.034,1.414),(.029,1.421),(.018,1.435),(.014,1.458),(.018,1.485),(.027,1.505),(.045,1.53),(.072,1.56),(.112,1.60),(.158,1.65),(.213,1.71),(.277,1.79),(.338,1.88),(.391,1.98),(.432,2.08),(.449,2.18),(.45,2.24),(.437,2.33),(.404,2.41),(.35,2.48),(.277,2.535),(.193,2.573),(.10,2.595),(.035,2.602)]
N=64;v=[];uv=[]
for j,(r,z) in enumerate(profile):
 for i in range(N):
  a=i*math.tau/N;wrinkle=1+(.055*math.sin(7*a+z*23) if z<1.60 else .0015*math.sin(3*a))
  v.append((r*math.cos(a)*wrinkle,r*math.sin(a)*wrinkle,z));uv.append((i/N,(z-1.399)/1.21))
f=[]
for j in range(len(profile)-1):
 for i in range(N):f.append((j*N+i,j*N+(i+1)%N,(j+1)*N+(i+1)%N,(j+1)*N+i))
# Cap inside the uninflated neck, and pole fan on crown.
for ring,z,reverse in [(0,1.449,True),(len(profile)-1,2.603,False)]:
 idx=len(v);v.append((0,0,z));uv.append((.5,0 if reverse else 1))
 for i in range(N):f.append((idx,ring*N+(i+1)%N,ring*N+i) if reverse else (idx,ring*N+i,ring*N+(i+1)%N))
shell=mesh('LatexShell_Neck_RolledMouth',v,f,uv,latex,uv_scale=8)
# Tube sweep with transported frames. Physical flattened overhand neck fold.
def tube(name,path,radii,mat,sides=8):
 verts=[];uv=[];length=0
 for j,pt in enumerate(path):
  if j:length+=(pt-path[j-1]).length
  tangent=(path[min(j+1,len(path)-1)]-path[max(0,j-1)]).normalized();u=tangent.cross(Vector((0,1,0))).normalized();w=tangent.cross(u).normalized()
  for i in range(sides):
   a=i*math.tau/sides;verts.append(pt+radii[j]*(u*math.cos(a)+w*math.sin(a)));uv.append((i/sides,length*8))
 faces=[]
 for j in range(len(path)-1):
  for i in range(sides):faces.append((j*sides+i,j*sides+(i+1)%sides,(j+1)*sides+(i+1)%sides,(j+1)*sides+i))
 faces.extend([tuple(reversed(range(sides))),tuple((len(path)-1)*sides+i for i in range(sides))]);return mesh(name,verts,faces,uv,mat)
path=[]
for j in range(65):
 t=j/64*math.tau*1.25;path.append(Vector((.025*math.sin(t),.018*math.cos(t),1.469+.009*math.sin(2*t)+.009*j/64)))
tube('Latex_OverhandKnot',path,[.010]*len(path),latex,10)
# Continuous tether: vertical free length transitions into a snug wrap at neck.
path=[]
for j in range(65):
 t=j/64;path.append(Vector((.055*t**4+.030*math.sin(t*math.tau)*math.sin(t*math.pi),.018*math.sin(t*math.pi),1.46*t)))
# Approach outside the rolled mouth, then curl tangentially around the knot.
# This avoids the physically incorrect appearance of threading through the lip.
a,b,c,d=Vector((.055,0,1.46)),Vector((.055,0,1.48)),Vector((.032,-.018,1.472)),Vector((.032,0,1.472))
for j in range(1,9):
 t=j/8;path.append((1-t)**3*a+3*(1-t)**2*t*b+3*(1-t)*t*t*c+t**3*d)
for j in range(1,41):
 t=j/40*math.tau*1.2;path.append(Vector((.032*math.cos(t),.032*math.sin(t),1.472+.005*j/40)))
assert all(math.hypot(p.x,p.y)>.0372 for p in path if 1.399<=p.z<=1.435), 'Cord must clear rolled lip'
tube('ContinuousCottonString',path,[.0032]*len(path),cord,6)
for name,pos in [('mount_tie',(0,0,0)),('mount_neck',(0,0,1.472)),('mount_body',(0,0,2.06))]:
 o=bpy.data.objects.new(name,None);bpy.context.collection.objects.link(o);o.location=pos;o['units']='feet'
s=bpy.context.scene;s.unit_settings.system='IMPERIAL';s.unit_settings.scale_length=.3048
for a in bpy.context.screen.areas:
 if a.type=='VIEW_3D':a.spaces.active.region_3d.view_distance=4;a.spaces.active.region_3d.view_location=Vector((0,0,1.65))
bpy.ops.wm.save_as_mainfile(filepath=str(R/'tools/models/balloon.blend'))
path=R/'public/models/balloon.glb';bpy.ops.export_scene.gltf(filepath=str(path),export_format='GLB',export_yup=True,export_extras=True)
b=path.read_bytes();g=json.loads(b[20:20+struct.unpack_from('<I',b,12)[0]])
metrics={'bytes':len(b),'triangles':sum(g['accessors'][p['indices']]['count']//3 for m in g['meshes'] for p in m['primitives']),'primitives':sum(len(m['primitives']) for m in g['meshes']),'materials':[m['name'] for m in g['materials']],'images':len(g.get('images',[])),'allPrimitivesHaveUV':all('TEXCOORD_0' in p['attributes'] for m in g['meshes'] for p in m['primitives']),'manifoldParts':len(parts),'authoredBoundsFeet':[[min(v.co[k] for o in parts for v in o.data.vertices) for k in range(3)],[max(v.co[k] for o in parts for v in o.data.vertices) for k in range(3)]]}
(R/'tools/models/balloon-metrics.json').write_text(json.dumps(metrics,indent=2)+'\n');print(metrics)
