"""Wall-mounted changeable-strip information board family.
Blender scripted mesh authoring in imperial feet.
Exports:
  - public/models/wall-track-board-tall.glb
  - public/models/wall-track-board-long.glb
  - public/models/wall-track-rail.glb
Editable source:
  - tools/models/wall-track-board.blend
Metrics:
  - tools/models/wall-track-board-metrics.json
"""
import bpy, bmesh, math, json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]

# Clear existing objects
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
for block in bpy.data.meshes: bpy.data.meshes.remove(block)
for block in bpy.data.materials: bpy.data.materials.remove(block)
for col in list(bpy.data.collections): bpy.data.collections.remove(col)

bpy.context.scene.unit_settings.system = 'IMPERIAL'
bpy.context.scene.unit_settings.scale_length = 0.3048
bpy.context.preferences.filepaths.save_version = 0

# Material definitions
MATS = {}
def get_or_create_mat(name, color, metal=0.0, rough=0.5, emissive=(0,0,0,1)):
    if name in MATS: return MATS[name]
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    p = m.node_tree.nodes.get('Principled BSDF')
    p.inputs['Base Color'].default_value = color
    p.inputs['Metallic'].default_value = metal
    p.inputs['Roughness'].default_value = rough
    if emissive[0] > 0 or emissive[1] > 0 or emissive[2] > 0:
        p.inputs['Emission Color'].default_value = emissive
        p.inputs['Emission Strength'].default_value = 1.0
    MATS[name] = m
    return m

get_or_create_mat('TrackFrameSilver', (0.76, 0.78, 0.81, 1), metal=0.88, rough=0.24)
get_or_create_mat('TrackFrameDark',   (0.12, 0.13, 0.14, 1), metal=0.75, rough=0.38)
get_or_create_mat('TrackBacking',     (0.04, 0.04, 0.05, 1), metal=0.05, rough=0.85)
get_or_create_mat('TrackRail',        (0.68, 0.70, 0.73, 1), metal=0.85, rough=0.28)
get_or_create_mat('TrackStripFace',   (0.92, 0.91, 0.88, 1), metal=0.02, rough=0.45)
get_or_create_mat('BoardHardware',    (0.55, 0.57, 0.60, 1), metal=0.92, rough=0.30)
get_or_create_mat('PosterFrame',      (0.76, 0.78, 0.81, 1), metal=0.88, rough=0.24)
get_or_create_mat('PosterFace',       (0.86, 0.32, 0.08, 1), metal=0.02, rough=0.38)
get_or_create_mat('TrackHood',        (0.12, 0.13, 0.14, 1), metal=0.75, rough=0.38)
get_or_create_mat('TrackEmissive',    (0.96, 0.94, 0.88, 1), metal=0.0,  rough=0.18, emissive=(0.95, 0.92, 0.82, 1))

def make_mesh(name, verts, faces, mat_name, col=None):
    # Converts store coords (x, y, z) where y is height, z is forward depth
    # to Blender coords (x, -z, y)
    b_verts = [(x, -z, y) for x, y, z in verts]
    me = bpy.data.meshes.new(name)
    me.from_pydata(b_verts, [], faces)
    me.update()
    ob = bpy.data.objects.new(name, me)
    target_col = col if col else bpy.context.scene.collection
    target_col.objects.link(ob)
    ob.data.materials.append(MATS[mat_name])
    
    bm = bmesh.new()
    bm.from_mesh(me)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=0.00001)
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    assert all(e.is_manifold for e in bm.edges), f"Non-manifold edge in {name}"
    bm.to_mesh(me)
    bm.free()
    
    bpy.context.view_layer.objects.active = ob
    ob.select_set(True)
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=1.15, island_margin=0.02)
    bpy.ops.object.mode_set(mode='OBJECT')
    ob.select_set(False)
    return ob

def make_box(name, x0, x1, y0, y1, z0, z1, mat_name, col=None):
    verts = [
        (x0, y0, z0), (x1, y0, z0), (x1, y1, z0), (x0, y1, z0), # back
        (x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1), # front
    ]
    faces = [
        (0, 3, 2, 1), # back (facing -z)
        (4, 5, 6, 7), # front (facing +z)
        (0, 1, 5, 4), # bottom
        (2, 3, 7, 6), # top
        (0, 4, 7, 3), # left
        (1, 2, 6, 5), # right
    ]
    return make_mesh(name, verts, faces, mat_name, col=col)

def make_snap_frame(name, w, h, fw, fd, mat_name, cx=0.0, cy=0.0, col=None):
    # Constructs 4 mitered frame borders (bottom, top, left, right)
    # Origin of board is at (cx, cy) in (X, Y).
    x_min = cx - w/2
    x_max = cx + w/2
    y_min = cy
    y_max = cy + h
    
    # Beveled profile points (u from outer edge inwards, z depth forward):
    # Outer return: u=0, z=0 to z=fd
    # Front face: u=fw-0.02, z=fd-0.005
    # Inner chamfer: u=fw, z=fd-0.015
    # Inner rebate: u=fw, z=0.005
    # Back seat: u=fw-0.015, z=0.005 to z=0
    # Back wall: u=0, z=0
    prof = [
        (0.0, 0.0),
        (0.0, fd),
        (fw - 0.02, fd - 0.005),
        (fw, fd - 0.015),
        (fw, 0.005),
        (fw - 0.015, 0.005),
        (fw - 0.015, 0.0),
    ]
    np = len(prof)
    
    # We can create the 4 pieces as one welded frame mesh
    verts = []
    faces = []
    
    # 4 corners: bottom-left, bottom-right, top-right, top-left
    # At each corner, the miter ray bisects the 90 deg angle.
    corners = [
        (x_min, y_min, 1, 1),   # bottom-left: +x, +y
        (x_max, y_min, -1, 1),  # bottom-right: -x, +y
        (x_max, y_max, -1, -1), # top-right: -x, -y
        (x_min, y_max, 1, -1),  # top-left: +x, -y
    ]
    
    # For each corner c (0..3) and each profile index p (0..np-1):
    # Vertex coord in store:
    # x = corner_x + dir_x * prof_u
    # y = corner_y + dir_y * prof_u
    # z = prof_z
    for c_idx in range(4):
        cx0, cy0, dx, dy = corners[c_idx]
        for u, z in prof:
            verts.append((cx0 + dx * u, cy0 + dy * u, z))
            
    # Connect rings: 4 corners, each has np vertices
    for c_idx in range(4):
        next_c = (c_idx + 1) % 4
        base0 = c_idx * np
        base1 = next_c * np
        for p_idx in range(np - 1):
            faces.append((base0 + p_idx, base1 + p_idx, base1 + p_idx + 1, base0 + p_idx + 1))
        # Close back
        faces.append((base0 + (np - 1), base1 + (np - 1), base1, base0))
        
    return make_mesh(name, verts, faces, mat_name, col=col)

def make_rail(name, length, pitch, cx, cy, col=None):
    # Sweeps the 12-point extruded rail channel across X from cx - length/2 to cx + length/2
    rh = pitch / 2 - 0.004
    lip_y = 0.020
    # Profile in (rel_y, z):
    prof = [
        (-rh, 0.006),              # 0: bottom back
        (-rh, 0.026),              # 1: bottom front edge
        (-rh + lip_y, 0.026),       # 2: lower lip top front
        (-rh + lip_y, 0.016),       # 3: lower lip top back
        (-rh + 0.008, 0.016),       # 4: lower slot bottom
        (-rh + 0.008, 0.008),       # 5: channel bed lower
        (rh - 0.008, 0.008),        # 6: channel bed upper
        (rh - 0.008, 0.016),        # 7: upper slot top
        (rh - lip_y, 0.016),        # 8: upper lip bottom back
        (rh - lip_y, 0.026),        # 9: upper lip bottom front
        (rh, 0.026),               # 10: top front edge
        (rh, 0.006),               # 11: top back
    ]
    np = len(prof)
    x0 = cx - length / 2
    x1 = cx + length / 2
    
    verts = []
    # x0 cap vertices (0..np-1)
    for ry, z in prof:
        verts.append((x0, cy + ry, z))
    # x1 cap vertices (np..2*np-1)
    for ry, z in prof:
        verts.append((x1, cy + ry, z))
        
    faces = []
    # Side quads
    for i in range(np):
        next_i = (i + 1) % np
        faces.append((i, i + np, next_i + np, next_i))
    # End caps
    faces.append(tuple(reversed(range(np))))
    faces.append(tuple(range(np, 2 * np)))
    
    return make_mesh(name, verts, faces, 'TrackRail', col=col)

def make_strip(name, length, pitch, cx, cy, col=None):
    # Separable insert strip fitting into channel
    rh = pitch / 2 - 0.004
    strip_w = length - 0.008
    strip_h = (rh - 0.012) * 2  # extends into slots behind both lips
    x0 = cx - strip_w / 2
    x1 = cx + strip_w / 2
    y0 = cy - strip_h / 2
    y1 = cy + strip_h / 2
    z0 = 0.010
    z1 = 0.015 # front readable face
    return make_box(name, x0, x1, y0, y1, z0, z1, 'TrackStripFace', col=col)

def make_hardware(name, w, h, cx, cy, col=None):
    # Top Z-cleat and bottom wall standoff bumpers
    cleat_w = w * 0.75
    top_cleat = make_box(f"{name}_Cleat", cx - cleat_w/2, cx + cleat_w/2, cy + h - 0.35, cy + h - 0.15, -0.022, 0.0, 'BoardHardware', col=col)
    
    # Flange on cleat
    lip_w = cleat_w * 0.9
    top_flange = make_box(f"{name}_Flange", cx - lip_w/2, cx + lip_w/2, cy + h - 0.15, cy + h - 0.08, -0.028, -0.018, 'BoardHardware', col=col)
    
    # Bottom standoff bumper pads (left and right)
    b0 = make_box(f"{name}_BumperL", cx - w/2 + 0.15, cx - w/2 + 0.25, cy + 0.15, cy + 0.25, -0.020, 0.0, 'BoardHardware', col=col)
    b1 = make_box(f"{name}_BumperR", cx + w/2 - 0.25, cx + w/2 - 0.15, cy + 0.15, cy + 0.25, -0.020, 0.0, 'BoardHardware', col=col)
    
    return [top_cleat, top_flange, b0, b1]

# -------------------------------------------------------------
# 1. TALL BOARD & COMPANION POSTER
# -------------------------------------------------------------
col_tall = bpy.data.collections.new("WallTrackBoardTall")
bpy.context.scene.collection.children.link(col_tall)

# Proportions:
# Narrow visible track portion: width = 2.25 ft (27 in), height = 3.8 ft (45.6 in)
# Beside it sits its companion framed poster of identical size and frame profile!
# Gap between them = 0.12 ft (1.4 in)
# Placed symmetrically around x = 0:
# Track board center: X = - (2.25/2 + 0.12/2) = -1.185 ft
# Companion poster center: X = + (2.25/2 + 0.12/2) = +1.185 ft
TALL_W = 2.25
TALL_H = 3.8
TALL_FW = 0.085
TALL_FD = 0.045
TALL_ROWS = 14
TALL_GAP = 0.12
track_cx = -(TALL_W/2 + TALL_GAP/2)
poster_cx = (TALL_W/2 + TALL_GAP/2)

# Tall board frame
tall_frame = make_snap_frame("Tall_SnapFrame", TALL_W, TALL_H, TALL_FW, TALL_FD, 'TrackFrameSilver', cx=track_cx, cy=0.0, col=col_tall)

# Tall board backing
in_w = TALL_W - 2 * TALL_FW
in_h = TALL_H - 2 * TALL_FW
tall_backing = make_box("Tall_Backing", track_cx - in_w/2, track_cx + in_w/2, TALL_FW, TALL_H - TALL_FW, 0.0, 0.008, 'TrackBacking', col=col_tall)

# Tall board rails and strips
tall_pitch = in_h / TALL_ROWS
tall_rails = []
tall_strips = []
for r in range(TALL_ROWS):
    ry = TALL_FW + (r + 0.5) * tall_pitch
    rail = make_rail(f"Tall_Rail_{r:02d}", in_w, tall_pitch, track_cx, ry, col=col_tall)
    strip = make_strip(f"Tall_Strip_{r:02d}", in_w, tall_pitch, track_cx, ry, col=col_tall)
    tall_rails.append(rail)
    tall_strips.append(strip)

# Tall board hardware
tall_hw = make_hardware("Tall_HW", TALL_W, TALL_H, track_cx, 0.0, col=col_tall)

# Companion framed poster
poster_frame_ob = make_snap_frame("Poster_SnapFrame", TALL_W, TALL_H, TALL_FW, TALL_FD, 'PosterFrame', cx=poster_cx, cy=0.0, col=col_tall)
poster_backing = make_box("Poster_Backing", poster_cx - in_w/2, poster_cx + in_w/2, TALL_FW, TALL_H - TALL_FW, 0.0, 0.008, 'TrackBacking', col=col_tall)
# Poster face: thin printed sheet
poster_face_ob = make_box("Poster_Face", poster_cx - in_w/2 + 0.002, poster_cx + in_w/2 - 0.002, TALL_FW + 0.002, TALL_H - TALL_FW - 0.002, 0.008, 0.012, 'PosterFace', col=col_tall)
poster_hw = make_hardware("Poster_HW", TALL_W, TALL_H, poster_cx, 0.0, col=col_tall)

# -------------------------------------------------------------
# 2. LONG BOARD (RENTAL TERMS ABOVE FRONT GLASS)
# -------------------------------------------------------------
col_long = bpy.data.collections.new("WallTrackBoardLong")
bpy.context.scene.collection.children.link(col_long)

LONG_W = 11.5
LONG_H = 1.45
LONG_FW = 0.085
LONG_FD = 0.045
LONG_ROWS = 8

long_frame = make_snap_frame("Long_SnapFrame", LONG_W, LONG_H, LONG_FW, LONG_FD, 'TrackFrameDark', cx=0.0, cy=0.0, col=col_long)
long_in_w = LONG_W - 2 * LONG_FW
long_in_h = LONG_H - 2 * LONG_FW
long_backing = make_box("Long_Backing", -long_in_w/2, long_in_w/2, LONG_FW, LONG_H - LONG_FW, 0.0, 0.008, 'TrackBacking', col=col_long)

long_pitch = long_in_h / LONG_ROWS
long_rails = []
long_strips = []
for r in range(LONG_ROWS):
    ry = LONG_FW + (r + 0.5) * long_pitch
    rail = make_rail(f"Long_Rail_{r:02d}", long_in_w, long_pitch, 0.0, ry, col=col_long)
    strip = make_strip(f"Long_Strip_{r:02d}", long_in_w, long_pitch, 0.0, ry, col=col_long)
    long_rails.append(rail)
    long_strips.append(strip)

# Hardware across 11.5 ft width (4 cleats)
long_hw = []
for c_i, cx in enumerate([-4.2, -1.4, 1.4, 4.2]):
    hw_group = make_hardware(f"Long_HW_{c_i}", 2.2, LONG_H, cx, 0.0, col=col_long)
    long_hw.extend(hw_group)

# Top luminaire hood and underside diffuser (configurable illumination)
long_hood = make_box("Long_Luminaire_Hood", -LONG_W/2, LONG_W/2, LONG_H, LONG_H + 0.075, 0.0, 0.080, 'TrackHood', col=col_long)
long_diffuser = make_box("Long_Luminaire_Diffuser", -long_in_w/2, long_in_w/2, LONG_H - 0.005, LONG_H + 0.005, 0.020, 0.065, 'TrackEmissive', col=col_long)

# -------------------------------------------------------------
# 3. MODULAR SHARED RAIL UNIT (1-foot span)
# -------------------------------------------------------------
col_rail = bpy.data.collections.new("WallTrackRail")
bpy.context.scene.collection.children.link(col_rail)

MOD_LEN = 1.0
MOD_PITCH = tall_pitch
mod_rail = make_rail("Modular_Track_Rail", MOD_LEN, MOD_PITCH, 0.0, MOD_PITCH/2, col=col_rail)
mod_strip = make_strip("Modular_Track_Strip", MOD_LEN, MOD_PITCH, 0.0, MOD_PITCH/2, col=col_rail)

# Save editable .blend file
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'tools/models/wall-track-board.blend'))

# -------------------------------------------------------------
# 4. EXPORT GLB FILES & RECORD METRICS
# -------------------------------------------------------------
def export_collection(col, out_path):
    bpy.ops.object.select_all(action='DESELECT')
    for ob in col.objects:
        ob.select_set(True)
    bpy.ops.export_scene.gltf(
        filepath=str(out_path),
        export_format='GLB',
        use_selection=True,
        export_yup=True,
        export_apply=True,
    )
    triangles = sum(len(o.data.loop_triangles) if o.data.loop_triangles else len(o.data.polygons) * 2 for o in col.objects if o.type == 'MESH')
    bytes_size = out_path.stat().st_size
    materials = sorted(list({m.name for o in col.objects if o.type == 'MESH' for m in o.data.materials if m}))
    return {
        'bytes': bytes_size,
        'triangles': triangles,
        'materials': materials,
        'objects': len(col.objects),
    }

metrics = {}
metrics['wall-track-board-tall'] = export_collection(col_tall, ROOT/'public/models/wall-track-board-tall.glb')
metrics['wall-track-board-long'] = export_collection(col_long, ROOT/'public/models/wall-track-board-long.glb')
metrics['wall-track-rail']       = export_collection(col_rail, ROOT/'public/models/wall-track-rail.glb')

(ROOT/'tools/models/wall-track-board-metrics.json').write_text(json.dumps(metrics, indent=2) + '\n')
print("WALL_TRACK_BOARD_METRICS:", json.dumps(metrics))

