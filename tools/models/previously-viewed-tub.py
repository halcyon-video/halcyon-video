"""Original compact acrylic counter tub; feet, runtime XYZ feet, +Z clerk side.
Rebuild: blender -b -t 2 -P tools/models/previously-viewed-tub.py
No source photograph, branded art or third-party mesh is embedded.
"""
import bpy, bmesh, math, json
import numpy as np
from pathlib import Path
from mathutils import Vector
ROOT = Path(__file__).resolve().parents[2]
bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
for block in list(bpy.data.materials): bpy.data.materials.remove(block)
np.random.seed(185)
N=128
noise=np.random.random((N,N))

def image(name, rgb):
    im=bpy.data.images.new(name,width=N,height=N,alpha=True)
    rgba=np.ones((N,N,4),dtype=np.float32); rgba[:,:,:3]=rgb
    im.pixels.foreach_set(rgba.ravel()); im.pack(); im.colorspace_settings.name='Non-Color'
    return im
normal=np.empty((N,N,3)); normal[:,:,0]=.5+(np.roll(noise,1,1)-noise)*.035; normal[:,:,1]=.5+(np.roll(noise,1,0)-noise)*.035; normal[:,:,2]=1
nm=image('Fine wiped acrylic and molded grain',normal)
rm=image('Microsurface roughness',np.repeat((.84+noise*.16)[:,:,None],3,axis=2))

def material(name, color, rough, alpha=1):
    m=bpy.data.materials.new(name); m.use_nodes=True
    n=m.node_tree.nodes; l=m.node_tree.links; p=n.get('Principled BSDF')
    p.inputs['Base Color'].default_value=(*color,1); p.inputs['Roughness'].default_value=rough
    p.inputs['Alpha'].default_value=alpha
    p.inputs['IOR'].default_value=1.49
    if alpha<1:
        m.surface_render_method='DITHERED'; p.inputs['Coat Weight'].default_value=.4; p.inputs['Coat Roughness'].default_value=.08
    t=n.new('ShaderNodeTexImage'); t.image=nm
    normalnode=n.new('ShaderNodeNormalMap'); normalnode.inputs['Strength'].default_value=.18 if alpha<1 else .6
    l.new(t.outputs['Color'],normalnode.inputs['Color']); l.new(normalnode.outputs['Normal'],p.inputs['Normal'])
    t=n.new('ShaderNodeTexImage'); t.image=rm
    mul=n.new('ShaderNodeMath'); mul.operation='MULTIPLY'; mul.inputs[1].default_value=rough
    l.new(t.outputs['Color'],mul.inputs[0]); l.new(mul.outputs[0],p.inputs['Roughness'])
    return m
acrylic=material('Tub_ClearAcrylic',(.79,.88,.91),.13,.16)
feet=material('Tub_SiliconeFeet',(.28,.30,.29),.78)
paper=material('Tub_PriceCard',(.94,.90,.73),.82)
parts=[]
def finish(obj,mat,bevel=.001):
    obj.data.materials.append(mat); parts.append(obj)
    bpy.context.view_layer.objects.active=obj; obj.select_set(True)
    if bevel:
        b=obj.modifiers.new('Eased polished cut edges','BEVEL'); b.width=bevel; b.segments=2
        bpy.ops.object.modifier_apply(modifier=b.name)
    bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT'); bpy.ops.mesh.normals_make_consistent(inside=False); bpy.ops.uv.smart_project(island_margin=.025); bpy.ops.object.mode_set(mode='OBJECT')
    obj.select_set(False)
    obj['construction']='Original design; dimensions inferred for this consumer, not measured period replica'
    return obj

def prism(name,profile,x0,x1,mat):
    # Closed extruded profile; all broad walls/base are connected, not boxes.
    v=[(x,y,z) for x in [x0,x1] for y,z in profile]; n=len(profile)
    f=[tuple(range(n-1,-1,-1)),tuple(range(n,n*2))]+[(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)]
    mesh=bpy.data.meshes.new(name); mesh.from_pydata(v,[],f); mesh.update()
    o=bpy.data.objects.new(name,mesh); bpy.context.collection.objects.link(o)
    return finish(o,mat)
# U-shaped 3 mm sheet: front and rear .42 high; rounded bends into base.
# Profile runs inside front -> base -> rear; reverse outer path closes thickness.
inner=[(.38,.42),(.38,.08)]
for i in range(1,9):
    a=i*math.pi/16; inner.append((.34+.04*math.cos(a),.08-.04*math.sin(a)))
inner.append((-.34,.04))
for i in range(1,9):
    a=i*math.pi/16; inner.append((-.34-.04*math.sin(a),.08-.04*math.cos(a)))
inner.append((-.38,.42))
outer=[(-.39,.42),(-.39,.08)]
for i in range(1,9):
    a=i*math.pi/16; outer.append((-.34-.05*math.cos(a),.08-.05*math.sin(a)))
outer.append((.34,.03))
for i in range(1,9):
    a=i*math.pi/16; outer.append((.34+.05*math.sin(a),.08-.05*math.cos(a)))
outer.append((.39,.42))
prism('Bent_front_base_rear_3mm',inner+outer,-.53,.53,acrylic)
for side in [-1,1]:
    prism(('Left' if side<0 else 'Right')+'_solvent_bonded_end_3mm',inner, min(side*.53,side*.54),max(side*.53,side*.54),acrylic)
# Clear folded pocket bonded to customer face, with actual paper slot .002 ft.
prism('Folded_price_card_pocket',[(.391,.10),(.415,.10),(.415,.36),(.409,.36),(.409,.106),(.397,.106),(.397,.36),(.391,.36)],-.35,.35,acrylic)
prism('Removable_price_card',[(.400,.112),(.406,.112),(.406,.35),(.400,.35)],-.33,.33,paper)
for x in [-.43,.43]:
    for y in [-.28,.28]:
        bpy.ops.mesh.primitive_cylinder_add(vertices=16,radius=.045,depth=.03,location=(x,y,.015))
        o=bpy.context.object; o.name=f'Silicone_foot_{x}_{y}'; finish(o,feet,.003)
# Verify editable solid parts before export.
metrics={'units':'feet','origin':'underside of feet; X across, Y up, +Z clerk side after glTF export','parts':[]}
for o in parts:
    bm=bmesh.new(); bm.from_mesh(o.data); bad=sum(not e.is_manifold for e in bm.edges); bm.free()
    assert bad==0,(o.name,bad)
    metrics['parts'].append({'name':o.name,'triangles':sum(len(p.vertices)-2 for p in o.data.polygons),'nonmanifoldEdges':bad,'uv':bool(o.data.uv_layers)})
    o.modifiers.new('Runtime triangulation','TRIANGULATE')
coords=[o.matrix_world @ Vector(v.co) for o in parts for v in o.data.vertices]
metrics['boundsBlender']={'min':[min(v[i] for v in coords) for i in range(3)],'max':[max(v[i] for v in coords) for i in range(3)]}
metrics['triangles']=sum(p['triangles'] for p in metrics['parts'])
bpy.context.scene.unit_settings.system='IMPERIAL'; bpy.context.scene.unit_settings.scale_length=.3048
for area in bpy.context.screen.areas:
    if area.type=='VIEW_3D':
        area.spaces.active.region_3d.view_distance=2.2; area.spaces.active.region_3d.view_location=(0,0,.25)
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'tools/models/previously-viewed-tub.blend'))
bpy.ops.export_scene.gltf(filepath=str(ROOT/'public/models/previously-viewed-tub.glb'),export_format='GLB',export_yup=True,export_apply=True)
metrics['glbBytes']=(ROOT/'public/models/previously-viewed-tub.glb').stat().st_size
(ROOT/'tools/models/previously-viewed-tub-metrics.json').write_text(json.dumps(metrics,indent=2)+'\n')
print(json.dumps(metrics))
