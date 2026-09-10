"""Original generic corded phone. Blender scripted mesh authoring; no external art.
blender -b -t 2 --python tools/models/counter-telephone.py
Feet; store X right, Y up, Z toward controls; Blender (x,-z,y).
"""
import bpy, bmesh, math, json
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[2]

def build(out, source):
 bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
 bpy.context.preferences.filepaths.save_version=0
 mats={}
 for name,color in [('Housing',(.68,.61,.46,1)),('Handset',(.62,.55,.40,1)),('Keys',(.35,.32,.25,1)),('Rubber',(.065,.06,.05,1)),('Legend',(.88,.85,.74,1))]:
  m=bpy.data.materials.new('Phone'+name);m.diffuse_color=color;m.use_nodes=True
  m.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value=color
  m.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value=.58
  mats[name]=m
 def mesh(name,vs,fs,role):
  me=bpy.data.meshes.new(name);me.from_pydata([(x,-z,y) for x,y,z in vs],[],fs);me.update()
  o=bpy.data.objects.new(name,me);bpy.context.collection.objects.link(o);me.materials.append(mats[role]);return o
 def rounded(w,d,r):
  return [(cx+r*math.cos(a+j*math.pi/4),cz+r*math.sin(a+j*math.pi/4)) for cx,cz,a in [(w/2-r,d/2-r,0),(-w/2+r,d/2-r,math.pi/2),(-w/2+r,-d/2+r,math.pi),(w/2-r,-d/2+r,3*math.pi/2)] for j in range(3)]
 def rings(name,sections,role,c=(0,0,0),slope=0):
  n=len(sections[0][1]);vs=[(x+c[0],y+c[1]+slope*z,z+c[2]) for y,pr in sections for x,z in pr]
  fs=[(k*n+i,k*n+(i+1)%n,(k+1)*n+(i+1)%n,(k+1)*n+i) for k in range(len(sections)-1) for i in range(n)]
  fs += [tuple(reversed(range(n))),tuple((len(sections)-1)*n+i for i in range(n))]
  return mesh(name,vs,fs,role)
 def pad(name,w,d,h,c,role='Housing',slope=0):
  r=min(w,d)*.16
  return rings(name,[(0,rounded(w-.004,d-.004,r)),(.003,rounded(w,d,r)),(h-.003,rounded(w,d,r)),(h,rounded(w-.006,d-.006,r))],role,c,slope)
 # Original dimensions retain the old placement envelope.
 w,d=.55,.40
 slope=-.18
 def deck(z):return .13+slope*z
 rings('Lower shell and recessed perimeter seam',[(.012,rounded(w-.025,d-.025,.04)),(.025,rounded(w,d,.045)),(.046,rounded(w,d,.045))],'Housing')
 # fitted sloping deck; boolean pockets cut through the top into actual wells
 shell=rings('Sloped upper housing',[(.048,rounded(w-.006,d-.006,.044)),(.13,rounded(w-.006,d-.006,.044))],'Housing',slope=slope)
 def pocket(name,x,z,pw,pd):
  cutter=pad(name+' cutter',pw,pd,.07,(x,deck(z)-.018,z),slope=slope)
  bpy.context.view_layer.objects.active=shell
  mod=shell.modifiers.new(name,'BOOLEAN');mod.operation='DIFFERENCE';mod.object=cutter
  bpy.ops.object.modifier_apply(modifier=mod.name);bpy.data.objects.remove(cutter,do_unlink=True)
  pad(name+' well floor',pw-.006,pd-.006,.006,(x,deck(z)-.017,z),'Rubber',slope)
 # Handset rests across the rear of the base.
 hx,hz=0,-.103
 for q in [-.175,.175]:
  x,z=(hx+q,hz)
  pad('Cradle saddle',.105,.13,.03,(x,deck(z),z),'Housing',slope)
 # Swept, changing cross-sections form one curved solid, including both cups.
 vs=[];fs=[];n=12
 for q,width,height,cy in [(-.255,.05,.024,.027),(-.244,.070,.040,.030),(-.18,.069,.039,.035),(-.13,.050,.032,.060),(-.08,.038,.025,.075),(.08,.038,.025,.075),(.13,.050,.032,.060),(.18,.069,.039,.035),(.244,.070,.040,.030),(.255,.05,.024,.027)]:
  for j in range(n):
   a=j*math.tau/n;u=width*math.cos(a);v=height*math.sin(a)
   x,z=(hx+q,hz+u)
   vs.append((x,deck(z)+.03+cy+v,z))
 for k in range(9):
  for j in range(n):fs.append((k*n+j,k*n+(j+1)%n,(k+1)*n+(j+1)%n,(k+1)*n+j))
 fs += [tuple(reversed(range(n))),tuple(9*n+j for j in range(n))]
 handset=mesh('Continuous curved handset with receiver cups',vs,fs,'Handset')
 # Twelve keys with individually recessed sockets; texture-free materials.
 for row in range(4):
  for col in range(3):
   x=(-.025)+col*.059;z=(.015)+row*.041
   pocket('Key socket %d%d'%(row,col),x,z,.05,.034)
   pad('Dial key %d%d'%(row,col),.042,.026,.016,(x,deck(z)-.01,z),'Keys',slope)
 for x in [-.20,.20]:
  for z in [-.14,.14]:pad('Non-slip foot',.06,.055,.013,(x,0,z),'Rubber')
 # Continuous cable centerline with zero-amplitude tails, so the helix joins
 # the two sockets exactly instead of ending one coil radius away.
 start=Vector((-.25,deck(-.103)+.06,-.103))
 end=Vector((-.273,.061,.10))
 control=Vector((-.43,.018,-.12))
 pts=[]
 for i in range(209):
  t=i/208;p=(1-t)**2*start+2*t*(1-t)*control+t*t*end
  tangent=(2*(1-t)*(control-start)+2*t*(end-control)).normalized()
  side=Vector((0,1,0)).cross(tangent).normalized();up=tangent.cross(side).normalized()
  r=.014*min(1,t/.10,(1-t)/.10);angle=t*math.tau*13
  pts.append(p+r*(math.cos(angle)*side+math.sin(angle)*up))
 vs=[];fs=[]
 for i,p in enumerate(pts):
  t=(pts[min(i+1,208)]-pts[max(i-1,0)]).normalized();a=Vector((0,1,0)).cross(t).normalized();b=t.cross(a).normalized()
  for j in range(6):vs.append(tuple(p+.0045*(math.cos(j*math.tau/6)*a+math.sin(j*math.tau/6)*b)))
 for i in range(208):
  for j in range(6):fs.append((i*6+j,i*6+(j+1)%6,(i+1)*6+(j+1)%6,(i+1)*6+j))
 fs += [tuple(reversed(range(6))),tuple(208*6+j for j in range(6))]
 mesh('Continuous 13 turn handset cord',vs,fs,'Rubber')
 for label,p in [('Handset strain relief',start),('Base strain relief',end)]:
  pad(label,.03,.027,.025,(p.x,p.y-.0125,p.z),'Rubber')
 for ob in list(bpy.context.scene.objects):
  if ob.type!='MESH':continue
  bm=bmesh.new();bm.from_mesh(ob.data);bmesh.ops.remove_doubles(bm,verts=bm.verts,dist=.0000001);bmesh.ops.recalc_face_normals(bm,faces=bm.faces)
  assert all(e.is_manifold for e in bm.edges),ob.name
  bm.to_mesh(ob.data);bm.free()
  if ob.name.startswith('Continuous'):
   for face in ob.data.polygons:face.use_smooth=True
  bpy.context.view_layer.objects.active=ob;ob.select_set(True)
  bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT');bpy.ops.uv.smart_project(island_margin=.02);bpy.ops.object.mode_set(mode='OBJECT');ob.select_set(False)
  ob['units']='feet';ob['static']=True
  mod=ob.modifiers.new('Triangulated export','TRIANGULATE')
 for area in bpy.context.screen.areas:
  if area.type=='VIEW_3D':area.spaces.active.region_3d.view_distance=1.25;area.spaces.active.region_3d.view_location=(0,0,.12)
 source.parent.mkdir(parents=True,exist_ok=True);out.parent.mkdir(parents=True,exist_ok=True)
 bpy.ops.wm.save_as_mainfile(filepath=str(source))
 bpy.ops.object.select_all(action='SELECT');bpy.context.view_layer.objects.active=shell;bpy.ops.object.convert(target='MESH');bpy.ops.object.join();bpy.context.object.name='Corded telephone assembly'
 bpy.ops.export_scene.gltf(filepath=str(out),export_format='GLB',export_apply=True,export_yup=True)
 ob=bpy.context.object;ob.data.calc_loop_triangles()
 metrics={'triangles':len(ob.data.loop_triangles),'materials':len(ob.data.materials),'bytes':out.stat().st_size,'dimensions_blender':list(ob.dimensions),'textures':0}
 print('PHONE_METRICS',json.dumps(metrics));out.with_suffix('.json').write_text(json.dumps(metrics,indent=2)+'\n')
if __name__=='__main__':build(ROOT/'public/models/counter-telephone.glb',ROOT/'tools/models/counter-telephone.blend')
