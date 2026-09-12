"""Original neutral apparel study; numeric feet, Blender (x,-store_z,height).
Rebuild: blender -b -P tools/models/counter-apparel.py
No reference imagery/artwork used. Dimensions are design estimates, not replicas.
"""
import bpy, bmesh, math, os, json
import numpy as np
from mathutils import Vector
from mathutils.geometry import tessellate_polygon
ROOT=os.path.abspath(os.path.join(os.path.dirname(__file__),'../..'))
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
# Deterministic, embedded yarn maps: fine twisted warp/weft; shared by all cloth.
n=256;y,x=np.mgrid[0:n,0:n];u=x/n;v=y/n
h=.5+.20*np.sin(x*math.tau/8)*np.cos(y*math.tau/8)+.07*np.sin((x+y)*math.tau/3)
def image(name,rgb):
 im=bpy.data.images.new(name,width=n,height=n);im.colorspace_settings.name='Non-Color'
 rgba=np.ones((n,n,4),dtype=np.float32);rgba[:,:,:3]=rgb;im.pixels.foreach_set(rgba.ravel());im.pack();return im
dy,dx=np.gradient(h);normal=image('Cotton_yarn_normal',np.stack((.5-dx*.6,.5-dy*.6,np.ones_like(h)),2))
rough=image('Cotton_yarn_roughness',np.repeat((.79+.13*h)[:,:,None],3,2))
grain=image('Hardware_micrograin_normal',np.stack((.5+.025*np.sin(x*1.7+y*.3),.5+.018*np.cos(y*2.1),np.ones_like(h)),2))
def mat(name,c,metal=0,r=.8,cloth=False):
 m=bpy.data.materials.new(name);m.diffuse_color=(*c,1);m.use_nodes=True;p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*c,1);p.inputs['Metallic'].default_value=metal;p.inputs['Roughness'].default_value=r
 if cloth:
  ns=m.node_tree.nodes;ls=m.node_tree.links
  # glTF exports base tint multiplied by the yarn albedo through this node.
  tex=ns.new('ShaderNodeTexImage');tex.image=image(name+'_dyed_yarn',np.repeat((.88+.12*h)[:,:,None],3,2)*np.array(c))
  ls.new(tex.outputs['Color'],p.inputs['Base Color'])
  tex=ns.new('ShaderNodeTexImage');tex.image=normal;nm=ns.new('ShaderNodeNormalMap');nm.inputs['Strength'].default_value=.35;ls.new(tex.outputs['Color'],nm.inputs['Color']);ls.new(nm.outputs[0],p.inputs['Normal'])
  tex=ns.new('ShaderNodeTexImage');tex.image=rough;ls.new(tex.outputs['Color'],p.inputs['Roughness'])
 else:
  ns=m.node_tree.nodes;ls=m.node_tree.links
  tex=ns.new('ShaderNodeTexImage');tex.image=grain;nm=ns.new('ShaderNodeNormalMap');nm.inputs['Strength'].default_value=.2;ls.new(tex.outputs['Color'],nm.inputs['Color']);ls.new(nm.outputs[0],p.inputs['Normal'])
  tex=ns.new('ShaderNodeTexImage');tex.image=image(name+'_micro_roughness',np.repeat((r+.025*np.sin(x*1.7+y*.3))[:,:,None],3,2));ls.new(tex.outputs['Color'],p.inputs['Roughness'])
 return m
cotton=mat('ShirtCotton',(.34,.44,.48),cloth=True);rib=mat('RibAndStitch',(.26,.34,.37),cloth=True);cap=mat('CapTwill',(.48,.37,.23),cloth=True);metal=mat('SatinNickel',(.48,.51,.54),.85,.3);rubber=mat('SuctionRubber',(.33,.36,.38),0,.65)
parts=[]
def mesh(name,vs,fs,ma,solid=0):
 me=bpy.data.meshes.new(name);me.from_pydata([(a,-c,b) for a,b,c in vs],[],fs);me.update();o=bpy.data.objects.new(name,me);bpy.context.collection.objects.link(o);me.materials.append(ma)
 bpy.context.view_layer.objects.active=o;o.select_set(True)
 bm=bmesh.new();bm.from_mesh(me);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(me);bm.free()
 if solid:
  mod=o.modifiers.new('Sewn cloth thickness','SOLIDIFY');mod.thickness=solid;mod.offset=0;bpy.ops.object.modifier_apply(modifier=mod.name)
 bpy.ops.object.select_all(action='DESELECT');o.select_set(True);bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT');bpy.ops.uv.smart_project(island_margin=.015);bpy.ops.object.mode_set(mode='OBJECT')
 for p in me.polygons:p.use_smooth=True
 parts.append(o);return o
def tube(name,pts,r,ma):
 cu=bpy.data.curves.new(name,'CURVE');cu.dimensions='3D';cu.bevel_depth=r;cu.bevel_resolution=2;cu.resolution_u=1;cu.use_fill_caps=True
 closed=(Vector(pts[0])-Vector(pts[-1])).length<.000001
 if closed:pts=pts[:-1]
 sp=cu.splines.new('POLY');sp.use_cyclic_u=closed;sp.points.add(len(pts)-1)
 for p,(a,b,c) in zip(sp.points,pts):p.co=(a,-c,b,1)
 o=bpy.data.objects.new(name,cu);bpy.context.collection.objects.link(o);cu.materials.append(ma);bpy.ops.object.select_all(action='DESELECT');o.select_set(True);bpy.context.view_layer.objects.active=o;bpy.ops.object.convert(target='MESH')
 bm=bmesh.new();bm.from_mesh(o.data);bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=.00001);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(o.data);bm.free()
 bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT');bpy.ops.uv.smart_project(island_margin=.01);bpy.ops.object.mode_set(mode='OBJECT');parts.append(o);return o
# Garment pattern with genuinely open neck, cuffs and hem. Front/rear panels
# joined only along sewn side/shoulder boundaries, then given 0.006 ft thickness.
outline=[(-.70,0),(.70,0),(.67,1.24),(1.03,1.07),(1.24,1.47),(.77,1.94),(.30,2.03),(.22,1.87),(0,1.82),(-.22,1.87),(-.30,2.03),(-.77,1.94),(-1.24,1.47),(-1.03,1.07),(-.67,1.24)]
vec=[Vector((a,b,0)) for a,b in outline];tri=tessellate_polygon([vec]);vs=[];fs=[]
for side in [0,1]:
 vs += [(a-.65,b,.20+(1 if side==0 else -1)*.06) for a,b in outline]
 for t in tri:fs.append(tuple(side*len(vec)+(p if isinstance(p,int) else vec.index(p)) for p in (t if side==0 else reversed(t))))
for i in range(len(vec)):
 if i in [0,3,6,7,8,9,12]:continue
 j=(i+1)%len(vec);fs.append((i,j,j+len(vec),i+len(vec)))
shirt=mesh('Shirt_open_hem_cuffs_neck',vs,fs,cotton)
bpy.context.view_layer.objects.active=shirt
bm=bmesh.new();bm.from_mesh(shirt.data);bmesh.ops.subdivide_edges(bm,edges=list(bm.edges),cuts=7,use_grid_fill=True);bm.to_mesh(shirt.data);bm.free()
for p in shirt.data.vertices:
 a=p.co.x+.65;b=p.co.z
 wave=.060*math.sin(10*a+1.7*b)+.020*math.sin(18*a-3*b)
 p.co.y-=wave*(.25+.75*(1-min(b/2.05,1))) + .035*math.sin(b*4+a*3)
mod=shirt.modifiers.new('Cotton thickness 1.8mm','SOLIDIFY');mod.thickness=.006;bpy.ops.object.modifier_apply(modifier=mod.name)
# Collar follows the actual neck aperture; paired hem stitches follow drape.
for edge,name in [([6,7,8,9,10],'Neck_rib'),([0,1],'Hem'),([3,4],'Right_cuff'),([12,13],'Left_cuff')]:
 for side in [-1,1]:
  pts=[]
  for k in range(len(edge)-1):
   a0,b0=outline[edge[k]];a1,b1=outline[edge[k+1]]
   for j in range(17):
    t=j/16;a=a0+(a1-a0)*t;b=b0+(b1-b0)*t
    z=.20+side*.06+(.060*math.sin(10*a+1.7*b)+.020*math.sin(18*a-3*b))*(.25+.75*(1-min(b/2.05,1)))+.035*math.sin(b*4+a*3)
    pts.append((a-.65,b,z))
  tube(name+str(side),pts,.016 if name=='Neck_rib' else .008,rib)
# Six-gore structured baseball crown: opening faces wall, crown bulges outward.
cx=1.15;cy=1.87;N=48;R=16
vs=[(cx,cy,.78)]
for i in range(1,R+1):
 t=i/R*math.pi/2
 for j in range(N):
  a=j*math.tau/N;vs.append((cx+.36*math.sin(t)*math.cos(a),cy+.43*math.sin(t)*math.sin(a),.22+.56*math.cos(t)))
fs=[(0,1+j,1+(j+1)%N) for j in range(N)]
for i in range(R-1):
 for j in range(N):fs.append((1+i*N+j,1+i*N+(j+1)%N,1+(i+1)*N+(j+1)%N,1+(i+1)*N+j))
mesh('Cap_six_panel_crown',vs,fs,cap,.012)
for j in range(6):
 a=j*math.tau/6;pts=[]
 for i in range(1,33):
  t=i/32*math.pi/2;pts.append((cx+.364*math.sin(t)*math.cos(a),cy+.434*math.sin(t)*math.sin(a),.22+.566*math.cos(t)))
 tube('Crown_felled_seam_'+str(j),pts,.004,cap)
# Curved laminated visor at lower opening; stitched perimeter, exposed underside.
vs=[];fs=[]
for i in range(9):
 t=i/8
 for j in range(33):
  a=-math.pi/2+j*math.pi/32
  vs.append((cx+(.36+.05*t)*math.sin(a),cy-(.43+.38*t)*math.cos(a),.22+.28*t+.025*t*math.sin(a)**2))
for i in range(8):
 for j in range(32):q=i*33+j;fs.append((q,q+1,q+34,q+33))
mesh('Cap_curved_laminated_visor',vs,fs,cap,.025);tube('Visor_edge_binding',vs[-33:],.009,cap)
tube('Cap_inner_sweatband',[(cx+.355*math.cos(a),cy+.425*math.sin(a),.22) for a in [j*math.tau/64 for j in range(65)]],.025,rib)
tube('Cap_rear_hanging_strap',[(cx-.15,cy+.34,.22),(cx,cy+.30,.12),(cx+.15,cy+.34,.22)],.023,cap)
# Clear load paths: broad suction pads seated on glass, bent J hooks and
# shoulder clips capture cloth. Cap strap passes over the third hook.
def mount(x,y):
 # Stepped cup with thin perimeter lip and projecting boss.
 vs=[];fs=[];profile=[(.085,0),(.085,.009),(.073,.020),(.045,.034),(.020,.05)]
 for r,z in profile:
  for j in range(32):a=j*math.tau/32;vs.append((x+r*math.cos(a),y+r*math.sin(a),z))
 for i in range(4):
  for j in range(32):q=i*32+j;fs.append((q,i*32+(j+1)%32,(i+1)*32+(j+1)%32,q+32))
 fs.extend([tuple(reversed(range(32))),tuple(128+j for j in range(32))]);mesh('Glass_suction_pad',vs,fs,rubber)
 tube('Nickel_J_hook',[(x,y,.04),(x,y-.09,.09),(x,y-.12,.18),(x,y-.08,.21),(x,y-.04,.20)],.012,metal)
for x in [-1.42,.12]:
 mount(x,2.08)
 tube('Shoulder_pin_clip',[(x,2.00,.20),(x,1.91,.30),(x+.04,1.91,.30),(x+.04,2.00,.20)],.012,metal)
mount(cx,cy+.42)
# Repeat the thread-scale weave while retaining editable UV islands.
for o in parts:
 if o.data.materials[0] in [cotton,rib,cap]:
  for uv in o.data.uv_layers.active.data:uv.uv *= 16
# Keep optional print work isolated from neutral garment geometry.
art=bpy.data.collections.new('Optional_artwork_anchors');bpy.context.scene.collection.children.link(art)
for name,loc,size in [('Artwork_ShirtChest',(-.65,-.33,1.25),(.65,.6)),('Artwork_CapFront',(cx,-.80,cy),(.25,.18))]:
 o=bpy.data.objects.new(name,None);art.objects.link(o);o.location=loc;o.empty_display_size=.06;o['max_print_width_height_ft']=list(size)
 o['usage']='Optional local decal anchor. No artwork included or baked into cloth.'
# Audit real closed shell topology after thickness; deliberate garment openings
# have inner/outer returns, so even these material sheets are closed volumes.
audit=[]
for o in parts:
 bm=bmesh.new();bm.from_mesh(o.data)
 audit.append({'part':o.name,'vertices':len(bm.verts),'nonmanifold_edges':sum(not e.is_manifold for e in bm.edges)})
 bm.free()
open(ROOT+'/tools/models/counter-apparel-topology.json','w').write(json.dumps(audit,indent=2)+'\n')
# Finite UVs on every part; packing and material roles remain editable.
bpy.ops.object.select_all(action='SELECT')
bpy.context.scene.unit_settings.system='IMPERIAL';bpy.context.scene.unit_settings.scale_length=.3048
for screen in bpy.data.screens:
 for area in screen.areas:
  if area.type=='VIEW_3D':
   region=area.spaces.active.region_3d;region.view_distance=5;region.view_location=Vector((0,-.25,1.2));region.view_rotation=Vector((.2,-1,.1)).to_track_quat('Z','Y')
bpy.ops.wm.save_as_mainfile(filepath=ROOT+'/tools/models/counter-apparel.blend')
# Join by material for runtime, keeping named source parts in the .blend.
for ma in [cotton,rib,cap,metal,rubber]:
 obs=[o for o in bpy.context.scene.objects if o.type=='MESH' and o.data.materials[0]==ma];bpy.ops.object.select_all(action='DESELECT')
 for o in obs:o.select_set(True)
 bpy.context.view_layer.objects.active=obs[0];bpy.ops.object.join();obs[0].name=ma.name
bpy.ops.object.select_all(action='SELECT')
path=ROOT+'/public/models/counter-apparel.glb'
bpy.ops.export_scene.gltf(filepath=path,export_format='GLB',use_selection=True,export_yup=True,export_texcoords=True,export_extras=True)
vs=[o.matrix_world@v.co for o in bpy.context.scene.objects if o.type=='MESH' for v in o.data.vertices]
metrics={'bounds_blender':[[min(v[i] for v in vs) for i in range(3)],[max(v[i] for v in vs) for i in range(3)]],'triangles':sum(len(p.vertices)-2 for o in bpy.context.scene.objects if o.type=='MESH' for p in o.data.polygons),'materials':5,'glb_bytes':os.path.getsize(path),'textures':'eight 256x256 images: three cloth albedos, two shared normals, three roughness maps (export ORM)'}
open(ROOT+'/tools/models/counter-apparel-metrics.json','w').write(json.dumps(metrics,indent=2)+'\n');print(metrics)
