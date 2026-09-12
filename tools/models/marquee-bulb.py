"""Original generic marquee lamp; Blender 5.2 scripted mesh authoring.
Run: blender -b -P tools/models/marquee-bulb.py
Store feet; runtime +Z faces out, origin is the old globe center.
"""
import bpy, bmesh, math, json
from pathlib import Path
ROOT = Path(__file__).resolve().parents[2]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.context.scene.unit_settings.system = 'IMPERIAL'
bpy.context.scene.unit_settings.scale_length = .3048

def material(name, color, metal=0, emission=0):
    m=bpy.data.materials.new(name); m.diffuse_color=(*color,1)
    p=m.node_tree.nodes.get('Principled BSDF'); p.inputs['Base Color'].default_value=(*color,1)
    p.inputs['Metallic'].default_value=metal; p.inputs['Roughness'].default_value=.4
    p.inputs['Emission Color'].default_value=(1,.694,.352,1); p.inputs['Emission Strength'].default_value=emission
    return m

def lathe(name, profile, mat):
    # Ten-sided turned profiles, welded poles and quad bands; independent closed parts.
    n=10; verts=[]; rings=[]; faces=[]
    for r,z in profile:
        ring=[]
        for j in range(n if r else 1):
            a=j*2*math.pi/n; ring.append(len(verts)); verts.append((r*math.cos(a),-z,r*math.sin(a)))
        rings.append(ring)
    for a,b in zip(rings,rings[1:]):
        for j in range(n):
            k=(j+1)%n
            faces.append((a[0],b[k],b[j]) if len(a)==1 else (a[j],a[k],b[0]) if len(b)==1 else (a[j],a[k],b[k],b[j]))
    mesh=bpy.data.meshes.new(name); mesh.from_pydata(verts,[],faces); mesh.update()
    bm=bmesh.new(); bm.from_mesh(mesh); bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces))
    assert all(e.is_manifold for e in bm.edges),name
    bm.to_mesh(mesh); bm.free()
    uv=mesh.uv_layers.new(name='TurnedProfileUV')
    for poly in mesh.polygons:
        poly.use_smooth=True
        us=[(math.atan2(verts[mesh.loops[i].vertex_index][2],verts[mesh.loops[i].vertex_index][0])/(2*math.pi))%1 for i in poly.loop_indices]
        if max(us)-min(us)>.5: us=[u+1 if u<.5 else u for u in us]
        for i,u in zip(poly.loop_indices,us):
            z=-verts[mesh.loops[i].vertex_index][1]; uv.data[i].uv=(u,(z-profile[0][1])/(profile[-1][1]-profile[0][1]))
    obj=bpy.data.objects.new(name,mesh); bpy.context.collection.objects.link(obj); mesh.materials.append(mat)
    obj['units']='feet'; obj['provenance']='Original generic fixture, issue #241; no third-party mesh'
    return obj
lathe('GlassEnvelope',[(0,-.036),(.021,-.036),(.034,-.022),(.045,0),(.040,.021),(.025,.037),(0,.045)],material('BulbGlass',(.13,.07,.03),emission=3.2))
lathe('LampNeck',[(0,-.055),(.019,-.055),(.021,-.051),(.021,-.036),(0,-.036)],material('NickelNeck',(.34,.29,.20),.7))
lathe('Socket',[(0,-.085),(.029,-.085),(.033,-.081),(.033,-.073),(.027,-.069),(.027,-.055),(.023,-.052),(0,-.052)],material('PorcelainSocket',(.28,.25,.20)))
bpy.context.scene['contract']='Feet; glTF +Z outward; globe center origin; mounting back z=-0.085; diameter .09; length .13'
for a in bpy.context.screen.areas:
    if a.type=='VIEW_3D':
        a.spaces.active.region_3d.view_distance=.35
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'tools/models/marquee-bulb.blend'))
bpy.ops.export_scene.gltf(filepath=str(ROOT/'public/models/marquee-bulb.glb'),export_format='GLB',export_yup=True,export_extras=True)
