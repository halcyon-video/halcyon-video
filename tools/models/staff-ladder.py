"""Original wooden straight ladder in its leaning pose; scripted Blender mesh authoring.
Feet; Blender (X,Y,Z) -> store (X,Z,-Y). The ladder leans toward Blender +Y (store -Z).
Origin is the floor point under the ladder axis at the foot line; the wall is the
vertical plane y = wall_offset. Run: blender -b -t 2 -P tools/models/staff-ladder.py
Generic 1990s-era general-purpose wood ladder, not a measured replica. No reference pixels.
"""
import bpy, bmesh, math, json, struct
from pathlib import Path
from mathutils import Vector, Matrix
ROOT = Path(__file__).resolve().parents[2]
bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
scene = bpy.context.scene; scene.unit_settings.system = 'IMPERIAL'; scene.unit_settings.scale_length = .3048

L = 7.2            # rail length along the ladder axis
RAIL_W, RAIL_T = .14, .11     # 1-3/4 x 1-5/16 in nominal stock; wide face toward the climber
XC = .62           # rail centreline offset (outer width 1.52 ft)
RUNGS = [.8 + k for k in range(7)]
RUNG_R_END, RUNG_R_MID = .04, .036   # worn waist at the tread
LEAN = math.radians(14)
RODS = [2.3, 5.3]

def make_mat(name, col, rough):
    m = bpy.data.materials.new(name); m.diffuse_color = col; m.use_nodes = True
    b = m.node_tree.nodes.get('Principled BSDF'); b.inputs['Base Color'].default_value = col; b.inputs['Roughness'].default_value = rough
    return m
mats = [make_mat('LadderRailWood', (.42, .31, .22, 1), .78), make_mat('LadderRungWood', (.48, .36, .25, 1), .7),
        make_mat('LadderEndGrain', (.28, .20, .12, 1), .9), make_mat('LadderHardware', (.55, .56, .58, 1), .45)]
mats[3].metallic = 1.0
mats[3].node_tree.nodes.get('Principled BSDF').inputs['Metallic'].default_value = 1.0

inputs = bpy.data.collections.new('Editable construction parts'); scene.collection.children.link(inputs)
parts = []
def link(o): scene.collection.objects.link(o); parts.append(o); return o
def from_bm(name, bm, mat_idx=None):
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    for m in mats: me.materials.append(m)
    return link(bpy.data.objects.new(name, me))
def apply(o, mod):
    bpy.context.view_layer.objects.active = o; o.select_set(True); bpy.ops.object.modifier_apply(modifier=mod.name); o.select_set(False)

def cyl_x(name, x0, x1, radius_fn, seg=16, y=0, z=0, cap_mat=2, side_mat=1, stations=8):
    """Lathe along X; radius_fn(t) with t 0..1. Caps carry end grain material."""
    bm = bmesh.new(); rings = []
    for s in range(stations):
        t = s / (stations - 1); x = x0 + (x1 - x0) * t; r = radius_fn(t)
        rings.append([bm.verts.new((x, y + r * math.cos(2 * math.pi * i / seg), z + r * math.sin(2 * math.pi * i / seg))) for i in range(seg)])
    for s in range(stations - 1):
        for i in range(seg):
            f = bm.faces.new((rings[s][i], rings[s][(i + 1) % seg], rings[s + 1][(i + 1) % seg], rings[s + 1][i])); f.material_index = side_mat
    for ring, rev in ((rings[0], True), (rings[-1], False)):
        f = bm.faces.new(list(reversed(ring)) if rev else ring); f.material_index = cap_mat
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    return from_bm(name, bm)

def box(name, cx, cy, cz, w, d, h, mat=0):
    bm = bmesh.new(); bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts: v.co = (cx + v.co.x * w, cy + v.co.y * d, cz + v.co.z * h)
    for f in bm.faces: f.material_index = mat
    return from_bm(name, bm)

# Rails in the upright frame: X across, Y thickness (+Y toward wall), Z along the axis. Extra 0.2 ft below the floor.
rails = []
for side, nm in ((-1, 'Left rail'), (1, 'Right rail')):
    r = box(nm, side * XC, 0, (L - .2) / 2, RAIL_W, RAIL_T, L + .2)
    rails.append(r)
rungs = []
for k, v in enumerate(RUNGS):
    rungs.append(cyl_x(f'Rung {k + 1}', -XC - RAIL_W / 2 - .008, XC + RAIL_W / 2 + .008,
                       lambda t: RUNG_R_END - (RUNG_R_END - RUNG_R_MID) * math.sin(math.pi * t) ** 2, y=0, z=v))
rods = []
WASHER_T = .012
for k, v in enumerate(RODS):
    rods.append(cyl_x(f'Tie rod {k + 1}', -XC - RAIL_W / 2 - .03, XC + RAIL_W / 2 + .03, lambda t: .012, seg=10, z=v, cap_mat=3, side_mat=3, stations=2))
    for s in (-1, 1):
        xo = s * (XC + RAIL_W / 2)
        rods.append(cyl_x(f'Tie rod washer {k + 1}{"R" if s > 0 else "L"}', xo, xo + s * WASHER_T, lambda t: .034, seg=14, z=v, cap_mat=3, side_mat=3, stations=2))
# Mortises: rails are cut around each rung and rod with a hair of clearance so the seats read as joints.
def cutter(lo, hi, rad, z):
    o = cyl_x('cutter', lo, hi, lambda t: rad, seg=16, z=z, stations=2)
    parts.remove(o); return o
cutters = [cutter(-XC - RAIL_W / 2 - .02, XC + RAIL_W / 2 + .02, RUNG_R_END + .003, v) for v in RUNGS]
cutters += [cutter(-XC - RAIL_W / 2 - .02, XC + RAIL_W / 2 + .02, .0155, v) for v in RODS]
bpy.ops.object.select_all(action='DESELECT')
for c in cutters: c.select_set(True)
bpy.context.view_layer.objects.active = cutters[0]; bpy.ops.object.join(); allcut = bpy.context.object
for r in rails:
    mod = r.modifiers.new('Seats', 'BOOLEAN'); mod.operation = 'DIFFERENCE'; mod.object = allcut; mod.solver = 'EXACT'; mod.use_self = True
    apply(r, mod)
bpy.data.objects.remove(allcut)

for r in rails:
    mod = r.modifiers.new('Eased edges', 'BEVEL'); mod.width = .008; mod.segments = 2; mod.limit_method = 'ANGLE'; mod.angle_limit = math.radians(50); apply(r, mod)
    # Top end grain (before leaning): upward-facing faces near the top
    for p in r.data.polygons:
        if p.normal.z > .99 and p.center.z > L - .02: p.material_index = 2

# Lean everything about the foot line origin.
rot = Matrix.Rotation(-LEAN, 4, 'X')
for o in parts:
    me = o.data; me.transform(rot); me.update()
# Wall plane: rear face of the rail tops, trimmed back 0.035 ft so the contact is a flat, not a knife corner.
ymax = max(v.co.y for r in rails for v in r.data.vertices)
wall = ymax - .035
for r in rails:
    bm = bmesh.new(); bm.from_mesh(r.data)
    for co, no in (((0, 0, 0), (0, 0, 1)), ((0, wall, 0), (0, 1, 0))):
        geom = bm.verts[:] + bm.edges[:] + bm.faces[:]
        res = bmesh.ops.bisect_plane(bm, geom=geom, plane_co=co, plane_no=no, clear_inner=(co == (0, 0, 0)), clear_outer=(co != (0, 0, 0)))
        cut_edges = [e for e in res['geom_cut'] if isinstance(e, bmesh.types.BMEdge)]
        before = set(bm.faces)
        bmesh.ops.contextual_create(bm, geom=cut_edges)
        for f in bm.faces:
            if f not in before: f.material_index = 2
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    zmin = min(v.co.z for v in bm.verts); assert abs(zmin) < 1e-5, zmin
    assert all(e.is_manifold for e in bm.edges), 'rail must be closed'
    bm.to_mesh(r.data); bm.free()
for o in parts:
    for p in o.data.polygons: p.use_smooth = p.material_index in (1, 3)

for o in parts:
    c = o.copy(); c.data = o.data.copy(); inputs.objects.link(c)
inputs.hide_viewport = True; inputs.hide_render = True
bpy.ops.object.select_all(action='DESELECT')
for o in parts: o.select_set(True)
bpy.context.view_layer.objects.active = parts[0]; bpy.ops.object.join(); o = bpy.context.object; o.name = 'Wooden staff ladder'
bm = bmesh.new(); bm.from_mesh(o.data)
bmesh.ops.remove_doubles(bm, verts=bm.verts[:], dist=1e-5)
bm.to_mesh(o.data); bm.free()
bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT'); bpy.ops.uv.smart_project(island_margin=.02); bpy.ops.object.mode_set(mode='OBJECT')
o.data.uv_layers[0].name = 'WoodSurfaceUV'
zs = [v.co.z for v in o.data.vertices]; ys = [v.co.y for v in o.data.vertices]; xs = [v.co.x for v in o.data.vertices]
for name, pos in [('floor_origin', (0, 0, 0)), ('wall_contact', (0, wall, max(zs) - .05)), ('top_rung', (0, RUNGS[-1] * -math.sin(LEAN) * -1 if False else RUNGS[-1] * math.sin(LEAN), RUNGS[-1] * math.cos(LEAN)))]:
    a = bpy.data.objects.new(name, None); scene.collection.objects.link(a); a.location = pos; a['units'] = 'feet'; a.select_set(True)
scene['description'] = 'Original generic wooden straight ladder in leaning pose. Dimensions LOW historical confidence; not a measured replica.'
for area in bpy.context.screen.areas:
    if area.type == 'VIEW_3D':
        area.spaces.active.region_3d.view_distance = 11; area.spaces.active.region_3d.view_location = Vector((0, .6, 3.2))
(ROOT / 'public/models').mkdir(parents=True, exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT / 'tools/models/staff-ladder.blend'))
path = ROOT / 'public/models/staff-ladder.glb'
bpy.ops.export_scene.gltf(filepath=str(path), export_format='GLB', use_selection=True, export_yup=True, export_extras=True)
b = path.read_bytes(); g = json.loads(b[20:20 + struct.unpack_from('<I', b, 12)[0]])
metrics = {'bytes': len(b), 'triangles': sum(g['accessors'][p['indices']]['count'] // 3 for m in g['meshes'] for p in m['primitives']),
           'drawCalls': sum(len(m['primitives']) for m in g['meshes']), 'materials': [m['name'] for m in g['materials']], 'images': len(g.get('images', [])),
           'blenderBoundsFeet': [[min(xs), min(ys), min(zs)], [max(xs), max(ys), max(zs)]],
           'storeDimensionsFeet': {'width': max(xs) - min(xs), 'height': max(zs) - min(zs), 'depth': max(ys) - min(ys)},
           'wallOffsetFeet': wall, 'leanDegrees': math.degrees(LEAN), 'railLengthFeet': L,
           'allPrimitivesHaveUV': all('TEXCOORD_0' in p['attributes'] for m in g['meshes'] for p in m['primitives'])}
(ROOT / 'public/models/staff-ladder.geometry.json').write_text(json.dumps(metrics, indent=2) + '\n'); print(metrics)
