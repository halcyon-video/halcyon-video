"""Halcyon front-desk rental terminal: CRT monitor + keyboard.

Scripted bmesh authoring, run with:

    blender -b --python tools/models/counter-terminal.py

Writes tools/models/counter-terminal.blend (editable parts + export copies),
public/models/rental-terminal.glb and public/models/rental-keyboard.glb.

Units are FEET at runtime scale. Blender +Y is the object's FRONT (glTF -Z),
so src/entrance/index.ts keeps `rotation.y = Math.PI` to face the clerk.
Bottoms sit at z = 0; the monitor origin is the swivel foot's axis.

The silhouette reproduces the approved crt_monitor.glb (Jarlan Perez,
CC-BY 3.0) as measured in-scene: 1.274 wide x 1.55 tall x 1.53 deep, front
box 0.49 deep, cone tapering to a chamfered rear cap, foot 0.7 x 0.8. What
the old file lacked is what this adds: bevelled edges, a chamfered bezel
that returns to a flat tube face, a pillow-dome glass, a recessed chin
control panel, side vent grilles, a recessed rear panel with vent slots, a
cable, and a UV set with a baked occlusion map plus a tiling molded-ABS
grain normal map so the plastic reads under the store's lighting.

Material roles (the runtime recolors these by name, keeping the maps):
  CabinetABS  BezelABS  TrimDark  CrtTube  CrtGlass  PowerLed
  KeyboardShell  KeyCaps  KeyCapsDark
"""
import math
import pathlib

import bmesh
import bpy
import numpy as np
from mathutils import Vector

ROOT = pathlib.Path(__file__).resolve().parents[2]
OUT = ROOT / 'public' / 'models'
BLEND = ROOT / 'tools' / 'models' / 'counter-terminal.blend'

# ---------------------------------------------------------------- materials

def grain_image(size=128, seed=7):
    """Tiling molded-ABS grain as a tangent-space normal map (periodic FFT noise)."""
    rng = np.random.default_rng(seed)
    white = rng.standard_normal((size, size))
    f = np.fft.fft2(white)
    fy = np.fft.fftfreq(size)[:, None]
    fx = np.fft.fftfreq(size)[None, :]
    r = np.sqrt(fx * fx + fy * fy) + 1e-6
    band = np.exp(-((np.log(r / 0.09)) ** 2) / (2 * 0.6 ** 2))     # broad bump ~0.09 cycles/px
    fine = 0.35 * np.exp(-((np.log(r / 0.28)) ** 2) / (2 * 0.4 ** 2))  # finer texture
    h = np.real(np.fft.ifft2(f * (band + fine)))
    h = (h - h.mean()) / (h.std() + 1e-9)
    strength = 0.35   # subtle: molded ABS, not granite
    dx = (np.roll(h, -1, axis=1) - np.roll(h, 1, axis=1)) * 0.5 * strength
    dy = (np.roll(h, -1, axis=0) - np.roll(h, 1, axis=0)) * 0.5 * strength
    n = np.stack([-dx, -dy, np.ones_like(h)], axis=-1)
    n /= np.linalg.norm(n, axis=-1, keepdims=True)
    rgba = np.ones((size, size, 4), dtype=np.float32)
    rgba[..., :3] = n * 0.5 + 0.5
    img = bpy.data.images.new('abs_grain_n', size, size, alpha=False, float_buffer=False)
    img.colorspace_settings.name = 'Non-Color'
    img.pixels.foreach_set(rgba.ravel())
    img.pack()
    return img


def bake_image(name, size):
    img = bpy.data.images.new(name, size, size, alpha=False, float_buffer=False)
    img.colorspace_settings.name = 'sRGB'
    return img


def material(name, rgb, rough=0.55, metal=0.0, alpha=None, emit=None, ao=None,
             grain=None, grain_scale=22.0, grain_strength=0.55):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    nodes, links = nt.nodes, nt.links
    bsdf = nodes['Principled BSDF']
    bsdf.inputs['Base Color'].default_value = (*rgb, 1.0)
    bsdf.inputs['Roughness'].default_value = rough
    bsdf.inputs['Metallic'].default_value = metal
    if alpha is not None:
        bsdf.inputs['Alpha'].default_value = alpha
        m.surface_render_method = 'BLENDED'
    if emit is not None:
        bsdf.inputs['Emission Color'].default_value = (*emit, 1.0)
        bsdf.inputs['Emission Strength'].default_value = 3.0
    if ao is not None:
        tex = nodes.new('ShaderNodeTexImage')
        tex.name = 'BAKE'
        tex.image = ao
        tex.location = (-700, 300)
        mix = nodes.new('ShaderNodeMix')
        mix.data_type = 'RGBA'
        mix.blend_type = 'MULTIPLY'
        mix.inputs['Factor'].default_value = 1.0
        mix.location = (-350, 300)
        # ShaderNodeMix RGBA sockets: 6 = A, 7 = B, outputs[2] = Result
        mix.inputs[6].default_value = (*rgb, 1.0)
        links.new(tex.outputs['Color'], mix.inputs[7])
        links.new(mix.outputs[2], bsdf.inputs['Base Color'])
        nodes.active = tex
    if grain is not None:
        uv = nodes.new('ShaderNodeUVMap')
        uv.location = (-1100, -200)
        mapping = nodes.new('ShaderNodeMapping')
        mapping.location = (-900, -200)
        mapping.inputs['Scale'].default_value = (grain_scale, grain_scale, 1.0)
        gtex = nodes.new('ShaderNodeTexImage')
        gtex.image = grain
        gtex.location = (-700, -200)
        nmap = nodes.new('ShaderNodeNormalMap')
        nmap.inputs['Strength'].default_value = grain_strength
        nmap.location = (-350, -200)
        links.new(uv.outputs['UV'], mapping.inputs['Vector'])
        links.new(mapping.outputs['Vector'], gtex.inputs['Vector'])
        links.new(gtex.outputs['Color'], nmap.inputs['Color'])
        links.new(nmap.outputs['Normal'], bsdf.inputs['Normal'])
    return m

# ---------------------------------------------------------------- bmesh helpers

class Part:
    """One editable mesh part: a bmesh plus a material slot list."""

    def __init__(self, name, mats):
        self.name = name
        self.bm = bmesh.new()
        self.mats = list(mats)

    def idx(self, mat):
        return self.mats.index(mat)

    def rect(self, hw, zlo, zhi, y, cx=0.0):
        v = self.bm.verts.new
        return [v((cx - hw, y, zlo)), v((cx + hw, y, zlo)), v((cx + hw, y, zhi)), v((cx - hw, y, zhi))]

    def rect_xy(self, x0, x1, y0, y1, z):
        v = self.bm.verts.new
        return [v((x0, y0, z)), v((x1, y0, z)), v((x1, y1, z)), v((x0, y1, z))]

    def ellipse(self, rx, ry, z, n=24, cx=0.0, cy=0.0):
        v = self.bm.verts.new
        return [v((cx + rx * math.cos(2 * math.pi * i / n), cy + ry * math.sin(2 * math.pi * i / n), z))
                for i in range(n)]

    def circle_frame(self, center, u, w, r, n=8):
        v = self.bm.verts.new
        return [v(center + u * (r * math.cos(2 * math.pi * i / n)) + w * (r * math.sin(2 * math.pi * i / n)))
                for i in range(n)]

    def bridge(self, a, b, mat):
        faces = []
        n = len(a)
        for i in range(n):
            j = (i + 1) % n
            f = self.bm.faces.new((a[i], a[j], b[j], b[i]))
            f.material_index = self.idx(mat)
            faces.append(f)
        return faces

    def cap(self, ring, mat):
        f = self.bm.faces.new(ring)
        f.material_index = self.idx(mat)
        return f

    def loft(self, rings, mat, caps=(None, None)):
        for a, b in zip(rings, rings[1:]):
            self.bridge(a, b, mat)
        if caps[0]:
            self.cap(list(reversed(rings[0])), caps[0])
        if caps[1]:
            self.cap(rings[-1], caps[1])

    def box(self, x0, x1, y0, y1, z0, z1, mat):
        """Axis-aligned closed box."""
        a = self.rect_xy(x0, x1, y0, y1, z0)
        b = self.rect_xy(x0, x1, y0, y1, z1)
        self.loft([a, b], mat, caps=(mat, mat))

    def rounded_box(self, x0, x1, y0, y1, z0, z1, mat, inset=0.004, lip=0.004):
        """Box whose top ring steps inward: a molded button / keycap profile."""
        a = self.rect_xy(x0, x1, y0, y1, z0)
        b = self.rect_xy(x0, x1, y0, y1, z1 - lip)
        c = self.rect_xy(x0 + inset, x1 - inset, y0 + inset, y1 - inset, z1)
        self.loft([a, b, c], mat, caps=(mat, mat))

    def front_button(self, x0, x1, z0, z1, y0, y1, mat, inset=0.004, lip=0.004):
        """Button whose stepped face points +y (the front)."""
        hw, cx = (x1 - x0) / 2, (x0 + x1) / 2
        a = self.rect(hw, z0, z1, y0, cx)
        b = self.rect(hw, z0, z1, y1 - lip, cx)
        c = self.rect(hw - inset, z0 + inset, z1 - inset, y1, cx)
        self.loft([a, b, c], mat, caps=(mat, mat))

    def tube(self, points, r, mat, n=8):
        """Closed tube along a polyline (cable)."""
        pts = [Vector(p) for p in points]
        rings = []
        for i, p in enumerate(pts):
            t = (pts[min(i + 1, len(pts) - 1)] - pts[max(i - 1, 0)]).normalized()
            ref = Vector((0, 0, 1)) if abs(t.z) < 0.9 else Vector((1, 0, 0))
            u = t.cross(ref).normalized()
            w = t.cross(u).normalized()
            rings.append(self.circle_frame(p, u, w, r, n))
        self.loft(rings, mat, caps=(mat, mat))

    # -- carving -------------------------------------------------------------

    def carve(self, select, planes, pocket, depth, floor_mat, wall_mat=None):
        """Bisect the faces chosen by `select` with `planes` [(co, no), ...], then
        push the faces whose centres satisfy `pocket` inward by `depth`."""
        bm = self.bm
        for co, no in planes:
            bm.normal_update()
            faces = [f for f in bm.faces if select(f)]
            if not faces:
                continue
            edges = {e for f in faces for e in f.edges}
            verts = {v for f in faces for v in f.verts}
            bmesh.ops.bisect_plane(bm, geom=faces + list(edges) + list(verts), dist=1e-6,
                                   plane_co=co, plane_no=no)
        bm.normal_update()
        if depth <= 0:
            return []
        faces = [f for f in bm.faces if select(f) and pocket(f.calc_center_median())]
        if not faces:
            raise RuntimeError(f'{self.name}: carve selected no pocket faces')
        normal = faces[0].normal.copy()
        res = bmesh.ops.extrude_face_region(bm, geom=faces)
        # bmesh keeps the source faces behind the extrusion; they would leave
        # every pocket rim with three faces on an edge, so drop them.
        bmesh.ops.delete(bm, geom=faces, context='FACES_ONLY')
        new_verts = [g for g in res['geom'] if isinstance(g, bmesh.types.BMVert)]
        bmesh.ops.translate(bm, verts=new_verts, vec=-normal * depth)
        new_faces = [g for g in res['geom'] if isinstance(g, bmesh.types.BMFace)]
        nv = set(new_verts)
        for f in new_faces:
            if all(v in nv for v in f.verts):
                f.material_index = self.idx(floor_mat)
            elif wall_mat is not None:
                f.material_index = self.idx(wall_mat)
        bm.normal_update()
        return faces

    # -- finish ---------------------------------------------------------------

    def finish(self, collection, closed=True, bevel=None, smooth=True, location=(0, 0, 0)):
        bm = self.bm
        bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-6)
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        if closed:
            bad = [e for e in bm.edges if len(e.link_faces) != 2]
            if bad:
                raise RuntimeError(f'{self.name}: {len(bad)} non-manifold edges')
        me = bpy.data.meshes.new(self.name)
        bm.to_mesh(me)
        bm.free()
        for m in self.mats:
            me.materials.append(m)
        if smooth:
            me.polygons.foreach_set('use_smooth', [True] * len(me.polygons))
        me.update()
        ob = bpy.data.objects.new(self.name, me)
        ob.location = location
        collection.objects.link(ob)
        if bevel:
            mod = ob.modifiers.new('Bevel', 'BEVEL')
            mod.width = bevel
            mod.segments = 2
            mod.limit_method = 'ANGLE'
            mod.angle_limit = math.radians(30)
            mod.harden_normals = True
            mod.use_clamp_overlap = True
            mod.loop_slide = True
        return ob

# ---------------------------------------------------------------- monitor

def build_monitor(col, M):
    CABLE = M['CableRubber']
    ABS, BEZ, TRIM, TUBE, GLASS, LED = (M['CabinetABS'], M['BezelABS'], M['TrimDark'],
                                        M['CrtTube'], M['CrtGlass'], M['PowerLed'])
    # --- cabinet: one manifold loft, front box -> seam -> cone -> rear cap
    p = Part('Cabinet', [ABS, BEZ, TRIM, TUBE])
    HW, ZB, ZT = 0.637, 0.276, 1.55         # front box half-width, bottom, top
    R0 = p.rect(HW, ZB, ZT, 0.54)           # bezel plane
    R1 = p.rect(HW, ZB, ZT, 0.05)           # back of the front box
    R2 = p.rect(0.593, 0.320, 1.510, 0.05)  # step in to the seam
    R3 = p.rect(0.593, 0.320, 1.510, 0.02)  # seam band (TrimDark)
    R5 = p.rect(0.435, 0.478, 1.348, -0.89)  # cone end
    R6 = p.rect(0.320, 0.593, 1.233, -0.99)  # rear cap rim
    O0 = p.rect(0.517, 0.513, 1.429, 0.54)  # bezel opening
    O1 = p.rect(0.457, 0.573, 1.369, 0.48)  # bottom of the chamfer
    O2 = p.rect(0.457, 0.573, 1.369, 0.42)  # tube face
    p.bridge(R0, O0, BEZ)      # bezel frame
    p.bridge(O0, O1, BEZ)      # 45-degree chamfer
    p.bridge(O1, O2, BEZ)      # return wall
    p.cap(O2, TUBE)            # flat tube face (runtime hangs the screen in front)
    p.bridge(R0, R1, ABS)      # front box sides
    p.bridge(R1, R2, ABS)      # step
    p.bridge(R2, R3, TRIM)     # seam band
    p.bridge(R3, R5, ABS)      # cone
    p.bridge(R5, R6, ABS)      # rear chamfer
    p.cap(R6, ABS)             # rear face
    p.bm.normal_update()
    bmesh.ops.recalc_face_normals(p.bm, faces=p.bm.faces)

    Y, X, Z = Vector((0, 1, 0)), Vector((1, 0, 0)), Vector((0, 0, 1))

    # chin control recess (front face, below the opening)
    chin = lambda f: f.normal.y > 0.99 and f.calc_center_median().z < 0.513 and f.calc_center_median().y > 0.5
    p.carve(chin, [((-0.28, 0, 0), X), ((0.28, 0, 0), X)],
            lambda c: abs(c.x) < 0.28, 0.0, ABS)  # (depth 0 = just the cuts)
    chin_band = lambda f: chin(f) and abs(f.calc_center_median().x) < 0.28
    p.carve(chin_band, [((0, 0, 0.305), Z), ((0, 0, 0.425), Z)],
            lambda c: 0.305 < c.z < 0.425, 0.02, TRIM, BEZ)

    # side vent grilles, low on the rear cone, both sides
    for sx in (1, -1):
        side = lambda f, sx=sx: sx * f.normal.x > 0.9 and f.calc_center_median().y < 0.0
        p.carve(side, [((0, -0.72, 0), Y), ((0, -0.42, 0), Y)],
                lambda c: -0.72 < c.y < -0.42, 0.0, ABS)
        band = lambda f, side=side: side(f) and -0.72 < f.calc_center_median().y < -0.42
        planes = []
        for k in range(8):
            z0 = 0.58 + k * 0.036
            planes += [((0, 0, z0), Z), ((0, 0, z0 + 0.016), Z)]
        p.carve(band, planes,
                lambda c: any(0.58 + k * 0.036 < c.z < 0.58 + k * 0.036 + 0.016 for k in range(8)),
                0.02, TRIM, ABS)

    # rear recessed panel with vent slots
    rear = lambda f: f.normal.y < -0.99 and f.calc_center_median().y < -0.9
    p.carve(rear, [((-0.24, 0, 0), X), ((0.24, 0, 0), X)], lambda c: abs(c.x) < 0.24, 0.0, ABS)
    rear_band = lambda f: rear(f) and abs(f.calc_center_median().x) < 0.24
    p.carve(rear_band, [((0, 0, 0.66), Z), ((0, 0, 1.16), Z)],
            lambda c: 0.66 < c.z < 1.16, 0.03, ABS, ABS)
    panel = lambda f: f.normal.y < -0.99 and -0.98 < f.calc_center_median().y < -0.9 and abs(f.calc_center_median().x) < 0.24
    planes = []
    for k in range(6):
        z0 = 0.72 + k * 0.06
        planes += [((0, 0, z0), Z), ((0, 0, z0 + 0.024), Z)]
    p.carve(panel, [((-0.19, 0, 0), X), ((0.19, 0, 0), X)], lambda c: abs(c.x) < 0.19, 0.0, ABS)
    panel_band = lambda f: panel(f) and abs(f.calc_center_median().x) < 0.19
    p.carve(panel_band, planes,
            lambda c: any(0.72 + k * 0.06 < c.z < 0.72 + k * 0.06 + 0.024 for k in range(6)),
            0.015, TRIM, ABS)
    cabinet = p.finish(col, closed=True, bevel=0.012)

    # --- chin buttons (in the recess) + power rocker + LED
    b = Part('ChinButtons', [TRIM])
    for x in (-0.11, 0.0, 0.11):
        b.front_button(x - 0.028, x + 0.028, 0.345, 0.385, 0.505, 0.532, TRIM, inset=0.005, lip=0.005)
    buttons = b.finish(col, closed=True, bevel=None)

    r = Part('PowerRocker', [BEZ, LED])
    r.front_button(0.42, 0.52, 0.33, 0.39, 0.53, 0.556, BEZ, inset=0.006, lip=0.006)
    r.box(0.555, 0.575, 0.535, 0.548, 0.35, 0.37, LED)
    rocker = r.finish(col, closed=True, bevel=None)

    # --- glass: pillow dome sealed just inside the bezel return wall
    g = Part('Glass', [GLASS])
    hw, zlo, zhi, rim, bulge = 0.457, 0.573, 1.369, 0.47, 0.085
    N = 14
    grid = []
    for j in range(N + 1):
        row = []
        v = -1 + 2 * j / N
        for i in range(N + 1):
            u = -1 + 2 * i / N
            dome = bulge * ((1 - u * u) ** 0.55) * ((1 - v * v) ** 0.55)
            row.append(g.bm.verts.new((hw * u, rim + dome, (zlo + zhi) / 2 + (zhi - zlo) / 2 * v)))
        grid.append(row)
    for j in range(N):
        for i in range(N):
            f = g.bm.faces.new((grid[j][i], grid[j][i + 1], grid[j + 1][i + 1], grid[j + 1][i]))
            f.material_index = 0
    g.bm.normal_update()
    if sum(f.normal.y for f in g.bm.faces) < 0:
        bmesh.ops.reverse_faces(g.bm, faces=g.bm.faces)
    glass = g.finish(col, closed=False, bevel=None)

    # --- swivel base: foot, pedestal, rubber collar, tilt cup, neck
    s = Part('Base', [ABS, TRIM])
    foot = [s.ellipse(0.33, 0.38, 0.0), s.ellipse(0.35, 0.40, 0.018), s.ellipse(0.35, 0.40, 0.042),
            s.ellipse(0.33, 0.38, 0.06)]
    s.loft(foot, ABS, caps=(ABS, ABS))
    ped = [s.ellipse(0.29, 0.30, 0.06), s.ellipse(0.27, 0.28, 0.17)]
    s.loft(ped, ABS, caps=(ABS, ABS))
    ring = [s.ellipse(0.255, 0.265, 0.17), s.ellipse(0.255, 0.265, 0.215)]
    s.loft(ring, TRIM, caps=(TRIM, TRIM))
    cup = [s.ellipse(0.24, 0.25, 0.215), s.ellipse(0.265, 0.275, 0.29), s.ellipse(0.22, 0.23, 0.36)]
    s.loft(cup, ABS, caps=(ABS, ABS))
    base = s.finish(col, closed=True, bevel=0.008)

    # --- power cable out of the rear panel, down onto the deck
    c = Part('Cable', [CABLE])
    c.tube([(0.12, -0.965, 0.62), (0.12, -1.02, 0.56), (0.13, -1.045, 0.32), (0.15, -1.02, 0.08),
            (0.19, -0.93, 0.014), (0.25, -0.75, 0.012), (0.30, -0.55, 0.012)], 0.013, CABLE)
    cable = c.finish(col, closed=True, bevel=None)

    return [cabinet, buttons, rocker, base, cable], glass

# ---------------------------------------------------------------- keyboard

U = 0.0625      # 19.05 mm key pitch in feet
KGAP = 0.0075
KB_W, KB_D = 1.30, 0.50
Z_FRONT, Z_REAR = 0.062, 0.108   # sloped top: front edge (clerk side, +y) to rear
CASE_Z0 = 0.012                  # sits on feet pads
WELL = 0.006


def top_z(y):
    return Z_FRONT + (Z_REAR - Z_FRONT) * ((KB_D / 2 - y) / KB_D)


def build_keyboard(col, M):
    SHELL, CAPS, DARK, TRIM, LED = (M['KeyboardShell'], M['KeyCaps'], M['KeyCapsDark'],
                                    M['TrimDark'], M['PowerLed'])
    CABLE = M['CableRubber']
    p = Part('KeyboardCase', [SHELL, TRIM])
    hx, hy = KB_W / 2, KB_D / 2
    bot = p.rect_xy(-hx, hx, -hy, hy, CASE_Z0)
    vb = p.bm.verts.new
    top = [vb((-hx, -hy, Z_REAR)), vb((hx, -hy, Z_REAR)), vb((hx, hy, Z_FRONT)), vb((-hx, hy, Z_FRONT))]
    p.loft([bot, top], SHELL, caps=(SHELL, SHELL))
    p.bm.normal_update()
    bmesh.ops.recalc_face_normals(p.bm, faces=p.bm.faces)
    X, Y = Vector((1, 0, 0)), Vector((0, 1, 0))
    topf = lambda f: f.normal.z > 0.9
    p.carve(topf, [((-0.62, 0, 0), X), ((0.63, 0, 0), X)], lambda c: -0.62 < c.x < 0.63, 0.0, SHELL)
    band = lambda f: topf(f) and -0.62 < f.calc_center_median().x < 0.63
    p.carve(band, [((0, -0.215, 0), Y), ((0, 0.185, 0), Y)],
            lambda c: -0.215 < c.y < 0.185, WELL, TRIM, SHELL)
    case = p.finish(col, closed=True, bevel=0.012)

    f = Part('KeyboardFeet', [TRIM])
    for x in (-0.58, 0.58):
        for y in (-0.19, 0.19):
            f.box(x - 0.035, x + 0.035, y - 0.025, y + 0.025, 0.0, CASE_Z0 + 0.002, TRIM)
    feet = f.finish(col, closed=True, bevel=None)

    c = Part('KeyboardCable', [CABLE])
    c.tube([(0.30, -0.24, 0.05), (0.30, -0.30, 0.048), (0.31, -0.36, 0.03), (0.33, -0.42, 0.012),
            (0.36, -0.50, 0.011)], 0.011, CABLE)
    cable = c.finish(col, closed=True, bevel=None)

    # --- keys: rows rear -> front. Each entry (width in U, dark?). None = gap.
    rows = [
        [(1, True), None, (1, True), (1, True), (1, True), (1, True), (0.5, None), (1, True), (1, True), (1, True), (1, True), (0.5, None), (1, True), (1, True), (1, True), (1, True)],
        [(1, False)] * 13 + [(2, True)],
        [(1.5, True)] + [(1, False)] * 12 + [(1.5, True)],
        [(1.75, True)] + [(1, False)] * 11 + [(2.25, True)],
        [(2.25, True)] + [(1, False)] * 10 + [(2.75, True)],
        [(1.5, True), (1.5, True), (9, False), (1.5, True), (1.5, True)],
    ]
    rear_margin = 0.045
    row_y = []
    y = -hy + rear_margin + 0.5 * U
    row_y.append(y)
    y += U + 0.3 * U
    for _ in range(5):
        row_y.append(y)
        y += U
    x_main0 = -hx + 0.045
    keys = []  # (x0, x1, y0, y1, dark)
    for r, row in enumerate(rows):
        x = x_main0
        yc = row_y[r]
        for entry in row:
            if entry is None:
                x += U
                continue
            w, dark = entry
            if dark is None:
                x += w * U
                continue
            keys.append((x + KGAP / 2, x + w * U - KGAP / 2, yc - U / 2 + KGAP / 2, yc + U / 2 - KGAP / 2, dark))
            x += w * U
    # numpad: 4 columns to the right of the main block, rows 1..5
    np_x0 = x_main0 + 15 * U + 0.5 * U
    pad = [
        [(0, 1, True), (1, 1, True), (2, 1, True), (3, 1, True)],
        [(0, 1, False), (1, 1, False), (2, 1, False), (3, 2, True)],
        [(0, 1, False), (1, 1, False), (2, 1, False)],
        [(0, 1, False), (1, 1, False), (2, 1, False), (3, 2, True)],
        [(0, 1, False, 2), (2, 1, False)],
    ]
    for r, row in enumerate(pad):
        yc = row_y[r + 1]
        for entry in row:
            colx, tall, dark = entry[0], entry[1], entry[2]
            wide = entry[3] if len(entry) > 3 else 1
            x0 = np_x0 + colx * U + KGAP / 2
            x1 = np_x0 + (colx + wide) * U - KGAP / 2
            y0 = yc - U / 2 + KGAP / 2
            y1 = yc + (tall - 0.5) * U - KGAP / 2
            keys.append((x0, x1, y0, y1, dark))
    # lock LEDs over the numpad at the F-row line
    leds = Part('KeyboardLeds', [LED])
    for i in range(3):
        x = np_x0 + 1.0 * U + i * 0.9 * U
        yc = row_y[0]
        leds.box(x - 0.008, x + 0.008, yc - 0.006, yc + 0.006, top_z(yc) - 0.002, top_z(yc) + 0.004, LED)
    led_ob = leds.finish(col, closed=True, bevel=None)

    slope = math.atan((Z_REAR - Z_FRONT) / KB_D)
    key_obs = []
    kp = Part('Keys', [CAPS, DARK])
    for (x0, x1, y0, y1, dark) in keys:
        cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
        zb = top_z(cy) - WELL - 0.002
        mat = DARK if dark else CAPS
        # keycap: base -> shoulder -> inset top, then tilt with the deck slope
        rings = []
        for (inset, dz) in ((0.0, 0.0), (0.002, 0.024), (0.008, 0.031)):
            rings.append(kp.rect_xy(x0 + inset, x1 - inset, y0 + inset, y1 - inset, zb + dz))
        kp.loft(rings, mat, caps=(mat, mat))
        # tilt the cap about its base centre so it stands normal to the sloped deck
        vs = [v for ring in rings for v in ring]
        for v in vs:
            d = v.co - Vector((cx, cy, zb))
            ang = -slope
            v.co = Vector((cx, cy, zb)) + Vector((d.x, d.y * math.cos(ang) - d.z * math.sin(ang),
                                                  d.y * math.sin(ang) + d.z * math.cos(ang)))
    keys_ob = kp.finish(col, closed=True, bevel=0.0035)
    return [case, feet, cable, led_ob, keys_ob]

# ---------------------------------------------------------------- export copy

def unwrap_object(ob):
    bpy.ops.object.select_all(action='DESELECT')
    ob.select_set(True)
    bpy.context.view_layer.objects.active = ob
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=0.004,
                             correct_aspect=True, scale_to_bounds=False)
    bpy.ops.object.mode_set(mode='OBJECT')


def export_copy(parts, name, col):
    """Join copies of the parts (bevel applied) into one object, unwrap it."""
    bpy.ops.object.select_all(action='DESELECT')
    copies = []
    for ob in parts:
        cp = ob.copy()
        cp.data = ob.data.copy()
        col.objects.link(cp)
        copies.append(cp)
    for cp in copies:
        bpy.ops.object.select_all(action='DESELECT')
        cp.select_set(True)
        bpy.context.view_layer.objects.active = cp
        for mod in list(cp.modifiers):
            bpy.ops.object.modifier_apply(modifier=mod.name)
    bpy.ops.object.select_all(action='DESELECT')
    for cp in copies:
        cp.select_set(True)
    bpy.context.view_layer.objects.active = copies[0]
    bpy.ops.object.join()
    ob = bpy.context.view_layer.objects.active
    ob.name = name
    ob.data.name = name
    unwrap_object(ob)
    return ob


def bake_ao(ob, image, samples=96, distance=0.55):
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    scene.cycles.device = 'CPU'
    scene.cycles.samples = samples
    scene.render.bake.margin = 6
    scene.render.bake.use_selected_to_active = False
    if scene.world is None:
        scene.world = bpy.data.worlds.new('World')
    try:
        scene.world.light_settings.distance = distance
    except AttributeError:
        pass
    for m in ob.data.materials:
        node = m.node_tree.nodes.get('BAKE')
        if node is None:
            raise RuntimeError(f'{m.name}: no BAKE node for the AO target')
        node.image = image
        m.node_tree.nodes.active = node
    bpy.ops.object.select_all(action='DESELECT')
    ob.select_set(True)
    bpy.context.view_layer.objects.active = ob
    others = [o for o in bpy.data.objects if o is not ob]
    hidden = {o: o.hide_render for o in others}
    for o in others:
        o.hide_render = True
    try:
        bpy.ops.object.bake(type='AO', use_clear=True)
    finally:
        for o, was in hidden.items():
            o.hide_render = was
    # soften: keep the crevices, lift the floor so the runtime tint stays the hue
    px = np.empty(len(image.pixels), dtype=np.float32)
    image.pixels.foreach_get(px)
    px = px.reshape(-1, 4)
    ao = px[:, :3].mean(axis=1)
    ao = 0.28 + 0.72 * np.clip(ao, 0, 1) ** 0.85
    px[:, 0] = px[:, 1] = px[:, 2] = ao
    px[:, 3] = 1.0
    image.pixels.foreach_set(px.ravel())
    image.pack()


def export_glb(objects, path):
    bpy.ops.object.select_all(action='DESELECT')
    for ob in objects:
        ob.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    bpy.ops.export_scene.gltf(filepath=str(path), export_format='GLB', use_selection=True,
                              export_yup=True, export_apply=True, export_image_format='AUTO',
                              export_normals=True, export_texcoords=True, export_materials='EXPORT')
    print(f'[counter-terminal] wrote {path} ({path.stat().st_size} bytes)')

# ---------------------------------------------------------------- main

def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.context.preferences.filepaths.save_version = 0
    scene = bpy.context.scene
    scene.unit_settings.system = 'IMPERIAL'
    scene.unit_settings.scale_length = 0.3048
    scene.unit_settings.length_unit = 'FEET'

    grain = grain_image()
    # These maps tile or carry broad crevice shading; the former 1024/512 AO
    # pair and 256 grain map spent more bytes than the geometry and broke the
    # model's 500 KB shipping gate without adding visible detail at counter
    # distance. Half-resolution maps retain their full material roles.
    ao_term = bake_image('terminal_ao', 512)
    ao_kb = bake_image('keyboard_ao', 256)

    M = {
        'CabinetABS': material('CabinetABS', (0.72, 0.64, 0.47), rough=0.52, ao=ao_term, grain=grain),
        'BezelABS': material('BezelABS', (0.66, 0.59, 0.44), rough=0.5, ao=ao_term, grain=grain),
        'TrimDark': material('TrimDark', (0.03, 0.03, 0.032), rough=0.6, ao=ao_term, grain=grain),
        'CableRubber': material('CableRubber', (0.035, 0.034, 0.036), rough=0.72, ao=ao_term, grain=grain),
        'CrtTube': material('CrtTube', (0.012, 0.012, 0.014), rough=0.35, ao=ao_term),
        'CrtGlass': material('CrtGlass', (0.1, 0.11, 0.12), rough=0.05, alpha=0.25),
        # The runtime supplies the live LED emission and tags it as a light
        # source. Keep the shipped material physical/non-emissive so a model
        # viewed outside that integration does not smuggle in self-lighting.
        'PowerLed': material('PowerLed', (0.2, 0.9, 0.3), rough=0.4, ao=ao_term),
        'KeyboardShell': material('KeyboardShell', (0.60, 0.54, 0.41), rough=0.55, ao=ao_kb, grain=grain,
                                  grain_scale=30),
        'KeyCaps': material('KeyCaps', (0.70, 0.64, 0.49), rough=0.45, ao=ao_kb, grain=grain, grain_scale=30,
                            grain_strength=0.35),
        'KeyCapsDark': material('KeyCapsDark', (0.40, 0.37, 0.31), rough=0.5, ao=ao_kb, grain=grain,
                                grain_scale=30, grain_strength=0.35),
    }

    col_term = bpy.data.collections.new('Terminal (editable)')
    col_kb = bpy.data.collections.new('Keyboard (editable)')
    col_export = bpy.data.collections.new('Export')
    for c in (col_term, col_kb, col_export):
        scene.collection.children.link(c)

    parts, glass = build_monitor(col_term, M)
    kb_parts = build_keyboard(col_kb, M)

    term = export_copy(parts, 'TerminalExport', col_export)
    glass_ex = glass.copy()
    glass_ex.data = glass.data.copy()
    glass_ex.name = 'TerminalGlass'
    col_export.objects.link(glass_ex)
    unwrap_object(glass_ex)
    kb = export_copy(kb_parts, 'KeyboardExport', col_export)

    bake_ao(term, ao_term)
    export_glb([term, glass_ex], OUT / 'rental-terminal.glb')
    bake_ao(kb, ao_kb, samples=64, distance=0.25)
    export_glb([kb], OUT / 'rental-keyboard.glb')

    for ob in (term, glass_ex, kb):
        d = ob.dimensions
        print(f'[counter-terminal] {ob.name}: {d.x:.3f} x {d.y:.3f} x {d.z:.3f} ft, '
              f'{len(ob.data.polygons)} faces')

    col_export.hide_viewport = True
    col_export.hide_render = True
    bpy.ops.wm.save_as_mainfile(filepath=str(BLEND), compress=True)
    print(f'[counter-terminal] saved {BLEND}')


if __name__ == '__main__':
    main()
