"""Original Halcyon VCR and DVD decks, authored in feet with Blender mesh tools.

Run: blender -b -t 2 --python tools/models/av-decks.py
Blender (x, -store_z, height) exports to the store's Y-up, -Z-facing contract.
No downloaded meshes, textures, branding or exact-product claims.
"""
import json
import math
import struct
from pathlib import Path

import bpy
import bmesh
from mathutils import Quaternion, Vector

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'public/models'
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
for collection in list(bpy.data.collections):
    if collection.name != 'Collection':
        bpy.data.collections.remove(collection)


def material(name, color, roughness=.45, metalness=0, emission=0):
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = (*color, 1)
    mat.use_nodes = True
    node = mat.node_tree.nodes.get('Principled BSDF')
    node.inputs['Base Color'].default_value = (*color, 1)
    node.inputs['Roughness'].default_value = roughness
    node.inputs['Metallic'].default_value = metalness
    node.inputs['Emission Color'].default_value = (*color, 1)
    node.inputs['Emission Strength'].default_value = emission
    return mat


COAT = material('DeckCoatedSteel', (.045, .052, .060), .43, .45)
BLACK = material('DeckMouldedPlastic', (.026, .031, .040), .33)
SILVER = material('DeckBrushedSilver', (.56, .59, .63), .32, .68)
RUBBER = material('DeckRubberAndRecesses', (.009, .013, .017), .80)
METAL = material('DeckConnectorMetal', (.34, .37, .41), .26, .8)
PRINT = material('DeckLegends', (.58, .64, .66), .6)
DISPLAY = material('DeckDisplay', (.005, .016, .022), .19)
LED = material('DeckPowerLamp', (.055, .65, .30), .30, emission=.45)
PARTS = []


def finish(obj, mat, bevel=0):
    obj.data.materials.append(mat)
    bpy.context.view_layer.objects.active = obj
    if bevel:
        mod = obj.modifiers.new('Manufactured edge radius', 'BEVEL')
        mod.width = bevel
        mod.segments = 3
        bpy.ops.object.modifier_apply(modifier=mod.name)
    PARTS.append(obj)
    return obj


def box(name, size, pos, mat, bevel=.002):
    bpy.ops.mesh.primitive_cube_add(size=1, location=pos)
    obj = bpy.context.object
    obj.name = name
    obj.scale = size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return finish(obj, mat, bevel)


def sweep(name, section, y0, y1, mat):
    """Closed cross-section along depth: real bent metal thickness, eased by bevel."""
    verts = [(x, y, h) for y in (y0, y1) for x, h in section]
    n = len(section)
    faces = [tuple(reversed(range(n))), tuple(range(n, 2*n))]
    faces += [(i, (i+1) % n, (i+1) % n+n, i+n) for i in range(n)]
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    return finish(obj, mat, .002)


def cut(obj, size, pos, radius=.002):
    cutter = box('Temporary aperture tool', size, pos, RUBBER, radius)
    bpy.context.view_layer.objects.active = obj
    mod = obj.modifiers.new('Fitted opening', 'BOOLEAN')
    mod.operation = 'DIFFERENCE'
    mod.solver = 'EXACT'
    mod.object = cutter
    bpy.ops.object.modifier_apply(modifier=mod.name)
    PARTS.remove(cutter)
    bpy.data.objects.remove(cutter, do_unlink=True)


def cylinder(name, radius, depth, pos, mat, axis='Z', vertices=16):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=pos)
    obj = bpy.context.object
    obj.name = name
    if axis == 'Y':
        obj.rotation_euler.x = math.pi/2
    return finish(obj, mat, .0008)


def ring(name, x, y, h, radius=.014):
    """Rear socket: connected annulus with a bore, not a painted disk."""
    verts, faces = [], []
    for depth, r in [(y, radius), (y-.012, radius), (y-.012, radius*.56), (y, radius*.56)]:
        verts += [(x+r*math.cos(i*math.tau/16), depth, h+r*math.sin(i*math.tau/16)) for i in range(16)]
    for row in range(4):
        for i in range(16):
            faces.append((row*16+i, row*16+(i+1) % 16,
                          ((row+1) % 4)*16+(i+1) % 16, ((row+1) % 4)*16+i))
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(verts, [], faces)
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    return finish(obj, METAL)


def legend(name, text, x, y, h, size=.016, mat=PRINT, rear=False):
    curve = bpy.data.curves.new(name, 'FONT')
    curve.body = text
    curve.size = size
    curve.align_x = 'CENTER'
    curve.resolution_u = 2
    obj = bpy.data.objects.new(name, curve)
    bpy.context.collection.objects.link(obj)
    obj.location = (x, y, h)
    # Front normal +Y and reading right goes -X, matching the prop contract.
    obj.rotation_euler = (math.pi/2, 0, 0 if rear else math.pi)
    obj.data.materials.append(mat)
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.convert(target='MESH')
    obj['open_surface'] = True
    PARTS.append(obj)
    return obj


def build_deck(dvd=False):
    global PARTS
    PARTS = []
    key = 'dvd_player' if dvd else 'vcr'
    collection = bpy.data.collections.new(key)
    bpy.context.scene.collection.children.link(collection)
    bpy.context.view_layer.active_layer_collection = bpy.context.view_layer.layer_collection.children[collection.name]
    w, h, d = (1.4, .18, .85) if dvd else (1.4, .32, .95)
    front, rear = d/2, -d/2
    bottom = .025
    top = SILVER if dvd else COAT
    fascia_mat = SILVER if dvd else BLACK

    # One bent U cover and a screwed-on bottom pan. Panel ends fit the front
    # and rear mouldings; none of the visible metal strips float over a box.
    shell = sweep('Bent top and side cover', [
        (-w/2, bottom+.016), (-w/2, h-.008), (-w/2+.008, h),
        (w/2-.008, h), (w/2, h-.008), (w/2, bottom+.016),
        (w/2-.009, bottom+.016), (w/2-.009, h-.017),
        (w/2-.017, h-.009), (-w/2+.017, h-.009),
        (-w/2+.009, h-.017), (-w/2+.009, bottom+.016),
    ], rear+.018, front-.046, top)
    box('Folded bottom pan', (w-.020, d-.034, .018), (0, -.002, bottom+.009), COAT)
    fascia = box('Moulded front fascia', (w, .044, h-bottom), (0, front-.022, (h+bottom)/2), fascia_mat, .006)
    back = box('Rear connector panel', (w-.018, .014, h-bottom-.008), (0, rear+.007, (h+bottom-.008)/2), COAT)

    # Actual apertures through the sheet, in two banks with an internal
    # dark baffle. No repeated cylinders painted on top as fake ventilation.
    for bank in (-1, 1):
        for i in range(10):
            x = bank*(.30+i*.027)
            cut(shell, (.009, .145, .05), (x, rear+.20, h), .002)
    box('Vent dust baffle', (1.19, .19, .004), (0, rear+.20, h-.025), RUBBER, 0)
    for i in range(9):
        cut(back, (.012, .05, .045 if dvd else .080), (.16+i*.04, rear, h*.59), .002)

    # Four stepped rubber feet bear the base; the origin is at their soles.
    for x in (-.53, .53):
        for y in (rear+.14, front-.14):
            cylinder('Rubber isolator foot', .036, .025, (x, y, .0125), RUBBER, vertices=20)
    for x in (-.61, .61):
        for y in (rear+.085, front-.085):
            cylinder('Bottom pan screw', .011, .002, (x, y, bottom-.001), METAL)
    for x in (-.625, .625):
        cylinder('Rear cover screw', .010, .002, (x, rear-.001, h-.041), METAL, 'Y')

    if dvd:
        mouth_x, mouth_h, mouth_w, mouth_height = .17, .109, .69, .031
        display_x, display_h, display_w, display_height = -.36, .105, .245, .050
    else:
        mouth_x, mouth_h, mouth_w, mouth_height = .07, .234, .80, .093
        display_x, display_h, display_w, display_height = -.28, .106, .45, .070

    cut(fascia, (mouth_w+.009, .085, mouth_height+.009), (mouth_x, front-.020, mouth_h), .003)
    # Inset removable tray/flap with a continuous reveal and a solid pocket.
    box('Disc tray pocket' if dvd else 'Cassette throat',
        (mouth_w+.005, .016, mouth_height+.005), (mouth_x, front-.050, mouth_h), RUBBER)
    box('Disc tray lip' if dvd else 'Hinged cassette flap',
        (mouth_w, .018, mouth_height), (mouth_x, front-.015, mouth_h), fascia_mat, .003)
    legend('Tray legend', 'DISC' if dvd else 'VIDEO CASSETTE', mouth_x, front-.0055, mouth_h-.005, .012)

    cut(fascia, (display_w+.016, .085, display_height+.015), (display_x, front-.022, display_h), .004)
    box('Display housing', (display_w+.012, .012, display_height+.011),
        (display_x, front-.037, display_h), RUBBER, .003)
    # This exact named mesh supplies the live clock rectangle at runtime.
    box('DeckDisplay', (display_w, .004, display_height), (display_x, front-.012, display_h), DISPLAY, 0)

    # Small switches seated into face apertures, with a distinct transport row.
    control_h = .052 if dvd else .082
    for i, label in enumerate(('PLAY', 'STOP', 'PAUSE')):
        x = .01+i*.097 if dvd else .03+i*.11
        cut(fascia, (.056, .075, .025), (x, front-.024, control_h), .003)
        box('Transport '+label, (.048, .032, .018), (x, front-.014, control_h), BLACK, .003)
        legend('Label '+label, label, x, front+.0005, control_h+.021, .010, RUBBER if dvd else PRINT)
    for x, name in ((.595, 'POWER'), (-.595, 'EJECT')):
        cut(fascia, (.053, .075, .030), (x, front-.024, h*.58), .006)
        box(name+' switch', (.045, .032, .022), (x, front-.014, h*.58), BLACK, .005)
        legend(name+' legend', name, x, front+.0005, h*.58-.031, .010, RUBBER if dvd else PRINT)
    cylinder('Power indicator', .005, .002, (.595, front+.001, h*.58+.023), LED, 'Y', 12)
    legend('Format description', 'DIGITAL VIDEO' if dvd else 'HI-FI  STEREO', .22, front+.0005,
           .150 if dvd else .144, .011, RUBBER if dvd else PRINT)

    # Recessed rear I/O bay, bored RCA jacks, coax socket and a power inlet.
    bay_h = .091 if dvd else .14
    cut(back, (.35, .045, .060), (-.29, rear, bay_h), .003)
    box('Recessed connector insert', (.36, .007, .069), (-.29, rear+.016, bay_h), BLACK)
    for i in range(3):
        ring('RCA socket '+str(i), -.39+i*.10, rear+.009, bay_h)
    if not dvd:
        ring('Aerial coax socket', -.05, rear+.009, bay_h, .024)
    cut(back, (.092, .040, .037), (-.57, rear, bay_h), .006)
    box('Power inlet recess', (.086, .006, .031), (-.57, rear+.018, bay_h), RUBBER, .005)
    for x in (-.59, -.55):
        cylinder('Power inlet pin', .004, .011, (x, rear+.010, bay_h), METAL, 'Y', 12)
    legend('Rear AV legend', 'VIDEO   L   R', -.29, rear-.0005, bay_h+.039, .011, rear=True)

    # UVs and normals are authored on each editable part. Continuous solids
    # must be closed; only the deliberately flat letter faces are exempt.
    triangles = 0
    for obj in PARTS:
        bm = bmesh.new()
        bm.from_mesh(obj.data)
        bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
        if not obj.get('open_surface'):
            bad = [edge for edge in bm.edges if not edge.is_manifold]
            assert not bad, f'{key}: {obj.name}: {len(bad)} non-manifold edges'
            assert bm.calc_volume() > 0, f'{obj.name}: inward normals'
        bm.to_mesh(obj.data)
        bm.free()
        bpy.ops.object.select_all(action='DESELECT')
        obj.select_set(True)
        bpy.context.view_layer.objects.active = obj
        bpy.ops.object.mode_set(mode='EDIT')
        bpy.ops.mesh.select_all(action='SELECT')
        bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=.02)
        bpy.ops.object.mode_set(mode='OBJECT')
        obj.data.calc_loop_triangles()
        triangles += len(obj.data.loop_triangles)
    collection['contract'] = json.dumps({'feet': [w, h, d], 'front': '-Z in glTF', 'origin': 'sole centre'})
    collection['triangles'] = triangles

    # Export copies grouped by finish. The source retains individually named
    # physical parts; cut walls retain their darker material primitives.
    copies = []
    for mat in sorted({obj.data.materials[0] for obj in PARTS}, key=lambda m: m.name):
        bpy.ops.object.select_all(action='DESELECT')
        batch = []
        for obj in PARTS:
            if obj.data.materials[0] != mat:
                continue
            copy = obj.copy()
            copy.data = obj.data.copy()
            collection.objects.link(copy)
            copy.select_set(True)
            batch.append(copy)
        bpy.context.view_layer.objects.active = batch[0]
        bpy.ops.object.join()
        merged = bpy.context.object
        merged.name = mat.name if mat != DISPLAY else 'DeckDisplay'
        copies.append(merged)
    bpy.ops.object.select_all(action='DESELECT')
    for obj in copies:
        obj.select_set(True)
    mouth = bpy.data.objects.new('DeckMediaMouth', None)
    mouth.location = (mouth_x, front-.006, mouth_h)
    collection.objects.link(mouth)
    mouth.select_set(True)
    bpy.ops.export_scene.gltf(filepath=str(OUT/(key+'.glb')), export_format='GLB',
                              use_selection=True, export_yup=True, export_extras=False)
    mouth.name = key+' media mouth'
    for obj in copies:
        bpy.data.objects.remove(obj, do_unlink=True)
    # Read actual export costs, including material splits on aperture walls.
    blob = (OUT/(key+'.glb')).read_bytes()
    document = json.loads(blob[20:20+struct.unpack_from('<I', blob, 12)[0]])
    draws = sum(len(mesh['primitives']) for mesh in document['meshes'])
    print(f'DECK {key}: {triangles} triangles, {draws} draw primitives, {len(blob)} bytes, no textures')
    return collection


vcr = build_deck()
dvd = build_deck(True)
bpy.ops.object.select_all(action='DESELECT')
for obj in vcr.objects:
    obj.select_set(True)
for child in bpy.context.view_layer.layer_collection.children:
    child.hide_viewport = child.name != 'vcr'
for area in bpy.context.screen.areas:
    if area.type == 'VIEW_3D':
        area.spaces.active.region_3d.view_distance = 2.5
        area.spaces.active.region_3d.view_location = Vector((0, 0, .14))
        area.spaces.active.region_3d.view_rotation = Quaternion((.82, .53, .12, .16)).normalized()
        area.spaces.active.shading.type = 'MATERIAL'
bpy.context.scene.unit_settings.system = 'IMPERIAL'
bpy.context.scene.unit_settings.scale_length = .3048
bpy.context.preferences.filepaths.save_version = 0
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'tools/models/av-decks.blend'), compress=True)
