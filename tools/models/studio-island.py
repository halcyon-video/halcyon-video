"""Original two-sided island merchandiser for a studio feature; feet; no reference-derived art.
Run: blender -b -P tools/models/studio-island.py

Scripted bmesh authoring. Laminate parts are prisms of measured profiles whose
thin faces carry edge banding: two tapered gable ends, a spine, raked shelves
with chrome front rails on both faces, a black plinth and a header bar whose
chrome trim is the bevel of its own edges.
"""
import bpy, bmesh, math, json
from pathlib import Path
from mathutils import Matrix

ROOT = Path(__file__).resolve().parents[2]
bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
for block in (bpy.data.meshes, bpy.data.materials):
  for item in list(block): block.remove(item)
scene = bpy.context.scene
scene.unit_settings.system = 'IMPERIAL'; scene.unit_settings.scale_length = .3048
scene['provenance'] = ('Original generic island merchandiser for a studio catalogue feature. No reference '
  'photograph; not a period or brand replica.')
scene['contract'] = ('Feet; Blender (x,-store_z,height); origin floor centre; store +Z and -Z are the two '
  'stocked faces. Shelves hold catalog cases; the header receives house labels at runtime.')

# Shared with src/fixtures/studio-island-geometry.ts — change both together.
HW, T = 1.6, .0625                     # half width, laminate thickness
FOOT, SHOULDER, TOP = 1.0, .5, 4.3     # gable half depth at the floor, start of taper, spine top
TOP_Z = .36                            # gable half depth at the top
SPINE = .06                            # spine half thickness
BASE_H, BASE_Z = .32, .94
LEAN, LIP, RAIL_T = .2, .12, .02
DECK_Y = (.75, 1.85, 2.95)
HEADER_H, HEADER_Z, TRIM = .85, .1, .025
def gable_z(y): return FOOT - max(0, y - SHOULDER) * (FOOT - TOP_Z) / (TOP - SHOULDER)

def material(name, base, roughness, metal=0.):
  m = bpy.data.materials.new(name); m.diffuse_color = (*base, 1); m.use_nodes = True
  p = m.node_tree.nodes.get('Principled BSDF')
  p.inputs['Base Color'].default_value = (*base, 1); p.inputs['Roughness'].default_value = roughness
  p.inputs['Metallic'].default_value = metal
  return m
LAM = material('IslandLaminate', (.62, .43, .25), .5)
EDGE = material('IslandEdgeBand', (.3, .2, .11), .55)
BASE = material('IslandBase', (.02, .02, .022), .6)
CHROME = material('IslandChrome', (.82, .82, .84), .22, 1.)
MATS = [LAM, EDGE, BASE, CHROME]; L, E, B, C = 0, 1, 2, 3

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

# Gable ends: laminate faces, banded edges, tapering above the shoulder.
gable = [(-FOOT, 0), (FOOT, 0), (FOOT, SHOULDER), (TOP_Z, TOP), (-TOP_Z, TOP), (-FOOT, SHOULDER)]
for side in (-1, 1):
  prism('Gable_left' if side < 0 else 'Gable_right', gable, 'x', side * HW - (T if side > 0 else 0), side * HW + (T if side < 0 else 0), [E] * len(gable), (L, L))
# Plinth, then the spine standing on it between the gables.
inner = HW - T
prism('Plinth', [(-BASE_Z, 0), (BASE_Z, 0), (BASE_Z, BASE_H), (-BASE_Z, BASE_H)], 'x', -inner, inner, [B] * 4, (B, B))
prism('Spine', [(-SPINE, BASE_H), (SPINE, BASE_H), (SPINE, TOP), (-SPINE, TOP)], 'x', -inner, inner, [E, L, E, L], (E, E))

rows = []
for face in (1, -1):
  for k, yf in enumerate(DECK_Y):
    front = gable_z(yf + LIP) - .02                 # rail's outer face inside the gable line
    deck_end = front - RAIL_T; depth = deck_end - SPINE
    yb = yf - depth * math.tan(LEAN)
    # Deck: a raked board from the spine face to the rail, banded at its nose.
    deck = [(SPINE, yb - T), (deck_end, yf - T), (deck_end, yf), (SPINE, yb)]
    deck = [(face * z, y) for z, y in deck]
    if face < 0: deck = deck[::-1]
    prism(f'Shelf_{"front" if face > 0 else "back"}_{k}_deck', deck, 'x', -inner, inner,
          [L, E, L, E], (E, E))  # mirrored and reversed, so the edge order holds
    rail = [(deck_end, yf - T - .02), (front, yf - T - .02), (front, yf + LIP), (deck_end, yf + LIP)]
    rail = [(face * z, y) for z, y in rail]
    if face < 0: rail = rail[::-1]
    prism(f'Shelf_{"front" if face > 0 else "back"}_{k}_rail', rail, 'x', -inner, inner, [C] * 4, (C, C))
    if face > 0: rows.append({'deckFrontY': yf, 'deckBackY': round(yb, 4), 'railFrontZ': round(front, 4)})

# Header bar: panel bevelled at every edge; the bevels are the chrome trim.
bm = bmesh.new()
bmesh.ops.create_cube(bm, size=1.0, matrix=Matrix.Translation((0, 0, TOP + HEADER_H / 2)) @ Matrix.Diagonal((2 * HW, 2 * HEADER_Z, HEADER_H, 1)))
for f in bm.faces: f.material_index = B
for f in bmesh.ops.bevel(bm, geom=bm.edges[:], offset=TRIM, segments=2, profile=.5, affect='EDGES')['faces']: f.material_index = C
bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
me = bpy.data.meshes.new('Header_bar'); bm.to_mesh(me); bm.free()
for m in MATS: me.materials.append(m)
o = bpy.data.objects.new('Header_bar', me); scene.collection.objects.link(o); parts.append(o)

anchors = [('Anchor_Header_front', (0, TOP + HEADER_H / 2, HEADER_Z)), ('Anchor_Header_back', (0, TOP + HEADER_H / 2, -HEADER_Z))] + \
  [(f'Anchor_Shelf_{k}', (0, r['deckFrontY'], r['railFrontZ'])) for k, r in enumerate(rows)]
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
    for loop in f.loops: loop[uv].uv = (loop.vert.co[a], loop.vert.co[b])
  bm.to_mesh(o.data); bm.free()
  o['units'] = 'feet'; o['provenance'] = 'Original generic; scripted bmesh prisms and bevel'

collection = bpy.data.collections.new('StudioIsland'); scene.collection.children.link(collection)
for o in parts: scene.collection.objects.unlink(o); collection.objects.link(o)
bpy.context.preferences.filepaths.save_version = 0
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT / 'tools/models/studio-island.blend'))

bpy.ops.object.select_all(action='DESELECT')
for o in parts: o.select_set(True)
for o in scene.objects:
  if o.type == 'EMPTY': o.select_set(True)
path = ROOT / 'public/models/studio-island.glb'
bpy.ops.export_scene.gltf(filepath=str(path), export_format='GLB', use_selection=True, export_extras=True)
tri = 0
for o in parts: o.data.calc_loop_triangles(); tri += len(o.data.loop_triangles)
pts = [o.matrix_world @ v.co for o in parts for v in o.data.vertices]
lo = [min(p[k] for p in pts) for k in range(3)]; hi = [max(p[k] for p in pts) for k in range(3)]
metrics = {
  'triangles': tri, 'glbBytes': path.stat().st_size, 'parts': len(parts), 'materials': [m.name for m in MATS], 'textures': 0,
  'boundsFeet': {'min': [lo[0], lo[2], -hi[1]], 'max': [hi[0], hi[2], -lo[1]]},
  'lean': LEAN, 'laminate': T, 'spineHalf': SPINE, 'innerHalfWidth': inner, 'rows': rows,
  'header': {'bottomY': TOP, 'height': HEADER_H, 'halfDepth': HEADER_Z},
  'stock': 'Three raked shelves of four face-out copies on each face; the header carries the studio name.',
}
(ROOT / 'tools/models/studio-island-metrics.json').write_text(json.dumps(metrics, indent=2) + '\n'); print(metrics)
