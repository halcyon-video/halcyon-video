"""Original scripted-mesh gutter/downspout kit for flat-roof parapet walls (#259).
Feet. Authoring frame is (x outward from the veneer face, y up, z along the wall);
Blender gets (x, -z, y) so the Y-up glTF export lands on Three.js (x, y, z).
Origin: veneer wall face (x=0) at the scupper invert (y=0), pipe centreline z=0.
Run: blender -b -P tools/models/gutter-downspout.py     Reference: docs/gutter-downspout-model.md
"""
import json, math
from pathlib import Path
import bpy, bmesh
ROOT = Path(__file__).resolve().parents[2]
bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
bpy.context.scene.unit_settings.system = 'IMPERIAL'; bpy.context.scene.unit_settings.scale_length = .3048

ROLES = {}
for name, color, rough, metal in [
    ('DownspoutSheet', (.045, .05, .055, 1), .5, .45),
    ('DownspoutHardware', (.2, .22, .23, 1), .45, .8),
    ('DownspoutSplash', (.3, .29, .27, 1), .92, 0),
]:
    m = bpy.data.materials.new(name); m.diffuse_color = color; m.use_nodes = True
    b = m.node_tree.nodes.get('Principled BSDF')
    b.inputs['Base Color'].default_value = color
    b.inputs['Roughness'].default_value = rough; b.inputs['Metallic'].default_value = metal
    ROLES[name] = m

D = .15      # fascia proud of the veneer face (large-store brick)
PX = .165    # pipe centreline offset from wall face: 0.04 stand-off + half of 0.25 depth
PT, PW, WALL = .25, .333, .012   # 3 x 4 in rectangular downpipe, 0.144 in sheet
OBJS = {}

def mesh(name, verts, faces, role):
    data = bpy.data.meshes.new(name)
    data.from_pydata([(x, -z, y) for x, y, z in verts], [], faces)
    data.materials.append(ROLES[role]); data.update()
    bm = bmesh.new(); bm.from_mesh(data)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces); bm.to_mesh(data); bm.free()
    o = bpy.data.objects.new(name, data); bpy.context.collection.objects.link(o)
    uv = data.uv_layers.new(name='SurfaceFeet')
    for poly in data.polygons:   # dominant-axis planar, one tile per foot
        axis = max(range(3), key=lambda k: abs(poly.normal[k]))
        ax = [k for k in range(3) if k != axis]
        for li in poly.loop_indices:
            v = data.vertices[data.loops[li].vertex_index].co
            uv.data[li].uv = (v[ax[0]], v[ax[1]])
    OBJS[name] = o
    return o

def prism(name, poly, z0, z1, role):
    """Closed extrusion of an x-y polygon between z0 and z1."""
    n = len(poly)
    verts = [(x, y, z) for z in (z0, z1) for x, y in poly]
    faces = [tuple(range(n)), tuple(range(2*n-1, n-1, -1))]
    faces += [(j, (j+1) % n, (j+1) % n + n, j + n) for j in range(n)]
    return mesh(name, verts, faces, role)

def merge(name, parts, role):
    """Join closed parts into one named object (several sheet-metal pieces)."""
    vs, fs = [], []
    for v, f in parts:
        base = len(vs); vs += v; fs += [tuple(i + base for i in face) for face in f]
    return mesh(name, vs, fs, role)

def pr(poly, z0, z1):
    n = len(poly)
    v = [(x, y, z) for z in (z0, z1) for x, y in poly]
    f = [tuple(range(n)), tuple(range(2*n-1, n-1, -1))] + [(j, (j+1) % n, (j+1) % n + n, j + n) for j in range(n)]
    return v, f

def bx(x0, x1, y0, y1, z0, z1):
    return pr([(x0, y0), (x1, y0), (x1, y1), (x0, y1)], z0, z1)

def slab(p0, p1, t, z0, z1):
    """Plate along the x-y segment p0->p1, thickness t, spanning z0..z1."""
    dx, dy = p1[0]-p0[0], p1[1]-p0[1]; l = math.hypot(dx, dy); nx, ny = -dy/l*t/2, dx/l*t/2
    return pr([(p0[0]+nx, p0[1]+ny), (p1[0]+nx, p1[1]+ny), (p1[0]-nx, p1[1]-ny), (p0[0]-nx, p0[1]-ny)], z0, z1)

def screw(x, y, z, r=.024, h=.018):
    v, f = [], []
    n = 8
    for k in range(n): a = k*math.tau/n; v.append((x, y + r*math.cos(a), z + r*math.sin(a)))
    for k in range(n): a = k*math.tau/n; v.append((x + h, y + r*math.cos(a), z + r*math.sin(a)))
    f = [tuple(reversed(range(n))), tuple(range(n, 2*n))] + [(k, (k+1) % n, (k+1) % n + n, k + n) for k in range(n)]
    return v, f

def section(t, w, c):
    return [(-t/2+c, -w/2), (t/2-c, -w/2), (t/2, -w/2+c), (t/2, w/2-c), (t/2-c, w/2), (-t/2+c, w/2), (-t/2, w/2-c), (-t/2, -w/2+c)]

def sweep(name, path, role, t=PT, w=PW, wall=WALL, c=.03):
    """Hollow chamfered-rectangle tube with mitred bends along an x-y polyline (annular end caps)."""
    outer, inner = section(t, w, c), section(t-2*wall, w-2*wall, max(c-wall, .004))
    pts = [];
    for i, p in enumerate(path):
        def nrm(a, b):
            dx, dy = b[0]-a[0], b[1]-a[1]; l = math.hypot(dx, dy); return (-dy/l, dx/l)
        n1 = nrm(path[i-1], p) if i > 0 else None
        n2 = nrm(p, path[i+1]) if i < len(path)-1 else None
        if n1 and n2:
            ax, ay = n1[0]+n2[0], n1[1]+n2[1]; l = math.hypot(ax, ay); ax, ay = ax/l, ay/l
            k = 1/(ax*n1[0]+ay*n1[1]); n = (ax*k, ay*k)
        else:
            n = n1 or n2
        pts.append((p, n))
    N = len(outer); verts = []
    for ring in (outer, inner):
        for p, n in pts:
            for u, v in ring: verts.append((p[0]+n[0]*u, p[1]+n[1]*u, v))
    S = len(pts)
    def idx(layer, i, j): return layer*S*N + i*N + j % N
    faces = []
    for i in range(S-1):
        for j in range(N):
            faces.append((idx(0, i, j), idx(0, i, j+1), idx(0, i+1, j+1), idx(0, i+1, j)))
            faces.append((idx(1, i, j+1), idx(1, i, j), idx(1, i+1, j), idx(1, i+1, j+1)))
    for i in (0, S-1):
        for j in range(N): faces.append((idx(0, i, j), idx(1, i, j), idx(1, i, j+1), idx(0, i, j+1)))
    return mesh(name, verts, faces, role)

# ── Conductor head + scupper (roof-edge outlet) ─────────────────────────────
th = .015; HB, HT, HW = -.60, .55, .42         # head bottom/top, half width
FX_B, FX_T = D + .43, D + .59                   # flared front: bottom / top depth
parts = []
# back flange plate on the fascia face, with the scupper opening left clear
parts += [bx(D, D+th, HB, -.0, -HW-.07, HW+.07), bx(D, D+th, 0, .5, -HW-.07, -.27), bx(D, D+th, 0, .5, .27, HW+.07),
          bx(D, D+th, .5, HT, -HW-.07, HW+.07)]
# flared sides and front, sloped floor strips around the outlet spigot
parts += [pr([(D, HB), (FX_B, HB), (FX_T, HT), (D, HT)], z0, z0+th) for z0 in (-HW, HW-th)]
parts += [slab((FX_B, HB), (FX_T, HT), th, -HW, HW)]
parts += [bx(D, D+PX-PT/2+.04, HB, HB+th, -HW, HW), bx(D+PX+PT/2+.04, FX_B, HB, HB+th, -HW, HW),
          bx(D+PX-PT/2+.04, D+PX+PT/2+.04, HB, HB+th, -HW, -PW/2), bx(D+PX-PT/2+.04, D+PX+PT/2+.04, HB, HB+th, PW/2, HW)]
# rolled top hem
parts += [bx(D, FX_T+.01, HT, HT+.03, z0, z0+.03) for z0 in (-HW-.005, HW-.025)] + [bx(FX_T-.02, FX_T+.015, HT, HT+.03, -HW, HW)]
# scupper spout: U-trough through the parapet, lip projecting into the head
parts += [bx(D-.45, D+.38, -.012, 0, -.262, .262)] + [bx(D-.45, D+.38, 0, .5, z0, z0+.012) for z0 in (-.262, .25)]
merge('DownspoutHead', parts, 'DownspoutSheet')

# ── Offset (fascia -> veneer) and discharge foot ────────────────────────────
OH = .5
sweep('DownspoutOffset', [(PX+D, 0), (PX+D, -.1), (PX, -.1-D), (PX, -OH)], 'DownspoutSheet')
FOOT_H = 1.5
sweep('DownspoutFoot', [(PX, 0), (PX, -.3), (PX+.45, -.75), (PX+.45, -1.2)], 'DownspoutSheet')
sweep('DownspoutRunPipe', [(PX, 0), (PX, -1.0)], 'DownspoutSheet')
sweep('DownspoutSleeve', [(PX, .11), (PX, -.11)], 'DownspoutSheet', t=PT+.026, w=PW+.026, wall=.01, c=.036)

# ── Splash block under the discharge (concrete) ─────────────────────────────
G = -FOOT_H
sb = [bx(.14, 2.35, G, G+.14, -.45, .45)]
sb += [bx(.14, 2.35, G+.14, G+.2, z0, z0+.07) for z0 in (-.45, .38)]
sb += [bx(.14, .24, G+.14, G+.2, -.38, .38)]
merge('DownspoutSplashBlock', sb, 'DownspoutSplash')

# ── Hardware: wall straps with lag screws, flange screws ────────────────────
st = []
b0, b1 = PX-PT/2-.006, PX+PT/2+.006
hw = PW/2+.006
t = .02; h = .04
st += [bx(b0-t, b1+t, -h, h, -hw-t, -hw), bx(b0-t, b1+t, -h, h, hw, hw+t), bx(b0-t, b0, -h, h, -hw, hw), bx(b1, b1+t, -h, h, -hw, hw)]
for s in (-1, 1):
    st += [bx(0, b0, -h, h, s*(hw+t)*1.0 - (0 if s > 0 else .12) + (0 if s < 0 else 0), s*(hw+t) + (.12 if s > 0 else 0))]
    st += [screw(b0, 0, s*(hw+t+.06), .022, .02)]
merge('DownspoutStrap', st, 'DownspoutHardware')
fl = []
for sy in (.15, .4, -.35, 0.0):
    for s in (-1, 1): fl.append(screw(D+th, sy if sy != 0.0 else -.5, s*(HW+.035)))
merge('DownspoutFlangeScrews', fl, 'DownspoutHardware')

for n, p in [('Scupper_invert', (D, 0, 0)), ('Head_outlet', (D+PX, -.4, 0)), ('Offset_top', (PX+D, 0, 0)), ('Discharge', (PX+.45, -1.2, 0)), ('Splash_top', (1.25, G+.2, 0))]:
    o = bpy.data.objects.new(n, None); bpy.context.collection.objects.link(o)
    o.location = (p[0], -p[2], p[1]); o.empty_display_size = .15

metrics = {'units': 'feet', 'textures': 0, 'meshes': []}
for o in list(OBJS.values()):
    bm = bmesh.new(); bm.from_mesh(o.data)
    open_e = sum(not e.is_manifold for e in bm.edges); bm.free()
    o.data.calc_loop_triangles()
    metrics['meshes'].append({'name': o.name, 'triangles': len(o.data.loop_triangles), 'boundaryEdges': open_e})
    assert open_e == 0, (o.name, open_e)   # every part is a closed solid (tube mouths carry annular caps)
coords = [v.co[:] for o in OBJS.values() for v in o.data.vertices]
metrics['blenderBounds'] = [[min(c[i] for c in coords) for i in range(3)], [max(c[i] for c in coords) for i in range(3)]]
for area in bpy.context.screen.areas:
    if area.type == 'VIEW_3D':
        from mathutils import Vector
        r = area.spaces.active.region_3d; r.view_distance = 9; r.view_location = (.6, 0, -.4)
        r.view_rotation = Vector((8, -10, 6)).to_track_quat('Z', 'Y')
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'tools/models/gutter-downspout.blend'))
path = ROOT/'public/models/gutter-downspout.glb'
bpy.ops.export_scene.gltf(filepath=str(path), export_format='GLB', export_yup=True, export_apply=True)
metrics['bytes'] = path.stat().st_size
(ROOT/'tools/models/gutter-downspout-metrics.json').write_text(json.dumps(metrics, indent=2)+'\n')
print(json.dumps(metrics))
