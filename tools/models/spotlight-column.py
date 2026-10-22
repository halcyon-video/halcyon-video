"""Original marquee column for an actor spotlight; feet; no reference-derived art.
Run: blender -b -P tools/models/spotlight-column.py

Scripted bmesh authoring. Round parts are lathed from measured profiles: one
continuous plinth-and-drum body and three raked chrome ledge rings, so their
rims and steps are real turned surfaces. The four-sided marquee box carries
chrome edge trim as bevels of its own panels, and rows of lamp bulbs.
"""
import bpy, bmesh, math, json
from pathlib import Path
from mathutils import Matrix, Vector

ROOT = Path(__file__).resolve().parents[2]
bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
for block in (bpy.data.meshes, bpy.data.materials):
  for item in list(block): block.remove(item)
scene = bpy.context.scene
scene.unit_settings.system = 'IMPERIAL'; scene.unit_settings.scale_length = .3048
scene['provenance'] = ('Original generic marquee column for a floor spotlight. No reference photograph; '
  'not a period, theatre or brand replica.')
scene['contract'] = ('Feet; Blender (x,-store_z,height); origin floor centre; store +Z is the front face. '
  'Ledge rings hold catalog cases; the marquee faces receive house labels at runtime.')

# Shared with src/fixtures/spotlight-column-geometry.ts — change both together.
SEG = 48
DRUM_R = .95; LEDGE_R = 1.22; RIM_T = .025; RIM_H = .09; LEDGE_T = .04
LEAN = .20; LEDGE_Y = (1.25, 2.25, 3.25)   # ledge top at the drum
BASE_R, BASE_H, STEP_R, STEP_H = 1.28, .12, 1.10, .18
BOX_S, BOX_Y0, BOX_H, TRIM = 2.2, 4.45, .8, .03
BULBS, BULB_R = 7, .045

def material(name, base, roughness, metal=0., emit=0.):
  m = bpy.data.materials.new(name); m.diffuse_color = (*base, 1); m.use_nodes = True
  p = m.node_tree.nodes.get('Principled BSDF')
  p.inputs['Base Color'].default_value = (*base, 1); p.inputs['Roughness'].default_value = roughness
  p.inputs['Metallic'].default_value = metal
  if emit:
    p.inputs['Emission Color'].default_value = (*base, 1); p.inputs['Emission Strength'].default_value = emit
  return m
BODY = material('MarqueeBody', (.018, .018, .02), .45)
CHROME = material('MarqueeChrome', (.82, .82, .84), .22, 1.)
BULB = material('MarqueeBulb', (1., .82, .52), .3, emit=1.6)
MATS = [BODY, CHROME, BULB]; B, C, L = 0, 1, 2

parts = []
def finish(name, bm, smooth=True):
  me = bpy.data.meshes.new(name); bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
  bm.to_mesh(me); bm.free()
  for m in MATS: me.materials.append(m)
  o = bpy.data.objects.new(name, me); scene.collection.objects.link(o); parts.append(o); return o

def lathe(name, profile, mat, closed):
  """Revolve (r, y) points about the height axis. Points with r == 0 become
  poles; a closed profile is a ring section joined back to its start."""
  bm = bmesh.new(); rings = []
  for r, y in profile:
    if r == 0: rings.append([bm.verts.new((0, 0, y))])
    else: rings.append([bm.verts.new((r * math.sin(a), -r * math.cos(a), y))
                        for a in (math.tau * k / SEG for k in range(SEG))])
  pairs = list(zip(rings, rings[1:])) + ([(rings[-1], rings[0])] if closed else [])
  for lo, hi in pairs:
    for k in range(SEG):
      j = (k + 1) % SEG
      if len(lo) == 1: f = bm.faces.new((lo[0], hi[j], hi[k]))
      elif len(hi) == 1: f = bm.faces.new((lo[k], lo[j], hi[0]))
      else: f = bm.faces.new((lo[k], lo[j], hi[j], hi[k]))
      f.material_index = mat
  return finish(name, bm)

# Plinth and drum: one turned body from the floor to the marquee seat.
lathe('Column_body', [(0, 0), (BASE_R, 0), (BASE_R, BASE_H), (STEP_R, BASE_H), (STEP_R, BASE_H + STEP_H),
                      (DRUM_R, BASE_H + STEP_H), (DRUM_R, BOX_Y0), (0, BOX_Y0)], B, False)
# Chrome kick band and seat collar, turned as rings.
lathe('Kick_band', [(BASE_R, .02), (BASE_R + .012, .02), (BASE_R + .012, BASE_H - .02), (BASE_R, BASE_H - .02)], C, True)
lathe('Seat_collar', [(DRUM_R, BOX_Y0 - .07), (DRUM_R + .03, BOX_Y0 - .07), (DRUM_R + .03, BOX_Y0), (DRUM_R, BOX_Y0)], C, True)

rise = math.tan(LEAN)
for k, y in enumerate(LEDGE_Y):
  yo = y + (LEDGE_R - RIM_T - DRUM_R) * rise   # deck meets the rim
  lathe(f'Ledge_{k}', [(DRUM_R, y - LEDGE_T), (LEDGE_R, yo - LEDGE_T), (LEDGE_R, yo + RIM_H),
                       (LEDGE_R - RIM_T, yo + RIM_H), (LEDGE_R - RIM_T, yo), (DRUM_R, y)], C, True)

# Marquee box: panels bevelled at every edge; the bevels are the chrome trim.
bm = bmesh.new()
bmesh.ops.create_cube(bm, size=1.0, matrix=Matrix.Translation((0, 0, BOX_Y0 + BOX_H / 2)) @ Matrix.Diagonal((BOX_S, BOX_S, BOX_H, 1)))
for f in bm.faces: f.material_index = B
trim = bmesh.ops.bevel(bm, geom=bm.edges[:], offset=TRIM, segments=2, profile=.5, affect='EDGES')
for f in trim['faces']: f.material_index = C
finish('Marquee_box', bm)

# Lamp rows above and below each face's label band.
for face in range(4):
  a = face * math.pi / 2
  out = Vector((math.sin(a), -math.cos(a), 0)); along = Vector((math.cos(a), math.sin(a), 0))
  for row, y in enumerate((BOX_Y0 + .12, BOX_Y0 + BOX_H - .12)):
    for i in range(BULBS):
      t = (i - (BULBS - 1) / 2) * (BOX_S - .36) / (BULBS - 1)
      bm = bmesh.new()
      centre = out * (BOX_S / 2 + BULB_R * .45) + along * t + Vector((0, 0, y))
      bmesh.ops.create_uvsphere(bm, u_segments=10, v_segments=6, radius=BULB_R, matrix=Matrix.Translation(centre))
      for f in bm.faces: f.material_index = L
      finish(f'Lamp_{face}_{row}_{i}', bm)

anchors = [(f'Anchor_Ledge_{k}', (0, y, DRUM_R)) for k, y in enumerate(LEDGE_Y)] + \
  [(f'Anchor_Marquee_{f}', (math.sin(f * math.pi / 2) * BOX_S / 2, BOX_Y0 + BOX_H / 2, math.cos(f * math.pi / 2) * BOX_S / 2)) for f in range(4)]
for name, (x, y, z) in anchors:
  e = bpy.data.objects.new(name, None); scene.collection.objects.link(e); e.location = (x, -z, y); e.empty_display_size = .08

for o in parts:
  bm = bmesh.new(); bm.from_mesh(o.data)
  assert all(e.is_manifold for e in bm.edges), o.name
  for f in bm.faces: f.smooth = True
  for e in bm.edges:
    if len(e.link_faces) == 2 and e.calc_face_angle(0) > math.radians(40): e.smooth = False
  uv = bm.loops.layers.uv.new('UVMap')
  for f in bm.faces:
    axis = max(range(3), key=lambda k: abs(f.normal[k])); a, b = [k for k in range(3) if k != axis]
    for loop in f.loops: loop[uv].uv = (loop.vert.co[a], loop.vert.co[b])
  bm.to_mesh(o.data); bm.free()
  o['units'] = 'feet'; o['provenance'] = 'Original generic; scripted bmesh lathe and bevel'

collection = bpy.data.collections.new('SpotlightColumn'); scene.collection.children.link(collection)
for o in parts: scene.collection.objects.unlink(o); collection.objects.link(o)
bpy.context.preferences.filepaths.save_version = 0
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT / 'tools/models/spotlight-column.blend'))

# Export one object per finish: the lamps alone are 56 parts.
finishes = lambda o: {p.material_index for p in o.data.polygons}
groups = [[o for o in parts if finishes(o) == {i}] for i in range(len(MATS))]
merged = [o for o in parts if len(finishes(o)) > 1]
for i, subset in enumerate(groups):
  if not subset: continue
  bpy.ops.object.select_all(action='DESELECT')
  for o in subset: o.select_set(True)
  bpy.context.view_layer.objects.active = subset[0]; bpy.ops.object.join()
  bpy.context.object.name = MATS[i].name; merged.append(bpy.context.object)
bpy.ops.object.select_all(action='DESELECT')
for o in merged: o.select_set(True)
for o in scene.objects:
  if o.type == 'EMPTY': o.select_set(True)
path = ROOT / 'public/models/spotlight-column.glb'
bpy.ops.export_scene.gltf(filepath=str(path), export_format='GLB', use_selection=True, export_extras=True)
tri = 0
for o in merged: o.data.calc_loop_triangles(); tri += len(o.data.loop_triangles)
pts = [o.matrix_world @ v.co for o in merged for v in o.data.vertices]
lo = [min(p[k] for p in pts) for k in range(3)]; hi = [max(p[k] for p in pts) for k in range(3)]
metrics = {
  'triangles': tri, 'glbBytes': path.stat().st_size, 'materials': [m.name for m in MATS], 'textures': 0,
  'boundsFeet': {'min': [lo[0], lo[2], -hi[1]], 'max': [hi[0], hi[2], -lo[1]]},
  'drumRadius': DRUM_R, 'ledgeRadius': LEDGE_R, 'rimThickness': RIM_T, 'lean': LEAN, 'ledgeY': list(LEDGE_Y),
  'marquee': {'size': BOX_S, 'bottomY': BOX_Y0, 'height': BOX_H}, 'lamps': 8 * BULBS,
  'stock': 'Three ledge rings of face-out copies, twelve per ring; marquee faces carry the subject name.',
}
(ROOT / 'tools/models/spotlight-column-metrics.json').write_text(json.dumps(metrics, indent=2) + '\n'); print(metrics)
