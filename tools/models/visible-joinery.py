"""Original exposed joinery fitted to the store's existing anchors. Units: feet.
Blender X,-Z,Y exports store X,Y,Z. No concealed cabinet or light hardware.
"""
import bpy, bmesh, json, struct, math
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
bpy.context.preferences.filepaths.save_version=0
mat=bpy.data.materials.new('ReplaceableFinish');mat.diffuse_color=(.33,.36,.39,1)
mat.use_nodes=True;mat.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value=.55
parts=[]
def mesh(name,verts,faces,bevel=0):
 me=bpy.data.meshes.new(name);me.from_pydata([(x,-z,y) for x,y,z in verts],[],faces);me.update()
 ob=bpy.data.objects.new(name,me);bpy.context.collection.objects.link(ob);me.materials.append(mat)
 bpy.ops.object.select_all(action='DESELECT');ob.select_set(True);bpy.context.view_layer.objects.active=ob
 bm=bmesh.new();bm.from_mesh(me);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(me);bm.free()
 if bevel:
  mod=ob.modifiers.new('Visible edge easing','BEVEL');mod.width=bevel;mod.segments=2;bpy.ops.object.modifier_apply(modifier=mod.name)
 bm=bmesh.new();bm.from_mesh(ob.data);assert all(e.is_manifold for e in bm.edges),name;assert bm.calc_volume(signed=True)>0,name;bm.free()
 bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT');bpy.ops.uv.smart_project(island_margin=.01);bpy.ops.object.mode_set(mode='OBJECT')
 parts.append(ob);return ob
def prism(name,section,length,axis='x',bevel=0):
 v=[]
 for end in [-length/2,length/2]:
  v += [(end,a,b) if axis=='x' else (a,end,b) for a,b in section]
 n=len(section);f=[tuple(reversed(range(n))),tuple(range(n,2*n))]
 f += [(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)]
 return mesh(name,v,f,bevel)
def panel(name,w,h,d,x=0,y=0,z=0,bevel=.006):
 v=[(x+sx*w/2,y+sy*h/2,z+sz*d/2) for sx,sy,sz in [(-1,-1,-1),(1,-1,-1),(1,1,-1),(-1,1,-1),(-1,-1,1),(1,-1,1),(1,1,1),(-1,1,1)]]
 return mesh(name,v,[(3,2,1,0),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)],bevel)
# Rubber cove base: vertical face rolls into a narrow floor toe. Back seats flat.
prism('Baseboard',[(-.15,-.02),(.15,-.02),(.15,.006),(.143,.011),(-.11,.011),(-.128,.014),(-.14,.02),(-.15,.02)],1)
# Sill cap with a visibly eased front drip edge, not a rectangular strip.
prism('SillCap',[(-.06,-.20),(.052,-.20),(.06,-.188),(.06,.188),(.052,.20),(-.038,.20),(-.06,.17)],1)
# Exposed glazing stop on each side of the frame; internal aluminum webs omitted.
section=[(-.10,-.15),(.10,-.15),(.10,.15),(.066,.15),(.060,.126),(-.060,.126),(-.066,.15),(-.10,.15)]
prism('WindowVertical',section,1,'y',.002)
prism('WindowHorizontal',section,1,'x',.002)
# Reusable eased solid panel for visible stand shelves and column bands.
panel('FinishedPanel',1,1,1,bevel=.006)
# A complete fitted open stand. Shelves butt between sides; top rests above them.
start=len(parts)
panel('StandTop',3.2,.14,1.8,y=1.53,bevel=.012)
panel('StandBottom',2.92,.16,1.8,y=.08)
panel('StandSideL',.14,1.46,1.8,x=-1.53,y=.73)
panel('StandSideR',.14,1.46,1.8,x=1.53,y=.73)
panel('StandShelf',2.92,.08,1.6,y=.62,bevel=.004)
standparts=parts[start:]
# Door frames are single welded rings with the existing glazing opening and pivot.
def frame(name,w,h,single):
 margin=.05 if single else .10;left=-w/2+margin;right=w/2-margin
 bottom=.04 if single else .055;top=h-.02;stile=.15 if single else .12;kick=.28 if single else .24
 outer=[(left,bottom),(right,bottom),(right,top),(left,top)]
 inner=[(left+stile,bottom+kick),(right-stile,bottom+kick),(right-stile,top-.16),(left+stile,top-.16)]
 v=[(x,y,z) for z in [-.0575,.0575] for loop in [outer,inner] for x,y in loop];f=[]
 for i in range(4):
  j=(i+1)%4;f.extend([(i,j,8+j,8+i),(4+j,4+i,12+i,12+j),(j,i,4+i,4+j),(8+i,8+j,12+j,12+i)])
 return mesh(name,v,f,.004)
frame('DoubleDoorLeaf',3.2,7,False);frame('SingleDoorLeaf',3.2,7,True)
# Cast horizontal bar with continuous returns. Visible silhouette only.
prism('DoorPushBar',[(-1.45,0),(-1.45,.185),(1.45,.185),(1.45,0),(1.35,0),(1.35,.085),(-1.35,.085),(-1.35,0)],.24,'y',.004)
scene=bpy.context.scene;scene.unit_settings.system='IMPERIAL';scene.unit_settings.scale_length=.3048
for area in bpy.context.screen.areas:
 if area.type=='VIEW_3D':area.spaces.active.region_3d.view_distance=5
for ob in parts: ob.hide_set(ob not in standparts)
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'tools/models/visible-joinery.blend'))
for ob in parts: ob.hide_set(False)
# Merge the stand for one runtime draw; named editable physical parts stay above.
bpy.ops.object.select_all(action='DESELECT')
for ob in standparts:ob.select_set(True)
bpy.context.view_layer.objects.active=standparts[0];bpy.ops.object.join();standparts[0].name='TelevisionStand'
bpy.ops.object.select_all(action='SELECT')
path=ROOT/'public/models/visible-joinery.glb'
bpy.ops.export_scene.gltf(filepath=str(path),export_format='GLB',export_extras=True,use_selection=True)
b=path.read_bytes();j=json.loads(b[20:20+struct.unpack_from('<I',b,12)[0]])
metrics={'bytes':len(b),'triangles':sum(j['accessors'][p['indices']]['count']//3 for m in j['meshes'] for p in m['primitives']),'parts':[n['name'] for n in j['nodes'] if 'mesh' in n],'units':'feet','hiddenConstruction':False}
(ROOT/'tools/models/visible-joinery-metrics.json').write_text(json.dumps(metrics,indent=2)+'\n');print(metrics)
