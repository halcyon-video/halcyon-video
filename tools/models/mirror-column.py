"""Original four-sided mirrored column frame; scripted Blender mesh authoring.
Feet; Blender (X,Y,Z) -> store (X,Z,-Y). Origin is the floor point under the column axis.
The four mirror faces stay runtime panels (Reflector / painted wall) - this file models only
what frames them: base with toe recess and seat ledge, core, four angle corner posts, slim seat
rails and a stepped cap. Run: blender -b -t 2 -P tools/models/mirror-column.py
Generic structural-column cladding, not a measured replica. No reference pixels, no marks.
Parts have their origin at their own bottom so the runtime can fit the nominal 13.5 ft ceiling:
  Column base  (z 0..0.55)             stays on the floor
  Column cap   (z 0..0.45, rails below) moved to ceilingY - 0.45
  Column core / Column corner posts    (z 0..PANEL_H) Y-scaled to the real panel height
"""
import bpy, bmesh, math, json, struct
from pathlib import Path
ROOT = Path(__file__).resolve().parents[2]
bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
scene = bpy.context.scene; scene.unit_settings.system = 'IMPERIAL'; scene.unit_settings.scale_length = .3048

SIDE, PLINTH_H, CAP_H = 2.0, .55, .45
PANEL_H = 13.5 - PLINTH_H - CAP_H      # nominal; runtime rescales to the real ceiling
H = SIDE / 2

def make_mat(name, col, rough, metal):
    m = bpy.data.materials.new(name); m.diffuse_color = col; m.use_nodes = True
    b = m.node_tree.nodes.get('Principled BSDF'); b.inputs['Base Color'].default_value = col
    b.inputs['Roughness'].default_value = rough; b.inputs['Metallic'].default_value = metal
    return m
M_TRIM = make_mat('ColumnTrim', (.11, .12, .28, 1), .42, .25)
M_CORE = make_mat('ColumnCore', (.17, .18, .36, 1), .5, .2)
M_CORNER = make_mat('ColumnCorner', (.17, .18, .36, 1), .45, .3)
scene_parts = []
def new_obj(name, bm, mat, extra=None):
    bmesh.ops.remove_doubles(bm, verts=bm.verts[:], dist=1e-6)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    assert all(e.is_manifold for e in bm.edges), name + ' must be closed'
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free(); me.materials.append(mat)
    if extra: me.materials.append(extra)
    o = bpy.data.objects.new(name, me); scene.collection.objects.link(o); scene_parts.append(o); return o

def ring(bm, h, z, c):
    """Square ring half-width h at height z with chamfered corners (8 verts)."""
    p = [(h - c, -h), (h, -h + c), (h, h - c), (h - c, h), (-h + c, h), (-h, h - c), (-h, -h + c), (-h + c, -h)]
    return [bm.verts.new((x, y, z)) for x, y in p]
def loft(profile, c):
    """profile: [(half_width, z)] bottom to top; repeated z = horizontal step, repeated h = wall."""
    bm = bmesh.new(); rings = [ring(bm, h, z, c) for h, z in profile]
    for a, b in zip(rings, rings[1:]):
        for i in range(8): bm.faces.new((a[i], a[(i + 1) % 8], b[(i + 1) % 8], b[i]))
    bm.faces.new(list(reversed(rings[0]))); bm.faces.new(rings[-1])
    return bm
def add_box(bm, x0, x1, y0, y1, z0, z1, mat=0):
    r = bmesh.ops.create_cube(bm, size=1.0)
    for f in {f for v in r['verts'] for f in v.link_faces}: f.material_index = mat
    for v in r['verts']: v.co = (x0 + (v.co.x + .5) * (x1 - x0), y0 + (v.co.y + .5) * (y1 - y0), z0 + (v.co.z + .5) * (z1 - z0))

RAIL_H, RAIL_T, RAIL_END = .04, .02, .93      # slim seat rails tuck the panel edge
def rails(bm, zlo, zhi):
    for s in (1, -1):
        y0, y1 = sorted((s * H, s * (H + RAIL_T)))
        add_box(bm, -RAIL_END, RAIL_END, y0, y1, zlo, zhi, 1)
        add_box(bm, y0, y1, -RAIL_END, RAIL_END, zlo, zhi, 1)

# Base: recessed toe, ledge, face, ogee up to the seat ledge that the core and panels stand on.
base = [(H - .04, 0), (H - .04, .09), (H + .05, .09), (H + .05, .12), (H + .06, .14), (H + .06, .40),
        (H + .045, .44), (H + .035, .48), (H + .035, PLINTH_H)]
bm = loft(base, .03); rails(bm, PLINTH_H, PLINTH_H + RAIL_H); o_base = new_obj('Column base', bm, M_TRIM, M_CORNER)
# Cap: stepped crown, soffit overhangs the panel tops.
cap = [(H + .035, 0), (H + .035, .04), (H + .05, .07), (H + .06, .10), (H + .06, .31), (H + .05, .34), (H + .03, .37), (H + .03, CAP_H)]
bm = loft(cap, .03); rails(bm, -RAIL_H, 0); o_cap = new_obj('Column cap', bm, M_TRIM, M_CORNER)

# Core (backing the panels, shows in the hairline seams).
bm = bmesh.new(); add_box(bm, -H, H, -H, H, 0, PANEL_H); o_core = new_obj('Column core', bm, M_CORE)
# Corner posts: four L-section angles with a chamfered arris, full panel height.
A, B, C = H + .022, .93, .015
L = [(H, B), (A, B), (A, A - C), (A - C, A), (B, A), (B, H), (H, H)]
bm = bmesh.new()
for k in range(4):
    a = k * math.pi / 2; ca, sa = round(math.cos(a)), round(math.sin(a))
    pts = [(x * ca - y * sa, x * sa + y * ca) for x, y in L]
    lo = [bm.verts.new((x, y, 0)) for x, y in pts]; hi = [bm.verts.new((x, y, PANEL_H)) for x, y in pts]
    n = len(pts)
    for i in range(n): bm.faces.new((lo[i], lo[(i + 1) % n], hi[(i + 1) % n], hi[i]))
    bm.faces.new(list(reversed(lo))); bm.faces.new(hi)
o_post = new_obj('Column corner posts', bm, M_CORNER)
for o in (o_core, o_post): o.location = (0, 0, PLINTH_H)
o_cap.location = (0, 0, PLINTH_H + PANEL_H)

# Flat-shaded faces everywhere (hard mouldings); UVs and anchors.
for o in scene_parts:
    bpy.context.view_layer.objects.active = o; o.select_set(True)
    bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT'); bpy.ops.uv.smart_project(island_margin=.02)
    bpy.ops.object.mode_set(mode='OBJECT'); o.data.uv_layers[0].name = 'TrimUV'
    o.select_set(False)
for name, pos in [('floor_origin', (0, 0, 0)), ('ceiling_contact', (0, 0, PLINTH_H + PANEL_H + CAP_H)), ('panel_seat_bottom', (0, 0, PLINTH_H + .02))]:
    a = bpy.data.objects.new(name, None); scene.collection.objects.link(a); a.location = pos; a['units'] = 'feet'
scene['description'] = 'Original generic four-sided mirror column frame, 2 ft clad width, nominal 13.5 ft ceiling. Mirror faces are runtime panels.'
(ROOT / 'public/models').mkdir(parents=True, exist_ok=True)
for area in bpy.context.screen.areas if bpy.context.screen else []:
    if area.type == 'VIEW_3D':
        area.spaces.active.region_3d.view_distance = 22; area.spaces.active.region_3d.view_location = (0, 0, 6.5)
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT / 'tools/models/mirror-column.blend'))
bpy.ops.object.select_all(action='DESELECT')
for o in scene_parts: o.select_set(True)
path = ROOT / 'public/models/mirror-column.glb'
bpy.ops.export_scene.gltf(filepath=str(path), export_format='GLB', use_selection=True, export_yup=True, export_extras=True)
b = path.read_bytes(); g = json.loads(b[20:20 + struct.unpack_from('<I', b, 12)[0]])
metrics = {'bytes': len(b), 'triangles': sum(g['accessors'][p['indices']]['count'] // 3 for m in g['meshes'] for p in m['primitives']),
           'drawCalls': sum(len(m['primitives']) for m in g['meshes']), 'nodes': [n['name'] for n in g['nodes']],
           'materials': [m['name'] for m in g['materials']], 'images': len(g.get('images', [])),
           'sideFeet': SIDE, 'baseHeightFeet': PLINTH_H, 'capHeightFeet': CAP_H, 'nominalPanelHeightFeet': PANEL_H,
           'maxOuterWidthFeet': 2 * (H + .06), 'allPrimitivesHaveUV': all('TEXCOORD_0' in p['attributes'] for m in g['meshes'] for p in m['primitives'])}
(ROOT / 'public/models/mirror-column.geometry.json').write_text(json.dumps(metrics, indent=2) + '\n'); print(metrics)
