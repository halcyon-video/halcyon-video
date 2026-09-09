"""Original shallow commercial setting; feet, Y-up runtime. No survey/brand imagery.
Run: blender -b --python tools/models/commercial-streetscape.py
Geometry is grouped by material to bound runtime draw calls. Shading is baked
into vertex colors: there are no exterior shadow maps or texture downloads.
"""
from pathlib import Path
import bpy, bmesh, json
ROOT=Path(__file__).resolve().parents[2]
bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
parts={}
colors={'Pavement':(.105,.115,.125,1),'Concrete':(.44,.43,.39,1),'Walls':(.50,.43,.32,1),'Trim':(.21,.24,.22,1),'Windows':(.09,.16,.19,1),'Paint':(.65,.61,.46,1)}
def mesh(role,verts,faces):
    data=bpy.data.meshes.new(role)
    data.from_pydata([(x,-z,y) for x,y,z in verts],[],faces);data.update()
    bm=bmesh.new();bm.from_mesh(data);bmesh.ops.recalc_face_normals(bm,faces=bm.faces);bm.to_mesh(data);bm.free()
    obj=bpy.data.objects.new(role,data);bpy.context.collection.objects.link(obj)
    col=data.color_attributes.new(name='BakedShade',type='FLOAT_COLOR',domain='CORNER')
    uv=data.uv_layers.new(name='SurfaceFeet')
    for poly in data.polygons:
        shade=.7+.3*max(0,poly.normal.z)+.1*max(0,poly.normal.y)
        for i in poly.loop_indices:
            col.data[i].color=tuple(c*shade for c in colors[role][:3])+(1,)
            v=data.vertices[data.loops[i].vertex_index].co;uv.data[i].uv=(v.x/8,v.y/8)
    parts.setdefault(role,[]).append(obj)
def box(role,x0,x1,y0,y1,z0,z1):
    mesh(role,[(x,y,z) for z in [z0,z1] for y in [y0,y1] for x in [x0,x1]],[(0,1,3,2),(4,6,7,5),(0,4,5,1),(2,3,7,6),(0,2,6,4),(1,5,7,3)])
def shop(x0,x1,z,h):
    index=abs(int(x0/12))%4
    colors['Walls']=[(.50,.43,.32,1),(.34,.20,.14,1),(.43,.43,.37,1),(.43,.32,.23,1)][index]
    colors['Trim']=[(.13,.21,.19,1),(.20,.16,.14,1),(.26,.30,.32,1),(.22,.18,.14,1)][index]
    # Closed structural shell behind recessed glazing; opaque glass costs no sorting.
    box('Walls',x0,x1,0,h,z+2,z+30)
    box('Concrete',x0,x1,0,.35,z-8,z+2)
    box('Trim',x0,x1,h-.6,h+.15,z+1.7,z+30.2)
    box('Walls',x0,x1,10,h-1,z,z+2)
    # Folded canopy profile, closed with a soffit; shaded recess beneath.
    profile=[(z-4,9.2),(z-4,10),(z,12),(z+1,12),(z+1,9.2)]
    n=len(profile);verts=[(x,y,zz) for x in [x0,x1] for zz,y in profile]
    mesh('Trim',verts,[tuple(reversed(range(n))),tuple(range(n,2*n))]+[(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)])
    for a in range(int(x0),int(x1),12):
        b=min(a+12,x1)
        box('Walls',a,min(a+1,b),.35,10,z,z+2)
        box('Windows',a+1,b-.15,1,8.9,z+1.7,z+1.85)
        box('Trim',a+1,b,4.4,4.55,z+1.55,z+1.7)
        box('Trim',a+6,a+6.15,1,8.9,z+1.55,z+1.7)
    box('Walls',x1-.6,x1,.35,10,z,z+2)
    # Recessed double entry, framed and distinct from the display windows.
    mid=(x0+x1)/2
    box('Trim',mid-3.3,mid+3.3,.35,8.8,z+1.35,z+1.5)
    box('Windows',mid-3,mid-.1,.4,8.5,z+1.2,z+1.3)
    box('Windows',mid+.1,mid+3,.4,8.5,z+1.2,z+1.3)
    box('Concrete',mid-3.5,mid+3.5,.35,.42,z-.8,z+1.2)
# Ground sits below existing store/road planes. Extents are intentionally beyond
# normal street-level framing; this is not an aerial environment.
box('Pavement',-230,230,-.5,-.12,-70,255)
# Across-road curb, driveway opening and walkway. Existing road ends at z=90.
for a,b in [(-180,-18),(18,180)]:
    box('Concrete',a,b,-.12,.3,90,94)
# Opposite parking rows with realistic 9x18 ft bays and a broad drive aisle.
for row in [100,144]:
    for x in range(-144,153,9):box('Paint',x,x+.22,-.115,-.105,row,row+18)
# Low one-story commercial frontage, an anchor shop and smaller units.
shop(-156,-60,182,25)
shop(-60,-24,180,18)
shop(-24,12,180,19)
shop(12,48,180,18)
shop(48,84,180,20)
shop(84,156,182,23)
# Small neighboring buildings beyond our lot, with the same road-facing setback.
shop(-148,-100,40,17)
shop(100,148,48,18)
# Sidewalk expansion joints, restrained parking stops and static pole lamps.
for x in range(-150,154,6):box('Trim',x,x+.05,.351,.36,174,180)
for x in range(-135,145,18):box('Concrete',x-2.5,x+2.5,-.1,.25,160,160.7)
for x in [-120,-42,42,120]:
    box('Trim',x-.18,x+.18,-.1,19,128,128.36)
    box('Trim',x-1.5,x+1.5,18.7,19.2,127.4,129)
    box('Windows',x-1.3,x+1.3,18.62,18.7,127.5,128.9)
# Join by material: six draws, all opaque, no runtime lights or per-frame updates.
for role,objs in parts.items():
    bpy.ops.object.select_all(action='DESELECT')
    for obj in objs:obj.select_set(True)
    bpy.context.view_layer.objects.active=objs[0];bpy.ops.object.join();obj=objs[0];obj.name=role
    mat=bpy.data.materials.new(role);mat.diffuse_color=colors[role];mat.use_nodes=True
    vertex=mat.node_tree.nodes.new('ShaderNodeVertexColor');vertex.layer_name='BakedShade'
    mat.node_tree.links.new(vertex.outputs['Color'],mat.node_tree.nodes.get('Principled BSDF').inputs['Base Color'])
    obj.data.materials.clear();obj.data.materials.append(mat)
    bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
    assert all(len(p.vertices)>=3 for p in obj.data.polygons)
for area in bpy.context.screen.areas:
    if area.type=='VIEW_3D':area.spaces.active.region_3d.view_distance=300
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'tools/models/commercial-streetscape.blend'))
path=ROOT/'public/models/commercial-streetscape.glb'
bpy.ops.export_scene.gltf(filepath=str(path),export_format='GLB',export_yup=True,export_materials='EXPORT',export_attributes=True)
metrics={'bytes':path.stat().st_size,'meshes':len(parts),'triangles':sum(len(p.vertices)-2 for o in bpy.context.scene.objects for p in o.data.polygons),'boundsFeet':{'x':[-230,230],'y':[-.5,25.15],'z':[-70,255]},'surveyed':False}
(ROOT/'tools/models/commercial-streetscape-metrics.json').write_text(json.dumps(metrics,indent=2)+'\n');print(metrics)
