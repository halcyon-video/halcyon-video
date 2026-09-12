"""Original folded corrugated standee supports; Blender 5.2 scripted mesh authoring.
Run: blender -b -P tools/models/standee-support.py
Coordinates authored as (store X, -store Z, height), feet. No reference art.
"""
import bpy, bmesh, json, math
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[2]
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
scene=bpy.context.scene
scene.unit_settings.system='IMPERIAL';scene.unit_settings.scale_length=.3048

def mat(name,color):
 m=bpy.data.materials.new(name);m.diffuse_color=(*color,1);m.use_nodes=True
 p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*color,1);p.inputs['Roughness'].default_value=.93
 return m
kraft=mat('KraftLiner',(.49,.32,.16));core=mat('CorrugatedCutEdge',(.28,.17,.075));score=mat('CompressedFold',(.37,.23,.11))
parts=[]
def mesh(name,verts,faces,edgefaces=()):
 me=bpy.data.meshes.new(name);me.from_pydata(verts,[],faces);me.update()
 o=bpy.data.objects.new(name,me);scene.collection.objects.link(o)
 for m in [kraft,core,score]:me.materials.append(m)
 for i in edgefaces:me.polygons[i].material_index=1
 parts.append(o);return o

def sheet(name,poly,axis,t=.012):
 # Closed prism, deliberate profile vertices, cut edge roles distinct from liners.
 axes=[i for i in range(3) if i!=axis];v=[]
 for side in [-1,1]:
  for a,b in poly:
   p=[0,0,0];p[axis]=side*t/2;p[axes[0]]=a;p[axes[1]]=b;v.append(p)
 n=len(poly);f=[tuple(reversed(range(n))),tuple(range(n,2*n))]
 f += [(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)]
 return mesh(name,v,f,range(2,len(f)))

def slot(o,center,size):
 bpy.ops.mesh.primitive_cube_add(size=1,location=center);c=bpy.context.object;c.scale=size
 bpy.context.view_layer.objects.active=o
 mod=o.modifiers.new('Die punched locking slot','BOOLEAN');mod.operation='DIFFERENCE';mod.object=c
 bpy.ops.object.modifier_apply(modifier=mod.name);bpy.data.objects.remove(c,do_unlink=True)

def fold(name,x,depth,h,sign):
 # A continuous bent liner: small quarter-round score from vertical web to foot.
 r=.018;t=.008
 profile=[(0,h),(0,r)]
 for i in range(1,7):
  a=math.pi+i*math.pi/12;profile.append((r+r*math.cos(a),r+r*math.sin(a)))
 profile += [(.15,0),(.15,t),(r,t)]
 for i in range(6,-1,-1):
  a=math.pi+i*math.pi/12;profile.append((r+(r-t)*math.cos(a),r+(r-t)*math.sin(a)))
 profile.append((t,h))
 o=sheet(name,[(x+sign*a,b) for a,b in profile],1,depth)
 o.location.y=.008+depth/2
 for p in o.data.polygons:p.material_index=2
 return o

metrics={}
for variant,h,d in [('header',1.20,.07),('floor',3.0,.85)]:
 start=len(parts)
 for sign in [-1,1]:
  x=sign*.43
  # Front glue flange joins the cutout; triangular web opens toward the rear.
  web=sheet(variant+('_Left' if sign<0 else '_Right')+'_EaselWeb',[(.008,.014),(.008,h),(.008+d,.014)],0)
  web.location.x=x
  # Locking bridge passes through a real punched slot in each web.
  locky=.008+d*.32;lockz=h*.18
  slot(web,(x,locky,lockz),(.04,d*.12,.016))
  flap=sheet(variant+f'_GlueFlange_{sign}',[(x-.047,.02),(x+.047,.02),(x+.047,h*.94),(x-.047,h*.94)],1,.006)
  flap.location.y=.009
  fold(variant+f'_ScoredFoot_{sign}',x,d,.055,sign)
 # Die-cut bar with narrow protruding tongues and shoulders; no floating decal.
 poly=[(-.49,locky-d*.055),(-.415,locky-d*.055),(-.415,locky-d*.085),(.415,locky-d*.085),(.415,locky-d*.055),(.49,locky-d*.055),(.49,locky+d*.055),(.415,locky+d*.055),(.415,locky+d*.085),(-.415,locky+d*.085),(-.415,locky+d*.055),(-.49,locky+d*.055)]
 bar=sheet(variant+'_ShoulderedLockingBridge',poly,2,.009);bar.location.z=lockz
 # Exposed corrugation visible between thin liners at the rear foot edge.
 # One welded zig-zag ribbon per foot, not hundreds of disconnected cylinders.
 for sign in [-1,1]:
  x=sign*.43;verts=[];faces=[]
  for i in range(25):
   xx=x+sign*(.023+i*.12/24);zz=.002 if i%2==0 else .006
   verts.extend([(xx,.008+d-.002,zz),(xx,.008+d,zz),(xx,.008+d,zz+.001),(xx,.008+d-.002,zz+.001)])
  for i in range(24):
   for j in range(4):faces.append((i*4+j,i*4+(j+1)%4,(i+1)*4+(j+1)%4,(i+1)*4+j))
  faces.extend([(3,2,1,0),(96,97,98,99)])
  flute=mesh(variant+f'_ExposedFootFlute_{sign}',verts,faces)
  for p in flute.data.polygons:p.material_index=1
 selected=parts[start:];rows=[]
 for o in selected:
  bpy.ops.object.select_all(action='DESELECT');o.select_set(True);bpy.context.view_layer.objects.active=o
  bm=bmesh.new();bm.from_mesh(o.data);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));assert all(e.is_manifold for e in bm.edges),o.name
  bm.to_mesh(o.data);bm.free()
  bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT');bpy.ops.uv.smart_project(island_margin=.025);bpy.ops.object.mode_set(mode='OBJECT')
  o.data.calc_loop_triangles();o['construction']='Original generic design; rear joinery not evidenced by 1990 photograph'
  rows.append({'name':o.name,'triangles':len(o.data.loop_triangles),'manifold':True,'uv':True})
 bpy.ops.object.select_all(action='DESELECT')
 for o in selected:o.select_set(True)
 path=ROOT/f'public/models/standee-support-{variant}.glb'
 bpy.ops.export_scene.gltf(filepath=str(path),export_format='GLB',use_selection=True,export_extras=True)
 metrics[variant]={'parts':rows,'triangles':sum(r['triangles'] for r in rows),'bytes':path.stat().st_size}
 collection=bpy.data.collections.new(variant.title()+' construction');scene.collection.children.link(collection)
 for o in selected:
  scene.collection.objects.unlink(o);collection.objects.link(o)
  if variant=='floor':o.hide_set(True);o.hide_render=True
scene.render.engine='CYCLES';scene.cycles.samples=24;scene.render.film_transparent=True
scene.render.resolution_x=900;scene.render.resolution_y=900;scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG';scene.render.image_settings.color_mode='RGBA'
scene.world.color=(.3,.3,.3)
for pos,power in [((2,-3,4),250),((-2,2,3),200)]:
 bpy.ops.object.light_add(type='AREA',location=pos);o=bpy.context.object;o.data.energy=power;o.data.size=3;o.rotation_euler=(Vector((0,0,.6))-o.location).to_track_quat('-Z','Y').to_euler()
bpy.ops.object.camera_add(location=(2,3,2));camera=bpy.context.object;scene.camera=camera;camera.data.type='ORTHO';camera.data.ortho_scale=1.7
camera.rotation_euler=(Vector((0,0,.6))-camera.location).to_track_quat('-Z','Y').to_euler()
for area in bpy.context.screen.areas:
 if area.type=='VIEW_3D':
  area.spaces.active.region_3d.view_distance=2.5;area.spaces.active.region_3d.view_location=(0,0,.6)
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'tools/models/standee-support.blend'))
(ROOT/'tools/models/standee-support-metrics.json').write_text(json.dumps(metrics,indent=2)+'\n')
