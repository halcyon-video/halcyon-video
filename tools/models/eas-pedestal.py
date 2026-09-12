"""Original generic EAS pedestal; feet, X width, -Y store depth, Z height.
Run blender -b -P tools/models/eas-pedestal.py. No photographic inputs.
"""
import bpy, bmesh, math, json
import numpy as np
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
# Deterministic tileable molded polymer grain, stored in the GLB and blend.
rng=np.random.default_rng(220)
h=rng.random((128,128)).astype(np.float32)
dx=np.roll(h,1,1)-np.roll(h,-1,1); dy=np.roll(h,1,0)-np.roll(h,-1,0)
def image(name, pixels):
    im=bpy.data.images.new(name,width=128,height=128); im.colorspace_settings.name='Non-Color'
    im.pixels.foreach_set(pixels.astype(np.float32).ravel()); im.pack(); return im
normal=image('ABS_micrograin_normal',np.stack((.5+dx*.12,.5+dy*.12,np.ones_like(h),np.ones_like(h)),axis=2))
rough=image('ABS_roughness',np.stack((.49+h*.12,)*3+(np.ones_like(h),),axis=2))
mats=[]
for name,c,r,metal in [('MoldedIvory',(.81,.78,.69),.55,0),('SeamElastomer',(.09,.095,.10),.8,0),('BasePolymer',(.36,.35,.31),.65,0),('FastenerSteel',(.32,.34,.36),.32,.8)]:
    m=bpy.data.materials.new(name); m.diffuse_color=(*c,1); m.use_nodes=True
    p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*c,1);p.inputs['Roughness'].default_value=r;p.inputs['Metallic'].default_value=metal
    if metal==0:
        n=m.node_tree.nodes.new('ShaderNodeTexImage');n.image=normal
        nm=m.node_tree.nodes.new('ShaderNodeNormalMap');nm.inputs['Strength'].default_value=.35
        m.node_tree.links.new(n.outputs['Color'],nm.inputs['Color']);m.node_tree.links.new(nm.outputs['Normal'],p.inputs['Normal'])
        t=m.node_tree.nodes.new('ShaderNodeTexImage');t.image=rough;m.node_tree.links.new(t.outputs['Color'],p.inputs['Roughness'])
    mats.append(m)

def outline(w,h,r,z):
    pts=[]
    for cx,cz,start in [(w/2-r,z+r,-90),(w/2-r,z+h-r,0),(-w/2+r,z+h-r,90),(-w/2+r,z+r,180)]:
        for j in range(9):
            a=math.radians(start+j*90/8);pts.append((cx+r*math.cos(a),cz+r*math.sin(a)))
    return pts

def shell(name,w,h,r,z,layers,role):
    # Successive inset perimeter rings form rolled shoulders and a closed panel.
    v=[];f=[];N=36
    for depth,inset in layers:
        v.extend((x,depth,zz) for x,zz in outline(w-2*inset,h-2*inset,max(.003,r-inset),z+inset))
    f.append(tuple(reversed(range(N))))
    for j in range(len(layers)-1):
        for i in range(N):
            k=(i+1)%N;f.append((j*N+i,j*N+k,(j+1)*N+k,(j+1)*N+i))
    f.append(tuple(range((len(layers)-1)*N,len(layers)*N)))
    me=bpy.data.meshes.new(name);me.from_pydata(v,[],f);me.update()
    ob=bpy.data.objects.new(name,me);bpy.context.collection.objects.link(ob);me.materials.append(mats[role])
    bm=bmesh.new();bm.from_mesh(me);bmesh.ops.recalc_face_normals(bm,faces=bm.faces)
    assert all(e.is_manifold for e in bm.edges),name
    bm.to_mesh(me);bm.free()
    bpy.ops.object.select_all(action='DESELECT');ob.select_set(True);bpy.context.view_layer.objects.active=ob
    bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT');bpy.ops.uv.smart_project(island_margin=.025);bpy.ops.object.mode_set(mode='OBJECT')
    for p in me.polygons:p.use_smooth=len(p.vertices)==4
    ob['material_role']=mats[role].name
    return ob
shell('Front_continuous_molded_shell',.5,3.36,.235,.07,[(0.002,0),(.025,0),(.038,.009),(.045,.023)],0)
shell('Rear_continuous_molded_shell',.5,3.36,.235,.07,[(-.002,0),(-.025,0),(-.038,.009),(-.045,.023)],0)
shell('Recessed_clamshell_gasket',.493,3.353,.231,.0735,[(-.002,0),(.002,0)],1)
shell('Rear_service_cover_reveal',.32,.51,.045,.16,[(-.045,0),(-.046,.002)],1)
shell('Rear_service_cover',.304,.494,.038,.168,[(-.046,0),(-.05,.008)],0)
# Horizontal eased mounting shoe, with four separate captive rubber feet.
def box(name,loc,scale,bevel,role):
    bpy.ops.mesh.primitive_cube_add(size=1,location=loc);o=bpy.context.object;o.name=name;o.scale=scale
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    o.data.materials.append(mats[role]);m=o.modifiers.new('Molded_edge_radius','BEVEL');m.width=bevel;m.segments=3
    bpy.ops.object.modifier_apply(modifier=m.name)
    bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT');bpy.ops.uv.smart_project(island_margin=.02);bpy.ops.object.mode_set(mode='OBJECT')
    return o
box('Molded_mounting_shoe',(0,0,.038),(.62,.5,.044),.012,2)
box('Shell_socket',(0,0,.067),(.52,.13,.03),.009,0)
for x in [-.235,.235]:
    for y in [-.175,.175]:box('Captive_elastomer_foot',(x,y,.01),(.105,.105,.02),.006,1)
# Rear sealed cable entry; cable routes into the shoe and floor, never across passage.
shell('Rear_cable_grommet',.085,.07,.03,.08,[(-.046,0),(-.061,.005)],1)
box('Cable_entry_into_shoe',(0,-.056,.077),(.031,.028,.055),.01,1)
for z in [.205,.625]:
    shell('Service_cover_captive_screw',.022,.022,.01,z,[(-.050,0),(-.053,.002)],3)
scene=bpy.context.scene;scene.unit_settings.system='IMPERIAL';scene.unit_settings.scale_length=.3048
scene['provenance']='Original generic reconstruction of existing procedural envelope. No period-fidelity claim; late-era archive unavailable.'
scene['dimensions_feet']='0.62 wide x 0.50 deep x 3.43 tall; floor origin; no moving parts'
parts=list(scene.objects)
for o in parts:
    # Tile the micrograin eight times across the packed UV domain.
    for uv in o.data.uv_layers.active.data: uv.uv *= 8
    bm=bmesh.new();bm.from_mesh(o.data);assert all(e.is_manifold for e in bm.edges),o.name;bm.free()
for area in bpy.context.screen.areas:
    if area.type=='VIEW_3D':
        area.spaces.active.region_3d.view_distance=5;area.spaces.active.region_3d.view_location=(0,0,1.7)
for o in parts:o.select_set(True)
bpy.context.view_layer.objects.active=parts[0]
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'tools/models/eas-pedestal.blend'))
bpy.ops.object.join();ob=bpy.context.object;ob.name='EAS_Pedestal';ob.data.calc_loop_triangles()
bpy.ops.export_scene.gltf(filepath=str(ROOT/'public/models/eas-pedestal.glb'),export_format='GLB',export_yup=True,export_extras=True)
metrics={'triangles':len(ob.data.loop_triangles),'source_parts':len(parts),'materials':[m.name for m in mats],'textures':['128x128 normal','128x128 roughness'],'dimensions_feet':[.62,3.43,.5],'closed_manifold_parts':True,'glb_bytes':(ROOT/'public/models/eas-pedestal.glb').stat().st_size,'blender':bpy.app.version_string}
(ROOT/'tools/models/eas-pedestal-metrics.json').write_text(json.dumps(metrics,indent=2)+'\n');print(metrics)
