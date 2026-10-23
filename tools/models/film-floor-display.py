"""Original corrugated floor display for one featured film; feet; no reference-derived art.
Run: blender -b -P tools/models/film-floor-display.py

Scripted bmesh authoring. Each board is a folded sheet: an open profile is
offset by the board thickness, filleted at its scores and extruded, so folds
are continuous surfaces rather than butted blocks. The back and both sides are
one folded blank whose side panels are cut back along the taper line.
"""
import bpy, bmesh, math, json
from pathlib import Path
import numpy as np

ROOT = Path(__file__).resolve().parents[2]
bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
for block in (bpy.data.meshes, bpy.data.materials, bpy.data.images):
  for item in list(block): block.remove(item)
scene = bpy.context.scene
scene.unit_settings.system = 'IMPERIAL'; scene.unit_settings.scale_length = .3048
scene['provenance'] = ('Original generic single-title corrugated floor display. No reference photograph; '
  'proportions follow common printed floor displays for boxed video. Not a period or brand replica.')
scene['contract'] = ('Feet; Blender (x,-store_z,height); origin floor centre of the base; store +Z faces the '
  'customer. Stock rows and header art are catalog-owned at runtime.')

# Shared with src/fixtures/film-floor-display.ts — change both together.
T = .024                 # double-wall board
HW = 1.05; XI = HW - T   # outer / inner half width
ZB, ZF = -.50, .50       # outer back face, foot of the side panels
KICK, TOP = .40, 4.46    # kick-base top, side-panel top
ZTF = .04                # side-panel front edge at TOP
TILT = .20               # deck rake (front edge high), radians
LIP, APRON, FLANGE = .15, .08, .18
Y0, PITCH, ROWS = .66, .95, 4
HEADER_H = .82
FOLD_R = .035
def zfront(y): return ZF - (y - KICK) * (ZF - ZTF) / (TOP - KICK)

def material(name, base, roughness):
  m = bpy.data.materials.new(name); m.diffuse_color = (*base, 1); m.use_nodes = True
  p = m.node_tree.nodes.get('Principled BSDF')
  p.inputs['Base Color'].default_value = (*base, 1); p.inputs['Roughness'].default_value = roughness
  p.inputs['Metallic'].default_value = 0
  return m
# Untextured finishes: satin litho print, kraft liner and the darker cut flute.
PRINT = material('FilmDisplayPrint', (.016, .016, .018), .58)
KRAFT = material('FilmDisplayKraft', (.6, .43, .26), .86)
FLUTE = material('FilmDisplayFlute', (.33, .22, .12), .95)
MATS = [PRINT, KRAFT, FLUTE]; P, K, F = 0, 1, 2

def fillet(points, r, segs=3):
  """Round each interior score of an open polyline with an arc of radius r."""
  out = [points[0]]
  for i in range(1, len(points) - 1):
    a, b, c = (np.array(points[j], float) for j in (i - 1, i, i + 1))
    d1 = (b - a) / np.linalg.norm(b - a); d2 = (c - b) / np.linalg.norm(c - b)
    turn = math.acos(max(-1, min(1, float(d1 @ d2))))
    if turn < 1e-3: out.append(tuple(b)); continue
    trim = r * math.tan(turn / 2); s, e = b - d1 * trim, b + d2 * trim
    side = 1 if d1[0] * d2[1] - d1[1] * d2[0] > 0 else -1
    centre = s + side * np.array([-d1[1], d1[0]]) * r
    a0 = math.atan2(*(s - centre)[::-1]); sweep = side * turn
    out += [tuple(centre + r * np.array([math.cos(a0 + sweep * k / segs), math.sin(a0 + sweep * k / segs)])) for k in range(segs + 1)]
  out.append(points[-1]); return out

def offset(points, t, side):
  """Miter offset; side=+1 offsets to the right of travel."""
  def normal(p, q):
    d = np.array(q, float) - np.array(p, float); d /= np.linalg.norm(d); return side * np.array([d[1], -d[0]])
  out = []
  for i, p in enumerate(points):
    if i == 0: nn = normal(points[0], points[1]); out.append(tuple(np.array(p) + t * nn)); continue
    if i == len(points) - 1: nn = normal(points[-2], points[-1]); out.append(tuple(np.array(p) + t * nn)); continue
    n1, n2 = normal(points[i - 1], p), normal(p, points[i + 1]); m = n1 + n2; m /= np.linalg.norm(m)
    out.append(tuple(np.array(p) + t * m / float(m @ n1)))
  return out

def store(axis, a, s, t):
  """Profile coordinates (s,t) at extrusion coordinate a -> Blender (x, -z, y)."""
  x, y, z = {'x': (a, t, s), 'y': (s, a, t), 'z': (s, t, a)}[axis]
  return (x, -z, y)

parts = []
def prism(name, poly, axis, a0, a1, edge_mats, caps):
  me = bpy.data.meshes.new(name); bm = bmesh.new()
  lo = [bm.verts.new(store(axis, a0, *p)) for p in poly]; hi = [bm.verts.new(store(axis, a1, *p)) for p in poly]
  f = bm.faces.new(lo); f.material_index = caps[0]
  f = bm.faces.new(hi[::-1]); f.material_index = caps[1]
  for i in range(len(poly)):
    j = (i + 1) % len(poly); f = bm.faces.new((lo[i], lo[j], hi[j], hi[i])); f.material_index = edge_mats[i]
  bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
  bm.to_mesh(me); bm.free()
  for m in MATS: me.materials.append(m)
  o = bpy.data.objects.new(name, me); scene.collection.objects.link(o); parts.append(o); return o

def sheet(name, path, side, axis, a0, a1, face_mat, back_mat, caps=(F, F), end_s=None):
  """Folded board: `path` traces the face side; thickness grows toward `side`.
  end_s squares the last cut to a plane of constant s (a butt joint)."""
  near = fillet(path, FOLD_R) if len(path) > 2 else path
  far = offset(near, T, side)
  if end_s is not None:
    (s0, t0), (s1, t1) = far[-2], far[-1]; k = (end_s - s0) / (s1 - s0); far[-1] = (end_s, t0 + k * (t1 - t0))
  runs = len(near) - 1
  return prism(name, near + far[::-1], axis, a0, a1, [face_mat] * runs + [F] + [back_mat] * runs + [F], caps)

def box(name, x0, x1, y0, y1, z0, z1, mats):
  """Flat board in the x-y plane: mats = (back z0, front z1, edges)."""
  return prism(name, [(x0, y0), (x1, y0), (x1, y1), (x0, y1)], 'z', z0, z1, [mats[2]] * 4, (mats[0], mats[1]))

# Back and sides: one blank, scored at the rear corners, printed both faces.
shell = sheet('Body_back_and_sides', [(-HW, ZF), (-HW, ZB), (HW, ZB), (HW, ZF)], -1, 'y', 0, TOP, P, P)
bm = bmesh.new(); bm.from_mesh(shell.data)
d = np.array([0, TOP - KICK, ZTF - ZF]); cut_n = (0, -d[2], d[1])  # store (x,y,z) normal of the taper plane
res = bmesh.ops.bisect_plane(bm, geom=bm.verts[:] + bm.edges[:] + bm.faces[:], dist=1e-7,
  plane_co=store('x', 0, ZF, KICK), plane_no=(0, -cut_n[2], cut_n[1]), clear_outer=True)
filled = bmesh.ops.holes_fill(bm, edges=bm.edges[:], sides=4)['faces']
for f in filled: f.material_index = F
bmesh.ops.recalc_face_normals(bm, faces=bm.faces); bm.to_mesh(shell.data); bm.free()

# Kick base: top and front folded from one strip, flush with the side feet.
sheet('Kick_base', [(ZB + T, KICK), (ZF, KICK), (ZF, 0)], 1, 'x', -XI, XI, P, K)

rows = []
for k in range(ROWS):
  yf = Y0 + k * PITCH; zl = zfront(yf + LIP) - .01; zd = zl - T
  yb = yf - (zd - (ZB + 2 * T)) * math.tan(TILT)
  sheet(f'Tray_{k}_deck', [(ZB + 2 * T, yb + FLANGE), (ZB + 2 * T, yb), (zd, yf)], 1, 'x', -XI, XI, P, K, end_s=zd)
  ya = KICK if k == 0 else yf - APRON
  prism(f'Tray_{k}_apron', [(zl - T, ya), (zl, ya), (zl, yf + LIP), (zl - T, yf + LIP)], 'x', -XI, XI, [F, P, F, K], (F, F))
  rows.append({'deckFrontY': round(yf, 4), 'apronFrontZ': round(zl, 4), 'deckBackY': round(yb, 4)})

# Header card stands in the back panel's plane on two rear lock tabs.
box('Header_card', -HW + .01, HW - .01, TOP, TOP + HEADER_H, ZB, ZB + T, (P, P, F))
for x in (-.55, .55): box('Header_lock_tab', x - .07, x + .07, TOP - .22, TOP + .22, ZB - T, ZB, (K, K, F))

anchors = [('Anchor_Header', (0, TOP + HEADER_H / 2, ZB + T))] + \
  [(f'Anchor_Row_{k}', (0, r['deckFrontY'], r['apronFrontZ'])) for k, r in enumerate(rows)]
for name, (x, y, z) in anchors:
  e = bpy.data.objects.new(name, None); scene.collection.objects.link(e); e.location = (x, -z, y); e.empty_display_size = .08

for o in parts:
  bm = bmesh.new(); bm.from_mesh(o.data)
  assert all(e.is_manifold for e in bm.edges), o.name
  for f in bm.faces: f.smooth = True
  for e in bm.edges:
    if len(e.link_faces) == 2 and e.calc_face_angle(0) > math.radians(35): e.smooth = False
  uv = bm.loops.layers.uv.new('UVMap')
  for f in bm.faces:
    axis = max(range(3), key=lambda k: abs(f.normal[k])); a, b = [k for k in range(3) if k != axis]
    for loop in f.loops: loop[uv].uv = (loop.vert.co[a], loop.vert.co[b])  # one tile per foot
  bm.to_mesh(o.data); bm.free()
  o['units'] = 'feet'; o['provenance'] = 'Original generic; scripted bmesh folded board'

collection = bpy.data.collections.new('FilmFloorDisplay'); scene.collection.children.link(collection)
for o in parts: scene.collection.objects.unlink(o); collection.objects.link(o)
bpy.context.preferences.filepaths.save_version = 0
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT / 'tools/models/film-floor-display.blend'))

bpy.ops.object.select_all(action='DESELECT')
for o in parts: o.select_set(True)
for o in scene.objects:
  if o.type == 'EMPTY': o.select_set(True)
path = ROOT / 'public/models/film-floor-display.glb'
bpy.ops.export_scene.gltf(filepath=str(path), export_format='GLB', use_selection=True, export_extras=True)
tri = 0
for o in parts: o.data.calc_loop_triangles(); tri += len(o.data.loop_triangles)
pts = [o.matrix_world @ v.co for o in parts for v in o.data.vertices]
lo = [min(p[k] for p in pts) for k in range(3)]; hi = [max(p[k] for p in pts) for k in range(3)]
metrics = {
  'triangles': tri, 'glbBytes': path.stat().st_size, 'parts': len(parts), 'materials': [m.name for m in MATS],
  'textures': 0,
  'boundsFeet': {'min': [lo[0], lo[2], -hi[1]], 'max': [hi[0], hi[2], -lo[1]]},
  'board': T, 'tilt': TILT, 'rows': rows, 'columns': 3, 'headerFeet': [2 * HW - .02, HEADER_H], 'headerBottomY': TOP,
  'stock': 'Twelve face-out copies of one catalog film, three per raked tray; header art is the film\'s own backdrop.',
}
(ROOT / 'tools/models/film-floor-display-metrics.json').write_text(json.dumps(metrics, indent=2) + '\n'); print(metrics)
