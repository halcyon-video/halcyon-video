"""Scripted mesh authoring: feet, Blender (x, -depth, height), origin at glass/ground.
Run: blender -b -P tools/models/storefront-entry-cone-canopy.py
"""
import bpy, bmesh, json, math
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
P=json.loads((ROOT/'src/storefront-cone-canopy-profile.json').read_text())
bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
bpy.context.preferences.filepaths.save_version=0
bpy.context.scene.unit_settings.system='IMPERIAL'; bpy.context.scene.unit_settings.scale_length=.3048
mats={}
for name,color,rough,metal in [('FacadeSlate',(.060,.070,.080,1),.88,.08),('FacadeCanopy',(.060,.070,.080,1),.88,.08),('FacadeCoping',(.023,.027,.032,1),.52,.35),('FacadeSoffit',(.48,.47,.42,1),.72,.15),('FacadeDownlight',(1,.86,.66,1),.45,0)]:
    m=bpy.data.materials.new(name);m.diffuse_color=color;m.use_nodes=True
    bs=m.node_tree.nodes.get('Principled BSDF');bs.inputs['Base Color'].default_value=color;bs.inputs['Roughness'].default_value=rough;bs.inputs['Metallic'].default_value=metal
    mats[name]=m

def mesh(name,verts,faces,role,cyl=False):
    data=bpy.data.meshes.new(name); data.from_pydata([(x,-z,y) for x,y,z in verts],[],faces);data.materials.append(mats[role]);data.update()
    bm=bmesh.new();bm.from_mesh(data);bmesh.ops.recalc_face_normals(bm,faces=bm.faces)
    assert all(e.is_manifold for e in bm.edges),name
    bm.to_mesh(data);bm.free()
    obj=bpy.data.objects.new(name,data);bpy.context.collection.objects.link(obj)
    uv=data.uv_layers.new(name='FacadeFeet')
    for face in data.polygons:
        for li in face.loop_indices:
            v=data.vertices[data.loops[li].vertex_index].co
            uv.data[li].uv=(v.x/4,v.z/4) if abs(face.normal.y)>.5 else (v.y/4,v.z/4) if abs(face.normal.x)>.5 else (v.x/4,v.y/4)
    if not cyl:
        bevel=obj.modifiers.new('Eased panel edges','BEVEL');bevel.width=.012;bevel.segments=2
        obj.modifiers.new('Weighted panel normals','WEIGHTED_NORMAL')
    return obj

def prism(name,outline,y0,y1,role):
    n=len(outline);return mesh(name,[(x,y,z) for y in [y0,y1] for x,z in outline],[tuple(reversed(range(n))),tuple(range(n,2*n))]+[(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)],role)
def box(name,x0,x1,y0,y1,z0,z1,role):
    return prism(name,[(x0,z0),(x1,z0),(x1,z1),(x0,z1)],y0,y1,role)

w=P['spanHalf'];f=P['front'];b=P['bottom'];t=P['top']
box('Recessed canopy structural core',-w+.1,w-.1,b+.12,t-.15,.1,f-.1,'FacadeCoping')
# Continuous folded U-shaped cladding courses, mitered front corners. The .035ft
# open joints reveal the recessed substrate without overlay strips or coplanarity.
outline=[(-w,.1),(-w,f),(w,f),(w,.1),(w-.1,.1),(w-.1,f-.1),(-w+.1,f-.1),(-w+.1,.1)]
for row in range(3):
    lo=b+.12+row*(t-b-.27)/3; hi=b+.12+(row+1)*(t-b-.27)/3-.035
    prism('Slate folded cladding course %d'%(row+1),outline,lo,hi,'FacadeCanopy')
box('Overhanging folded coping',-w-.06,w+.06,t-.15,t,.02,f+.06,'FacadeCoping')
# Eight individual folded soffit pans, with recessed rather than painted joints.
for i in range(8):
    x0=-w+i*2*w/8;x1=x0+2*w/8
    box('Soffit pan %02d'%i,x0+.014,x1-.014,b,b+.12,.1,f,'FacadeSoffit')
for s in [-1,1]:
    cx=s*P['pillarX'];cz=P['pillarZ']; profile=P['pillarProfile'];n=64
    verts=[];rings=[]
    for r,y in profile:
        ring=[]
        for j in range(n if r else 1):
            a=2*math.pi*j/n;ring.append(len(verts));verts.append((cx+r*math.cos(a),y,cz+r*math.sin(a)))
        rings.append(ring)
    faces=[]
    for a,c in zip(rings,rings[1:]):
        for j in range(n):
            k=(j+1)%n
            faces.append((a[0],c[k],c[j]) if len(a)==1 else (a[j],a[k],c[0]) if len(c)==1 else (a[j],a[k],c[k],c[j]))
    obj=mesh(('Left' if s<0 else 'Right')+' turned cone with integral plinth and ring capital',verts,faces,'FacadeCanopy',True)
    # Cylindrical seam at the rear of each turned profile. Smooth around its
    # circumference; split normals across horizontal beads and plinth shoulders.
    for poly in obj.data.polygons:
        poly.use_smooth=abs(poly.normal.z)<.95
        angles=[]
        for li in poly.loop_indices:
            v=obj.data.vertices[obj.data.loops[li].vertex_index].co
            angles.append((math.atan2(-v.y-cz,v.x-cx)/(2*math.pi))%1)
        wrap=max(angles)-min(angles)>.5
        for li,u in zip(poly.loop_indices,angles):
            v=obj.data.vertices[obj.data.loops[li].vertex_index].co
            obj.data.uv_layers[0].data[li].uv=(u+1 if wrap and u<.5 else u,v.z/4)
    x0,x1=sorted([s*5.55,s*P['massHalf']]);box('Shallow rear entry jamb',x0,x1,0,b,-.18,.25,'FacadeSlate')
    box('Recessed warm downlight lens',s*4-.32,s*4+.32,b-.015,b,5.9,6.54,'FacadeDownlight')
# Explicit attachment markers are editable source metadata; runtime derives the
# live equivalents from facadeDimensions and actual store/corner widths.
for name,co in [('Canopy ticket anchor',(0,13.65,11.55)),('Left wall letters',(-22,12.85,.8)),('Right wall letters',(22,12.85,.8))]:
    ob=bpy.data.objects.new(name,None);bpy.context.collection.objects.link(ob);ob.location=(co[0],-co[2],co[1]);ob.empty_display_size=.5
objects=[o for o in bpy.context.scene.objects if o.type=='MESH']
bpy.ops.object.select_all(action='DESELECT')
for o in objects:o.select_set(True)
bpy.context.view_layer.objects.active=objects[0]
for area in bpy.context.screen.areas:
    if area.type=='VIEW_3D':
        area.spaces.active.region_3d.view_distance=38;area.spaces.active.region_3d.view_location=(0,-5,9)
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'tools/models/storefront-entry-cone-canopy.blend'))
bpy.ops.export_scene.gltf(filepath=str(ROOT/'public/models/storefront-entry-cone-canopy.glb'),export_format='GLB',use_selection=True,export_yup=True,export_apply=True)
metrics={'units':'feet','nonManifoldEdges':0,'materialRoles':list(mats),'sourceMeshes':len(objects),'bytes':(ROOT/'public/models/storefront-entry-cone-canopy.glb').stat().st_size}
for o in objects:o.data.calc_loop_triangles()
metrics['sourceTriangles']=sum(len(o.data.loop_triangles) for o in objects)
metrics['exportedTriangles']=0
for o in objects:
    evaluated=o.evaluated_get(bpy.context.evaluated_depsgraph_get());data=evaluated.to_mesh();data.calc_loop_triangles()
    metrics['exportedTriangles']+=len(data.loop_triangles);evaluated.to_mesh_clear()
metrics['boundsStoreFeet']=[[-w-.06,0,-.18],[w+.06,t,f+.06]]
(ROOT/'tools/models/storefront-entry-cone-canopy-metrics.json').write_text(json.dumps(metrics,indent=2)+'\n')
print(metrics)
