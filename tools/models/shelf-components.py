"""Editable shelf construction kit. Blender local (x,-z,y) exports store Y-up.
Run: blender -b -t 2 --python tools/models/shelf-components.py
The runtime stretches only the straight central runs, preserving edge profiles.
"""
from pathlib import Path
import math
import bpy
import bmesh
ROOT = Path(__file__).resolve().parents[2]
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
mat = bpy.data.materials.new('ShelfFinish')
mat.diffuse_color = (.78, .76, .70, 1)
mat.use_nodes = True
mat.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value = .55

def sweep(name, profile, length=1):
    # Closed physical section swept down the shelf's longitudinal axis.
    n = len(profile)
    verts = [(x, -z, y) for z in (-length/2, length/2) for x,y in profile]
    faces = [tuple(reversed(range(n))), tuple(range(n,2*n))]
    faces += [(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)]
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    obj.data.materials.append(mat)
    bm=bmesh.new(); bm.from_mesh(mesh)
    bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces))
    assert all(e.is_manifold for e in bm.edges), name
    bm.to_mesh(mesh); bm.free()
    bpy.context.view_layer.objects.active=obj
    obj.select_set(True)
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(island_margin=.02)
    bpy.ops.object.mode_set(mode='OBJECT')
    obj.select_set(False)
    return obj

# Support plane remains y=.02, matching the established case anchors.
# Eased laminate edges and a finished underside, 3/4 inch nominal board.
sweep('Deck', [(-.5,-.034),(-.494,-.0425),(.494,-.0425),(.5,-.034),
               (.5,.014),(.494,.02),(-.494,.02),(-.5,.014)])
# Extruded price-card channel. Open mouth is a concavity in a CLOSED solid,
# not an alpha decal or overlapping bars; two retaining lips frame its recess.
sweep('Rail', [(-.022,-.040),(.012,-.040),(.022,-.030),(.022,-.019),
               (.008,-.019),(.006,-.025),(-.010,-.025),(-.010,.025),
               (.006,.025),(.008,.019),(.022,.019),(.022,.030),
               (.012,.040),(-.022,.040)])
# Narrow folded support bracket, below the stock surface.
sweep('Bracket', [(-.5,-.018),(.5,-.018),(.47,-.052),(-.44,-.15),(-.5,-.15)], .028)
# Round wire with a closed end, eight sides enough at browsing distance.
sweep('Wire', [(math.cos(a*math.tau/8)*.008, math.sin(a*math.tau/8)*.008)
               for a in range(8)])
# A full 3-inch slat pitch with the groove recessed into both faces.
sweep('Slat', [(-.25,-.125),(.25,-.125),(.25,.072),(.213,.072),
               (.213,.105),(.25,.105),(.25,.125),(-.25,.125),
               (-.25,.105),(-.213,.105),(-.213,.072),(-.25,.072)])
# Structural carcass components: finished laminate panel with a recessed toe,
# eased edges and a fitted central spine. Nominal height five feet.
panel=sweep('Upright', [(-.94,0),(.94,0),(.94,.20),(1.08,.20),
    (.70,4.994),(.694,5),(-.694,5),(-.70,4.994),(-1.08,.20),(-.94,.20)], .04)
# Bevel every sheet edge, including the cut underside of the toe notch.
bpy.context.view_layer.objects.active=panel
bevel=panel.modifiers.new('Finished panel edges','BEVEL');bevel.width=.006;bevel.segments=2
bpy.ops.object.modifier_apply(modifier=bevel.name)
sweep('Spine', [(-.25,.20),(.25,.20),(.25,4.994),(.244,5),(-.244,5),(-.25,4.994)])
cap=sweep('EndPanel', [(-1.074,0),(1.074,0),(1.08,.006),(1.08,.20),
    (.70,4.994),(.694,5),(-.694,5),(-.70,4.994),(-1.08,.20),(-1.08,.006)], .10)
bpy.context.view_layer.objects.active=cap
bevel=cap.modifiers.new('Finished cap edges','BEVEL');bevel.width=.008;bevel.segments=3
bpy.ops.object.modifier_apply(modifier=bevel.name)
# Steel C-standard, closed thin-wall profile rather than a solid dark bar.
standard=sweep('Standard', [(-.07,-.045),(.07,-.045),(.07,.045),(.042,.045),
    (.042,.032),(.056,.032),(.056,-.031),(-.056,-.031),(-.056,.032),(-.042,.032),(-.042,.045),(-.07,.045)])
# Formed steel foot with a rolled top edge. Runs across the aisle depth.
sweep('Foot', [(-.5,0),(.5,0),(.5,.10),(.46,.15),(-.46,.15),(-.5,.10)],.14)

# Editable source spreads parts out so their individual construction is visible.
for i,obj in enumerate(bpy.context.scene.objects):
    obj.location.x=i*1.5
    obj.select_set(True)
bpy.context.scene.unit_settings.system='IMPERIAL'
bpy.context.scene.unit_settings.scale_length=.3048
bpy.context.preferences.filepaths.save_version=0
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'tools/models/shelf-components.blend'))
bpy.ops.export_scene.gltf(filepath=str(ROOT/'public/models/shelf-components.glb'),
    export_format='GLB',use_selection=True,export_yup=True,export_apply=True)
print('Shelf kit: closed manifold parts, UVs,',sum(len(o.data.polygons) for o in bpy.context.scene.objects),'polygons')
