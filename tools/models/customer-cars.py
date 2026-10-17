"""Original period customer cars (#392): sedan, hatchback, station wagon and minivan.
Run: blender -b --factory-startup --python-exit-code 1 -P tools/models/customer-cars.py
Feet; Blender X across, -Y toward the nose, Z up. The Y-up glTF export puts the nose on +Z.
Scripted mesh authoring: each body is lofted through shaped cross-sections with
tumblehome, a shoulder, rolled sills and true wheel-arch openings. Glass, pillars and
trim are regions of that one skin; bumpers are swept sections; tyres and wheel covers
are revolved profiles. No imported geometry, images, badges or lettering.
Writes tools/models/customer-cars.blend (one collection per style) and
public/models/customer-car-<style>.glb plus a lighter -lite.glb for low/medium quality.
"""
import bpy, bmesh, math, json
from pathlib import Path
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[2]
# Same eight roles and finishes as the earlier customer cars, so runtime shaders are shared.
ROLES = [('BodyPaint', (.12, .23, .28), .35, .32), ('RubberTrim', (.022, .027, .029), 0, .8),
         ('WindowGlass', (.025, .045, .055), .05, .22), ('WheelMetal', (.43, .47, .48), .65, .35),
         ('Headlamp', (.85, .85, .67), .1, .25), ('TailLamp', (.5, .025, .016), .1, .28),
         ('AmberLens', (.85, .26, .02), .1, .28), ('InteriorCloth', (.09, .105, .11), 0, .95)]
ORDER = [r[0] for r in ROLES]

for o in list(bpy.data.objects): bpy.data.objects.remove(o, do_unlink=True)
for c in list(bpy.data.collections): bpy.data.collections.remove(c)
for me in list(bpy.data.meshes): bpy.data.meshes.remove(me)
for m in list(bpy.data.materials): bpy.data.materials.remove(m)
M = {}
for name, color, metal, rough in ROLES:
    m = bpy.data.materials.new(name); m.diffuse_color = (*color, 1); m.use_nodes = True
    p = m.node_tree.nodes.get('Principled BSDF'); p.inputs['Base Color'].default_value = (*color, 1)
    p.inputs['Metallic'].default_value = metal; p.inputs['Roughness'].default_value = rough; M[name] = m
# Lightly translucent tint lets the seats and dashboard read through the glass.
M['WindowGlass'].node_tree.nodes.get('Principled BSDF').inputs['Alpha'].default_value = .78
if hasattr(M['WindowGlass'], 'surface_render_method'): M['WindowGlass'].surface_render_method = 'DITHERED'
else: M['WindowGlass'].blend_method = 'HASHED'

def style(name, L, ws, belt, zsill, wr, front, rear, ws0, ws1, rw0, rw1, top, glass, black,
          tumble, handles, shuts, seats):
    yF = -L / 2
    return dict(name=name, L=L, ws=ws, belt=belt, zsill=zsill, wr=wr, Ra=wr + .15,
                wheels=(yF + front, L / 2 - rear), ws0=yF + ws0, ws1=yF + ws1, rw0=L / 2 - rw0, rw1=L / 2 - rw1,
                top=[(yF + a if a >= 0 else L / 2 + a, z) for a, z in top], glass=glass, black=black,
                tumble=tumble, handles=handles, shuts=shuts, seats=seats)

# Profiles are original period proportions (late 1980s), not measured replicas.
# top: (distance from nose, or negative distance from tail, height of the upper line).
STYLES = [
    style('sedan', 14.6, 2.8, 2.62, .72, .95, 2.75, 3.0, 4.55, 6.45, 4.75, 3.2,
          [(0, 2.16), (.3, 2.28), (4.55, 2.74), (6.45, 4.46), (-4.75, 4.46), (-3.2, 2.92), (-.3, 2.86), (-.001, 2.74)],
          [(-2.0, .55), (.85, 2.95)], [(.55, .85)], .52, [.25, 2.55], [-2.45, .7, 3.05], [-.1, 2.35]),
    style('hatchback', 13.0, 2.72, 2.58, .7, .92, 2.5, 2.25, 3.95, 5.85, 2.05, .35,
          [(0, 2.12), (.3, 2.24), (3.95, 2.7), (5.85, 4.42), (-2.05, 4.42), (-.35, 2.86), (-.12, 2.8), (-.001, 2.68)],
          [(-1.6, 1.15), (1.45, 4.85)], [(1.15, 1.45)], .48, [.85], [-2.2, 1.3], [.45, 3.0]),
    style('wagon', 15.2, 2.84, 2.66, .72, .95, 2.8, 3.2, 4.6, 6.5, .55, .16,
          [(0, 2.18), (.3, 2.3), (4.6, 2.76), (6.5, 4.55), (-.55, 4.5), (-.16, 2.95), (-.001, 2.85)],
          [(-2.1, .45), (.75, 3.15), (3.5, 6.85)], [(.45, .75)], .5, [.15, 2.75], [-2.55, .6, 3.3], [-.4, 1.95]),
    style('minivan', 14.8, 2.95, 3.0, .78, .95, 2.35, 2.55, 2.45, 5.05, .5, .14,
          [(0, 2.3), (.3, 2.45), (2.45, 3.02), (5.05, 5.48), (-.5, 5.42), (-.14, 3.2), (-.001, 3.1)],
          [(-3.9, -1.75), (-1.45, 1.95), (2.25, 6.6)], [(-1.75, -1.45), (1.95, 2.25)], .45, [-2.1, 1.6],
          [-3.85, -1.6, 2.1], [-2.9, -.2, 2.3]),
]
YEARS = {'sedan': 1987, 'hatchback': 1987, 'wagon': 1987, 'minivan': 1989}

def table(tab, y):
    if y <= tab[0][0]: return tab[0][1]
    for (y0, v0), (y1, v1) in zip(tab, tab[1:]):
        if y <= y1: return v0 + (v1 - v0) * ((y - y0) / (y1 - y0) if y1 > y0 else 1)
    return tab[-1][1]

def smooth(t): t = min(1, max(0, t)); return t * t * (3 - 2 * t)

def greenhouse(S, y):
    if y <= S['ws1']: return smooth((y - S['ws0']) / (S['ws1'] - S['ws0']))
    return 1 - smooth((y - S['rw0']) / (S['rw1'] - S['rw0']))

def top_at(S, y):
    z = table(S['top'], y)
    if S['ws1'] < y < S['rw0']: z += .05 * math.sin(math.pi * (y - S['ws1']) / (S['rw0'] - S['ws1']))
    return z

def bottom_at(S, y):
    yF, yR = -S['L'] / 2, S['L'] / 2
    d = min(y - yF, yR - y)
    z = S['zsill'] + .22 * (1 - smooth((d - .2) / .8))  # tucked under the bumpers
    for cy in S['wheels']:
        a = abs(y - cy)
        if a < S['Ra']: z = max(z, S['wr'] + math.sqrt(S['Ra'] ** 2 - a * a))
    return z

def half_ring(S, y):
    """Right half cross-section, bottom centre to roof centre (nine points)."""
    yF, yR = -S['L'] / 2, S['L'] / 2
    ws, r = S['ws'], .55
    d = min(y - yF, yR - y)
    sx = 1 - (r - math.sqrt(max(0, r * r - (r - d) ** 2))) / ws if d < r else 1  # rounded corners in plan
    zt, g, zb = top_at(S, y), greenhouse(S, y), bottom_at(S, y)
    belt = min(S['belt'], zt - .1)
    zc = min(S['zsill'] + .62 * (S['belt'] - S['zsill']), belt - .22)
    wb, tum = ws - .13, S['tumble']
    pts = [(0, zb), (wb - .14, zb), (wb, zb + .11), (ws, zc), (ws - .04, belt), (ws - .1, belt + .05),
           (ws - (.2 + (tum - .2) * g), zt - (.03 + .19 * g)), (ws - (.48 + (tum - .18) * g), zt), (0, zt + .06)]
    out, prev = pts[:2], pts[1][1]
    for x, z in pts[2:]:
        z = max(z, prev + .025); out.append((x, z)); prev = z
    return [(x * sx, z) for x, z in out], g

class Kit:
    def __init__(self, S, coll, full):
        self.S, self.coll, self.full, self.objs = S, coll, full, []
    def mesh(self, name, verts, faces, roles, angle=0):
        label = self.S['name'].title() + ' ' + name
        me = bpy.data.meshes.new(label); me.from_pydata([tuple(v) for v in verts], [], [tuple(f) for f in faces]); me.update()
        roles = [roles] * len(faces) if isinstance(roles, str) else roles
        used = sorted(set(roles), key=ORDER.index)
        for r in used: me.materials.append(M[r])
        for poly, r in zip(me.polygons, roles): poly.material_index = used.index(r)
        bm = bmesh.new(); bm.from_mesh(me)
        bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        uv = bm.loops.layers.uv.verify()
        for f in bm.faces:  # box projection; finishes are uniform, so islands only need to be sane
            n = f.normal; ax = max(range(3), key=lambda i: abs(n[i]))
            for l in f.loops:
                c = l.vert.co; u, v = (c.y, c.z) if ax == 0 else (c.x, c.z) if ax == 1 else (c.x, c.y)
                l[uv].uv = (u / 16 + .5, v / 16 + .5)
        bm.to_mesh(me); bm.free()
        if angle:
            for p in me.polygons: p.use_smooth = True
            if hasattr(me, 'set_sharp_from_angle'): me.set_sharp_from_angle(angle=math.radians(angle))
        o = bpy.data.objects.new(label, me); self.coll.objects.link(o); self.objs.append(o)
        o['units'] = 'feet'; o['provenance'] = 'Original scripted period ' + self.S['name'] + ' (#392)'
        return o
    def box(self, name, c, d, role):
        x, y, z = c; a, b, h = d[0] / 2, d[1] / 2, d[2] / 2
        v = [(x - a, y - b, z - h), (x + a, y - b, z - h), (x + a, y + b, z - h), (x - a, y + b, z - h),
             (x - a, y - b, z + h), (x + a, y - b, z + h), (x + a, y + b, z + h), (x - a, y + b, z + h)]
        return self.mesh(name, v, [(0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)], role)
    def sweep(self, name, path, section, role, angle=50):
        P = [Vector(p) for p in path]; n, m, v = len(path), len(section), []
        for i, p in enumerate(P):
            t = P[min(i + 1, n - 1)] - P[max(i - 1, 0)]; t.z = 0; t.normalize()
            nrm = Vector((t.y, -t.x, 0))
            for a, h in section: v.append(p + nrm * a + Vector((0, 0, h)))
        f = [(i * m + j, i * m + (j + 1) % m, (i + 1) * m + (j + 1) % m, (i + 1) * m + j) for i in range(n - 1) for j in range(m)]
        f += [tuple(range(m))[::-1], tuple(range((n - 1) * m, n * m))]
        return self.mesh(name, v, f, role, angle)
    def revolve(self, name, profile, c, side, segs, role):
        v, n = [], len(profile)
        for dx, r in profile:
            for i in range(segs):
                a = i * math.tau / segs; v.append((c[0] + side * dx, c[1] + r * math.cos(a), c[2] + r * math.sin(a)))
        f = [(j * segs + i, j * segs + (i + 1) % segs, ((j + 1) % n) * segs + (i + 1) % segs, ((j + 1) % n) * segs + i)
             for j in range(n) for i in range(segs)]
        return self.mesh(name, v, f, role, 40)

def stations(S, full):
    yF, yR = -S['L'] / 2, S['L'] / 2
    ys, y, step = set(), yF, (.22 if full else .5)
    while y < yR: ys.add(y); y += step
    for d in ([0, .04, .12, .25, .4, .55] if full else [0, .12, .3, .55]): ys |= {yF + d, yR - d}
    ys |= {S['ws0'], S['ws1'], S['rw0'], S['rw1']} | {e for r in S['glass'] + S['black'] for e in r}
    for cy in S['wheels']:
        k = 14 if full else 7
        ys |= {cy - S['Ra'] * math.cos(math.pi * i / k) for i in range(1, k)}
        ys |= {cy - S['Ra'] - .006, cy + S['Ra'] + .006, cy - S['Ra'] + .002, cy + S['Ra'] - .002}
    out = []
    for y in sorted(v for v in ys if yF <= v <= yR):
        if not out or y - out[-1] > .003: out.append(y)
    out[0], out[-1] = yF, yR
    return out

def face_role(S, j, y, g):
    side = j if j <= 7 else 15 - j
    if side == 0: return 'RubberTrim'
    if side == 5 and g > .5:
        if any(a <= y <= b for a, b in S['glass']): return 'WindowGlass'
        if any(a <= y <= b for a, b in S['black']): return 'RubberTrim'
    if side == 7 and (S['ws0'] + .1 < y < S['ws1'] - .06 or S['rw0'] + .06 < y < S['rw1'] - .1): return 'WindowGlass'
    return 'BodyPaint'

def body(k):
    S = k.S; ys = stations(S, k.full); v, f, roles = [], [], []
    for y in ys:
        half, _ = half_ring(S, y)
        ring = half + [(-x, z) for x, z in reversed(half[1:-1])]
        v += [(x, y, z) for x, z in ring]
    R = 16
    for i in range(len(ys) - 1):
        ym = (ys[i] + ys[i + 1]) / 2; g = greenhouse(S, ym)
        for j in range(R):
            f.append((i * R + j, i * R + (j + 1) % R, (i + 1) * R + (j + 1) % R, (i + 1) * R + j)); roles.append(face_role(S, j, ym, g))
    for i, y in ((0, ys[0]), (len(ys) - 1, ys[-1])):  # fascia and tail panels close the shell
        c = len(v); ring = v[i * R:(i + 1) * R]
        v.append(tuple(sum(p[a] for p in ring) / R for a in range(3)))
        for j in range(R): f.append((i * R + j, i * R + (j + 1) % R, c)); roles.append('BodyPaint')
    k.mesh('lofted body shell with glass and pillars', v, f, roles, 34)

def details(k):
    S, full = k.S, k.full; ws, yF, yR = S['ws'], -S['L'] / 2, S['L'] / 2
    hood = S['top'][1][1]; tail = S['top'][-1][1]; segs = 24 if full else 12
    bz = S['zsill'] + .56
    sec = [(-.15, -.17), (-.11, -.21), (.11, -.21), (.15, -.17), (.15, .17), (.11, .21), (-.11, .21), (-.15, .17)]
    for end, sgn in (('Front', -1), ('Rear', 1)):
        e = yF if sgn < 0 else yR
        half = [(ws + .03, e - sgn * 1.0), (ws + .03, e - sgn * .55), (ws - .12, e - sgn * .18), (ws - .32, e - sgn * .02),
                (ws * .55, e + sgn * .1), (0, e + sgn * .13)]
        path = [(-x, y, bz) for x, y in half] + [(x, y, bz) for x, y in reversed(half[:-1])]
        if sgn > 0: path.reverse()
        k.sweep(end + ' wraparound bumper', path, sec, 'RubberTrim')
        if full: k.sweep(end + ' bumper bright strip', path, [(.14, -.035), (.175, -.035), (.175, .035), (.14, .035)], 'WheelMetal')
        k.box(end + ' blank plate', (0, e + sgn * .03, bz + .4) if sgn > 0 else (0, e - .3, bz), (.95, .04, .3), 'WheelMetal')
    lz0, lz1 = hood - .66, hood - .3
    xe = ws - .55
    for s in (-1, 1):
        k.box(f'{s} headlamp', (s * (xe - .72), yF - .015, (lz0 + lz1) / 2), (.95, .06, lz1 - lz0), 'Headlamp')
        k.box(f'{s} front indicator', (s * (xe - .12), yF - .01, (lz0 + lz1) / 2), (.2, .05, lz1 - lz0), 'AmberLens')
        k.box(f'{s} side marker', (s * (ws - .03), yF + .5, bz + .3), (.03, .28, .1), 'AmberLens')
        t0, t1 = tail - .85, tail - .45
        k.box(f'{s} tail lamp', (s * (xe - .55), yR + .015, (t0 + t1) / 2), (.95, .06, t1 - t0), 'TailLamp')
        k.box(f'{s} rear indicator', (s * (xe - 1.2), yR + .02, (t0 + t1) / 2), (.3, .06, t1 - t0), 'AmberLens')
        my = max(S['ws0'] + .45, S['glass'][0][0] + .12)
        k.box(f'{s} mirror stem', (s * (ws + .03), my, S['belt'] + .1), (.14, .1, .07), 'RubberTrim')
        k.box(f'{s} mirror housing', (s * (ws + .2), my + .02, S['belt'] + .2), (.26, .17, .22), 'RubberTrim')
        for cy in S['wheels']:
            Ra, wr = S['Ra'], S['wr']
            arc = [(cy + Ra * math.cos(math.pi * i / 12), wr + Ra * math.sin(math.pi * i / 12)) for i in range(13)]
            x = s * (ws - .95); v = [(x, y, z) for y, z in arc] + [(x - s * .04, y, z) for y, z in arc]
            n = 13; f = [tuple(range(n)), tuple(range(2 * n - 1, n - 1, -1))] + [(i, i + 1, n + i + 1, n + i) for i in range(n - 1)] + [(n - 1, 0, n, 2 * n - 1)]
            k.mesh(f'{s} {cy:.1f} wheel-well liner', v, f, 'RubberTrim')
            c = (s * (ws - .5), cy, wr)
            k.revolve(f'{s} {cy:.1f} tyre', [(.31, .6), (.3, .78), (.27, .88), (.2, wr), (-.2, wr), (-.27, .88), (-.3, .78), (-.31, .6)], c, s, segs, 'RubberTrim')
            k.revolve(f'{s} {cy:.1f} wheel cover', [(.27, .004), (.3, .1), (.31, .3), (.29, .5), (.27, .58), (.2, .6), (0, .59), (0, .004)], c, s, segs, 'WheelMetal')
        if not full: continue
        for y in S['handles']: k.box(f'{s} door handle {y}', (s * (ws - .005), y, S['belt'] - .2), (.06, .32, .07), 'RubberTrim')
        for y in S['shuts']:
            half, _ = half_ring(S, y); pts = half[2:6]
            v = [(s * (x + .006), y + d, z) for x, z in pts for d in (-.011, .011)]
            k.mesh(f'{s} door shut line {y}', v, [(2 * i, 2 * i + 1, 2 * i + 3, 2 * i + 2) for i in range(len(pts) - 1)], 'RubberTrim')
        a, b = S['wheels'][0] + S['Ra'] + .2, S['wheels'][1] - S['Ra'] - .2
        zc = min(S['zsill'] + .62 * (S['belt'] - S['zsill']), S['belt'] - .22)
        k.sweep(f'{s} protective side strip', [(s * (ws + .004), a, zc), (s * (ws + .004), b, zc)], [(-.03, -.05), (.03, -.05), (.03, .05), (-.03, .05)], 'RubberTrim')
    k.box('Grille recess', (0, yF - .01, (lz0 + lz1) / 2), (2 * (xe - 1.22), .05, lz1 - lz0), 'RubberTrim')
    if full:
        for i in range(3): k.box(f'Grille bar {i}', (0, yF - .04, lz0 + (lz1 - lz0) * (i + 1) / 4), (2 * (xe - 1.24), .03, .035), 'WheelMetal')
        k.box('Dashboard', (0, S['ws0'] + .6, S['belt'] - .05), (2 * (ws - .45), .7, .3), 'InteriorCloth')
        for n, y in enumerate(S['seats']):
            for x in ((-.72, .72) if n == 0 else (0,)):
                w = 1.0 if n == 0 else 2 * (ws - .55)
                k.box(f'Seat cushion {n} {x}', (x, y - .45, S['zsill'] + .62), (w, 1.0, .22), 'InteriorCloth')
                k.box(f'Seat back {n} {x}', (x, y + .05, S['zsill'] + 1.25), (w, .22, 1.15), 'InteriorCloth')
                if n == 0: k.box(f'Headrest {x}', (x, y + .05, S['zsill'] + 1.98), (.55, .2, .3), 'InteriorCloth')

def build(S, full, coll):
    k = Kit(S, coll, full); body(k); details(k); return k.objs

audit = {}
# Editable source: every style as named parts in its own collection, lined up along X.
for i, S in enumerate(STYLES):
    coll = bpy.data.collections.new(S['name'].title()); bpy.context.scene.collection.children.link(coll)
    for o in build(S, True, coll): o.location.x = (i - 1.5) * 7.5
if bpy.context.screen:
    for area in bpy.context.screen.areas:
        if area.type == 'VIEW_3D': area.spaces.active.region_3d.view_distance = 34; area.spaces.active.region_3d.view_location = (0, 0, 2)
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT / 'tools/models/customer-cars.blend'))
# Runtime meshes: rebuild at the origin and batch physical parts by material role.
for S in STYLES:
    for full in (True, False):
        coll = bpy.data.collections.new('export'); bpy.context.scene.collection.children.link(coll)
        objs = build(S, full, coll)
        groups = {r: [] for r in ORDER}
        for o in objs:
            names = [m.name for m in o.data.materials]
            if len(names) == 1: groups[names[0]].append(o); continue
            for idx, role in enumerate(names):  # split the lofted shell so each batch carries one material
                bm = bmesh.new(); bm.from_mesh(o.data)
                bmesh.ops.delete(bm, geom=[f for f in bm.faces if f.material_index != idx], context='FACES')
                me = bpy.data.meshes.new(o.name + ' ' + role); bm.to_mesh(me); bm.free()
                me.materials.clear(); me.materials.append(M[role])
                for p in me.polygons: p.material_index = 0
                po = bpy.data.objects.new(me.name, me); coll.objects.link(po); groups[role].append(po)
            bpy.data.objects.remove(o, do_unlink=True)
        joined = []
        for role in ORDER:
            parts = groups[role]
            if not parts: continue
            bpy.ops.object.select_all(action='DESELECT')
            for o in parts: o.select_set(True)
            bpy.context.view_layer.objects.active = parts[0]; bpy.ops.object.join()
            j = bpy.context.view_layer.objects.active; j.name = S['name'].title() + '_' + role; joined.append(j)
        bpy.ops.object.select_all(action='DESELECT')
        for o in joined: o.select_set(True)
        name = 'customer-car-' + S['name'] + ('' if full else '-lite')
        bpy.ops.export_scene.gltf(filepath=str(ROOT / 'public/models' / (name + '.glb')), export_format='GLB',
                                  use_selection=True, export_yup=True, export_apply=True)
        lo, hi = Vector((1e9,) * 3), Vector((-1e9,) * 3); tris = 0
        for o in joined:
            o.data.calc_loop_triangles(); tris += len(o.data.loop_triangles)
            for vtx in o.data.vertices:
                c = o.matrix_world @ vtx.co; lo = Vector(map(min, lo, c)); hi = Vector(map(max, hi, c))
        audit[name] = {'year': YEARS[S['name']], 'length': round(hi.y - lo.y, 3), 'width': round(hi.x - lo.x, 3),
                       'height': round(hi.z - lo.z, 3), 'minZ': round(lo.z, 4), 'triangles': tris, 'draws': len(joined)}
        for o in joined: bpy.data.objects.remove(o, do_unlink=True)
        bpy.data.collections.remove(coll)
(ROOT / 'scratch').mkdir(exist_ok=True)
(ROOT / 'scratch/customer-cars-audit.json').write_text(json.dumps(audit, indent=1))
print('AUDIT', json.dumps(audit))
