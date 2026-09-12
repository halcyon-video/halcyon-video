"""Original generic surround study, not a faithful skin or confirmed installation.
Run: blender -b -t 2 -P "$PWD/tools/models/customer-information-terminal.py"
Coordinates in feet: Blender (x, -store_z, height). Lower crop is the datum,
not a floor contact. No unseen base, keyboard, hinge or floor stand is modeled.
"""
import bpy
import bmesh
import json
import math
from pathlib import Path
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[2]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.context.preferences.filepaths.save_version = 0
scene = bpy.context.scene
scene.unit_settings.system = 'IMPERIAL'
scene.unit_settings.scale_length = .3048
scene.unit_settings.length_unit = 'FEET'

def material(name, color, metal=0):
    m = bpy.data.materials.new(name)
    m.diffuse_color = (*color, 1)
    m.use_nodes = True
    p = m.node_tree.nodes['Principled BSDF']
    p.inputs['Base Color'].default_value = (*color, 1)
    p.inputs['Metallic'].default_value = metal
    p.inputs['Roughness'].default_value = .48
    return m

shell = material('EnclosurePowderCoat', (.66, .68, .69))
metal = material('MountHardware', (.19, .21, .23), .7)
board = material('ProgramBackboard', (.06, .13, .25))
badge = material('PromotionalBadge', (.64, .49, .19))
parts = []

def finish(o, name, mat, bevel=0):
    o.name = name
    o.data.materials.append(mat)
    bpy.context.view_layer.objects.active = o
    bpy.ops.object.select_all(action='DESELECT')
    o.select_set(True)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if bevel:
        mod = o.modifiers.new('Manufactured edge radius', 'BEVEL')
        mod.width = bevel
        mod.segments = 2
        bpy.ops.object.modifier_apply(modifier=mod.name)
    bm = bmesh.new()
    bm.from_mesh(o.data)
    bmesh.ops.remove_doubles(bm, verts=list(bm.verts), dist=.000001)
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    assert all(e.is_manifold for e in bm.edges), name
    bm.to_mesh(o.data)
    bm.free()
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(island_margin=.015)
    bpy.ops.object.mode_set(mode='OBJECT')
    parts.append(o)
    return o

def box(name, loc, dims, mat, bevel=.003):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
    o = bpy.context.object
    o.dimensions = dims
    return finish(o, name, mat, bevel)

def folded_profile(name, profile):
    # Extrude a closed sheet-metal cross-section; hollow returns, not solid bars.
    n = len(profile)
    verts = [(x, y, z) for z in [0, 1.35] for x, y in profile]
    faces = [tuple(reversed(range(n))), tuple(range(n, 2*n))]
    faces.extend((i, (i+1)%n, (i+1)%n+n, i+n) for i in range(n))
    mesh = bpy.data.meshes.new(name); mesh.from_pydata(verts, [], faces)
    o = bpy.data.objects.new(name, mesh); scene.collection.objects.link(o)
    return finish(o, name, shell, .001)

def perforated_side(x, name):
    # Welded eight-segment annuli tile a sheet. Real through-holes, including
    # their thickness walls, rather than decals or dark discs.
    verts, faces = [], []
    square = [(1, 0), (1, 1), (0, 1), (-1, 1),
              (-1, 0), (-1, -1), (0, -1), (1, -1)]
    for col in range(6):
        for row in range(18):
            cy = -.015 + (col + .5) * .07
            cz = (row + .5) * .075
            n = len(verts)
            verts.extend((x, cy + u*.035, cz + v*.0375) for u, v in square)
            verts.extend((x, cy + .011*math.cos(i*math.tau/8),
                          cz + .011*math.sin(i*math.tau/8)) for i in range(8))
            for i in range(8):
                j = (i+1) % 8
                faces.append((n+i, n+j, n+8+j, n+8+i))
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(verts, [], faces)
    bm = bmesh.new(); bm.from_mesh(mesh)
    bmesh.ops.remove_doubles(bm, verts=list(bm.verts), dist=.000001)
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    bm.to_mesh(mesh); bm.free()
    o = bpy.data.objects.new(name, mesh); scene.collection.objects.link(o)
    bpy.context.view_layer.objects.active = o
    mod = o.modifiers.new('1.8 mm formed sheet', 'SOLIDIFY'); mod.thickness = .006
    bpy.ops.object.modifier_apply(modifier=mod.name)
    return finish(o, name, shell)

left = perforated_side(-.79, 'PerforatedSide_L')
# Mirrored panel shares its editable mesh, as do the repeated fasteners.
right = left.copy(); right.data = left.data
right.name = 'PerforatedSide_R'; right.location.x = 1.58
scene.collection.objects.link(right); parts.append(right)
box('RearPanel', (0, .408, .675), (1.586, .006, 1.35), shell, .001)
for side in [-1, 1]:
    folded_profile('RearFoldReturn', [(side*x, y) for x, y in
        [(.787,.355), (.781,.355), (.781,.399), (.75,.399), (.75,.405), (.787,.405)]])
    folded_profile('FrontHem', [(side*x, y) for x, y in
        [(.79,-.021), (.755,-.021), (.755,-.009), (.761,-.009), (.761,-.015), (.79,-.015)]])

# Inferred generic mounting structure: separated from the observed envelope.
box('MountCrossRail', (0, .375, .76), (1.5, .06, .12), metal)
box('DisplayBracketWeb', (0, .20, .76), (.12, .29, .10), metal)
box('DisplayMountPlate', (0, .045, .76), (.38, .02, .30), metal)
for x in [-.49, .49]:
    box('BackboardSupport', (x, .369, 1.35), (.045, .025, .75), metal)
    for z in [1.05, 1.23]:
        box('BackboardRailSpacer', (x, .39325, z), (.045, .0235, .055), metal, .001)
box('ProgramBackboard', (-.07, .344, 1.585), (1.58, .025, .47), board, .006)
box('BadgeSupport', (.59, .316, 1.59), (.038, .02, .50), metal)
box('BadgeSupportSpacer', (.59, .32875, 1.40), (.038, .0055, .05), metal, .001)
bpy.ops.mesh.primitive_cylinder_add(vertices=48, radius=.34, depth=.018,
    location=(.59, .297, 1.67), rotation=(math.pi/2, 0, 0))
finish(bpy.context.object, 'PromotionalBadge', badge, .002)
bolt = None
for x in [-.70, .70]:
    for z in [.18, .76, 1.22]:
        if bolt is None:
            bpy.ops.mesh.primitive_cylinder_add(vertices=8, radius=.016, depth=.008,
                location=(x, .416, z), rotation=(math.pi/2, 0, 0))
            bolt = finish(bpy.context.object, 'RearFastener', metal, .001)
        else:
            o = bolt.copy(); o.data = bolt.data; o.location = (x, .416, z)
            scene.collection.objects.link(o); parts.append(o)

anchors = []
for name, loc in [('mount_display', (0, .035, .76)),
                  ('mount_program_face', (-.07, .330, 1.585)),
                  ('mount_badge_face', (.59, .286, 1.67)),
                  ('crop_datum_NOT_floor', (0, 0, 0))]:
    o = bpy.data.objects.new(name, None); scene.collection.objects.link(o)
    o.location = loc; o.empty_display_size = .08
    o['units'] = 'feet'; o['placementConfirmed'] = False; anchors.append(o)
scene['provenance'] = 'Original generic construction study; dimensions and hidden brackets estimated; private photo not embedded.'
scene['displayContract'] = 'mount_display accepts future #189 device only after hinge/base evidence. Runtime generic screen envelope is not historical hardware.'
for area in bpy.context.screen.areas:
    if area.type == 'VIEW_3D':
        area.spaces.active.region_3d.view_distance = 3.7
        area.spaces.active.region_3d.view_location = (0, 0, 1)
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'tools/models/customer-information-terminal.blend'), compress=True)

# Runtime merges by material: four draws, no texture payload, named editable
# parts remain in the .blend. UVs and anchors survive this export-only join.
bpy.ops.object.select_all(action='DESELECT')
for o in parts: o.select_set(True)
bpy.context.view_layer.objects.active = left
bpy.ops.object.make_single_user(type='SELECTED_OBJECTS', object=True, obdata=True)
bpy.ops.object.join()
runtime = bpy.context.object; runtime.name = 'CustomerInformationSurround'
for o in anchors: o.select_set(True)
out = ROOT/'public/models/customer-information-terminal.glb'
bpy.ops.export_scene.gltf(filepath=str(out), export_format='GLB', use_selection=True,
    export_yup=True, export_extras=True, export_texcoords=True)
runtime.data.calc_loop_triangles()
points = [runtime.matrix_world @ Vector(c) for c in runtime.bound_box]
report = {'units': 'feet', 'triangles': len(runtime.data.loop_triangles),
          'materialRoles': [m.name for m in runtime.data.materials], 'textures': 0,
          'bytes': out.stat().st_size, 'boundsBlender': [[min(p[i] for p in points) for i in range(3)],
                                                     [max(p[i] for p in points) for i in range(3)]],
          'placementConfirmed': False, 'closedPartsManifold': True}
(ROOT/'tools/models/customer-information-terminal-metrics.json').write_text(json.dumps(report, indent=2)+'\n')
print(json.dumps(report))
