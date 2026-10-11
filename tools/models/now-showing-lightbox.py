"""Hanging double-sided now-showing poster lightbox (#242); Blender scripted mesh authoring.
Run: blender -b -P tools/models/now-showing-lightbox.py
Authored in store coordinates (x right, y up, z toward viewer on the +face), feet.
Blender (x,-z,y) -> glTF Y-up (x,y,z). Origin = centre of the poster window.
Parts: GoldFrame x2 faces (moulded, stepped), LightboxShell (hollow tube), bulbs
(glass/neck/socket), interior tubes + holders, two rods + ceiling canopies (rods
are unit-length, origin at their base; runtime stretches them to the ceiling),
separate header plaque hung on straps from collars on the rods.
"""
import bpy, bmesh, math
from pathlib import Path
ROOT = Path(__file__).resolve().parents[2]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.context.scene.unit_settings.system = 'IMPERIAL'
bpy.context.scene.unit_settings.scale_length = .3048

HW, HH = .95, 1.40          # box inner opening (poster window 1.8 x 2.7 behind a .05 lip)
HALF_DEPTH = .19
ROD_X = 1.0

def material(name, color, metal=0, rough=.4, emission=0, ecol=None):
    m = bpy.data.materials.new(name); m.diffuse_color = (*color, 1)
    p = m.node_tree.nodes.get('Principled BSDF')
    p.inputs['Base Color'].default_value = (*color, 1)
    p.inputs['Metallic'].default_value = metal; p.inputs['Roughness'].default_value = rough
    if emission:
        p.inputs['Emission Color'].default_value = (*(ecol or color), 1); p.inputs['Emission Strength'].default_value = emission
    return m

MAT = {
    'GoldFrame': material('GoldFrame', (.62, .42, .12), .85, .32),
    'LightboxShell': material('LightboxShell', (.07, .06, .06), 0, .6),
    'BulbGlass': material('BulbGlass', (.13, .07, .03), emission=3.2, ecol=(1, .694, .352)),
    'NickelNeck': material('NickelNeck', (.34, .29, .20), .7),
    'PorcelainSocket': material('PorcelainSocket', (.28, .25, .20)),
    'TubeLight': material('TubeLight', (1, 1, 1), emission=4, ecol=(1, .95, .85)),
    'RodSteel': material('RodSteel', (.45, .45, .47), .8, .35),
    'PlaqueTrim': material('PlaqueTrim', (.62, .42, .12), .85, .32),
    'PlaqueFace': material('PlaqueFace', (.05, .05, .2), 0, .5),
}

def B(v):  # store -> blender
    return (v[0], -v[2], v[1])

def finish(name, verts, faces, mat, solid=True, uv='box', smooth=False):
    mesh = bpy.data.meshes.new(name); mesh.from_pydata([B(v) for v in verts], [], faces); mesh.update()
    bm = bmesh.new(); bm.from_mesh(mesh)
    if solid:
        bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
        assert all(e.is_manifold for e in bm.edges), name
    bm.to_mesh(mesh); bm.free()
    layer = mesh.uv_layers.new(name='UV0')
    if uv == 'box':
        for poly in mesh.polygons:
            n = poly.normal; ax = max(range(3), key=lambda i: abs(n[i]))
            k = [(1, 2), (0, 2), (0, 1)][ax]
            for li in poly.loop_indices:
                p = mesh.vertices[mesh.loops[li].vertex_index].co
                layer.data[li].uv = (p[k[0]] / 3 % 1.0, p[k[1]] / 3 % 1.0)
    for poly in mesh.polygons:
        poly.use_smooth = smooth
    mesh.materials.append(MAT[mat])
    obj = bpy.data.objects.new(name, mesh); bpy.context.collection.objects.link(obj)
    obj['units'] = 'feet'; obj['provenance'] = 'Original generic fixture, issue #242; no third-party mesh'
    return obj

def sweep(name, profile, mat):
    """Closed ring: profile [(d, z)] swept around the box window with mitred corners."""
    corners = [(1, 1), (-1, 1), (-1, -1), (1, -1)]
    verts = []; n = len(profile)
    for d, z in profile:
        for sx, sy in corners:
            verts.append((sx * (HW + d), sy * (HH + d), z))
    faces = []
    for i in range(n):
        j = (i + 1) % n
        for c in range(4):
            c2 = (c + 1) % 4
            faces.append((i * 4 + c, i * 4 + c2, j * 4 + c2, j * 4 + c))
    return finish(name, verts, faces, mat)

FRAME_H = [(-.05, 0), (-.05, .05), (0, .07), (.03, .11), (.07, .11), (.09, .07), (.11, .07),
           (.23, .07), (.25, .10), (.27, .10), (.27, 0)]
frames = []
for sgn, nm in ((1, 'FrameFront'), (-1, 'FrameBack')):
    frames.append(sweep(nm, [(d, sgn * (HALF_DEPTH + h)) for d, h in FRAME_H], 'GoldFrame'))
sweep('LightboxShell', [(0, -HALF_DEPTH), (.04, -HALF_DEPTH), (.04, HALF_DEPTH), (0, HALF_DEPTH)], 'LightboxShell')

# ---- bulbs: 8-sided turned lamp (same envelope as the #241 marquee lamp), both faces ----
N = 6
def lathe_parts(profile, cx, cy, cz, sgn):
    verts = []; rings = []; faces = []
    for r, z in profile:
        ring = []
        for j in range(N if r else 1):
            a = j * 2 * math.pi / N; ring.append(len(verts))
            verts.append((cx + r * math.cos(a), cy + r * math.sin(a), cz + sgn * z))
        rings.append(ring)
    for a, b in zip(rings, rings[1:]):
        for j in range(N):
            k = (j + 1) % N
            faces.append((a[0], b[k], b[j]) if len(a) == 1 else (a[j], a[k], b[0]) if len(b) == 1 else (a[j], a[k], b[k], b[j]))
    return verts, faces

PROFILES = {
    'BulbGlass': [(0, -.036), (.021, -.036), (.034, -.022), (.045, 0), (.040, .021), (.025, .037), (0, .045)],
    'NickelNeck': [(0, -.055), (.019, -.055), (.021, -.051), (.021, -.036), (0, -.036)],
    'PorcelainSocket': [(0, -.085), (.029, -.085), (.033, -.081), (.033, -.073), (.027, -.069), (.027, -.055), (.023, -.052), (0, -.052)],
}
BD = .17; BX, BY = HW + BD, HH + BD
pts = []
nx, ny = 6, 9
for i in range(nx): pts.append((BX - i * 2 * BX / nx, BY))
for i in range(ny): pts.append((-BX, BY - i * 2 * BY / ny))
for i in range(nx): pts.append((-BX + i * 2 * BX / nx, -BY))
for i in range(ny): pts.append((BX, -BY + i * 2 * BY / ny))
bulb_z = HALF_DEPTH + .07 + .085
for mname, prof in PROFILES.items():
    V = []; F = []
    for sgn in (1, -1):
        for (px, py) in pts:
            v, f = lathe_parts(prof, px, py, sgn * bulb_z, sgn)
            F += [tuple(i + len(V) for i in face) for face in f]; V += v
    finish(mname if mname != 'BulbGlass' else 'Bulbs', V, F, mname, uv='box', smooth=True)
BULB_COUNT = len(pts) * 2

# ---- generic closed primitives ----
def cyl(name_, cx, cy, cz, r, length, axis, mat, sides=8, base=False):
    """Closed capped cylinder along axis 'x'|'y'|'z'; returns (verts, faces)."""
    verts = []; faces = []
    for e in (0, 1):
        t = (0 if base else -length / 2) + e * length
        for j in range(sides):
            a = j * 2 * math.pi / sides; u, w = r * math.cos(a), r * math.sin(a)
            p = {'y': (cx + u, cy + t, cz + w), 'x': (cx + t, cy + u, cz + w), 'z': (cx + u, cy + w, cz + t)}[axis]
            verts.append(p)
    for j in range(sides):
        k = (j + 1) % sides; faces.append((j, k, sides + k, sides + j))
    faces.append(tuple(range(sides))); faces.append(tuple(sides + j for j in range(sides)))
    return verts, faces

def merge(name, parts, mat):
    V = []; F = []
    for v, f in parts:
        F += [tuple(i + len(V) for i in face) for face in f]; V += v
    return finish(name, V, F, mat)

def box(cx, cy, cz, sx, sy, sz):
    v = [(cx + a * sx / 2, cy + b * sy / 2, cz + c * sz / 2) for a in (-1, 1) for b in (-1, 1) for c in (-1, 1)]
    f = [(0, 1, 3, 2), (4, 6, 7, 5), (0, 4, 5, 1), (2, 3, 7, 6), (0, 2, 6, 4), (1, 5, 7, 3)]
    return v, f

# interior fluorescent tubes between the two posters, with holders
merge('InteriorTubes', [cyl('t', x, 0, 0, .03, 2.7, 'y', 'TubeLight') for x in (-.5, .5)], 'TubeLight')
merge('InteriorHolders', [box(x, y, 0, .09, .06, .09) for x in (-.5, .5) for y in (-1.38, 1.38)], 'RodSteel')

# ---- suspension ----
TOP = HH + .27
for nm, sx in (('Rod_L', -1), ('Rod_R', 1)):
    o = merge(nm, [cyl('r', 0, 0, 0, .018, 1.0, 'y', 'RodSteel', base=True)], 'RodSteel')
    o.location = B((sx * ROD_X, TOP, 0))
    o = merge('Canopy_' + nm[-1], [cyl('c', 0, 0, 0, .22, .05, 'y', 'RodSteel', 12),
                                    cyl('c2', 0, -.045, 0, .12, .04, 'y', 'RodSteel', 12)], 'RodSteel')
    o.location = B((sx * ROD_X, TOP + 1.0, 0))   # placeholder; runtime moves to the ceiling
merge('EyePlates', [cyl('e', sx * ROD_X, TOP + .02, 0, .06, .04, 'y', 'RodSteel', 10) for sx in (-1, 1)], 'RodSteel')

# header plaque, hung on straps from arms on collars on the rods (separate part)
PY, PW, PH, PD = 2.28, 1.8, .42, .07
merge('PlaqueBody', [box(0, PY, 0, PW, PH, PD)], 'PlaqueTrim')
hang = []
for sx in (-1, 1):
    hang.append(cyl('collar', sx * ROD_X, 2.85, 0, .035, .06, 'y', 'RodSteel', 8))
    hang.append(cyl('arm', sx * (ROD_X - .1), 2.85, 0, .012, .2, 'x', 'RodSteel', 6))
    hang.append(cyl('strap', sx * .8, (PY + PH / 2 + 2.85) / 2, 0, .012, 2.85 - PY - PH / 2, 'y', 'RodSteel', 6))
merge('PlaqueHardware', hang, 'RodSteel')
iw, ih, zf = PW / 2 - .06, PH / 2 - .05, PD / 2 + .002
V = [(-iw, PY - ih, zf), (iw, PY - ih, zf), (iw, PY + ih, zf), (-iw, PY + ih, zf),
     (iw, PY - ih, -zf), (-iw, PY - ih, -zf), (-iw, PY + ih, -zf), (iw, PY + ih, -zf)]
face = finish('PlaqueFace', V, [(0, 1, 2, 3), (4, 5, 6, 7)], 'PlaqueFace', solid=False, uv=None)
uvl = face.data.uv_layers['UV0']
for poly in face.data.polygons:
    for k, li in enumerate(poly.loop_indices):
        uvl.data[li].uv = [(0, 0), (1, 0), (1, 1), (0, 1)][k]

bpy.context.scene['contract'] = ('Feet; glTF Y-up, +Z front face; origin = poster window centre; poster window 1.8x2.7 at z=+-0.17 '
    f'(runtime planes); Rod_L/Rod_R unit length origin at base (stretch scale.y); Canopy_* moved to ceiling; {BULB_COUNT} bulbs')
for a in bpy.context.screen.areas if bpy.context.screen else []:
    if a.type == 'VIEW_3D':
        a.spaces.active.region_3d.view_distance = 8
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT / 'tools/models/now-showing-lightbox.blend'))
bpy.ops.export_scene.gltf(filepath=str(ROOT / 'public/models/now-showing-lightbox.glb'), export_format='GLB', export_yup=True, export_extras=True)
tris = sum(len(p.vertices) - 2 for o in bpy.data.objects for p in o.data.polygons)
print('OK bulbs', BULB_COUNT, 'tris', tris)
