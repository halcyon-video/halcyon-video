"""Original illuminated exit-sign lightbox fitted to the existing sign-face dimensions.
Scripted Blender mesh authoring, feet. Blender (x, -depth, height) exports as store (x, height, depth);
origin is the wall-contact centre. The 1.3 x 0.73 ft face plane at depth 0.274 and the wall anchor are
unchanged (the face is a separate emissive mesh built in src/storefront-facade.ts). Not a brand replica.
Run: blender -b -P tools/models/exit-sign.py
Parts: ExitHousing (shell: back pan, eased bezel, diffuser seat ledge), ExitGasket (diffuser seat gasket),
ExitEndPlateL/R (end plates with conduit knockouts), ExitCanopy (top wiring canopy), ExitScrews (bezel fasteners).
"""
from pathlib import Path
import bpy, bmesh, json, math
ROOT = Path(__file__).resolve().parents[2]
bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
scene = bpy.context.scene; scene.unit_settings.system = 'IMPERIAL'; scene.unit_settings.scale_length = .3048
D = .292; HW, HH = .69, .405

def mat(name, col, rough, metal=0.0):
    m = bpy.data.materials.new(name); m.diffuse_color = col; m.use_nodes = True
    b = m.node_tree.nodes.get('Principled BSDF')
    b.inputs['Base Color'].default_value = col; b.inputs['Roughness'].default_value = rough; b.inputs['Metallic'].default_value = metal
    return m
M = {'ExitHousing': mat('ExitHousing', (.82, .84, .80, 1), .6),
     'ExitGasket': mat('ExitGasket', (.04, .04, .045, 1), .85),
     'ExitEndPlate': mat('ExitEndPlate', (.62, .63, .64, 1), .4, 1.0),
     'ExitHardware': mat('ExitHardware', (.5, .5, .52, 1), .35, 1.0)}

def finish(name, bm, material, bevel=None, parent=None):
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    me = bpy.data.meshes.new(name + ' mesh'); bm.to_mesh(me); bm.free()
    o = bpy.data.objects.new(name, me); bpy.context.collection.objects.link(o); me.materials.append(M[material])
    bpy.context.view_layer.objects.active = o; o.select_set(True)
    if bevel:
        mod = o.modifiers.new('Eased edges', 'BEVEL'); mod.width = bevel[0]; mod.segments = bevel[1]
        bpy.ops.object.modifier_apply(modifier=mod.name)
    bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(island_margin=.02); bpy.ops.object.mode_set(mode='OBJECT'); o.select_set(False)
    return o

def ring_solid(rings, closed_back=True):
    """Skin through rectangular rings (hw, hh, depth); caps both ends."""
    bm = bmesh.new(); rs = []
    for w, h, d in rings:
        rs.append([bm.verts.new((x * w, -d, y * h)) for x, y in [(-1, -1), (1, -1), (1, 1), (-1, 1)]])
    for a, b in zip(rs, rs[1:]):
        for i in range(4):
            j = (i + 1) % 4; bm.faces.new((a[i], a[j], b[j], b[i]))
    bm.faces.new(rs[0][::-1]); bm.faces.new(rs[-1])
    return bm

def box(bm, cx, cy, cz, sx, sy, sz):
    r = bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=(sx, sy, sz), verts=r['verts']); bmesh.ops.translate(bm, vec=(cx, cy, cz), verts=r['verts'])

def frame_ring(bm, o_hw, o_hh, i_hw, i_hh, d0, d1):
    def r(w, h, d): return [bm.verts.new((x * w, -d, y * h)) for x, y in [(-1, -1), (1, -1), (1, 1), (-1, 1)]]
    oa, ob, ia, ib = r(o_hw, o_hh, d0), r(o_hw, o_hh, d1), r(i_hw, i_hh, d0), r(i_hw, i_hh, d1)
    for i in range(4):
        j = (i + 1) % 4
        bm.faces.new((oa[i], oa[j], ob[j], ob[i])); bm.faces.new((ia[j], ia[i], ib[i], ib[j]))
        bm.faces.new((oa[j], oa[i], ia[i], ia[j])); bm.faces.new((ob[i], ob[j], ib[j], ib[i]))

# Shell: back pan -> outer walls -> front bezel -> inner return -> diffuser seat ledge -> cavity floor.
shell = finish('ExitHousing', ring_solid([(HW, HH, 0), (HW, HH, D), (.65, .365, D), (.65, .365, .268),
                                           (.62, .335, .268), (.62, .335, .06)]), 'ExitHousing', (.006, 3))
# Gasket: thin dark frame seating the diffuser on the ledge (face plane sits at .274).
bm = bmesh.new(); frame_ring(bm, .65, .365, .622, .337, .2685, .2735)
gasket = finish('ExitGasket', bm, 'ExitGasket')
# End plates: shallow pressed plates on each end with a conduit knockout boss.
plates = []
for name, s in (('ExitEndPlateL', -1), ('ExitEndPlateR', 1)):
    bm = bmesh.new(); box(bm, s * (HW + .006), -D / 2 - .01, 0, .012, D - .04, .75)
    c = bmesh.ops.create_cone(bm, cap_ends=True, segments=20, radius1=.032, radius2=.032, depth=.012)
    bmesh.ops.rotate(bm, verts=c['verts'], cent=(0, 0, 0), matrix=__import__('mathutils').Matrix.Rotation(math.pi / 2, 3, 'Y'))
    bmesh.ops.translate(bm, vec=(s * (HW + .018), -D / 2 - .01, .22), verts=c['verts'])
    plates.append(finish(name, bm, 'ExitEndPlate', (.002, 2)))
# Canopy: wiring canopy straddling the top edge, fed by the wall.
bm = bmesh.new(); box(bm, 0, -.1, HH + .026, .5, .2, .052)
canopy = finish('ExitCanopy', bm, 'ExitEndPlate', (.006, 3))
# Four bezel screws.
bm = bmesh.new()
for sx in (-1, 1):
    for sy in (-1, 1):
        c = bmesh.ops.create_cone(bm, cap_ends=True, segments=14, radius1=.013, radius2=.011, depth=.01)
        bmesh.ops.rotate(bm, verts=c['verts'], cent=(0, 0, 0), matrix=__import__('mathutils').Matrix.Rotation(math.pi / 2, 3, 'X'))
        bmesh.ops.translate(bm, vec=(sx * .67, -D - .003, sy * .385), verts=c['verts'])
screws = finish('ExitScrews', bm, 'ExitHardware')

tris = 0; checks = {}
for o in (shell, gasket, canopy, screws, *plates):
    o.data.calc_loop_triangles(); tris += len(o.data.loop_triangles)
    b = bmesh.new(); b.from_mesh(o.data); checks[o.name] = all(e.is_manifold for e in b.edges); b.free()
assert all(checks.values()), checks
shell['construction'] = 'Closed molded shell: back pan, eased bezel, diffuser seat ledge; face plane depth 0.274 ft stays a separate emissive mesh.'
shell['face_plane_depth_ft'] = .274; shell['face_width_ft'] = 1.3; shell['face_height_ft'] = .73
bpy.context.preferences.filepaths.save_version = 0
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT / 'tools/models/exit-sign.blend'))
bpy.ops.export_scene.gltf(filepath=str(ROOT / 'public/models/exit-sign.glb'), export_format='GLB', export_extras=True)
metrics = {'triangles': tris, 'meshes': len(checks), 'material_roles': list(M), 'outer_size_ft': [1.38, .81 + .052, D],
           'face_seat_depth_ft': .274, 'manifold': True, 'parts': list(checks)}
(ROOT / 'tools/models/exit-sign-metrics.json').write_text(json.dumps(metrics, indent=2) + '\n')
print(metrics)
