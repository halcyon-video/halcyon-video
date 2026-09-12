"""Original NR wall fixture for the existing shelf contract (issue #311).
Feet in store coordinates; Blender (x,-z,y) -> glTF Y-up. No external assets.
Run: blender -b -t 2 -P "$(pwd)/tools/models/new-release-wall.py"
Optional -- --render /absolute/preview.png includes a non-exported capacity study.
"""
from pathlib import Path
import bpy, bmesh, math, json, sys
from mathutils import Vector
ROOT = Path(__file__).resolve().parents[2]
HEIGHTS = [.42, 1.295, 2.17, 3.045, 3.92, 4.795, 5.67, 6.545]
WIDTH, DEPTH, CLEARANCE, SLOPE = 8., .70, .08, math.tan(math.radians(5))
bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
fixture = bpy.data.collections.new('New Release — eight-foot construction'); bpy.context.scene.collection.children.link(fixture)
study = bpy.data.collections.new('Capacity study — NOT exported'); bpy.context.scene.collection.children.link(study)

def material(name, color, rough=.6):
    m=bpy.data.materials.new(name); m.diffuse_color=(*color,1); m.use_nodes=True
    bs=m.node_tree.nodes.get('Principled BSDF'); bs.inputs['Base Color'].default_value=(*color,1); bs.inputs['Roughness'].default_value=rough
    return m
laminate=material('BeigeVinylLaminate', (.69,.61,.46))
edge=material('BeigeVinylEdgeBand', (.59,.51,.37))
rail=material('SatinPriceChannel', (.49,.46,.39), .5)

# Sweep a deliberately drawn closed Y/Z cross-section across X. Every part is
# a manifold solid, including the recessed channel lips; no alpha planes.
def sweep(name, profile, width, mat, collection=fixture, x=0):
    n=len(profile); verts=[(xx+x,-z,y) for xx in (-width/2,width/2) for y,z in profile]
    faces=[tuple(reversed(range(n))),tuple(range(n,2*n))]
    faces += [(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)]
    mesh=bpy.data.meshes.new(name); mesh.from_pydata(verts,[],faces); mesh.update()
    ob=bpy.data.objects.new(name,mesh); collection.objects.link(ob); mesh.materials.append(mat)
    bm=bmesh.new(); bm.from_mesh(mesh); bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces))
    assert all(e.is_manifold for e in bm.edges), name
    bm.to_mesh(mesh); bm.free()
    bpy.context.view_layer.objects.active=ob; ob.select_set(True)
    bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT'); bpy.ops.uv.smart_project(island_margin=.015); bpy.ops.object.mode_set(mode='OBJECT'); ob.select_set(False)
    return ob

def box(name, x,y,z, w,h,d, mat, collection=fixture):
    return sweep(name,[(y-h/2,z-d/2),(y-h/2,z+d/2),(y+h/2,z+d/2),(y+h/2,z-d/2)],w,mat,collection,x)

front=CLEARANCE+DEPTH
for i,y in enumerate(HEIGHTS):
    # 3/4 inch particleboard tray: front support plane matches stock anchors.
    bottom=y+.02-.0625
    p=[(bottom,CLEARANCE+.022),(bottom,front-.006),(bottom+.006,front),
       (y+.014,front),(y+.02,front-.006),(y+.02,CLEARANCE+.022)]
    p=[(yy+SLOPE*(z-front),z) for yy,z in p]
    ob=sweep(f'Deck_{i}',p,7.875,laminate)
    ob['substrate']='3/4 inch particle board, vinyl wrapped'; ob['slope_degrees']=5
    # Each shelf's high back is structural laminate, below the next tray.
    box(f'HighBack_{i}',0,y+.275,CLEARANCE+.05125,7.875,.65,.0625,laminate)
    sweep(f'Rail_{i}',[(y-.041,front),(y-.041,front+.019),(y-.033,front+.025),
        (y-.020,front+.025),(y-.020,front+.013),(y-.026,front+.013),
        (y-.026,front+.005),(y+.033,front+.005),(y+.033,front+.013),
        (y+.027,front+.013),(y+.027,front+.025),(y+.041,front+.025),
        (y+.047,front+.019),(y+.047,front)],7.875,rail)
box('Backing',0,4,CLEARANCE,7.875,8,.04,laminate)
for name,x in [('LeftEnd',-3.96875),('RightEnd',3.96875)]:
    ob=sweep(name,[(0,CLEARANCE),(0,front-.12),(.25,front-.12),(.25,front),
        (7.994,front),(8,front-.006),(8,CLEARANCE)],.0625,edge,x=x)
box('Toe',0,.17,front-.14,7.875,.30,.0625,edge)

# Construction/capacity markers are editable empties, not runtime draw calls.
for row in range(5):
    for facing in range(8):
        ob=bpy.data.objects.new(f'PopularTitle_row{row+1}_facing{facing+1}',None); study.objects.link(ob)
        ob.location=(-3.5+facing,-.64,HEIGHTS[row]); ob.empty_display_size=.05

bpy.context.scene.unit_settings.system='IMPERIAL'; bpy.context.scene.unit_settings.scale_length=.3048
bpy.context.scene['capacity']='8 facings x 5 tiers for one title; 3 Amray behind cover, fourth tightly packed. Demonstration only, not catalog content.'
for ob in fixture.objects: ob.select_set(True)
bpy.context.preferences.filepaths.save_version=0
bpy.ops.export_scene.gltf(filepath=str(ROOT/'public/models/new-release-wall.glb'),export_format='GLB',use_selection=True,export_yup=True,export_apply=True,export_extras=True)
metrics={'section_width_ft':WIDTH,'depth_ft':DEPTH,'tiers':HEIGHTS,'slope_degrees':5,'facings_per_study_row':8,'popular_title_study_rows':5,'comfortable_rental_depth':3,'tight_rental_depth':4,'meshes':len(fixture.objects),'triangles':sum(sum(len(p.vertices)-2 for p in o.data.polygons) for o in fixture.objects),'glb_bytes':(ROOT/'public/models/new-release-wall.glb').stat().st_size}
(ROOT/'tools/models/new-release-wall-metrics.json').write_text(json.dumps(metrics,indent=2)+'\n')

# Non-exported capacity study: nominal cases (4.38 x 8 x 1.10 inches), with
# slightly thicker 1.25-inch Amray stock. Neutral original cover graphics.
blue=material('Study — Amray blue',(.025,.085,.30)); yellow=material('Study — yellow wall',(.88,.59,.035)); cover=material('Study — coverbox',(.06,.20,.35)); white=material('Study — lettering',(.93,.84,.54))
for ob in fixture.objects: ob.select_set(False)
box('Reference yellow accent wall',0,5,-.10,10,10,.12,yellow,study)
other_covers=[material('Study — other title '+str(i),c) for i,c in enumerate([(.32,.12,.06),(.12,.22,.10),(.23,.09,.20)])]
for row,y in enumerate(HEIGHTS):
    for col in range(8):
        xx=-3.5+col
        count=4 if col==7 else 3
        for k in range(count+1):
            z=.67-k*.108; d=.092 if k==0 else .1042
            yy=y+.02+SLOPE*(z-front)+.667/2
            box(f'Study_r{row}_c{col}_copy{k}',xx,yy,z,.365,.667,d,(cover if row < 5 else other_covers[row-5]) if k==0 else blue,study)
        box(f'Cover label {row} {col}',xx,y+.36,.718,.30,.09,.002,white,study)
def text(label,x,y,z,size,mat):
    cu=bpy.data.curves.new(label,'FONT'); cu.body=label; cu.align_x='CENTER'; cu.size=size; cu.extrude=.001
    ob=bpy.data.objects.new(label,cu); study.objects.link(ob); ob.location=(x,-z,y); ob.rotation_euler=(math.pi/2,0,0); cu.materials.append(mat)
text('8 FT  /  8 TIERS  /  8 FACINGS',0,7.52,.11,.22,blue)
text('ONE POPULAR TITLE — FIVE SHELVES',0,7.18,.11,.16,blue)
# Keep the capacity study available but hidden in normal editing.
study.hide_viewport=True
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'tools/models/new-release-wall.blend'))
if '--render' in sys.argv:
    out=sys.argv[sys.argv.index('--render')+1]; study.hide_viewport=False
    scene=bpy.context.scene; scene.render.engine='CYCLES'; scene.cycles.samples=24
    scene.world.color=(.35,.35,.35)
    def aim(ob,at): ob.rotation_euler=(Vector(at)-ob.location).to_track_quat('-Z','Y').to_euler()
    bpy.ops.object.camera_add(location=(11,-18,11)); cam=bpy.context.object; aim(cam,(0,-.2,4.3)); cam.data.type='ORTHO'; cam.data.ortho_scale=12; scene.camera=cam
    bpy.ops.object.light_add(type='AREA',location=(1,-8,12)); bpy.context.object.data.energy=1800; bpy.context.object.data.shape='DISK'; bpy.context.object.data.size=8; aim(bpy.context.object,(0,0,4))
    scene.render.resolution_x=1200; scene.render.resolution_y=1200; scene.render.resolution_percentage=100; scene.render.filepath=out; bpy.ops.render.render(write_still=True)
print(json.dumps(metrics))
