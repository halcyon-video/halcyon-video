"""Original floor-standing tape-cleaner sidekick (#199). Scripted Blender mesh authoring.
Run: blender -b -t 2 -P "$PWD/tools/models/tape-cleaner-sidekick.py"   Feet.
Local frame: origin at floor centre, +Z toward the customer. Blender authors
(x, -store_z, store_y); the Y-up glTF export maps straight to the store.
No third-party geometry or artwork. Cartons are NOT modelled here: the app
instances the shared #181 cleaner-carton on the stock matrices in TIERS.
"""
import bpy, bmesh, math, json
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
bpy.context.preferences.filepaths.save_version=0
bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)

W=1.9            # overall width (x)
BASE_D,BASE_H=1.0,.4
SLAT_T=.08; SLAT_Z=-.46   # slat panel back face z; front face = SLAT_Z+SLAT_T
SLAT_Y0,SLAT_Y1=BASE_H,5.0
POST_R,POST_X,POST_Z=.065,W/2-.02,-.40
TIER_Y=[.9,1.8,2.7,3.6]  # tray floor top surfaces
TRAY_Z0,TRAY_Z1=-.38,-.16
COLS=[-.63,-.21,.21,.63]; CARTON_Z=-.27; CARTON_H=.667
HEADER=(4.35,5.0)
MATS={}
def mat(name,color,rough=.5,metal=0,alpha=1):
    m=bpy.data.materials.new(name);m.use_nodes=True;m.diffuse_color=(*color,alpha)
    p=m.node_tree.nodes.get('Principled BSDF')
    p.inputs['Base Color'].default_value=(*color,1);p.inputs['Roughness'].default_value=rough;p.inputs['Metallic'].default_value=metal
    if alpha<1:
        p.inputs['Alpha'].default_value=alpha
        try:m.surface_render_method='BLENDED'
        except Exception:m.blend_method='BLEND'
    MATS[name]=m
mat('SidekickBase',(.05,.055,.07),.6)
mat('SidekickSlat',(.88,.87,.84),.45)
mat('SidekickPost',(.62,.64,.68),.28,.9)
mat('SidekickAcrylic',(.85,.93,.97),.08,0,.22)
mat('SidekickHeader',(.02,.1,.42),.5)
PARTS=[]
def finish(name,data,role,uvfn):
    o=bpy.data.objects.new(name,data);bpy.context.collection.objects.link(o)
    data.materials.append(MATS[role])
    bm=bmesh.new();bm.from_mesh(data);bmesh.ops.recalc_face_normals(bm,faces=bm.faces)
    bm.to_mesh(data);bm.free()
    uv=data.uv_layers.new(name='FinishUV')
    for p in data.polygons:
        n=p.normal
        for li in p.loop_indices:
            x,by,y=data.vertices[data.loops[li].vertex_index].co;z=-by
            ax,ay,az=abs(n.x),abs(n.z),abs(n.y)  # blender z=up is store y
            if ay>=ax and ay>=az:u,v=x,z
            elif ax>=az:u,v=-by,y
            else:u,v=x,y
            uv.data[li].uv=(u,v)
    for e in data.edges:
        pass
    PARTS.append(o);return o
def manifold(o):
    bm=bmesh.new();bm.from_mesh(o.data)
    ok=all(e.is_manifold for e in bm.edges);bm.free()
    assert ok,o.name+' not manifold'
def box(name,cx,cy,cz,w,h,d,role,chamfer=0,seg=1):
    bm=bmesh.new()
    bmesh.ops.create_cube(bm,size=1)
    for v in bm.verts:v.co.x*=w;v.co.y*=d;v.co.z*=h
    for v in bm.verts:v.co.x+=cx;v.co.y+=-cz;v.co.z+=cy
    if chamfer:
        bmesh.ops.bevel(bm,geom=list(bm.edges),offset=chamfer,segments=seg,affect='EDGES')
    data=bpy.data.meshes.new(name);bm.to_mesh(data);bm.free()
    o=finish(name,data,role,None);manifold(o);return o
def extrude_profile(name,prof,x0,x1,role):
    """prof: closed (y,z) loop in store coords, extruded along x."""
    bm=bmesh.new()
    a=[bm.verts.new((x0,-z,y)) for y,z in prof]
    b=[bm.verts.new((x1,-z,y)) for y,z in prof]
    bm.faces.new(a);bm.faces.new(b[::-1])
    n=len(prof)
    for i in range(n):bm.faces.new((a[i],a[(i+1)%n],b[(i+1)%n],b[i]))
    data=bpy.data.meshes.new(name);bm.to_mesh(data);bm.free()
    o=finish(name,data,role,None);manifold(o);return o
def cylinder(name,cx,y0,y1,cz,r,role,bevel=.03):
    bm=bmesh.new()
    bmesh.ops.create_cone(bm,cap_ends=True,segments=20,radius1=r,radius2=r,depth=y1-y0)
    for v in bm.verts:v.co.z+=(y0+y1)/2;v.co.x+=cx;v.co.y+=-cz
    top=[e for e in bm.edges if all(abs(v.co.z-y1)<1e-6 or abs(v.co.z-y0)<1e-6 for v in e.verts) and abs(e.verts[0].co.z-e.verts[1].co.z)<1e-6]
    bmesh.ops.bevel(bm,geom=top,offset=bevel,segments=3,affect='EDGES')
    data=bpy.data.meshes.new(name);bm.to_mesh(data);bm.free()
    o=finish(name,data,role,None);manifold(o);return o

# Chamfered base: tapered plinth with toe recess.
box('Chamfered base plinth',0,BASE_H/2,0,W,BASE_H,BASE_D,'SidekickBase',chamfer=.06,seg=2)
box('Base toe kick recess',0,.04,.02,W-.2,.08,BASE_D-.12,'SidekickBase')

# Slatwall panel: real grooved profile (3 in pitch), extruded across the width.
pitch=.25;groove_h=.05;groove_d=.025
front=SLAT_Z+SLAT_T
prof=[(SLAT_Y0,SLAT_Z),(SLAT_Y1,SLAT_Z),(SLAT_Y1,front)]
y=SLAT_Y1
while y-pitch>SLAT_Y0+.05:
    prof+= [(y-pitch+groove_h+.01,front),(y-pitch+groove_h,front-groove_d),(y-pitch,front-groove_d),(y-pitch-.01,front)]
    y-=pitch
prof+=[(SLAT_Y0,front)]
extrude_profile('Slatwall panel',prof,-W/2+.09,W/2-.09,'SidekickSlat')

# Rounded posts with rolled caps, plus clip feet at the base.
for s in(-1,1):
    cylinder(f'Post {"L" if s<0 else "R"}',s*POST_X,BASE_H,5.2,POST_Z,POST_R,'SidekickPost')
    box(f'Post collar {"L" if s<0 else "R"}',s*POST_X,BASE_H+.05,POST_Z,.2,.1,.2,'SidekickPost',chamfer=.025)

# Clear carton trays: floor, front retaining lip, end walls, rear slat clip.
tw=W-.34
for i,ty in enumerate(TIER_Y):
    box(f'Tray {i+1} floor',0,ty-.02,(TRAY_Z0+TRAY_Z1)/2,tw,.04,TRAY_Z1-TRAY_Z0,'SidekickAcrylic',chamfer=.008)
    box(f'Tray {i+1} front lip',0,ty+.05,TRAY_Z1-.015,tw,.14,.03,'SidekickAcrylic',chamfer=.008)
    for s in(-1,1):
        box(f'Tray {i+1} end wall {"L" if s<0 else "R"}',s*(tw/2-.015),ty+.1,(TRAY_Z0+TRAY_Z1)/2,.03,.24,TRAY_Z1-TRAY_Z0,'SidekickAcrylic',chamfer=.008)
    box(f'Tray {i+1} slat clip',0,ty-.07,TRAY_Z0-.01,tw*.9,.06,.03,'SidekickPost',chamfer=.008)

# Header board on posts (theme-replaceable role).
box('Header board',0,(HEADER[0]+HEADER[1])/2,POST_Z+.11,W-.4,HEADER[1]-HEADER[0],.05,'SidekickHeader',chamfer=.012)

# Export: editable named parts in .blend, role-merged GLB.
for o in PARTS:o.select_set(True)
bpy.context.view_layer.objects.active=PARTS[0]
for a in bpy.context.screen.areas if bpy.context.screen else []:
    if a.type=='VIEW_3D':a.spaces.active.region_3d.view_distance=9
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'tools/models/tape-cleaner-sidekick.blend'))
n_parts=len(PARTS)
bpy.ops.object.join();o=bpy.context.object;o.name='tape-cleaner-sidekick'
glb=ROOT/'public/models/tape-cleaner-sidekick.glb'
bpy.ops.export_scene.gltf(filepath=str(glb),export_format='GLB',use_selection=True,export_yup=True,export_texcoords=True,export_normals=True,export_materials='EXPORT',export_cameras=False,export_lights=False)
o.data.calc_loop_triangles()
cs=[o.matrix_world@v.co for v in o.data.vertices]
report={'parts':n_parts,'triangles':len(o.data.loop_triangles),'vertices':len(o.data.vertices),
 'material_roles':sorted(m.name for m in o.data.materials),'glb_bytes':glb.stat().st_size,
 'bounds_blender_xyz':[[round(min(c[i] for c in cs),4),round(max(c[i] for c in cs),4)] for i in range(3)],
 'tiers':[{'trayTopY':t,'cartonCenterY':round(t+CARTON_H/2,4),'cartonZ':CARTON_Z,'cartonX':COLS} for t in TIER_Y]}
(ROOT/'tools/models/tape-cleaner-sidekick-metrics.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps(report))
