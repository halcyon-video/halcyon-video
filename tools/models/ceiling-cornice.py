"""Original Halcyon cornice section; Blender scripted mesh authoring, feet.
Run blender -b -t 2 --python tools/models/ceiling-cornice.py.
X is a one-foot span, store Y is height, store Z points toward the sales floor.
Open mating faces are intentional; separate finished caps serve exposed ends.
"""
from pathlib import Path
import math, json
import bpy, bmesh
ROOT=Path(__file__).resolve().parents[2]
bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
roles=[]
for name,col,metal,rough in [('CorniceFascia',(.62,.66,.70,1),1,.23),('CorniceLedge',(.76,.79,.82,1),1,.18),('MirrorSeat',(.08,.09,.10,1),.35,.48)]:
 m=bpy.data.materials.new(name);m.use_nodes=True;m.diffuse_color=col
 p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=col;p.inputs['Metallic'].default_value=metal;p.inputs['Roughness'].default_value=rough;roles.append(m)
# Rolled nose, recessed mirror bed, bottom drainage reveal and eased rear edge.
h=2.3; tilt=math.radians(14); top=-1.35+h/2*math.cos(tilt); bottom=-1.35-h/2*math.cos(tilt); spread=h*math.sin(tilt)
profile=[(-1.8,-.04,0),(-1.8,-2.65,0),(-1.75,-2.7,1),(.025,-2.7,1),(.065,-2.67,1),(.075,-2.62,1),(.06,-2.575,1),(.025,-2.55,2),(.025,bottom-.02,1),(0,bottom,2),(spread,top,1),(spread+.025,top+.025,1),(.62,-.17,1),(.62,-.12,1),(.59,-.065,1),(.54,-.04,0)]
verts=[(x,-d,y) for x in [0,1] for d,y,_ in profile]; n=len(profile)
faces=[(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)]
mesh=bpy.data.meshes.new('Rolled_section');mesh.from_pydata(verts,[],faces);mesh.update()
obj=bpy.data.objects.new('Cornice_span',mesh);bpy.context.collection.objects.link(obj)
for m in roles:mesh.materials.append(m)
uv=mesh.uv_layers.new(name='ProfileFeet');v=0
for i,p in enumerate(mesh.polygons):
 p.material_index=profile[i][2]
 d0,y0,_=profile[i];d1,y1,_=profile[(i+1)%n];v1=v+math.hypot(d1-d0,y1-y0)
 for li,co in zip(p.loop_indices,[(0,v),(0,v1),(1,v1),(1,v)]):uv.data[li].uv=co
 v=v1
bm=bmesh.new();bm.from_mesh(mesh);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(mesh);bm.free()
obj['units']='feet';obj['span_axis']='X';obj['mirror_height']=h;obj['mirror_tilt_degrees']=14
obj['mating_faces']='Open endpoints fitted to shared mitre planes at runtime'
# Finished caps retained in the editable source; closed outline is triangulated by Blender.
for end in [0,1]:
 cap=bpy.data.meshes.new('Finished_end');cap.from_pydata([(end,-d,y) for d,y,_ in profile],[],[tuple(range(n)) if end else tuple(reversed(range(n)))]);cap.materials.append(roles[0]);cap.uv_layers.new(name='EndFeet')
 ob=bpy.data.objects.new('Finished_end_'+str(end),cap);bpy.context.collection.objects.link(ob)
 ob.hide_render=True;ob.hide_set(True)
bpy.ops.object.select_all(action='DESELECT');obj.select_set(True);bpy.context.view_layer.objects.active=obj
out=ROOT/'public/models/ceiling-cornice.glb';bpy.ops.export_scene.gltf(filepath=str(out),export_format='GLB',use_selection=True,export_extras=True,export_yup=True)
bpy.context.scene.unit_settings.system='IMPERIAL';bpy.context.scene.unit_settings.scale_length=.3048
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'tools/models/ceiling-cornice.blend'))
print(json.dumps({'span_triangles':len(faces)*2,'profile_vertices':n,'materials':len(roles),'bytes':out.stat().st_size,'bounds_feet':[[0,-2.7,-1.8],[1,-.04,.62]]}))
