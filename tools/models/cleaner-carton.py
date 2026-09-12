"""Original generic folded paperboard. No third-party geometry or artwork.
Run blender -b -t 2 -P tools/models/cleaner-carton.py. Store units: feet.
"""
import bpy, bmesh, math, random, json
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
bpy.context.preferences.filepaths.save_version=0
bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
W,H,D,T=.365,.667,.082,.0015
# Deterministic, tileable fibre relief and roughness; packed into source and GLB.
rng=random.Random(181); n=128
height=[rng.random() for _ in range(n*n)]
images={}
for kind in ['normal','roughness','paper']:
 im=bpy.data.images.new('Carton_'+kind,width=n,height=n)
 pixels=[]
 for y in range(n):
  for x in range(n):
   h=height[y*n+x]
   if kind=='normal':
    dx=(height[y*n+(x+1)%n]-height[y*n+(x-1)%n])*.10
    dy=(height[((y+1)%n)*n+x]-height[((y-1)%n)*n+x])*.10
    v=(dx,dy,1); length=math.sqrt(sum(a*a for a in v)); rgb=[a/length*.5+.5 for a in v]
   elif kind=='roughness':rgb=[.66+.13*h]*3
   else:rgb=[.88+.09*h]*3
   pixels.extend([*rgb,1])
 im.pixels=pixels
 im.filepath_raw=str(ROOT/'tools/models'/('cleaner-carton-'+kind+'.png'));im.file_format='PNG';im.save();im.pack()
 if kind!='paper': im.colorspace_settings.name='Non-Color'
 images[kind]=im
mats=[]
for name in ['CartonFront','CartonBack','CartonSpine','CartonBoard']:
 m=bpy.data.materials.new(name);m.use_nodes=True;m.diffuse_color=(.55,.51,.40,1)
 nt=m.node_tree;p=nt.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(.55,.51,.40,1)
 p.inputs['Roughness'].default_value=.72
 for kind,slot in [('paper','Base Color'),('roughness','Roughness'),('normal','Normal')]:
  tex=nt.nodes.new('ShaderNodeTexImage');tex.image=images[kind]
  if kind=='normal':
   nm=nt.nodes.new('ShaderNodeNormalMap');nm.inputs['Strength'].default_value=.45;nt.links.new(tex.outputs['Color'],nm.inputs['Color']);nt.links.new(nm.outputs['Normal'],p.inputs[slot])
  else:nt.links.new(tex.outputs['Color'],p.inputs[slot])
 mats.append(m)

def mesh(name,vs,fs,roles):
 me=bpy.data.meshes.new(name);me.from_pydata([(x,-z,y) for x,y,z in vs],[],fs);me.update()
 ob=bpy.data.objects.new(name,me);bpy.context.collection.objects.link(ob)
 for m in mats:me.materials.append(m)
 for poly,role in zip(me.polygons,roles):poly.material_index=role
 bm=bmesh.new();bm.from_mesh(me);bmesh.ops.recalc_face_normals(bm,faces=bm.faces)
 assert all(e.is_manifold for e in bm.edges),name
 bm.to_mesh(me);bm.free()
 uv=me.uv_layers.new(name='ArtworkUV')
 for p in me.polygons:
  for li in p.loop_indices:
   x,by,y=me.vertices[me.loops[li].vertex_index].co;z=-by
   if p.material_index==0:u,v=x/W+.5,y/H+.5
   elif p.material_index==1:u,v=.5-x/W,y/H+.5
   elif p.material_index==2:u,v=.5+z/D,y/H+.5
   else:
    # Project cut edges/interior walls as well: avoid collapsed grain UVs.
    nx,ny,nz=map(abs,p.normal)
    if nz>=max(nx,ny):u,v=x/W+.5,z/D+.5
    elif ny>=nx:u,v=x/W+.5,y/H+.5
    else:u,v=z/D+.5,y/H+.5
   uv.data[li].uv=(u,v)
 return ob
# A continuous eight-sided sleeve, including narrow compressed spine folds.
def profile(w,d,r):
 return [(-w/2+r,d/2),(w/2-r,d/2),(w/2,d/2-r),(w/2,-d/2+r),(w/2-r,-d/2),(-w/2+r,-d/2),(-w/2,-d/2+r),(-w/2,d/2-r)]
vs=[]
for y,p in [(-H/2,profile(W,D,.0025)),(H/2,profile(W,D,.0025)),(-H/2,profile(W-2*T,D-2*T,.002)),(H/2,profile(W-2*T,D-2*T,.002))]:
 vs.extend((x,y,z) for x,z in p)
fs=[];roles=[]
for i in range(8):
 j=(i+1)%8
 fs.extend([(i,j,8+j,8+i),(16+i,24+i,24+j,16+j),(i,16+i,16+j,j),(8+i,8+j,24+j,24+i)])
 roles.extend([0 if i==0 else 1 if i==4 else 2 if i in [2,6] else 3,3,3,3])
mesh('Sleeve_with_scored_spines',vs,fs,roles)
# Extruded folded closure cross sections: crown, eased fold and recessed tuck.
# Ends are capped; upper and lower closures have visible paper cut edges.
for sign,label in [(1,'Top'),(-1,'Bottom')]:
 y=H/2-T
 cross=[(-D/2+T,y),(D/2-T*2,y),(D/2-T,y-T),(D/2-T,y-.025),(D/2-T*2,y-.025),(D/2-T*2,y-T*2),(D/2-T*3,y-T),(-D/2+T,y-T)]
 vs=[(x,sign*yy,z) for x in [-W/2+T,W/2-T] for z,yy in cross]
 k=len(cross);fs=[tuple(reversed(range(k))),tuple(range(k,2*k))]+[(i,(i+1)%k,(i+1)%k+k,i+k) for i in range(k)]
 mesh(label+'_folded_tuck_closure',vs,fs,[3]*len(fs))
# Interior manufacturer's glue lap, with its free cut edge visible at the rear.
vs=[(x,y,z) for x in [-W/2+T,-W/2+.018] for y in [-H/2+T,H/2-T] for z in [-D/2+T,-D/2+T*2]]
mesh('Interior_glue_lap',vs,[(0,1,3,2),(4,6,7,5),(0,4,5,1),(2,3,7,6),(0,2,6,4),(1,5,7,3)],[3]*6)
bpy.context.scene.unit_settings.system='IMPERIAL';bpy.context.scene.unit_settings.scale_length=.3048
for o in bpy.context.scene.objects:
 o['construction']='Original generic 0.0015 ft paperboard; nominal existing fixture dimensions'
for screen in bpy.data.screens:
 for area in screen.areas:
  if area.type=='VIEW_3D':area.spaces.active.region_3d.view_distance=1.2
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'tools/models/cleaner-carton.blend'))
bpy.ops.export_scene.gltf(filepath=str(ROOT/'public/models/cleaner-carton.glb'),export_format='GLB',export_yup=True,export_apply=True,export_extras=True)
metrics={'dimensionsFeet':[W,H,D],'paperThicknessFeet':T,'parts':[]}
for o in bpy.context.scene.objects:
 if o.type=='MESH':
  o.data.calc_loop_triangles();metrics['parts'].append({'name':o.name,'vertices':len(o.data.vertices),'triangles':len(o.data.loop_triangles),'manifold':True})
metrics['triangles']=sum(p['triangles'] for p in metrics['parts']);metrics['glbBytes']=(ROOT/'public/models/cleaner-carton.glb').stat().st_size
(ROOT/'docs/cleaner-carton-cost.json').write_text(json.dumps(metrics,indent=2)+'\n')
