"""Original editable folding sale table, static drape and bent-wire rack.
Blender coordinates (x,-store_z,height), feet. Existing runtime anchors retained.
Reproduce with Blender -b -t 2 --python-exit-code 1 -P /absolute/path/to/this.py.
"""
import bpy, bmesh, math, json
from pathlib import Path
from mathutils import Vector, Euler
ROOT=Path(__file__).resolve().parents[2]
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
bpy.context.preferences.filepaths.save_version=0
bpy.context.scene.unit_settings.system='IMPERIAL';bpy.context.scene.unit_settings.scale_length=.3048
bpy.context.scene['provenance']='Original folding-table and wire-rack construction; no source-photo pixels or external geometry.'
M={}
for name,col,rough,metal in [('TableTop',(.30,.22,.13),.62,0),('TableFrame',(.10,.115,.12),.46,.55),
    ('TableFeet',(.035,.038,.04),.85,0),('DrapeCloth',(.03,.03,.038),.94,0),('RackWire',(.035,.035,.045),.42,.45)]:
    m=bpy.data.materials.new(name);m.diffuse_color=(*col,1);m.use_nodes=True
    p=m.node_tree.nodes['Principled BSDF'];p.inputs['Base Color'].default_value=(*col,1)
    p.inputs['Roughness'].default_value=rough;p.inputs['Metallic'].default_value=metal;M[name]=m

def pt(v):return (v[0],-v[2],v[1])
def active(o):
    bpy.ops.object.select_all(action='DESELECT');o.select_set(True);bpy.context.view_layer.objects.active=o
def mesh(name,vs,fs,role):
    me=bpy.data.meshes.new(name);me.from_pydata([pt(v) for v in vs],[],fs);me.update()
    o=bpy.data.objects.new(name,me);bpy.context.collection.objects.link(o);me.materials.append(M[role]);return o
def box(name,c,d,role,bevel=.01):
    x,y,z=c;w,h,depth=[a/2 for a in d]
    vs=[(x+sx*w,y+sy*h,z+sz*depth) for sx,sy,sz in [(-1,-1,-1),(1,-1,-1),(1,-1,1),(-1,-1,1),(-1,1,-1),(1,1,-1),(1,1,1),(-1,1,1)]]
    o=mesh(name,vs,[(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)],role)
    if bevel:
        active(o);b=o.modifiers.new('Eased physical edge','BEVEL');b.width=bevel;b.segments=2;bpy.ops.object.modifier_apply(modifier=b.name)
    return o
def tube(name,points,r,role,sides=8):
    curve=bpy.data.curves.new(name,'CURVE');curve.dimensions='3D';curve.resolution_u=1
    curve.bevel_depth=r;curve.resolution_u=1;curve.bevel_resolution=1;curve.use_fill_caps=True
    spline=curve.splines.new('POLY');spline.points.add(len(points)-1)
    for p,v in zip(spline.points,points):p.co=(*pt(v),1)
    o=bpy.data.objects.new(name,curve);bpy.context.collection.objects.link(o);active(o)
    bpy.ops.object.convert(target='MESH');o=bpy.context.object;o.data.materials.append(M[role]);return o
def rounded_path(points,r=.035):
    out=[Vector(points[0])]
    for i in range(1,len(points)-1):
        a,b,c=map(Vector,[points[i-1],points[i],points[i+1]])
        v1=(a-b).normalized();v2=(c-b).normalized();length=min(r,(a-b).length/3,(c-b).length/3)
        p=b+v1*length;q=b+v2*length
        for j in range(5):
            t=j/4;out.append((1-t)**2*p+2*(1-t)*t*b+t*t*q)
    out.append(Vector(points[-1]));return out
def finish(parts):
    for o in parts:
        active(o);bm=bmesh.new();bm.from_mesh(o.data)
        bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=1e-6)
        bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces))
        assert all(e.is_manifold for e in bm.edges),o.name
        assert all(f.calc_area()>1e-10 for f in bm.faces),o.name
        bm.to_mesh(o.data);bm.free()
        bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT')
        bpy.ops.uv.smart_project(island_margin=.02);bpy.ops.object.mode_set(mode='OBJECT')
        o['units']='feet';o['construction']='original scripted Blender mesh'

table=[]
table.append(box('Fitted laminate tabletop',(0,2.455,0),(5.99,.084,2.49),'TableTop',.018))
for z in [-1.10,1.10]:table.append(box('Underside channel rail '+str(z),(0,2.34,z),(5.68,.13,.055),'TableFrame',.008))
for x in [-2.18,2.18]:
    # One bent U leg frame at each end, seated into pivot brackets. Folding
    # braces and pivots are static physical parts, not a simulation.
    table.append(tube('Continuous folding leg '+str(x),rounded_path([(x,.085,-.98),(x,2.28,-.84),(x,2.31,.84),(x,.085,.98)],.10),.045,'TableFrame'))
    for z in [-.98,.98]:table.append(box('Nonmarking foot '+str((x,z)),(x,.065,z),(.14,.13,.18),'TableFeet',.026))
    for z in [-.84,.84]:
        table.append(box('Pivot clevis '+str((x,z)),(x,2.335,z),(.20,.13,.14),'TableFrame',.014))
    direction=-1 if x>0 else 1
    table.append(tube('Folding diagonal brace '+str(x),[(x,1.12,0),(x+direction*.84,2.34,0)],.025,'TableFrame'))
    table.append(box('Brace locking sleeve '+str(x),(x+direction*.42,1.73,0),(.11,.15,.065),'TableFrame',.012))

# A single top-and-skirt fabric surface follows the real table perimeter.
# The static folds widen modestly toward a turned hem one inch above the floor.
perimeter=[];arc=0;W=6;D=2.5;P=2*(W+D)
for a,b in [((-3,1.25),(3,1.25)),((3,1.25),(3,-1.25)),((3,-1.25),(-3,-1.25)),((-3,-1.25),(-3,1.25))]:
    length=math.dist(a,b);n=round(length/.10)
    for i in range(n):
        t=i/n;perimeter.append((a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t,(arc+length*t)/P))
    arc+=length
vs=[];fs=[];N=len(perimeter);rings=14
for ring in range(rings):
    v=ring/(rings-1);y=2.5-(2.5-.075)*v
    for x,z,u in perimeter:
        radial=Vector((x,z)).normalized();fold=math.sin(24*math.tau*u+.20*math.sin(v*math.pi))
        # Max edge stays inside the existing 6.20 by 2.70-foot footprint.
        offset=.048*v**1.4+(.002+.028*v**1.3)*fold
        vs.append((x+radial.x*offset,y+.003*math.sin(u*math.tau*4)*v,z+radial.y*offset))
for r in range(rings-1):
    for i in range(N):fs.append((r*N+i,(r+1)*N+i,(r+1)*N+(i+1)%N,r*N+(i+1)%N))
fs.append(tuple(reversed(range(N))))
drape=mesh('Continuous tablecloth with turned hem',vs,fs,'DrapeCloth');active(drape)
s=drape.modifiers.new('Woven cloth thickness','SOLIDIFY');s.thickness=.003;s.offset=-1
bpy.ops.object.modifier_apply(modifier=s.name)
for p in drape.data.polygons:p.use_smooth=True
table.append(drape)

rack=[];width=5.88;depth=2.5/6
for side in [-1,1]:
    for tier in range(3):
        outer=side*(1.25-tier*depth);inner=side*(1.25-(tier+1)*depth);y=2.5+tier*.42+.015
        # Closed bent-wire deck perimeter, with corner radii rather than four
        # intersecting cubes. Dense crossbars support all eleven case columns.
        loop=([(-width/2,y,inner),(-width/2,y,outer),(width/2,y,outer),(width/2,y,inner)]
              if tier==2 and side==1 else
              [(-width/2,y,outer),(width/2,y,outer),(width/2,y,inner),(-width/2,y,inner),(-width/2,y,outer)])
        rack.append(tube('Deck rim '+str((side,tier)),rounded_path(loop,.028),.015,'RackWire'))
        for col in range(23):
            x=(col/22-.5)*(width-.07)
            rack.append(tube('Deck cross wire '+str((side,tier,col)),[(x,y,inner),(x,y,outer)],.010,'RackWire'))
        fence=[(-width/2,y,outer),(-width/2,y+.17,outer),(width/2,y+.17,outer),(width/2,y,outer)]
        rack.append(tube('Continuous retaining fence '+str((side,tier)),rounded_path(fence,.032),.016,'RackWire'))
        for col in range(12):
            x=(col/11-.5)*(width-.06)
            rack.append(tube('Fence weld '+str((side,tier,col)),[(x,y,outer),(x,y+.17,outer)],.010,'RackWire'))
for end in [-1,1]:
    x=end*width/2
    profile=[(x,2.5,1.1),(x,2.515,1.1),(x,2.515,.835),(x,2.935,.835),
             (x,2.935,.417),(x,3.355,.417),(x,3.355,-.417),
             (x,2.935,-.417),(x,2.935,-.835),(x,2.515,-.835),(x,2.515,-1.1),(x,2.5,-1.1)]
    rack.append(tube('Bent stepped support '+str(end),rounded_path(profile,.026),.020,'RackWire'))
    for z in [-1.10,-.42,.42,1.10]:
        top=3.355 if abs(z)<.5 else 2.515
        rack.append(tube('Rack bearing upright '+str((end,z)),[(x,2.5,z),(x,top,z)],.018,'RackWire'))
        rack.append(box('Rack foot pad '+str((end,z)),(x,2.501,z),(.065,.006,.09),'RackWire',.002))

# Named sign supports adapt only their stem height to the live media-case size.
# These are separate physical spring clips, not painted rails on the sign.
for x in [-1.36,1.36]:
    rack.append(tube('Offer stem '+str(x),[(x,3.355,0),(x,4.005,0)],.016,'RackWire'))
    yz=[(-.14,-.025),(.012,-.025),(.012,.025),(-.14,.025),
        (-.14,.014),(0,.014),(0,-.014),(-.14,-.014)]
    n=len(yz);vs=[(xx,4.005+y,z) for xx in [x-.05,x+.05] for y,z in yz]
    fs=[tuple(reversed(range(n))),tuple(range(n,2*n))]
    fs += [(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)]
    rack.append(mesh('Offer clip '+str(x),vs,fs,'RackWire'))

families={'sale-table':table,'sale-table-rack':rack};metrics={}
for name,parts in families.items():
    collection=bpy.data.collections.new(name);bpy.context.scene.collection.children.link(collection)
    for o in parts:
        for c in list(o.users_collection):c.objects.unlink(o)
        collection.objects.link(o)
    finish(parts)
    count=sum(len(o.data.polygons) for o in parts)
    bounds=[o.matrix_world@v.co for o in parts for v in o.data.vertices]
    metrics[name]={'parts':len(parts),'source_polygons':count,'manifold':True,'uv':True,
        'bounds_blender_ft':[[min(v[i] for v in bounds),max(v[i] for v in bounds)] for i in range(3)]}
    # Keep editable parts separate; batch static exports by finish. Only the
    # named offer supports need independent meshes for media-height adaptation.
    batches={}
    for o in parts:
        copy=o.copy();copy.data=o.data.copy();bpy.context.scene.collection.objects.link(copy)
        key=o.name if o.name.startswith('Offer ') else o.data.materials[0].name
        batches.setdefault(key,[]).append(copy)
    exported=[]
    for key,objects in batches.items():
        bpy.ops.object.select_all(action='DESELECT')
        for o in objects:o.select_set(True)
        bpy.context.view_layer.objects.active=objects[0]
        if len(objects)>1:bpy.ops.object.join()
        o=bpy.context.object;o.name=key;exported.append(o)
    bpy.ops.object.select_all(action='DESELECT')
    for o in exported:o.select_set(True)
    path=ROOT/'public/models'/f'{name}.glb'
    bpy.ops.export_scene.gltf(filepath=str(path),export_format='GLB',use_selection=True,export_yup=True,export_apply=True)
    metrics[name]['bytes']=path.stat().st_size
    metrics[name]['export_meshes']=len(exported)
    for o in exported:bpy.data.objects.remove(o,do_unlink=True)
    for o in parts:o.data.calc_loop_triangles()
    metrics[name]['triangles']=sum(len(o.data.loop_triangles) for o in parts)
(ROOT/'tools/models/sale-table-metrics.json').write_text(json.dumps(metrics,indent=2)+'\n')
for o in rack:o.location.x+=7
for screen in bpy.data.screens:
    for area in screen.areas:
        if area.type=='VIEW_3D':
            v=area.spaces.active.region_3d;v.view_location=Vector((3.5,0,1.7));v.view_distance=19
            v.view_rotation=Euler((math.radians(65),0,math.radians(20)),'XYZ').to_quaternion()
bpy.ops.object.select_all(action='SELECT')
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'tools/models/sale-table.blend'))
print(json.dumps(metrics,indent=2))
