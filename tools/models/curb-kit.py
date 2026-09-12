"""Original generic concrete edge kit, scripted mesh authoring (no external assets).
Blender: X span, -Y store depth, Z height; GLB: X span, Y height, Z depth.
Numeric units are feet. Run: blender -b -t 2 -P tools/models/curb-kit.py
"""
from pathlib import Path
import bpy, bmesh, json, math
ROOT = Path(__file__).resolve().parents[2]
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
roles = {}
for name, color, rough in [('CurbConcrete',(.153,.144,.117,1),.85),('GutterConcrete',(.107,.098,.076,1),.9),('SidewalkConcrete',(.5,.49,.45,1),.9)]:
    m = bpy.data.materials.new(name); m.use_nodes = True
    m.diffuse_color = color
    p = m.node_tree.nodes.get('Principled BSDF')
    p.inputs['Base Color'].default_value = color
    p.inputs['Roughness'].default_value = rough
    roles[name] = m
metrics = {}
def mesh(name, verts, faces, role):
    data = bpy.data.meshes.new(name)
    data.from_pydata([(x,-z,y) for x,y,z in verts],[],faces); data.update()
    bm=bmesh.new();bm.from_mesh(data)
    bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces))
    assert all(e.is_manifold for e in bm.edges), name
    assert all(f.calc_area()>1e-9 for f in bm.faces), name
    bm.to_mesh(data);bm.free()
    ob=bpy.data.objects.new(name,data);bpy.context.collection.objects.link(ob)
    data.materials.append(roles[role])
    # Planar face projections in feet: tiling aggregate, no uniquely baked wear.
    uv=data.uv_layers.new(name='ConcreteFeet')
    for p in data.polygons:
        axis=max(range(3),key=lambda i:abs(p.normal[i]))
        axes=[i for i in range(3) if i!=axis]
        for li in p.loop_indices:
            v=data.vertices[data.loops[li].vertex_index].co
            uv.data[li].uv=(v[axes[0]],v[axes[1]])
    ob['units']='feet';ob['provenance']='Original Halcyon generic concrete; existing scene dimensions, no period replica claim'
    data.calc_loop_triangles()
    metrics[name]={'vertices':len(data.vertices),'triangles':len(data.loop_triangles),'material':role,'manifold':True,'bounds':[[min(v[i] for v in verts) for i in range(3)],[max(v[i] for v in verts) for i in range(3)]]}
    return ob

def prism(name, profile, length, role):
    n=len(profile)
    verts=[(x,y,z) for x in [0,length] for z,y in profile]
    faces=[tuple(range(n-1,-1,-1)),tuple(range(n,2*n))]
    faces += [(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)]
    return mesh(name,verts,faces,role)
prism('CurbSpan',[(0,-.1),(.4,-.1),(.4,.015),(.375,.04),(.025,.04),(0,.015)],1,'CurbConcrete')
# Pan stays at -0.03 on the road join; a shallow fall collects water at the toe.
prism('GutterSpan',[(0,-.1),(1.6,-.1),(1.6,-.03),(.22,-.032),(0,-.03)],1,'GutterConcrete')
prism('SidewalkSpan',[(0,-.08),(4.7,-.08),(4.7,-.012),(4.688,0),(0,0)],1,'SidewalkConcrete')
# Closed height-field solids permit deliberate corner transitions without overlapping boxes.
def grid_solid(name,xs,zs,height,bottom,role):
    n=len(xs);m=len(zs)
    verts=[(x,height(x,z),z) for z in zs for x in xs]
    boundary=list(range(n))+[j*n+n-1 for j in range(1,m)]+[(m-1)*n+i for i in range(n-2,-1,-1)]+[j*n for j in range(m-2,0,-1)]
    faces=[(j*n+i,j*n+i+1,(j+1)*n+i+1,(j+1)*n+i) for j in range(m-1) for i in range(n-1)]
    base=len(verts)
    verts += [(verts[i][0],bottom,verts[i][2]) for i in boundary]
    for k,i in enumerate(boundary):
        q=(k+1)%len(boundary);faces.append((i,boundary[q],base+q,base+k))
    faces.append(tuple(range(base,len(verts))))
    return mesh(name,verts,faces,role)
grid_solid('CurbJunction',[0,.025,.375,.4],[0,.025,.375,.4],lambda x,z: .015 if z==.4 or (z==0 and x in [0,.4]) else .04,-.1,'CurbConcrete')
# Outer side at X=0; mirror this end return on the opposite side at runtime.
grid_solid('SidewalkReturn',[0,.012,.2],[0,4.688,4.7],lambda x,z:-.012 if x==0 or z==4.7 else 0,-.08,'SidewalkConcrete')
bpy.context.scene.unit_settings.system='IMPERIAL'
bpy.context.scene.unit_settings.scale_length=.3048
for screen in bpy.data.screens:
    for area in screen.areas:
        if area.type=='VIEW_3D':
            area.spaces.active.region_3d.view_distance=8
            area.spaces.active.region_3d.view_location=(.5,-2,0)
out=ROOT/'public/models/curb-kit.glb'
bpy.ops.export_scene.gltf(filepath=str(out),export_format='GLB',export_yup=True,export_extras=True,export_cameras=False,export_lights=False)
metrics['glb_bytes']=out.stat().st_size
(ROOT/'docs/curb-kit-cost.json').write_text(json.dumps(metrics,indent=2)+'\n')
print(json.dumps(metrics))

# Exploded library layout in the editable source; GLB above has mating origins.
for i, ob in enumerate(sorted(bpy.context.scene.objects,key=lambda o:o.name)):
    ob.location.x=i*2
    ob['library_display_offset_x']=i*2
for screen in bpy.data.screens:
    for area in screen.areas:
        if area.type=='VIEW_3D':
            area.spaces.active.region_3d.view_distance=13
            area.spaces.active.region_3d.view_location=(4,-2,0)
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'tools/models/curb-kit.blend'))
