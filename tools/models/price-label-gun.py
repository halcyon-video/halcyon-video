"""Original unbranded mechanical labeler; see docs/price-label-gun-model.md.
Rebuild: blender -b -t 2 -P "$PWD/tools/models/price-label-gun.py"
Profile authored in feet in XY; thickness Z. Export maps to store X,Y,-Z.
"""
import bpy, bmesh, math, json
import numpy as np
from pathlib import Path
from mathutils import Vector
ROOT = Path(__file__).resolve().parents[2]
bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
bpy.context.preferences.filepaths.save_version = 0
scene = bpy.context.scene
scene.unit_settings.system = 'IMPERIAL'; scene.unit_settings.scale_length = .3048
# Deterministic original surface maps, packed into both deliverables.
rng = np.random.default_rng(192)
n = 128
height = rng.random((n,n)).astype(np.float32)
height = (height + np.roll(height,1,0) + np.roll(height,1,1))/3

def image(name, data, color=False):
    im = bpy.data.images.new(name, width=n, height=n)
    im.colorspace_settings.name = 'sRGB' if color else 'Non-Color'
    im.pixels.foreach_set(data.astype(np.float32).ravel()); im.pack(); return im
rgba = np.ones((n,n,4)); rgba[:,:,:3] = (.86 + .12*height)[:,:,None]
grain = image('Original molded grain albedo', rgba, True)
rgba = np.ones((n,n,4)); rgba[:,:,:3] = (.78 + .2*height)[:,:,None]
rough = image('Original micro roughness', rgba)
gx = (np.roll(height,-1,1)-np.roll(height,1,1))*.24
gy = (np.roll(height,-1,0)-np.roll(height,1,0))*.24
rgba = np.ones((n,n,4)); rgba[:,:,0]=.5-gx; rgba[:,:,1]=.5-gy; rgba[:,:,2]=np.sqrt(1-gx*gx*4-gy*gy*4)*.5+.5
normal = image('Original fine stipple normal',rgba)
mats={}
for name,col,r,metal in [
 ('LabelerOchreABS',(.66,.34,.09),.52,0),
 ('LabelerGraphite',(.10,.105,.11),.62,0),
 ('LabelerPaper',(.84,.79,.64),.9,0),
 ('LabelerSteel',(.43,.45,.47),.32,.8),
 ('LabelerRollCover',(.28,.13,.10),.58,0)]:
    m=bpy.data.materials.new(name); m.diffuse_color=(*col,1); m.use_nodes=True; m.use_backface_culling=True
    nt=m.node_tree; p=nt.nodes.get('Principled BSDF'); p.inputs['Base Color'].default_value=(*col,1)
    p.inputs['Roughness'].default_value=r; p.inputs['Metallic'].default_value=metal
    # Bake the original color modulation explicitly; portable glTF texture.
    rgba=np.ones((n,n,4)); linear=np.array(col)[None,None,:]*(.92+.08*height[:,:,None])
    rgba[:,:,:3]=np.where(linear<=.0031308,linear*12.92,1.055*linear**(1/2.4)-.055)
    colored=image(name+' molded surface',rgba,True)
    t=nt.nodes.new('ShaderNodeTexImage');t.image=colored
    nt.links.new(t.outputs['Color'],p.inputs['Base Color'])
    t=nt.nodes.new('ShaderNodeTexImage');t.image=rough
    mul=nt.nodes.new('ShaderNodeMath');mul.operation='MULTIPLY';mul.inputs[1].default_value=r
    nt.links.new(t.outputs['Color'],mul.inputs[0]);nt.links.new(mul.outputs[0],p.inputs['Roughness'])
    t=nt.nodes.new('ShaderNodeTexImage');t.image=normal
    nm=nt.nodes.new('ShaderNodeNormalMap');nm.inputs['Strength'].default_value=.12 if name in ['LabelerPaper','LabelerSteel'] else .3
    nt.links.new(t.outputs['Color'],nm.inputs['Color']);nt.links.new(nm.outputs[0],p.inputs['Normal'])
    mats[name]=m

def finish(o, role, bevel=.006):
    o.data.materials.append(mats[role])
    if bevel:
        b=o.modifiers.new('Molded edge radii','BEVEL');b.width=bevel;b.segments=2
    return o

def profile(name, points, z0,z1,role,bevel=.006):
    n=len(points);vs=[(x,y,z) for z in [z0,z1] for x,y in points]
    fs=[tuple(reversed(range(n))),tuple(range(n,2*n))]
    fs += [(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)]
    me=bpy.data.meshes.new(name);me.from_pydata(vs,[],fs);me.update()
    o=bpy.data.objects.new(name,me);bpy.context.collection.objects.link(o)
    return finish(o,role,bevel)

def box(name,x,y,z,w,d,h,role,bevel=.003):
    return profile(name,[(x-w/2,y-d/2),(x+w/2,y-d/2),(x+w/2,y+d/2),(x-w/2,y+d/2)],z-h/2,z+h/2,role,bevel)

def cylinder(name,x,y,z,r,depth,role,vertices=24):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices,radius=r,depth=depth,location=(x,y,z))
    o=bpy.context.object;o.name=name;return finish(o,role,0 if vertices==8 else .002)
# Body and grip form one continuous molded profile, paired halves and seam.
body=[(-.34,.105),(-.32,.20),(-.26,.25),(-.03,.25),(.04,.22),(.29,.17),(.34,.12),(.30,.005),(.22,-.025),(-.035,-.015),(-.045,-.10),(-.035,-.21),(-.005,-.27),(-.025,-.295),(-.13,-.285),(-.19,-.255),(-.175,-.19),(-.17,-.11),(-.18,-.015),(-.28,.005),(-.34,.045)]
profile('Body lower shell and curved grip',body,.009,.100,'LabelerOchreABS')
profile('Body parting seam',body,.100,.105,'LabelerGraphite',.002)
profile('Body upper shell and curved grip',body,.105,.198,'LabelerOchreABS')
# Trigger has its own curved edge, pivot, and an open finger space.
trigger=[(-.034,-.023),(.045,-.027),(.035,-.085),(.020,-.16),(.027,-.23),(.008,-.264),(-.015,-.248),(-.027,-.202),(-.030,-.14),(-.017,-.075)]
profile('Squeeze trigger',trigger,.040,.163,'LabelerGraphite',.006)
# Separate roll cover, paper roll and arbor. Roll axis is perpendicular to profile.
cylinder('Paper roll',-.222,.225,.104,.080,.13,'LabelerPaper',32)
# Cover wraps the rear arc, leaving the front of the roll accessible.
arc=[(-.222+r*math.cos(a),.225+r*math.sin(a)) for r, angles in [(.089,[math.radians(v) for v in range(65,216,10)]),(.077,[math.radians(v) for v in range(215,64,-10)])] for a in angles]
profile('Curved label roll cover',arc,.029,.179,'LabelerRollCover',.002)
cylinder('Roll arbor cap',-.222,.225,.181,.022,.008,'LabelerGraphite')
# Raised removable print-head service panel and selector spindle.
profile('Print head access panel',[(.075,.025),(.25,.015),(.30,.115),(.09,.166)],.199,.206,'LabelerOchreABS',.004)
box('Service latch',.172,.094,.211,.042,.021,.011,'LabelerGraphite')
cylinder('Trigger pivot',-.103,.066,.202,.023,.009,'LabelerSteel')
box('Pivot screw slot',-.103,.066,.207,.027,.003,.0015,'LabelerGraphite',0)
cylinder('Band selector stem',.020,.22,.153,.017,.22,'LabelerSteel')
cylinder('Knurled band selector',.020,.22,.275,.034,.038,'LabelerGraphite')
for i in range(16):
    a=i*math.tau/16
    cylinder('Selector knurl %02d'%i,.020+.032*math.cos(a),.22+.032*math.sin(a),.275,.003,.026,'LabelerGraphite',8)
# Six raised mechanical wheel edges, no invented logo/brand face.
for i in range(6):
    box('Price wheel %d'%i,.065+i*.028,.195,.13,.021,.042,.11,'LabelerGraphite',.003)
# Mouth is physically open: two jaws surround a recessed ink/feed roller.
for z in [.038,.168]:
    box('Dispensing jaw',.324,.083,z,.052,.098,.024,'LabelerOchreABS')
box('Mouth recessed roller',.329,.083,.103,.025,.074,.075,'LabelerGraphite')
box('Peel blade',.354,.083,.058,.012,.086,.007,'LabelerSteel',.001)
# Short blank label emerging from blade; custom bent strip with thickness.
profile('Emerging blank label',[(.35,.050),(.395,.054),(.402,.112),(.35,.118)],.060,.062,'LabelerPaper',.0005)
for x,y in [(-.285,.050),(-.147,-.236),(.256,.124)]:
    cylinder('Recessed shell fastener',x,y,.200,.009,.005,'LabelerSteel',16)
    box('Fastener slot',x,y,.203,.011,.002,.001,'LabelerGraphite',0)
# Bring the resting shell side into exact worktop contact.
meshes=[o for o in scene.objects if o.type=='MESH']
for o in meshes:
    bpy.ops.object.select_all(action='DESELECT');o.select_set(True);bpy.context.view_layer.objects.active=o
    # Apply radii for verified manifold topology and predictable export normals.
    for mod in list(o.modifiers):bpy.ops.object.modifier_apply(modifier=mod.name)
    bm=bmesh.new();bm.from_mesh(o.data);bmesh.ops.recalc_face_normals(bm,faces=bm.faces)
    assert all(e.is_manifold for e in bm.edges),o.name
    bm.to_mesh(o.data);bm.free()
    bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT');bpy.ops.uv.smart_project(island_margin=.025);bpy.ops.object.mode_set(mode='OBJECT')
    for uv in o.data.uv_layers.active.data:uv.uv *= 4
    o['material_role']=o.data.materials[0].name;o['units']='feet';o['motion']='static resting pose; parts separately editable'
min_z=min((o.matrix_world@Vector(v.co)).z for o in meshes for v in o.data.vertices)
for o in meshes:o.location.z-=min_z
for name,loc in [('anchor_worktop',(0,0,0)),('anchor_trigger_pivot',(-.103,.066,.10-min_z)),('anchor_label_exit',(.36,.083,.06-min_z))]:
    o=bpy.data.objects.new(name,None);scene.collection.objects.link(o);o.location=loc;o.empty_display_size=.025
for area in bpy.context.screen.areas:
    if area.type=='VIEW_3D':area.spaces.active.region_3d.view_distance=1.2;area.spaces.active.region_3d.view_location=(0,0,.1)
source=ROOT/'tools/models/price-label-gun.blend';out=ROOT/'public/models/price-label-gun.glb'
bpy.ops.wm.save_as_mainfile(filepath=str(source))
# Runtime joins by role; editable source keeps all physical parts.
for role in mats:
    bpy.ops.object.select_all(action='DESELECT')
    batch=[o for o in scene.objects if o.type=='MESH' and o.data.materials[0].name==role]
    for o in batch:o.select_set(True)
    bpy.context.view_layer.objects.active=batch[0]
    if len(batch)>1:bpy.ops.object.join()
    bpy.context.object.name=role+' assembly'
bpy.ops.export_scene.gltf(filepath=str(out),export_format='GLB',export_apply=True,export_yup=True)
obs=[o for o in scene.objects if o.type=='MESH'];tri=0
vs=[]
for o in obs:
    o.data.calc_loop_triangles();tri+=len(o.data.loop_triangles)
    vs += [o.matrix_world@v.co for v in o.data.vertices]
lo=[min(v[i] for v in vs) for i in range(3)];hi=[max(v[i] for v in vs) for i in range(3)]
metrics={'bytes':out.stat().st_size,'triangles':tri,'draws':len(obs),'source_mesh_parts':len(meshes),'bounds_runtime':{'min':[lo[0],lo[2],-hi[1]],'max':[hi[0],hi[2],-lo[1]]},'units':'feet','source_maps':'7 original 128x128 runtime images: five albedos, shared normal and roughness','manifold_solids':True}
out.with_suffix('.json').write_text(json.dumps(metrics,indent=2)+'\n');print(json.dumps(metrics))
