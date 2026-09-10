"""Original Halcyon hollow blow-molded pumpkin. Feet; Blender Z -> glTF Y.
Reproduce: blender -b -t 2 --python tools/models/halloween-pumpkin.py
"""
import bpy, bmesh, math, json
from pathlib import Path
ROOT = Path(__file__).resolve().parents[2]
bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
def material(name, color):
    m=bpy.data.materials.new(name); m.diffuse_color=(*color,1); m.use_nodes=True
    p=m.node_tree.nodes.get('Principled BSDF'); p.inputs['Base Color'].default_value=(*color,1); p.inputs['Roughness'].default_value=.36
    return m
orange=material('PumpkinMoldedOrange',(.65,.17,.025)); green=material('PumpkinStem',(.12,.18,.035))
def revolve(name, profile, mat, ribs=False, sides=64):
    v=[]; f=[]
    for r,z in profile:
        for j in range(sides):
            a=j*math.tau/sides
            # Eight deliberate lobes; slightly raised parting seam in mold plane.
            seam=.006*max(0,1-abs(math.sin(a))*25) if ribs else 0
            rr=r*(1+.09*math.cos(8*a))+seam if ribs else r
            v.append((rr*math.cos(a),rr*math.sin(a),z))
    for i in range(len(profile)):
        n=(i+1)%len(profile)
        for j in range(sides):
            k=(j+1)%sides; f.append((i*sides+j,i*sides+k,n*sides+k,n*sides+j))
    mesh=bpy.data.meshes.new(name); mesh.from_pydata(v,[],f); mesh.update()
    o=bpy.data.objects.new(name,mesh); bpy.context.collection.objects.link(o); mesh.materials.append(mat)
    bm=bmesh.new(); bm.from_mesh(mesh); bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces))
    assert all(e.is_manifold for e in bm.edges); assert bm.calc_volume()>0
    bm.to_mesh(mesh); bm.free()
    for p in mesh.polygons:p.use_smooth=True
    bpy.context.view_layer.objects.active=o; o.select_set(True)
    bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT'); bpy.ops.uv.smart_project(island_margin=.02); bpy.ops.object.mode_set(mode='OBJECT'); o.select_set(False)
    return o
# Closed shell wall with an open underside access aperture, flat annular foot,
# inner return and a small stem socket. No unseen solid sphere inside.
outer=[(.16,0),(.32,0),(.46,.08),(.56,.22),(.61,.43),(.59,.66),(.50,.86),(.34,1.00),(.13,1.025),(.08,1.01)]
inner=[(.08,.985),(.13,1.0),(.33,.975),(.48,.84),(.565,.65),(.585,.43),(.535,.23),(.44,.105),(.30,.025),(.16,.025)]
revolve('Hollow ribbed shell with mold seam and flat foot',outer+inner,orange)
# apply lobes on shell only
shell=bpy.context.collection.objects[0]
for v in shell.data.vertices:
    a=math.atan2(v.co.y,v.co.x); factor=1+.09*math.cos(8*a)
    v.co.x*=factor; v.co.y*=factor
    r=math.hypot(v.co.x,v.co.y)
    if r>.2:
        delta=.006*max(0,1-abs(math.sin(a))*25)
        v.co.x+=delta*math.cos(a); v.co.y+=delta*math.sin(a)
revolve('Socket fitted tapered stem',[(.025,.985),(.08,.985),(.085,1.025),(.06,1.10),(.043,1.23),(.025,1.24)],green,sides=16)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'tools/models/halloween-pumpkin.blend'))
out=ROOT/'public/models/halloween-pumpkin.glb'
bpy.ops.export_scene.gltf(filepath=str(out),export_format='GLB',use_selection=True,export_yup=True)
metrics={'bytes':out.stat().st_size,'triangles':sum(sum(len(p.vertices)-2 for p in o.data.polygons) for o in bpy.context.selected_objects),'materials':2,'dimensions_ft':[1.34,1.24,1.34]}
(ROOT/'tools/models/halloween-pumpkin-metrics.json').write_text(json.dumps(metrics,indent=2)+'\n')
print(metrics)
