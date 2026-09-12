"""Original generic walk-off mat. Feet, X width/-Y depth/Z up; no external art.
Run blender -b -P "$PWD/tools/models/entrance-mat.py".
Unit footprint is fitted in X/depth only at the consumer; height stays in feet.
"""
import bpy, bmesh, math, json
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
scene=bpy.context.scene
scene.unit_settings.system='IMPERIAL'; scene.unit_settings.scale_length=.3048
scene.render.engine='CYCLES'; scene.cycles.samples=8
# Bake the fine fibers rather than tessellating thousands of pile loops.
bpy.ops.mesh.primitive_plane_add(size=1)
plane=bpy.context.object; plane.name='Pile_bake_target'
proc=bpy.data.materials.new('Pile_procedural_authoring'); proc.use_nodes=True; proc.use_fake_user=True
plane.data.materials.append(proc)
n=proc.node_tree.nodes; l=proc.node_tree.links; p=n.get('Principled BSDF')
uv=n.new('ShaderNodeTexCoord'); noise=n.new('ShaderNodeTexNoise'); noise.inputs['Scale'].default_value=190; noise.inputs['Detail'].default_value=2
l.new(uv.outputs['UV'],noise.inputs['Vector'])
wave=n.new('ShaderNodeTexWave'); wave.bands_direction='X'; wave.inputs['Scale'].default_value=32; wave.inputs['Distortion'].default_value=1.3
l.new(uv.outputs['UV'],wave.inputs['Vector'])
mix=n.new('ShaderNodeMath'); mix.operation='MULTIPLY'; l.new(noise.outputs['Fac'],mix.inputs[0]); l.new(wave.outputs['Color'],mix.inputs[1])
bump=n.new('ShaderNodeBump'); bump.inputs['Strength'].default_value=.32; bump.inputs['Distance'].default_value=.0015; l.new(mix.outputs[0],bump.inputs['Height']); l.new(bump.outputs['Normal'],p.inputs['Normal'])
ramp=n.new('ShaderNodeValToRGB'); ramp.color_ramp.elements[0].color=(.022,.025,.028,1); ramp.color_ramp.elements[1].color=(.065,.071,.079,1); l.new(mix.outputs[0],ramp.inputs[0]); l.new(ramp.outputs[0],p.inputs['Base Color']); p.inputs['Roughness'].default_value=.96
images=[]
for name,kind in [('PileColor','DIFFUSE'),('PileNormal','NORMAL')]:
    im=bpy.data.images.new(name,512,512,alpha=False); im.colorspace_settings.name='Non-Color' if kind=='NORMAL' else 'sRGB'
    target=n.new('ShaderNodeTexImage'); target.image=im; n.active=target
    scene.render.bake.use_pass_direct=False; scene.render.bake.use_pass_indirect=False; scene.render.bake.use_pass_color=True
    bpy.ops.object.bake(type=kind)
    im.pack(); images.append(im)
bpy.data.objects.remove(plane,do_unlink=True)
roles=[]
for name,color,rough in [('RubberBacking',(.012,.014,.017,1),.82),('CompressedPile',(.04,.045,.05,1),.96)]:
    m=bpy.data.materials.new(name); m.use_nodes=True; m.diffuse_color=color
    p=m.node_tree.nodes.get('Principled BSDF'); p.inputs['Base Color'].default_value=color; p.inputs['Roughness'].default_value=rough
    roles.append(m)
n=roles[1].node_tree.nodes; l=roles[1].node_tree.links; p=n.get('Principled BSDF')
c=n.new('ShaderNodeTexImage'); c.image=images[0]; l.new(c.outputs['Color'],p.inputs['Base Color'])
t=n.new('ShaderNodeTexImage'); t.image=images[1]; normal=n.new('ShaderNodeNormalMap'); normal.inputs['Strength'].default_value=.5; l.new(t.outputs['Color'],normal.inputs['Color']); l.new(normal.outputs[0],p.inputs['Normal'])
def ring(inset,z):
    # Rounded rectangle, six segments/corner. Localized 0.0008 ft curl only
    # at rear right rubber corner; stays below the pile crest.
    r=.025; h=.5-inset; pts=[]
    for cx,cy,start in [(h-r,h-r,0),(-h+r,h-r,90),(-h+r,-h+r,180),(h-r,-h+r,270)]:
        for j in range(7):
            a=math.radians(start+j*15); x=cx+r*math.cos(a); y=cy+r*math.sin(a)
            curl=.0008*max(0,(x-.37)/.13)*max(0,(y-.37)/.13) if 0<z<.018 else 0
            pts.append((x,y,z+curl))
    return pts
# Closed rubber backing + four molded ramp bands; separate inset pile solid.
def solid(name,profile,role):
    verts=[]; faces=[]; N=28
    for inset,z in profile: verts.extend(ring(inset,z))
    faces.append(tuple(reversed(range(N))))
    for k in range(len(profile)-1):
        for i in range(N): j=(i+1)%N; faces.append((k*N+i,k*N+j,(k+1)*N+j,(k+1)*N+i))
    faces.append(tuple(range((len(profile)-1)*N,len(profile)*N)))
    mesh=bpy.data.meshes.new(name); mesh.from_pydata(verts,[],faces); mesh.update()
    ob=bpy.data.objects.new(name,mesh); bpy.context.collection.objects.link(ob); mesh.materials.append(roles[role])
    layer=mesh.uv_layers.new(name='PlanarPile_and_Rubber')
    for f in mesh.polygons:
        for li in f.loop_indices:
            v=mesh.vertices[mesh.loops[li].vertex_index].co; layer.data[li].uv=(v.x+.5,v.y+.5)
    bm=bmesh.new(); bm.from_mesh(mesh); bmesh.ops.recalc_face_normals(bm,faces=bm.faces)
    assert all(e.is_manifold for e in bm.edges)
    assert all(f.calc_area()>1e-10 for f in bm.faces)
    bm.to_mesh(mesh); bm.free()
    ob['role']=roles[role].name; ob['units']='feet; unit footprint fitted in X/depth only'; return ob
solid('Rubber_backing_molded_ramps',[(0,0),(0,.0015),(.009,.003),(.028,.014),(.036,.017)],0)
solid('Compressed_pile_inset',[(.038,.017),(.042,.020),(.048,.024)],1)
scene['provenance']='Original generic scripted mat, no imported geometry or artwork; dimensions are design assumptions, not historical measurements.'
scene['dimensions']='Unit footprint 1 x 1; 0.024 ft pile height; floor origin at underside center. Runtime scales footprint only.'
scene['construction']='Flat underside, feathered 0.0015 ft outer lip, molded ramps, <=0.0008 ft corner curl below pile crest, packed 512px color/normal bakes.'
for area in bpy.context.screen.areas:
    if area.type=='VIEW_3D': area.spaces.active.region_3d.view_distance=1.8
bpy.ops.object.select_all(action='SELECT'); bpy.context.view_layer.objects.active=bpy.data.objects['Rubber_backing_molded_ramps']
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'tools/models/entrance-mat.blend'))
triangles=0
for ob in scene.objects: ob.data.calc_loop_triangles(); triangles+=len(ob.data.loop_triangles)
bpy.ops.export_scene.gltf(filepath=str(ROOT/'public/models/entrance-mat.glb'),export_format='GLB',export_yup=True,export_extras=True)
metrics={'triangles':triangles,'parts':2,'material_roles':[m.name for m in roles],'textures':2,'texture_dimensions':[512,512],'footprint':[1,1],'max_height_ft':max(v.co.z for o in scene.objects for v in o.data.vertices),'glb_bytes':(ROOT/'public/models/entrance-mat.glb').stat().st_size,'blender_version':bpy.app.version_string,'manifold':True}
(ROOT/'tools/models/entrance-mat-metrics.json').write_text(json.dumps(metrics,indent=2)+'\n'); print(metrics)
