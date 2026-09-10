"""Original recessed round downlight fixture; Blender mesh authoring.
Run: blender -b --python tools/models/recessed-downlight.py
Units: feet. Origin: center of ceiling opening (y=0 ceiling plane).
+Y is up into plenum (+Z in Blender); -Y is down into store (-Z in Blender).
"""
import bpy, bmesh, math, json
from pathlib import Path
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[2]

bpy.ops.wm.read_factory_settings(use_empty=True)
for block in list(bpy.data.materials):
    bpy.data.materials.remove(block)

def create_material(name, color, metal, rough, emissive=(0, 0, 0), emission_strength=0.0):
    m = bpy.data.materials.new(name)
    m.diffuse_color = (*color, 1)
    p = m.node_tree.nodes.get('Principled BSDF')
    p.inputs['Base Color'].default_value = (*color, 1)
    p.inputs['Metallic'].default_value = metal
    p.inputs['Roughness'].default_value = rough
    if emission_strength > 0:
        if 'Emission Color' in p.inputs:
            p.inputs['Emission Color'].default_value = (*emissive, 1)
        if 'Emission Strength' in p.inputs:
            p.inputs['Emission Strength'].default_value = emission_strength
    return m

mat_trim = create_material('DownlightTrim', (0.12, 0.12, 0.13), 0.35, 0.65)
mat_refl = create_material('DownlightReflector', (0.82, 0.84, 0.86), 0.85, 0.18)
mat_lamp = create_material('DownlightLamp', (1.0, 1.0, 1.0), 0.0, 0.9, (1.0, 0.95, 0.87), 2.2)
mat_can  = create_material('DownlightCan', (0.55, 0.57, 0.58), 0.70, 0.45)

def gltf_to_blender(gx, gy, gz):
    return Vector((gx, -gz, gy))

def revolve_profile(name, profile, N=24, mat=None, smooth=True):
    """Revolve a closed (r, gy) polygon around the Y axis."""
    mesh = bpy.data.meshes.new(name)
    bm = bmesh.new()
    M = len(profile)
    rings = []
    for r, gy in profile:
        ring = []
        for j in range(N):
            th = j * 2 * math.pi / N
            gx = r * math.cos(th)
            gz = r * math.sin(th)
            ring.append(bm.verts.new(gltf_to_blender(gx, gy, gz)))
        rings.append(ring)
    for i in range(M):
        i_next = (i + 1) % M
        for j in range(N):
            j_next = (j + 1) % N
            bm.faces.new((rings[i][j], rings[i][j_next], rings[i_next][j_next], rings[i_next][j]))
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    bm.normal_update()
    assert all(edge.is_manifold for edge in bm.edges), f'{name} non-manifold edge'
    bm.to_mesh(mesh)
    bm.free()
    ob = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(ob)
    if mat:
        ob.data.materials.append(mat)
    ob['units'] = 'feet'
    ob['smooth'] = smooth
    return ob

def make_disc(name, r, gy_bottom, gy_top, gy_bottom_center=None, gy_top_center=None, N=24, mat=None):
    """Closed circular disc/lens with thickness and optional center crown."""
    if gy_bottom_center is None: gy_bottom_center = gy_bottom
    if gy_top_center is None: gy_top_center = gy_top
    mesh = bpy.data.meshes.new(name)
    bm = bmesh.new()
    ring_b = [bm.verts.new(gltf_to_blender(r * math.cos(j * 2 * math.pi / N), gy_bottom, r * math.sin(j * 2 * math.pi / N))) for j in range(N)]
    ring_t = [bm.verts.new(gltf_to_blender(r * math.cos(j * 2 * math.pi / N), gy_top, r * math.sin(j * 2 * math.pi / N))) for j in range(N)]
    c_b = bm.verts.new(gltf_to_blender(0, gy_bottom_center, 0))
    c_t = bm.verts.new(gltf_to_blender(0, gy_top_center, 0))
    for j in range(N):
        j_next = (j + 1) % N
        bm.faces.new((c_b, ring_b[j], ring_b[j_next]))
        bm.faces.new((ring_b[j], ring_t[j], ring_t[j_next], ring_b[j_next]))
        bm.faces.new((c_t, ring_t[j_next], ring_t[j]))
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    bm.normal_update()
    assert all(edge.is_manifold for edge in bm.edges), f'{name} non-manifold edge'
    bm.to_mesh(mesh)
    bm.free()
    ob = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(ob)
    if mat:
        ob.data.materials.append(mat)
    ob['units'] = 'feet'
    ob['smooth'] = True
    return ob

def make_box(name, center, size, mat=None):
    """Watertight rectangular solid."""
    mesh = bpy.data.meshes.new(name)
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    cx, cy, cz = center
    sx, sy, sz = size
    for v in bm.verts:
        gx = cx + v.co.x * sx
        gy = cy + v.co.y * sy
        gz = cz + v.co.z * sz
        v.co = gltf_to_blender(gx, gy, gz)
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    bm.normal_update()
    assert all(edge.is_manifold for edge in bm.edges)
    bm.to_mesh(mesh)
    bm.free()
    ob = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(ob)
    if mat:
        ob.data.materials.append(mat)
    ob['units'] = 'feet'
    ob['smooth'] = False
    return ob

def make_wire(name, points, radius, mat=None, sides=8):
    """Capped watertight tubular wire along 3D points."""
    pts = [gltf_to_blender(gx, gy, gz) for gx, gy, gz in points]
    mesh = bpy.data.meshes.new(name)
    bm = bmesh.new()
    previous_u = None
    rings = []
    for i, p in enumerate(pts):
        tangent = (pts[min(i+1, len(pts)-1)] - pts[max(i-1, 0)]).normalized()
        u = tangent.cross(Vector((0, 0, 1)))
        if u.length < 0.01:
            u = tangent.cross(Vector((0, 1, 0)))
        u.normalize()
        if previous_u is not None and u.dot(previous_u) < 0:
            u = -u
        previous_u = u.copy()
        v = tangent.cross(u).normalized()
        ring = []
        for j in range(sides):
            th = j * 2 * math.pi / sides
            ring.append(bm.verts.new(p + radius * (u * math.cos(th) + v * math.sin(th))))
        rings.append(ring)
    for i in range(len(pts) - 1):
        for j in range(sides):
            j_next = (j + 1) % sides
            bm.faces.new((rings[i][j], rings[i][j_next], rings[i+1][j_next], rings[i+1][j]))
    c_start = bm.verts.new(pts[0])
    c_end = bm.verts.new(pts[-1])
    for j in range(sides):
        j_next = (j + 1) % sides
        bm.faces.new((c_start, rings[0][j_next], rings[0][j]))
        bm.faces.new((c_end, rings[-1][j], rings[-1][j_next]))
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    bm.normal_update()
    assert all(edge.is_manifold for edge in bm.edges), f'{name} non-manifold edge'
    bm.to_mesh(mesh)
    bm.free()
    ob = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(ob)
    if mat:
        ob.data.materials.append(mat)
    ob['units'] = 'feet'
    ob['smooth'] = True
    return ob

# 1. Stepped trim ring:
# Opening radius = 0.320 ft (7.68 in diameter).
# Outer trim radius = 0.410 ft (+0.09 ft radial flange).
# Stepped reveal profile with outer drop of 0.015 ft into room, return collar into ceiling.
trim_profile = [
    (0.410, 0.000), (0.408, -0.015), (0.350, -0.015), (0.350, -0.006),
    (0.325, -0.006), (0.320, 0.000), (0.320, 0.020), (0.328, 0.020),
    (0.328, 0.000)
]
trim_ring = revolve_profile('Stepped_trim_ring', trim_profile, N=24, mat=mat_trim)

# 2. Recessed reflector bowl:
# Parabolic reflector cone recessing up into ceiling from y=0.005 to y=0.280 ft.
# Realistic 0.008 ft wall thickness, closed solid.
refl_profile = [
    (0.320, 0.005), (0.285, 0.065), (0.240, 0.135), (0.190, 0.210), (0.145, 0.280),
    (0.153, 0.280), (0.198, 0.210), (0.248, 0.135), (0.293, 0.065), (0.328, 0.005)
]
reflector = revolve_profile('Recessed_reflector_bowl', refl_profile, N=24, mat=mat_refl)

# 3. Lamp seat collar:
# Collar holding the lamp lens at the top of the reflector bowl.
seat_profile = [
    (0.155, 0.280), (0.155, 0.315), (0.125, 0.315), (0.125, 0.295),
    (0.140, 0.295), (0.140, 0.280)
]
lamp_seat = revolve_profile('Lamp_seat', seat_profile, N=24, mat=mat_trim)

# 4. Bright lamp lens:
# Separate emissive surface at y=0.285 ft, radius 0.125 ft, slightly convex face pointing down.
lamp = make_disc('Bright_lamp', 0.125, 0.285, 0.295, 0.282, 0.295, N=24, mat=mat_lamp)

# 5. Hidden upper housing can:
# Cylindrical plenum enclosure from y=0.020 to y=0.550 ft (can depth 0.55 ft = 6.6 in).
can_profile = [
    (0.355, 0.020), (0.355, 0.550), (0.040, 0.550),
    (0.040, 0.542), (0.347, 0.542), (0.347, 0.020)
]
upper_can = revolve_profile('Upper_housing_can', can_profile, N=24, mat=mat_can)

# 6. Mounting frame / bar hangers:
# Two C-channel bar hangers spanning along X (x = -0.75 to +0.75 ft) at z = +/-0.34 ft.
# Cross brackets securing to the plaster frame collar.
bar1 = make_box('Hanger_bar_north', (0.0, 0.02, 0.34), (1.50, 0.03, 0.04), mat=mat_can)
bar2 = make_box('Hanger_bar_south', (0.0, 0.02, -0.34), (1.50, 0.03, 0.04), mat=mat_can)
tie_w = make_box('Mounting_tie_west', (-0.38, 0.02, 0.0), (0.06, 0.025, 0.68), mat=mat_can)
tie_e = make_box('Mounting_tie_east', (0.38, 0.02, 0.0), (0.06, 0.025, 0.68), mat=mat_can)

bpy.ops.object.select_all(action='DESELECT')
for ob in [bar1, bar2, tie_w, tie_e]:
    ob.select_set(True)
bpy.context.view_layer.objects.active = bar1
bpy.ops.object.join()
mounting_frame = bpy.context.object
mounting_frame.name = 'Mounting_frame'

# 7. Junction box:
jbox_body = make_box('Jbox_body', (0.46, 0.14, 0.0), (0.20, 0.20, 0.18), mat=mat_can)
jbox_cover = make_box('Jbox_cover', (0.565, 0.14, 0.0), (0.01, 0.21, 0.19), mat=mat_can)
bpy.ops.object.select_all(action='DESELECT')
for ob in [jbox_body, jbox_cover]:
    ob.select_set(True)
bpy.context.view_layer.objects.active = jbox_body
bpy.ops.object.join()
junction_box = bpy.context.object
junction_box.name = 'Junction_box'

# 8. Flexible conduit whip:
conduit = make_wire('Conduit_whip', [
    (0.44, 0.24, 0.0),
    (0.40, 0.38, 0.0),
    (0.28, 0.48, 0.0),
    (0.15, 0.54, 0.0),
    (0.05, 0.55, 0.0)
], radius=0.016, mat=mat_can)

all_parts = [
    trim_ring, reflector, lamp_seat, lamp,
    upper_can, mounting_frame, junction_box, conduit
]

# Smart UV projection and smoothing on each authored component
for ob in all_parts:
    bpy.ops.object.select_all(action='DESELECT')
    ob.select_set(True)
    bpy.context.view_layer.objects.active = ob
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(island_margin=0.02)
    bpy.ops.object.mode_set(mode='OBJECT')
    smooth = ob.get('smooth', True)
    for poly in ob.data.polygons:
        poly.use_smooth = smooth
    ob['provenance'] = 'Original generic recessed round downlight; issue #286'

# Verify manifold edges and active UV layers
for ob in all_parts:
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    assert all(edge.is_manifold for edge in bm.edges), f'{ob.name} has non-manifold edges'
    bm.free()
    assert ob.data.uv_layers.active is not None, f'{ob.name} missing UV layer'

# Save editable Blender source
source_blend = ROOT / 'tools/models/recessed-downlight.blend'
bpy.context.scene.unit_settings.system = 'IMPERIAL'
bpy.context.scene.unit_settings.scale_length = 0.3048
bpy.ops.wm.save_as_mainfile(filepath=str(source_blend))

# Merge by material role for optimized runtime GLB export
merged_objects = []
material_groups = [
    (mat_trim, [trim_ring, lamp_seat]),
    (mat_refl, [reflector]),
    (mat_lamp, [lamp]),
    (mat_can,  [upper_can, mounting_frame, junction_box, conduit]),
]

for mat, subset in material_groups:
    if len(subset) > 1:
        bpy.ops.object.select_all(action='DESELECT')
        for ob in subset:
            ob.select_set(True)
        bpy.context.view_layer.objects.active = subset[0]
        bpy.ops.object.join()
        obj = bpy.context.object
    else:
        obj = subset[0]
    obj.name = f'Downlight_{mat.name}'
    merged_objects.append(obj)

# Export runtime GLB
target_glb = ROOT / 'public/models/recessed-downlight.glb'
bpy.ops.object.select_all(action='DESELECT')
for ob in merged_objects:
    ob.select_set(True)

bpy.ops.export_scene.gltf(
    filepath=str(target_glb),
    export_format='GLB',
    use_selection=True,
    export_yup=True,
    export_texcoords=True,
    export_normals=True,
    export_materials='EXPORT',
)

total_tris = 0
metrics_by_part = {}
for ob in merged_objects:
    ob.data.calc_loop_triangles()
    tris = len(ob.data.loop_triangles)
    total_tris += tris
    metrics_by_part[ob.name] = tris

metrics = {
    'total_triangles': total_tris,
    'primitives': len(merged_objects),
    'materials': len(merged_objects),
    'bytes': target_glb.stat().st_size,
    'textures': 0,
    'aperture_diameter_inches': 7.68,
    'trim_outer_diameter_inches': 9.84,
    'plenum_can_depth_inches': 6.6,
    'parts': metrics_by_part,
}

metrics_path = ROOT / 'tools/models/recessed-downlight-metrics.json'
metrics_path.write_text(json.dumps(metrics, indent=2) + '\n')
print('DOWNLIGHT_METRICS', json.dumps(metrics))
