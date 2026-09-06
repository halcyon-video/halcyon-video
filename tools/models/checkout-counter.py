"""Original, editable checkout millwork. Run: blender -b -t 2 --python tools/models/checkout-counter.py

No primitive meshes or intersecting solids: each cabinet is a closed, welded
surface swept through an authored joinery section. Panel reveals are cut INTO
that surface. Dimensions are feet, matching entrance/counter.ts. Blender's Z
is up; (x, -store_z, height) exports directly to Three's Y-up coordinates.
"""
import math
from pathlib import Path
import bpy
import bmesh
from mathutils import Euler, Vector

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'public/models'
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
for material in list(bpy.data.materials):
    bpy.data.materials.remove(material)

MATERIALS = []
for name, color, roughness in [
    ('CounterBody', (0.79, 0.78, 0.72, 1), .45),
    ('CounterTop', (0.018, 0.065, 0.36, 1), .28),
    ('CounterInlay', (.86, .56, .065, 1), .32),
    ('CounterWorktop', (.82, .81, .75, 1), .40),
    ('CounterPlinth', (.022, .028, .035, 1), .70),
    ('CounterReveal', (.09, .105, .12, 1), .65),
]:
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = color
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value = color
    bsdf.inputs['Roughness'].default_value = roughness
    MATERIALS.append(mat)


def section(depth, island=False, rounded=False):
    """(inset, height, material on the following strip). Closed joinery profile."""
    h = 2.82 if island else 3.54
    top = 3 if island else 1
    # Recessed kick, eased panel foot, cabinet face, under-top shadow reveal.
    face_top = 2.55 if island else 2.23
    p = [(.20, 0, 4), (.20, .28, 4), (.18, .32, 4),
         (.055, .32, 0), (.035, .35, 0), (.035, face_top, 0),
         (.045, face_top + .018, 5), (.07, face_top + .018, 5),
         (.07, face_top + .05, top), (.025, face_top + .05, top)]
    if not island:
        # Recessed contrasting inlay, with an actual return at both lips.
        p += [(.015, 3.195, 1), (.032, 3.215, 1),
              (.055, 3.225, 2), (.055, 3.355, 1),
              (.032, 3.365, 1), (.015, 3.385, 1)]
    # A rolled front and rear edge, confined to the existing top footprint.
    r = (.085 if rounded else .035) if not island else (.065 if rounded else .025)
    p.append((0, h-r, top))
    for k in range(1, 7):
        a = math.pi - k * math.pi/12
        p.append((r + r*math.cos(a), h-r + r*math.sin(a), top))
    p.append((depth-r, h, top))
    for k in range(1, 7):
        a = math.pi/2 - k * math.pi/12
        p.append((depth-r + r*math.cos(a), h-r + r*math.sin(a), top))
    # Clerk-side finger rail and inset door faces are part of the same skin.
    p += [(depth, h-.13, top), (depth-.04, h-.16, 5),
          (depth-.11, h-.16, 5), (depth-.11, h-.23, 5),
          (depth-.035, h-.25, 0), (depth-.035, .35, 0),
          (depth-.055, .32, 4), (depth-.20, .32, 4),
          (depth-.20, 0, 4)]
    return p


def sweep(name, path, depth, island=False, rounded=False):
    """Welded quad rings, including mitres, routed seams and closed cut ends."""
    pts = [Vector(p) for p in path]
    tangents = [(b-a).normalized() for a, b in zip(pts, pts[1:])]
    normals = [Vector((-t.y, t.x)) for t in tangents]
    offsets = [normals[0]]
    for a, b in zip(normals, normals[1:]):
        bis = (a+b).normalized()
        offsets.append(bis / a.dot(bis))
    offsets.append(normals[-1])
    rings = []
    distance = 0
    for i, (a, b) in enumerate(zip(pts, pts[1:])):
        length = (b-a).length
        # Deliberate joinery, roughly 30-inch panels. Four rings per reveal
        # make a chamfer into a narrow, recessed joint, not a dark decal.
        divisions = max(1, round(length / (2.3 if island else 2.8)))
        stations = [(0, 0)]
        for j in range(1, divisions):
            s = length*j/divisions
            stations += [(s-.027, 0), (s-.012, 1), (s+.012, 1), (s+.027, 0)]
        stations += [(length, 0)]
        for s, seam in stations:
            if i and s == 0:
                continue
            t = s/length
            rings.append((a.lerp(b, t), offsets[i].lerp(offsets[i+1], t), distance+s, seam))
        distance += length
    profile = section(depth, island, rounded)
    verts, faces, materials, uv = [], [], [], []
    perimeter = [0]
    for a, b in zip(profile, profile[1:]):
        perimeter.append(perimeter[-1] + math.hypot(a[0]-b[0], a[1]-b[1]))
    for p, normal, s, seam in rings:
        for d, y, mat in profile:
            # Only cabinet panels receive vertical reveals, never the top
            # or the inlay. All adjacent patches share their exact vertices.
            if .35 <= y <= (2.55 if island else 2.23) and (d < .08 or d > depth-.08):
                d += (.021 if d < depth/2 else -.021) * seam
            q = p + normal*d
            verts.append((q.x, -q.y, y))
    count = len(profile)
    for i in range(len(rings)-1):
        for j in range(count):
            k = (j+1) % count
            faces.append((i*count+j, (i+1)*count+j, (i+1)*count+k, i*count+k))
            mat = profile[j][2]
            if mat == 0 and rings[i][3] and rings[i+1][3]:
                mat = 5
            materials.append(mat)
            v0, v1 = perimeter[j], perimeter[k] if k else perimeter[-1]+.1
            uv.append([(rings[i][2]/4, v0/4), (rings[i+1][2]/4, v0/4),
                       (rings[i+1][2]/4, v1/4), (rings[i][2]/4, v1/4)])
    # End panels match the physical cut, including the stepped plinth.
    for end, reverse in [(0, True), (len(rings)-1, False)]:
        indices = list(range(end*count, (end+1)*count))
        if reverse:
            indices.reverse()
        faces.append(indices)
        materials.append(0)
        uv.append([(profile[j % count][0]/4, profile[j % count][1]/4) for j in indices])
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    for mat in MATERIALS:
        mesh.materials.append(mat)
    layer = mesh.uv_layers.new(name='MillworkUV')
    for polygon, mat, coords in zip(mesh.polygons, materials, uv):
        polygon.material_index = mat
        for li, coord in zip(polygon.loop_indices, coords):
            layer.data[li].uv = coord
    bm = bmesh.new()
    bm.from_mesh(mesh)
    # Slice the cut-end faces at finish transitions. A cabinet's exposed end
    # must carry the blue edging around the cut, not a white wall through it.
    cap_layer = bm.faces.layers.int.new('cut_end')
    bm.faces.ensure_lookup_table()
    bm.faces[-1][cap_layer] = bm.faces[-2][cap_layer] = 1
    for y in [.32, 2.60 if island else 2.28]:
        bmesh.ops.bisect_plane(bm, geom=list(bm.verts)+list(bm.edges)+list(bm.faces),
                              dist=0.000001, plane_co=(0,0,y), plane_no=(0,0,1))
    for face in bm.faces:
        if face[cap_layer]:
            y = face.calc_center_median().z
            face.material_index = 4 if y < .32 else (3 if island else 1) if y > (2.60 if island else 2.28) else 0
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    # Every authored part must be closed and manifold BEFORE export.
    assert all(e.is_manifold for e in bm.edges), name + ': open/nonmanifold edge'
    # Smooth only the small rolled-edge steps, preserve panel/mitre corners.
    for edge in bm.edges:
        edge.smooth = edge.calc_face_angle(0) < math.radians(25)
    for face in bm.faces:
        face.smooth = len(face.verts) == 4
    bm.to_mesh(mesh)
    bm.free()
    obj['construction'] = 'Welded millwork surface with routed panel joints; original Halcyon model'
    return obj


def shield():
    points = [Vector(p) for p in [(-6.2,-.1),(-9.8,-6.34),(0,-14.1),(9.8,-6.34),(6.2,-.1)]]
    # Same 2.2-foot trims as counter.ts: an open staff entrance at the left shoulder.
    a = points[1] + (points[2]-points[1]).normalized()*2.2
    b = points[1] + (points[0]-points[1]).normalized()*2.2
    path = [a, points[2], points[3], points[4], points[0], b]
    t = (points[2]-points[1]).normalized()
    n = Vector((-t.y,t.x))
    apex = Vector((0,-14.1 + 1.5/n.y))
    left = Vector((-6, apex.y + 6*7.76/9.8))
    right = Vector((6,left.y))
    return [path], [left,apex,right]


variants = []
for shape in ['shield', 'usquare', 'desk']:
    if shape == 'shield':
        paths, island = shield()
    elif shape == 'usquare':
        paths = [[(-6.8,-5.2),(-6.8,-12.1),(6.8,-12.1),(6.8,-.11)],
                 [(-6.8,-.11),(-6.8,-3.0)]]
        island = [(-5,-10.6),(5,-10.6)]
    else:
        paths, island = [], [(-3,0),(3,0)]
    for style in ['laminate', 'rounded']:
        collection = bpy.data.collections.new(f'{shape}-{style}')
        bpy.context.scene.collection.children.link(collection)
        objects = []
        for i, path in enumerate(paths):
            objects.append(sweep(f'{shape}-surround-{i}', path, 1.5, rounded=style == 'rounded'))
        objects.append(sweep(f'{shape}-work-cabinet', island, 1.6, island=True, rounded=style == 'rounded'))
        for obj in objects:
            for owner in list(obj.users_collection):
                owner.objects.unlink(obj)
            collection.objects.link(obj)
        bpy.ops.object.select_all(action='DESELECT')
        for obj in objects:
            obj.select_set(True)
        bpy.context.view_layer.objects.active = objects[0]
        bpy.ops.export_scene.gltf(filepath=str(OUT / f'checkout-counter-{shape}-{style}.glb'),
                                  export_format='GLB', use_selection=True,
                                  export_extras=True, export_yup=True)
        tris = sum(sum(len(p.vertices)-2 for p in o.data.polygons) for o in objects)
        print(f'COUNTER VERIFIED {shape}-{style}: {tris} triangles; all surfaces manifold')
        variants.append(collection)

# Keep every variant editable, with only the primary counter visible on open.
for collection in variants[1:]:
    collection.hide_viewport = True
    collection.hide_render = True
for obj in bpy.context.selected_objects:
    obj.select_set(False)
for obj in variants[0].objects:
    obj.select_set(True)
bpy.context.view_layer.objects.active = variants[0].objects[0]
for screen in bpy.data.screens:
    for area in screen.areas:
        if area.type == 'VIEW_3D':
            area.spaces.active.region_3d.view_location = (0, 6.5, 1.6)
            area.spaces.active.region_3d.view_distance = 25
            area.spaces.active.region_3d.view_rotation = Euler((1.05, 0, .5)).to_quaternion()
            area.spaces.active.shading.color_type = 'MATERIAL'
bpy.context.scene.unit_settings.system = 'IMPERIAL'
bpy.context.scene.unit_settings.scale_length = .3048
bpy.context.preferences.filepaths.save_version = 0
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT / 'tools/models/checkout-counter.blend'), compress=True)
