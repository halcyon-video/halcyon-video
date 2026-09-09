"""Original opaque scenery cards; feet, Y-up runtime, not a surveyed location.
Run: blender -b --python tools/models/commercial-streetscape.py
Four batches: fixed frontage, window glow, adjustable ground, movable rear.
Open surfaces are intentional cardboard scenery, with no image/alpha textures.
"""
from pathlib import Path
import bpy, bmesh, json, math
ROOT = Path(__file__).resolve().parents[2]
bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
parts = {}
colors = {'Pavement':(.105,.115,.125,1), 'Concrete':(.44,.43,.39,1),
          'Walls':(.50,.43,.32,1), 'Trim':(.21,.24,.22,1),
          'Windows':(.09,.16,.19,1), 'Paint':(.65,.61,.46,1),
          'Leaves':(.13,.23,.12,1), 'Bark':(.24,.20,.15,1)}
zone = 'Frontage'
def mesh(role, verts, faces, batch=None):
    data = bpy.data.meshes.new(role)
    data.from_pydata([(x,-z,y) for x,y,z in verts], [], faces); data.update()
    bm=bmesh.new(); bm.from_mesh(data); bmesh.ops.recalc_face_normals(bm,faces=bm.faces); bm.to_mesh(data); bm.free()
    obj=bpy.data.objects.new(role,data); bpy.context.collection.objects.link(obj)
    col=data.color_attributes.new(name='BakedShade',type='FLOAT_COLOR',domain='CORNER')
    uv=data.uv_layers.new(name='SurfaceFeet')
    for poly in data.polygons:
        shade=.8+.2*max(0,poly.normal.z)
        for i in poly.loop_indices:
            leaf_shade = 1
            if role == 'Leaves':
                v = data.vertices[data.loops[i].vertex_index].co
                ys = [v.co.z for v in data.vertices]
                leaf_shade = .72 + .3 * (v.z-min(ys))/max(.01,max(ys)-min(ys))
            col.data[i].color=tuple(c*shade*leaf_shade for c in colors[role][:3])+(1,)
            v=data.vertices[data.loops[i].vertex_index].co; uv.data[i].uv=(v.x/8,v.z/8)
    key=batch or ('Windows' if role=='Windows' and zone=='Frontage' else zone)
    parts.setdefault(key,[]).append(obj)
def face(role,x0,x1,y0,y1,z):
    mesh(role,[(x0,y0,z),(x1,y0,z),(x1,y1,z),(x0,y1,z)],[(0,1,2,3)])
def ground(role,x0,x1,z0,z1,y,batch=None):
    mesh(role,[(x0,y,z0),(x1,y,z0),(x1,y,z1),(x0,y,z1)],[(0,1,2,3)],batch)
def shop(x0,x1,z,h,shallow=False):
    i=abs(int(x0/12))%4
    colors['Walls']=[(.50,.43,.32,1),(.34,.20,.14,1),(.43,.43,.37,1),(.43,.32,.23,1)][i]
    colors['Trim']=[(.13,.21,.19,1),(.20,.16,.14,1),(.26,.30,.32,1),(.22,.18,.14,1)][i]
    face('Walls',x0,x1,0,h,z)
    face('Trim',x0,x1,h-.65,h+.15,z-.015)
    face('Trim',x0,x1,9,11,z-.025)
    ground('Concrete',x0,x1,z-8,z,.03)
    # Painted opaque glazing and mullions: every part lies on the facade card.
    for a in range(int(x0),int(x1),12):
        b=min(a+12,x1)
        face('Windows',a+1,b-.5,1,8.8,z-.03)
        face('Trim',a+1,b-.5,4.4,4.55,z-.045)
        face('Trim',a+6,a+6.15,1,8.8,z-.045)
    mid=(x0+x1)/2
    face('Trim',mid-3.3,mid+3.3,.15,8.8,z-.06)
    face('Windows',mid-3,mid-.1,.2,8.5,z-.075)
    face('Windows',mid+.1,mid+3,.2,8.5,z-.075)
    if shallow:
        # Nearby scenery keeps returns/roof so it survives oblique views.
        for x in [x0,x1]:
            mesh('Walls',[(x,0,z),(x,0,z+12),(x,h,z+12),(x,h,z)],[(0,1,2,3)])
        ground('Trim',x0,x1,z,z+12,h)
        mesh('Trim',[(x0,9,z-3),(x1,9,z-3),(x1,11,z),(x0,11,z)],[(0,1,2,3)])
def tree(x,z,h,w,seed,angle=0):
    # Fixed silhouette cards, never rotated per frame. Scalloped crown edges
    # give broadleaf trees a leaf-like outline without transparent overdraw.
    ca,sa=math.cos(angle),math.sin(angle)
    def pt(u,y,offset=0):return (x+u*ca+offset*sa,y,z+u*sa-offset*ca)
    mesh('Bark',[pt(-.45,0),pt(.45,0),pt(.65,h*.64),pt(-.65,h*.64)],[(0,1,2,3)])
    colors['Leaves']=[(.12,.22,.11,1),(.16,.26,.13,1),(.19,.28,.15,1)][seed%3]
    rim=[]
    for j in range(64):
        a=2*math.pi*j/64
        r=1+.045*math.sin(a*7+seed)+.035*math.cos(a*11-seed)
        rim.append(pt(math.cos(a)*w*.5*r,h*.67+math.sin(a)*h*.32*r,-.02 if zone=='Rear' else .02))
    mesh('Leaves',[pt(0,h*.67,-.02 if zone=='Rear' else .02)]+rim,[(0,j+1,(j+1)%64+1) for j in range(64)])
# A separate four-vertex ground sheet is stretched only once at load to reach
# the dynamic rear boundary, including in the deepest supported store layouts.
ground('Pavement',-230,230,-70,255,-.12,'Ground')
for a,b in [(-180,-18),(18,180)]:ground('Concrete',a,b,90,94,.015)
for row in [100,144]:
    for x in range(-144,153,9):ground('Paint',x,x+.22,row,row+18,-.105)
for args in [(-156,-60,182,25),(-60,-24,180,18),(-24,12,180,19),
             (12,48,180,18),(48,84,180,20),(84,156,182,23)]:shop(*args)
shop(-148,-100,40,17,True); shop(100,148,48,18,True)
for i,x in enumerate([-205,-178,178,208]):tree(x,204,27+i%2*5,23,i)
# Side trees use two fixed cards so they don't disappear when seen edge-on.
for i,(x,z) in enumerate([(-170,-20),(174,-14)]):
    tree(x,z,30,25,i+4); tree(x,z,30,25,i+4,math.pi/2)
for x in [-120,-42,42,120]:
    face('Trim',x-.18,x+.18,0,19,128)
    face('Trim',x-1.5,x+1.5,18.7,19.2,127.9)
    face('Windows',x-1.3,x+1.3,18.65,18.85,127.85)
# Rear is authored around z=0, placed 24 feet behind the actual back wall.
# A modest service court, masonry boundary, low utility roofs and trees. No
# animated vegetation, shadow maps, downloaded artwork or extra lighting.
zone='Rear'
colors['Walls']=(.38,.38,.34,1); colors['Trim']=(.24,.27,.25,1)
face('Walls',-200,200,0,7,0)
face('Trim',-200,200,6.7,7.2,.02)
for x in range(-200,201,20):face('Concrete',x-.25,x+.25,0,7.35,.04)
for x0,x1,h in [(-175,-90,15),(-65,40,12),(65,175,17)]:
    face('Walls',x0,x1,0,h,-27)
    face('Trim',x0,x1,h-.8,h+.1,-26.98)
    face('Trim',x0+12,x0+24,0,8,-26.96)
for i,x in enumerate([-190,-145,-90,-38,12,58,110,162,194]):
    tree(x,-12-i%3*3,23+i%4*3,24+i%3*4,i)
# Group by render role rather than every painted color: four opaque draws.
for role,objs in parts.items():
    bpy.ops.object.select_all(action='DESELECT')
    for obj in objs:obj.select_set(True)
    bpy.context.view_layer.objects.active=objs[0]; bpy.ops.object.join(); obj=objs[0]; obj.name=role
    mat=bpy.data.materials.new(role); mat.use_nodes=True; mat.use_backface_culling=False
    vertex=mat.node_tree.nodes.new('ShaderNodeVertexColor'); vertex.layer_name='BakedShade'
    mat.node_tree.links.new(vertex.outputs['Color'],mat.node_tree.nodes.get('Principled BSDF').inputs['Base Color'])
    obj.data.materials.clear(); obj.data.materials.append(mat)
    bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
for area in bpy.context.screen.areas:
    if area.type=='VIEW_3D':area.spaces.active.region_3d.view_distance=300
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'tools/models/commercial-streetscape.blend'))
path=ROOT/'public/models/commercial-streetscape.glb'
bpy.ops.export_scene.gltf(filepath=str(path),export_format='GLB',export_yup=True,export_materials='EXPORT',export_attributes=True)
metrics={'bytes':path.stat().st_size,'meshes':len(parts),
         'triangles':sum(len(p.vertices)-2 for o in bpy.context.scene.objects for p in o.data.polygons),
         'rearAnchor':'backWallZ - 24 feet','groundRearEdge':'backWallZ - 80 feet',
         'flatDistantFacades':6,'shallowSideShops':2,'treeCards':17,'surveyed':False}
(ROOT/'tools/models/commercial-streetscape-metrics.json').write_text(json.dumps(metrics,indent=2)+'\n'); print(metrics)
