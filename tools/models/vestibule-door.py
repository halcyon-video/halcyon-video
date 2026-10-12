"""Vestibule door and hardware family: aluminium leaf profiles, glazing beads, seals, butt hinges,
push/pull bars, ladder pull handles, overhead closer, and extruded jamb/header sections with seal strips.
Scripted Blender mesh authoring, feet. Blender (x, -store_z, height) exports as store (x, height, z).

Two variants (empty parents DoorDouble / DoorSingle), each authored at its nominal leaf width:
  DoorDouble  3.2 ft wide, 7 ft tall, 0.115 ft leaf  (StorefrontSpec.doorStyle 'double-swing')
  DoorSingle  3.0 ft wide, 7 ft tall, 0.115 ft leaf  (doorStyle 'single')
Leaf origin: centre of the leaf width, floor level, mid thickness. Hinge edge is -x, latch edge +x; the runtime
mirrors and stretches it to the real opening (src/entrance/door-model.ts). Moving-leaf parts are separate meshes
from the static jamb/header sections so the leaf swings around the same pivot as before.
Run: blender -b -P tools/models/vestibule-door.py
"""
import json, math
from pathlib import Path
import bpy, bmesh
from mathutils import Matrix

ROOT = Path(__file__).resolve().parents[2]
bpy.context.preferences.filepaths.save_version = 0
bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
sc = bpy.context.scene; sc.unit_settings.system = 'IMPERIAL'; sc.unit_settings.scale_length = .3048
H = 7.0; HT = .0575  # leaf half-thickness


def mat(name, col, rough, metal):
    m = bpy.data.materials.new(name); m.diffuse_color = col; m.use_nodes = True
    b = m.node_tree.nodes.get('Principled BSDF')
    b.inputs['Base Color'].default_value = col; b.inputs['Roughness'].default_value = rough
    b.inputs['Metallic'].default_value = metal
    return m


M = {'DoorAluminium': mat('DoorAluminium', (.55, .56, .58, 1), .45, .85),
     'DoorChrome': mat('DoorChrome', (.81, .83, .85, 1), .2, .9),
     'DoorSeal': mat('DoorSeal', (.012, .012, .014, 1), .9, 0),
     'DoorCloser': mat('DoorCloser', (.05, .05, .055, 1), .55, .5)}
metrics = {}


def P(x, zs, y): return (x, -zs, y)


def box(bm, cx, cz, cy, sx, sz, sy):
    r = bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=(sx, sz, sy), verts=r['verts'])
    bmesh.ops.translate(bm, vec=P(cx, cz, cy), verts=r['verts'])


def cyl(bm, cx, cz, cy, r, length, axis, seg=12):
    c = bmesh.ops.create_cone(bm, cap_ends=True, segments=seg, radius1=r, radius2=r, depth=length)
    if axis == 'x': bmesh.ops.rotate(bm, verts=c['verts'], cent=(0, 0, 0), matrix=Matrix.Rotation(math.pi / 2, 3, 'Y'))
    if axis == 'z': bmesh.ops.rotate(bm, verts=c['verts'], cent=(0, 0, 0), matrix=Matrix.Rotation(math.pi / 2, 3, 'X'))
    bmesh.ops.translate(bm, vec=P(cx, cz, cy), verts=c['verts'])


def grow(r, d): return (r[0] - d, r[1] + d, r[2] - d, r[3] + d)


def sweep(bm, profile):
    """Closed rectangular ring swept through [(rect(xl,xr,yb,yt), store_z), ...] (cyclic cross-section)."""
    rings = []
    for (xl, xr, yb, yt), z in profile:
        rings.append([bm.verts.new(P(x, z, y)) for x, y in ((xl, yb), (xr, yb), (xr, yt), (xl, yt))])
    n = len(rings)
    for k in range(n):
        a, b = rings[k], rings[(k + 1) % n]
        for i in range(4):
            j = (i + 1) % 4; bm.faces.new((a[i], a[j], b[j], b[i]))


def prism(bm, poly, y0, y1, along='y'):
    """Extrude a closed (x, store_z) polygon between heights y0..y1 (along='y') or a (store_z, y) polygon along x."""
    if along == 'y':
        lo = [bm.verts.new(P(x, z, y0)) for x, z in poly]; hi = [bm.verts.new(P(x, z, y1)) for x, z in poly]
    else:
        lo = [bm.verts.new(P(y0, z, y)) for z, y in poly]; hi = [bm.verts.new(P(y1, z, y)) for z, y in poly]
    n = len(poly)
    for i in range(n):
        j = (i + 1) % n; bm.faces.new((lo[i], lo[j], hi[j], hi[i]))
    bm.faces.new(lo[::-1]); bm.faces.new(hi)


PARTS = []


def finish(name, bm, role, parent, bevel=None, uvscale=True):
    bmesh.ops.remove_doubles(bm, verts=list(bm.verts), dist=1e-5)
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    me = bpy.data.meshes.new(name + 'Mesh'); bm.to_mesh(me); bm.free()
    o = bpy.data.objects.new(name, me); bpy.context.collection.objects.link(o); me.materials.append(M[role])
    o.parent = parent
    bpy.context.view_layer.objects.active = o; o.select_set(True)
    if bevel:
        mod = o.modifiers.new('Eased edges', 'BEVEL'); mod.width = bevel[0]; mod.segments = bevel[1]
        mod.limit_method = 'ANGLE'; mod.angle_limit = math.radians(50)
        bpy.ops.object.modifier_apply(modifier=mod.name)
    bpy.ops.object.shade_smooth_by_angle(angle=math.radians(40))
    bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(island_margin=.02); bpy.ops.object.mode_set(mode='OBJECT'); o.select_set(False)
    PARTS.append(o); return o


def build_variant(tag, Wn, margin, stile, kick, bottom, double):
    root = bpy.data.objects.new('Door' + tag, None); bpy.context.collection.objects.link(root)
    L, R = -Wn / 2 + margin, Wn / 2 - margin
    top = H - .02
    outer = (L, R, bottom, top)
    core = (L + stile, R - stile, bottom + kick, top - .16)
    rebate = grow(core, .03)
    e = .006; lip = .02
    # Leaf profile: eased outer edges, glazing rebate stepping down to the glass web on both faces.
    bm = bmesh.new()
    sweep(bm, [(grow(outer, -e), -HT), (outer, -HT + e), (outer, HT - e), (grow(outer, -e), HT),
               (rebate, HT), (rebate, HT - lip), (core, HT - lip), (core, -(HT - lip)),
               (rebate, -(HT - lip)), (rebate, -HT)])
    finish(tag + 'Frame', bm, 'DoorAluminium', root)
    # Glazing beads pressed into the rebate on both faces.
    bm = bmesh.new()
    for s in (-1, 1):
        z0, z1 = s * (HT - lip), s * (HT - .002)
        sweep(bm, [(grow(core, .006), z0), (grow(core, .006), z1), (grow(rebate, -.002), z1), (grow(rebate, -.002), z0)])
    finish(tag + 'Bead', bm, 'DoorAluminium', root)
    # Weather strip down the latch edge and a bottom sweep.
    bm = bmesh.new()
    box(bm, R + .007, 0, (bottom + kick + top - .16) / 2, .014, .07, top - .16 - bottom - kick)
    box(bm, 0, 0, bottom - .012, R - L - .4, .09, .026)
    finish(tag + 'Seal', bm, 'DoorSeal', root, bevel=(.002, 1))
    # Three butt hinges: knuckle barrel on the pivot line with a plate on each face.
    bm = bmesh.new()
    kx = L - .012
    for hy in (.85, 3.5, 6.15):
        cyl(bm, kx, 0, hy, .021, .34, 'y', 12)
        for s in (-1, 1):
            box(bm, kx + .06, s * (HT + .003), hy, .12, .006, .34)
        for s in (-1, 1):
            for dx in (.045, .09):
                for dy in (-.11, .11):
                    cyl(bm, kx + dx, s * (HT + .008), hy + dy, .008, .006, 'z', 8)
    finish(tag + 'Hinges', bm, 'DoorChrome', root, bevel=(.0015, 1))
    barY = 3.4
    if double:
        half = Wn / 2 - .15
        for name, s in (('PushBar', -1), ('PullBar', 1)):
            bm = bmesh.new()
            cyl(bm, 0, s * (HT + .13), barY, .042, half * 2 - .1, 'x', 16)
            for sx in (-1, 1):
                box(bm, sx * (half - .06), s * (HT + .07), barY, .07, .14, .09)
                cyl(bm, sx * (half - .06), s * (HT + .005), barY, .03, .01, 'z', 12)
            finish(tag + name, bm, 'DoorAluminium', root, bevel=(.002, 1))
        # Overhead closer on the pull face: cylinder body on the top rail and a hinged arm toward the latch.
        bm = bmesh.new()
        box(bm, L + .55, HT + .045, top - .08, .62, .09, .1)
        cyl(bm, L + .24, HT + .045, top - .08, .055, .1, 'z', 14)
        box(bm, L + 1.0, HT + .08, top - .05, .55, .014, .035)
        box(bm, L + 1.3, HT + .055, top - .04, .4, .012, .03)
        finish(tag + 'Closer', bm, 'DoorCloser', root, bevel=(.0015, 1))
    else:
        for name, s in (('PushHandle', -1), ('PullHandle', 1)):
            bm = bmesh.new()
            hx = R - stile / 2
            cyl(bm, hx, s * (HT + .09), barY, .028, 1.1, 'y', 14)
            for hy in (barY - .45, barY + .45):
                cyl(bm, hx, s * (HT + .045), hy, .014, .09, 'z', 10)
                cyl(bm, hx, s * (HT + .005), hy, .026, .01, 'z', 12)
            finish(tag + name, bm, 'DoorChrome', root)
        bm = bmesh.new()
        box(bm, L + .5, HT + .04, top - .08, .52, .08, .09)
        cyl(bm, L + .24, HT + .04, top - .08, .05, .09, 'z', 14)
        box(bm, L + .95, HT + .07, top - .05, .4, .012, .03)
        finish(tag + 'Closer', bm, 'DoorCloser', root, bevel=(.0015, 1))
    # Static aluminium sections. Jamb: tube profile with a seal groove on each reveal. Header: same in side view.
    ft, fd = (.16, .30) if double else (.08, .38)
    hh = .25 if double else .20
    gw, gd = (.09, .02) if double else (.06, .015)
    def tube(w, d):
        a, b = w / 2, d / 2
        return [(-a, -b), (a, -b), (a, -gw / 2), (a - gd, -gw / 2), (a - gd, gw / 2), (a, gw / 2),
                (a, b), (-a, b), (-a, gw / 2), (-a + gd, gw / 2), (-a + gd, -gw / 2), (-a, -gw / 2)]
    bm = bmesh.new(); prism(bm, tube(ft, fd), 0, H, 'y')
    finish(tag + 'Jamb', bm, 'DoorAluminium', root, bevel=(.004, 1))
    bm = bmesh.new()
    for s in (-1, 1):
        box(bm, s * (ft / 2 - gd + .006), 0, H / 2, .012, gw - .01, H - .1)
    finish(tag + 'JambSeal', bm, 'DoorSeal', root)
    # Header authored 1 ft long; the runtime scales it to the opening.
    poly = [(z, y) for z, y in ((-fd / 2, -hh / 2), (fd / 2, -hh / 2), (fd / 2, hh / 2), (-fd / 2, hh / 2))]
    bm = bmesh.new(); prism(bm, [(-fd / 2, -hh / 2), (fd / 2, -hh / 2), (fd / 2, hh / 2 - 0), (-fd / 2, hh / 2)], -.5, .5, 'x')
    finish(tag + 'Header', bm, 'DoorAluminium', root, bevel=(.004, 1))
    bm = bmesh.new(); box(bm, 0, 0, -hh / 2 + .006, 1.0, gw - .01, .012)
    finish(tag + 'HeaderSeal', bm, 'DoorSeal', root)
    return root


build_variant('Double', 3.2, .10, .12, .24, .055, True)
build_variant('Single', 3.0, .05, .15, .28, .04, False)

tris = 0; nonman = {}
for o in PARTS:
    o.data.calc_loop_triangles(); tris += len(o.data.loop_triangles)
    b = bmesh.new(); b.from_mesh(o.data)
    nonman[o.name] = sum(1 for ed in b.edges if not ed.is_manifold); b.free()
# Hardware sub-solids are intentionally separate islands, but each must close on itself.
assert all(v == 0 for v in nonman.values()), nonman

mn = [1e9] * 3; mx = [-1e9] * 3
for o in PARTS:
    for v in o.data.vertices:
        for i in range(3): mn[i] = min(mn[i], v.co[i]); mx[i] = max(mx[i], v.co[i])
metrics = {'triangles': tris, 'meshes': len(PARTS), 'nonManifoldEdges': nonman,
           'materialRoles': list(M), 'units': 'feet', 'boundsAxes': 'Blender X, negative store depth, height',
           'bounds': [mn, mx], 'variants': {'DoorDouble': 3.2, 'DoorSingle': 3.0},
           'provenance': 'Original scripted Blender mesh authoring (tools/models/vestibule-door.py); not a brand replica.'}
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT / 'tools/models/vestibule-door.blend'))
bpy.ops.export_scene.gltf(filepath=str(ROOT / 'public/models/vestibule-door.glb'), export_format='GLB', export_extras=True)
(ROOT / 'tools/models/vestibule-door-metrics.json').write_text(json.dumps(metrics, indent=2) + '\n')
print({k: metrics[k] for k in ('triangles', 'meshes')})
