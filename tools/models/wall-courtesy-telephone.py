"""Original generic wall phone; feet, Blender (x,-store_z,height).
Reuses #178's authored handset mesh; no external artwork or exact period claim.
blender -b -t 2 -P tools/models/wall-courtesy-telephone.py
"""
import bpy, bmesh, math, json
import numpy as np
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[2]
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
bpy.context.preferences.filepaths.save_version=0
# Shared fine molded-grain normal and roughness images, embedded in both deliveries.
n=128;rng=np.random.default_rng(191);h=rng.random((n,n));dy,dx=np.gradient(h)
def image(name,rgb):
 im=bpy.data.images.new(name,width=n,height=n);im.colorspace_settings.name='Non-Color';a=np.ones((n,n,4),dtype=np.float32);a[:,:,:3]=rgb;im.pixels.foreach_set(a.ravel());im.pack();return im
normal=image('Telephone_molded_micrograin',np.stack((.5+dx*.13,.5+dy*.13,np.ones_like(h)),2))
rough=image('Telephone_satin_variation',np.repeat((.86+.14*h)[:,:,None],3,2))
mats={}
for role,c,r,metal in [('Housing',(.68,.61,.46),.43,0),('Handset',(.62,.55,.40),.34,0),('Keys',(.55,.51,.41),.46,0),('Rubber',(.10,.09,.08),.82,0),('Hardware',(.52,.54,.56),.3,.8),('Legend',(.09,.085,.08),.55,0)]:
 m=bpy.data.materials.new('Phone'+role);m.diffuse_color=(*c,1);m.use_nodes=True;p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*c,1);p.inputs['Roughness'].default_value=r;p.inputs['Metallic'].default_value=metal
 ns=m.node_tree.nodes;ls=m.node_tree.links;t=ns.new('ShaderNodeTexImage');t.image=normal;nm=ns.new('ShaderNodeNormalMap');nm.inputs['Strength'].default_value=.35;ls.new(t.outputs['Color'],nm.inputs['Color']);ls.new(nm.outputs['Normal'],p.inputs['Normal'])
 t=ns.new('ShaderNodeTexImage');t.image=rough;mult=ns.new('ShaderNodeMath');mult.operation='MULTIPLY';mult.inputs[1].default_value=r;ls.new(t.outputs['Color'],mult.inputs[0]);ls.new(mult.outputs[0],p.inputs['Roughness']);mats[role]=m
parts=[]
def mesh(name,vs,fs,role):
 me=bpy.data.meshes.new(name);me.from_pydata([(x,-z,y) for x,y,z in vs],[],fs);me.update();o=bpy.data.objects.new(name,me);bpy.context.collection.objects.link(o);me.materials.append(mats[role]);parts.append(o);return o
def profile(w,h,r):
 return [(cx+r*math.cos(a+j*math.pi/8),cy+r*math.sin(a+j*math.pi/8)) for cx,cy,a in [(w/2-r,h/2-r,0),(-w/2+r,h/2-r,math.pi/2),(-w/2+r,-h/2+r,math.pi),(w/2-r,-h/2+r,3*math.pi/2)] for j in range(5)]
def shell(name,w,h,z0,z1,c=(0,0),role='Housing',r=.035):
 sections=[(z0,profile(w-.008,h-.008,r)),(z0+.005,profile(w,h,r)),(z1-.005,profile(w,h,r)),(z1,profile(w-.008,h-.008,r))];N=len(sections[0][1]);vs=[(x+c[0],y+c[1],z) for z,p in sections for x,y in p];fs=[(k*N+j,k*N+(j+1)%N,(k+1)*N+(j+1)%N,(k+1)*N+j) for k in range(3) for j in range(N)];fs += [tuple(reversed(range(N))),tuple(3*N+j for j in range(N))];return mesh(name,vs,fs,role)
backplate=shell('Wall_backplate',.53,1.02,0,.025,role='Hardware')
shell('Lower_shell',.57,.94,.025,.105)
shell('Recessed_perimeter_seam',.555,.925,.105,.112,role='Rubber')
shell('Upper_shell',.57,.94,.112,.18)
# Reuse the actual swept receiver authored for #178, turned vertically and scaled
# to a 9.18-inch wall handset. Its underside seats against two cradle saddles.
with bpy.data.libraries.load(str(ROOT/'tools/models/counter-telephone.blend'),link=False) as (src,dst):dst.objects=[n for n in src.objects if n.startswith('Continuous curved handset')]
o=dst.objects[0];bpy.context.collection.objects.link(o);o.name='Handset_shared_178';o.data.materials.clear();o.data.materials.append(mats['Handset'])
for v in o.data.vertices:
 x,y,z=v.co;v.co=(-.16+(y-.103)*1.5,-(.22+(z-.17)*1.5),x*1.5)
parts.append(o)
for y in [-.29,.29]:shell('Cradle_saddle_'+str(y),.16,.09,.18,.235,(-.16,y))
shell('Hook_switch',.035,.06,.215,.242,(-.16,.31),role='Keys',r=.009)
shell('Keypad_recess',.245,.37,.18,.187,(.145,-.04),role='Rubber',r=.018)
for row in range(4):
 for col in range(3):
  x=.067+col*.077;y=.08-row*.08
  shell('Key_'+str(row*3+col),.061,.059,.187,.209,(x,y),role='Keys',r=.011)
  cu=bpy.data.curves.new('Dial legend','FONT');cu.body='123456789*0#'[row*3+col];cu.resolution_u=2;cu.size=.042;cu.align_x='CENTER';cu.align_y='CENTER';cu.extrude=.0003
  ob=bpy.data.objects.new('Legend_'+cu.body,cu);bpy.context.collection.objects.link(ob);ob.location=(x,-.211,y);ob.rotation_euler=(math.pi/2,0,0);cu.materials.append(mats['Legend']);bpy.context.view_layer.objects.active=ob;ob.select_set(True);bpy.ops.object.convert(target='MESH');ob.select_set(False);parts.append(ob)
# Recessed slotted fixings on face and two keyed wall-mount sockets on rear.
for y in [-.425,.425]:
 shell('Fixing_washer_'+str(y),.065,.06,.18,.185,(.15,y),role='Hardware',r=.024)
 shell('Screw_slot_'+str(y),.041,.010,.185,.191,(.15,y),role='Rubber',r=.003)
 cutter=shell('Rear_socket_cutter',.055,.075,-.01,.018,(0,y),role='Rubber',r=.015)
 bpy.context.view_layer.objects.active=backplate;mod=backplate.modifiers.new('Recessed wall fixing socket','BOOLEAN');mod.object=cutter;mod.operation='DIFFERENCE';bpy.ops.object.modifier_apply(modifier=mod.name);parts.remove(cutter);bpy.data.objects.remove(cutter,do_unlink=True)
 shell('Rear_mount_socket_'+str(y),.05,.07,.014,.022,(0,y),role='Rubber',r=.014)
# Long 32-turn U-hanging cord, continuous tapered ends and capped swept tube.
start=Vector((-.16,-.37,.26));end=Vector((.20,-.46,.12));pts=[]
control=Vector((.04,-2.1,.21))
for i in range(513):
 t=i/512;p=(1-t)**2*start+2*t*(1-t)*control+t*t*end;tan=(2*(1-t)*(control-start)+2*t*(end-control)).normalized();a=Vector((0,0,1)).cross(tan).normalized();b=tan.cross(a);rad=.026*min(1,t/.06,(1-t)/.06);p+=rad*(math.cos(t*math.tau*32)*a+math.sin(t*math.tau*32)*b);pts.append(p)
vs=[];fs=[]
for i,p in enumerate(pts):
 tan=(pts[min(i+1,512)]-pts[max(i-1,0)]).normalized();a=Vector((0,0,1)).cross(tan).normalized();b=tan.cross(a)
 for j in range(6):vs.append(tuple(p+.006*(math.cos(j*math.tau/6)*a+math.sin(j*math.tau/6)*b)))
for i in range(512):
 for j in range(6):fs.append((i*6+j,i*6+(j+1)%6,(i+1)*6+(j+1)%6,(i+1)*6+j))
fs += [tuple(reversed(range(6))),tuple(512*6+j for j in range(6))]
cord=mesh('Continuous_32_turn_cord',vs,fs,'Rubber')
for label,p in [('Handset_cord_socket',start),('Base_cord_socket',end)]:
 shell(label,.033,.055,p.z-.012,p.z+.012,(p.x,p.y),role='Rubber',r=.01)
for name,p in [('Mount_wall',(0,0,0)),('Connector_handset',start),('Connector_base',end)]:
 ob=bpy.data.objects.new(name,None);bpy.context.collection.objects.link(ob);ob.location=(p[0],-p[2],p[1]);ob.empty_display_size=.035
closed=0
for ob in parts:
 # Boolean socket walls belong to the mounting plate finish, not the cutter.
 ma=ob.data.materials[0];ob.data.materials.clear();ob.data.materials.append(ma)
 for face in ob.data.polygons:face.material_index=0
 bpy.ops.object.select_all(action='DESELECT');ob.select_set(True);bpy.context.view_layer.objects.active=ob
 bm=bmesh.new();bm.from_mesh(ob.data);bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=1e-7);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces))
 if not ob.name.startswith('Legend'):assert all(e.is_manifold for e in bm.edges),ob.name;closed+=1
 bm.to_mesh(ob.data);bm.free();bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT');bpy.ops.uv.smart_project(island_margin=.015);bpy.ops.object.mode_set(mode='OBJECT')
 if ob==cord or ob.name.startswith('Handset_shared'):
  for p in ob.data.polygons:p.use_smooth=True
 ob['units']='feet';ob['material_role']=ob.data.materials[0].name
scene=bpy.context.scene;scene['provenance']='Original generic #191 design, #178 shared handset. Archive walkthrough unavailable; dimensions estimated. No external art.';scene.unit_settings.system='IMPERIAL';scene.unit_settings.scale_length=.3048
for area in bpy.context.screen.areas:
 if area.type=='VIEW_3D':area.spaces.active.region_3d.view_distance=2.5;area.spaces.active.region_3d.view_location=(0,-.1,-.35)
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'tools/models/wall-courtesy-telephone.blend'))
# Six runtime batches; editable source retains the physical component names.
batches={role:[o for o in parts if o.data.materials[0]==ma] for role,ma in mats.items()}
for role,obs in batches.items():
 bpy.ops.object.select_all(action='DESELECT')
 for o in obs:o.select_set(True)
 bpy.context.view_layer.objects.active=obs[0];bpy.ops.object.join();bpy.context.object.name='WallTelephone_'+role
out=ROOT/'public/models/wall-courtesy-telephone.glb';bpy.ops.export_scene.gltf(filepath=str(out),export_format='GLB',export_apply=True,export_yup=True)
tri=0;points=[]
for ob in scene.objects:
 if ob.type=='MESH':ob.data.calc_loop_triangles();tri+=len(ob.data.loop_triangles);points += [ob.matrix_world@v.co for v in ob.data.vertices]
metrics={'triangles':tri,'materials':len(mats),'draws':len(mats),'bytes':out.stat().st_size,'source_closed_parts':closed,'bounds_runtime':{'min':[min(p.x for p in points),min(p.z for p in points),min(-p.y for p in points)],'max':[max(p.x for p in points),max(p.z for p in points),max(-p.y for p in points)]},'textures':'128-square normal + exporter-packed metallic/roughness per finish','units':'feet'}
out.with_suffix('.json').write_text(json.dumps(metrics,indent=2)+'\n');print(metrics)
