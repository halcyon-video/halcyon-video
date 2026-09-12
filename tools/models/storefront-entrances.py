"""Welded masonry portals, folded coping and cornice profiles, authored in feet.

Blender (x, -store_z, height) exports directly to the store's Y-up coordinates.
The active scene supplies masonry, trim and canopy finishes and all branding.
"""
import json
import math
from pathlib import Path
import bpy
import bmesh

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT/'public/models'
bpy.context.preferences.filepaths.save_version = 0
bpy.context.scene.unit_settings.system = 'IMPERIAL'
bpy.context.scene.unit_settings.scale_length = .3048
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
MATS = []
for name, color, rough in [
    ('FacadeBrick', (.30,.12,.065,1), .95),
    ('FacadeTile', (.02,.07,.30,1), .33),
    ('FacadeTrim', (.82,.76,.60,1), .72),
    ('FacadeCoping', (.035,.042,.048,1), .52),
    ('FacadeSoffit', (.08,.08,.075,1), .85),
    ('FacadeCanopy', (.02,.07,.30,1), .60),
    ('FacadeSoldierBrick', (.30,.12,.065,1), .95),
]:
    mat=bpy.data.materials.new(name);mat.diffuse_color=color;mat.use_nodes=True
    b=mat.node_tree.nodes.get('Principled BSDF');b.inputs['Base Color'].default_value=color;b.inputs['Roughness'].default_value=rough
    MATS.append(mat)


def mesh(name, verts, faces, mat):
    data=bpy.data.meshes.new(name)
    data.from_pydata([(x,-z,y) for x,y,z in verts],[],faces);data.materials.append(MATS[mat]);data.update()
    bm=bmesh.new();bm.from_mesh(data);bmesh.ops.recalc_face_normals(bm,faces=bm.faces);bm.to_mesh(data);bm.free()
    obj=bpy.data.objects.new(name,data);bpy.context.collection.objects.link(obj)
    uv=data.uv_layers.new(name='FourFootTiles')
    for p in data.polygons:
        # Vertical faces keep running-bond brick courses horizontal, including
        # returns; horizontal surfaces use X/depth coordinates.
        for li in p.loop_indices:
            v=data.vertices[data.loops[li].vertex_index].co
            uv.data[li].uv=(v.x/4,v.z/4) if abs(p.normal.y)>.5 else (v.y/4,v.z/4) if abs(p.normal.x)>.5 else (v.x/4,v.y/4)
    return obj


def prism(name, profile, z0, z1, mat):
    n=len(profile);v=[(x,y,z) for z in [z0,z1] for x,y in profile]
    f=[tuple(reversed(range(n))),tuple(range(n,2*n))]
    f += [(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)]
    return mesh(name,v,f,mat)


def box(name,x0,x1,y0,y1,z0,z1,mat):
    return prism(name,[(x0,y0),(x1,y0),(x1,y1),(x0,y1)],z0,z1,mat)


def crown(name, path, z0, z1, mat=3):
    # A continuous folded cap with mitered joints, a small drip and finished
    # front/rear downstands, rather than intersecting bars at the peak.
    from mathutils import Vector
    points=[Vector(p) for p in path]
    normals=[]
    for a,b in zip(points,points[1:]):
        d=(b-a).normalized();normals.append(Vector((-d.y,d.x)))
    offsets=[normals[0]]
    for a,b in zip(normals,normals[1:]):
        d=(a+b).normalized();offsets.append(d/max(.2,d.dot(a)))
    offsets.append(normals[-1])
    profile=[(-.07,z0-.09),(.12,z0-.09),(.18,z0-.035),(.18,z1+.035),(.12,z1+.09),(-.07,z1+.09),(-.07,z1+.035),(.12,z1+.035),(.12,z0-.035),(-.07,z0-.035)]
    verts=[]
    for p,n in zip(points,offsets):
        for h,z in profile:
            q=p+n*h;verts.append((q.x,q.y,z))
    k=len(profile);faces=[tuple(reversed(range(k))),tuple(range((len(points)-1)*k,len(points)*k))]
    for i in range(len(points)-1):
        for j in range(k):faces.append((i*k+j,i*k+(j+1)%k,(i+1)*k+(j+1)%k,(i+1)*k+j))
    return mesh(name,verts,faces,mat)


def export(name, objects):
    bpy.ops.object.select_all(action='DESELECT')
    for obj in objects:obj.select_set(True)
    bpy.context.view_layer.objects.active=objects[0]
    bpy.ops.export_scene.gltf(filepath=str(OUT/name),export_format='GLB',use_selection=True,export_yup=True,export_apply=True)


def rectangular_entry(style):
    """A raised entrance pavilion, open beneath its roof and behind its piers."""
    m=7.9; opening=5.55; back=4.75; front=6.48; projection=6.2
    arcade=style=='arcaded-brick'
    width=3.25 if arcade else 2.75
    top=20.8 if arcade else 22.2
    spring=9.15; rise=4.0
    arch=[(-m*math.cos(k*math.pi/48),spring+rise*math.sin(k*math.pi/48)) for k in range(49)]
    underside=arch if arcade else [(-m,spring),(m,spring)]
    prism('Arched entrance spandrel' if arcade else 'Raised rectangular entrance tower',
          underside+[(m,top),(-m,top)],.10,projection,0)
    for sign in [-1,1]:
        x0,x1=sorted([sign*m,sign*(m+width)])
        box('Fitted pillar plinth',x0-.1,x1+.1,0,1.6,back-.1,front+.1,6)
        # The shaft and upper return are a single L section: no brick wall
        # beside the walking route, and no coplanar overlapping blocks.
        side=[(back,1.6),(front,1.6),(front,top),(.1,top),(.1,spring),(back,spring)]
        verts=[(x,y,z) for x in [x0,x1] for z,y in side]; n=len(side)
        faces=[tuple(reversed(range(n))),tuple(range(n,2*n))]
        faces += [(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)]
        mesh('Freestanding pier and overhead return',verts,faces,0)
        box('Pillar impost',x0-.08,x1+.08,8.75,spring,back-.06,front+.08,2)
        j0,j1=sorted([sign*opening,sign*m])
        box('Shallow rear glazing jamb',j0,j1,0,spring,-.18,.25,0)
    # Cornice is a continuous U profile, mitered at the front corners and
    # returned to the wall. Its inner surface fits the pavilion exactly.
    span=m+width
    for y0,y1,overhang in [(top-1.05,top-.8,.12),(top-.73,top-.52,.06),(top-.5,top-.1,.22)]:
        outline=[(-span-overhang,.02),( -span-overhang,front+overhang),
                 (span+overhang,front+overhang),(span+overhang,.02),
                 (span,.02),(span,front),(m,front),(m,projection),
                 (-m,projection),(-m,front),(-span,front),(-span,.02)]
        n=len(outline);verts=[(x,y,z) for y in [y0,y1] for x,z in outline]
        faces=[tuple(reversed(range(n))),tuple(range(n,2*n))]
        faces += [(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)]
        mesh('Returned molded cornice',verts,faces,2)
    crown('Continuous pavilion coping',[(-span-.08,top),(span+.08,top)],.02,front)
    if arcade:
        # An actual open arch, with a fitted stone archivolt. The soffit
        # follows the curve all the way back to the glazed entrance wall.
        outer=[(-(m+.44)*math.cos(k*math.pi/48),spring+(rise+.44)*math.sin(k*math.pi/48)) for k in range(49)]
        prism('Fitted entrance archivolt',arch+list(reversed(outer)),projection+.001,projection+.15,2)
        for k in range(13):
            x=-span+.7+k*(2*span-1.4)/12
            box('Cornice dentil',x-.25,x+.25,top-1.6,top-1.05,front+.001,front+.12,2)
    else:
        box('Rectangular tower sign field',-m+.38,m-.38,13.6,top-1.4,projection+.001,projection+.045,1)


metrics={}
for style in ['gabled-brick','flat-parapet','arcaded-brick']:
    collection=bpy.data.collections.new(style);bpy.context.scene.collection.children.link(collection)
    before=set(bpy.context.scene.objects)
    if style!='gabled-brick':
        rectangular_entry(style)
    else:
        m=7.6 if style=='gabled-brick' else 7.9
        opening=7.2 if style=='gabled-brick' else 5.55
        pier_width=2.75 if style=='gabled-brick' else 2
        projection=6.2 if style=='gabled-brick' else 4.2
        spring=17.1;peak=spring+6.003
        # The gabled canopy is supported by freestanding front pillars. Nothing
        # below the header joins those pillars back to the building wall.
        profile=[(-m,9.15),(m,9.15)] if style=='gabled-brick' else [(-m,0),(-opening,0),(-opening,9.15),(opening,9.15),(opening,0),(m,0)]
        roof=[(m,spring),(m-1,spring),(0,peak),(-m+1,spring),(-m,spring)] if style=='gabled-brick' else [(m,18.6),(-m,18.6)]
        prism('Continuous masonry portal',profile+roof,.10,projection,0)
        crown('Folded portal coping',list(reversed(roof)),.02,projection)
        # Raised, closed standing seams divide the broad metal roof into
        # serviceable sheets. Each follows the same welded miter at the ridge.
        for z in [2.08, 4.16]:
            crown('Roof standing seam', [(x,y+.17) for x,y in reversed(roof)], z-.018,z+.018)
        # Rear apron bridges the roof/wall junction, with an upstand and drip.
        # This is generic construction detail, not an exact period replica.
        side=[(-.12,16.40),(-.12,16.92),(.18,16.92),(.38,16.80),
              (.38,16.70),(.33,16.70),(.33,16.77),(.16,16.86),(-.07,16.86),(-.07,16.40)]
        verts=[(x,y,z) for x in [-m,m] for z,y in side];n=len(side)
        mesh('Rear abutment counterflashing',verts,
             [tuple(reversed(range(n))),tuple(range(n,2*n))]+
             [(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)],3)
        for s in [-1,1]:
            x0,x1=sorted([s*m,s*(m+pier_width)])
            h=17.9 if style=='gabled-brick' else 18.6
            pier_front=6.48 if style=='gabled-brick' else 2.4
            pier_back=4.75 if style=='gabled-brick' else .10
            crown('Pier cap',[(x0-.08,h),(x1+.08,h)],(.02 if style=='gabled-brick' else pier_back-.08),pier_front)
            if style=='gabled-brick':
                # Fitted courses wrap all four faces, including the rear face
                # visible from the passage. Separate courses meet without overlap.
                box('Projecting soldier plinth',x0-.10,x1+.10,0,2,pier_back-.10,pier_front+.10,6)
                # One L-shaped shaft: a clear passage below, with the upper return
                # carried continuously back to the wall. No overlapping box seam.
                side=[(pier_back,2),(pier_front,2),(pier_front,14.4),(.10,14.4),(.10,9.15),(pier_back,9.15)]
                verts=[(x,y,z) for x in [x0,x1] for z,y in side]
                n=len(side)
                faces=[tuple(reversed(range(n))),tuple(range(n,2*n))]
                faces += [(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)]
                mesh('Continuous pier and upper return',verts,faces,0)
                box('Pier tile wrap',x0,x1,14.4,15.45,.10,pier_front,1)
                box('Pier soldier capital',x0,x1,15.45,h,.10,pier_front,6)
                j0,j1=sorted([s*opening,s*m])
                box('Rear entry jamb',j0,j1,0,9.15,-.18,.25,0)
        # Folded pan soffit, recessed joints and returned edges visible from
        # the open passage. Panels butt without overlapping coplanar faces.
        for i in range(8):
            x0=-opening+i*(2*opening/8);x1=x0+2*opening/8
            profile=[(x0,9.15),(x1,9.15),(x1,9.13),(x1-.035,9.13),
                     (x1-.035,9.10),(x0+.035,9.10),(x0+.035,9.13),(x0,9.13)]
            prism('Folded soffit pan %02d'%i,profile,.10,projection-.04,4)
        if style=='gabled-brick':
            # The upper tile band on the entrance sits BELOW the wing stripe,
            # as it does on the building; it does not cut through the gable.
            for y0,y1 in [(9.15,10.2),(12.35,13.4)]:
                box('Entrance tile course',-m,m,y0,y1,projection+.001,projection+.07,1)
            box('Upright brick entry header',-m,m,10.2,12.35,projection+.001,projection+.025,6)
            box('Entry exit masonry divider',-.9,.9,0,9.1,-.18,.25,0)
            for s in [-1,1]:
                x0,x1=sorted([s*4.1,s*opening])
                box('Sidelight masonry knee',x0,x1,0,1.6,-.18,.25,0)
                box('Sidelight soldier sill',x0,x1,1.6,1.82,-.18,.32,6)
    objects=[o for o in bpy.context.scene.objects if o not in before]
    for obj in objects:
        for c in list(obj.users_collection):c.objects.unlink(obj)
        collection.objects.link(obj)
    # Weld coincident vertices and verify every authored solid before export.
    for obj in objects:
        bm=bmesh.new();bm.from_mesh(obj.data)
        bmesh.ops.remove_doubles(bm,verts=bm.verts,dist=.00001)
        bmesh.ops.recalc_face_normals(bm,faces=bm.faces)
        bad=sum(not e.is_manifold for e in bm.edges)
        assert bad==0,(style,obj.name,bad)
        bm.to_mesh(obj.data);bm.free()
    for mat in MATS:
        matching=[o for o in collection.objects if o.type=='MESH' and o.data.materials[0]==mat]
        if not matching:continue
        bpy.ops.object.select_all(action='DESELECT')
        for o in matching:
            vg=o.vertex_groups.new(name=o.name);vg.add(list(range(len(o.data.vertices))),1,'REPLACE');o.select_set(True)
        bpy.context.view_layer.objects.active=matching[0];bpy.ops.object.join();matching[0].name=style+'-'+mat.name
    objects=list(collection.objects)
    for obj in objects:obj.data.calc_loop_triangles()
    metrics[style]={'triangles':sum(len(o.data.loop_triangles) for o in objects),'meshes':len(objects),'nonManifoldEdges':0}
    export('storefront-entry-'+style+'.glb',objects)
    metrics[style].update({
        'bytes': (OUT/('storefront-entry-'+style+'.glb')).stat().st_size,
        'units': 'feet', 'textures': 0,
        'bounds': [[min(v.co[k] for o in objects for v in o.data.vertices) for k in range(3)],
                   [max(v.co[k] for o in objects for v in o.data.vertices) for k in range(3)]],
        'boundsAxes': 'Blender X, negative store depth, height',
        'materialRoles': [o.data.materials[0].name for o in objects],
        'uvLayers': sorted({u.name for o in objects for u in o.data.uv_layers}),
    })

# The arch spans TWO of the store's fixed four-foot window panes. Masonry
# spandrels cover the unused glass corners; the trimmed arch is an opening.
# Its upright trim begins on the masonry knee, just like the black window
# frames behind it.  Letting these strips reach the pavement visually cuts
# each continuous brick footer into separate pieces.
before=set(bpy.context.scene.objects)
window_knee=1.6
inner=[(3.62*math.cos(k*math.pi/32),6.05+2.8*math.sin(k*math.pi/32)) for k in range(33)]
prism('Arch spandrel',[(-4,8.9),(4,8.9),(4,6.05)]+inner+[(-4,6.05)],.01,.72,0)
outer=[(3.86*math.cos(k*math.pi/32),6.05+3.04*math.sin(k*math.pi/32)) for k in range(33)]
prism('Masonry arch trim',outer+list(reversed(inner)),.73,.91,2)
for s in [-1,1]:
    x0,x1=sorted([s*3.62,s*4])
    box('Arcade pier',x0,x1,window_knee,6.05,.05,.82,2)
    box('Pier capital',x0-.08,x1+.08,5.7,6.05,.02,.98,2)
objects=[o for o in bpy.context.scene.objects if o not in before]
for obj in objects:
    bm=bmesh.new();bm.from_mesh(obj.data);assert all(e.is_manifold for e in bm.edges),obj.name;bm.free()
for obj in objects:
    if obj.name.startswith('Arcade pier'):
        assert min(v.co.z for v in obj.data.vertices) >= window_knee-.00001, obj.name
for obj in objects:obj.data.calc_loop_triangles()
metrics['arcade-window-bay']={
    'triangles':sum(len(o.data.loop_triangles) for o in objects),
    'meshes':len(objects),
    'trimBottom':window_knee,
    'nonManifoldEdges':0,
}
export('storefront-arch-bay.glb',objects)
collection=bpy.data.collections.new('Arcade window module');bpy.context.scene.collection.children.link(collection)
for obj in objects:
    for c in list(obj.users_collection):c.objects.unlink(obj)
    collection.objects.link(obj)

# Open the editable source on the commissioned variant; other variants stay
# available in their named collections without obscuring it.
for obj in bpy.context.scene.objects:
    obj.hide_set(obj.users_collection[0].name != 'gabled-brick')
for area in bpy.context.screen.areas:
    if area.type=='VIEW_3D':
        area.spaces.active.region_3d.view_distance=42
        area.spaces.active.region_3d.view_location=(0,-2,12)
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'tools/models/storefront-entrances.blend'))
(ROOT/'tools/models/storefront-entrances-metrics.json').write_text(json.dumps(metrics,indent=2)+'\n')
print(json.dumps(metrics))
