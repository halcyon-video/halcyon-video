"""Original, unbranded spiral dispenser. Blender mesh authoring; units are feet.
Run: blender --background --python tools/models/gumball-machine.py
The public design uses a barrel hopper and squat plinth, not a measured replica.
"""
import bpy, bmesh, math, os, random, json
ROOT=os.path.abspath(os.path.join(os.path.dirname(__file__),'../..'))

def material(name, color, metal=0, rough=.28):
    m=bpy.data.materials.new(name);m.diffuse_color=(*color,1);m.use_nodes=True
    p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*color,1)
    p.inputs['Metallic'].default_value=metal;p.inputs['Roughness'].default_value=rough
    return m

def make_mesh(name, vertices, faces, mat):
    me=bpy.data.meshes.new(name);me.from_pydata(vertices,[],faces);me.update()
    bm=bmesh.new();bm.from_mesh(me);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces))
    assert all(e.is_manifold for e in bm.edges), name+' is not a closed solid'
    bm.to_mesh(me);bm.free()
    o=bpy.data.objects.new(name,me);bpy.context.collection.objects.link(o);me.materials.append(mat)
    for p in me.polygons:p.use_smooth=True
    bpy.ops.object.select_all(action='DESELECT');o.select_set(True);bpy.context.view_layer.objects.active=o
    bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT');bpy.ops.uv.smart_project(island_margin=.025);bpy.ops.object.mode_set(mode='OBJECT')
    return o

def lathe(name,profile,mat,segments=64):
    verts=[];rings=[];faces=[]
    for r,z in profile:
        if r==0:rings.append([len(verts)]);verts.append((0,0,z))
        else:
            rings.append(list(range(len(verts),len(verts)+segments)))
            verts += [(r*math.cos(i*math.tau/segments),r*math.sin(i*math.tau/segments),z) for i in range(segments)]
    for j in range(len(rings)-1):
        a,b=rings[j],rings[j+1]
        for i in range(segments):
            k=(i+1)%segments
            faces.append((a[0],b[k],b[i]) if len(a)==1 else (a[i],a[k],b[0]) if len(b)==1 else (a[i],a[k],b[k],b[i]))
    # Hollow ring profiles close back onto their first cross-section.
    if len(rings[0])>1 and len(rings[-1])>1:
        for i in range(segments):k=(i+1)%segments;faces.append((rings[-1][i],rings[-1][k],rings[0][k],rings[0][i]))
    return make_mesh(name,verts,faces,mat)

def box(name,loc,size,mat,bevel=.018):
    bpy.ops.mesh.primitive_cube_add(size=1,location=loc);o=bpy.context.object;o.name=name;o.dimensions=size
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    o.data.materials.append(mat)
    mod=o.modifiers.new('Rolled edges','BEVEL');mod.width=bevel;mod.segments=3;bpy.ops.object.modifier_apply(modifier=mod.name)
    bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT');bpy.ops.uv.smart_project(island_margin=.02);bpy.ops.object.mode_set(mode='OBJECT')
    return o

def build(config=None,output=None,source=None):
    config=config or {}
    bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
    enamel=material('Enamel',(.018,.12,.38),.12,.22)
    chrome=material('Chrome',(.56,.62,.66),.82,.18)
    dark=material('Mechanism',(.022,.027,.031),.2,.48)
    clear=material('ClearPlastic',(.82,.93,1),0,.12)
    clear.diffuse_color=(.82,.93,1,.13)
    p=clear.node_tree.nodes.get('Principled BSDF');p.inputs['Alpha'].default_value=.13
    clear.surface_render_method='DITHERED'
    base=config.get('base',[(0,.015),(.87,.015),(.93,.06),(.93,.16),(.85,.23),(.57,.28),(.49,.55),(0,.55)])
    lathe('Foot plinth',base,enamel)
    lo,hi=config.get('tube_height',(.57,2.5))
    r=config.get('tube_radius',.43)
    lathe('Clear chute sleeve',[(r,lo),(r,hi),(r-.016,hi),(r-.016,lo)],clear)
    for h in [lo,hi-.06]:lathe('Sleeve retaining collar',[(0,h),(.52,h),(.52,h+.055),(0,h+.055)],chrome)
    lathe('Chute floor',[(0,lo+.055),(.46,lo+.055),(.46,lo+.085),(0,lo+.085)],enamel)
    # A closed helical trough with raised outer lip, not a wire coil.
    turns=config.get('turns',5)
    profile=[(.12,-.014),(.405,-.014),(.43,.018),(.43,.095),(.409,.095),(.409,.025),(.14,.025),(.14,.072),(.12,.072)]
    verts=[];faces=[];steps=turns*56
    for i in range(steps+1):
        t=i/steps;a=t*math.tau*turns+math.pi/2;z=lo+.18+(hi-lo-.3)*t
        verts.extend([(rr*(r-.055)/.43*math.cos(a),rr*(r-.055)/.43*math.sin(a),z+hh) for rr,hh in profile])
    n=len(profile)
    for i in range(steps):
        for j in range(n):k=(j+1)%n;faces.append((i*n+j,i*n+k,(i+1)*n+k,(i+1)*n+j))
    faces += [tuple(reversed(range(n))),tuple(steps*n+j for j in range(n))]
    make_mesh('Continuous spiral raceway',verts,faces,clear)
    bodylo,bodyhi=config.get('body_height',(2.55,3.23))
    if config.get('body_profile'):lathe('Coin housing',config['body_profile'],enamel)
    else:box('Rounded coin cabinet',(0,0,(bodylo+bodyhi)/2),(1.12,1.12,bodyhi-bodylo),enamel,.10)
    lathe('Hopper seating ring',[(0,bodyhi-.02),(.68,bodyhi-.02),(.7,bodyhi+.045),(0,bodyhi+.045)],dark)
    outer=config.get('hopper',[(.66,3.28),(.83,3.4),(.90,3.58),(.90,4.87),(.83,5.05),(.66,5.18)])
    shell=outer+[(r-.016,z) for r,z in reversed(outer)]
    lathe('Clear hopper shell',shell,clear)
    lathe('Lid rim',[(0,5.19),(.69,5.19),(.71,5.23),(.70,5.27),(0,5.27)],chrome)
    lathe('Domed locking lid',[(0,5.27),(.69,5.27),(.65,5.33),(.54,5.40),(.34,5.46),(.12,5.48),(0,5.48)],enamel)
    lathe('Lid lock',[(0,5.48),(.045,5.48),(.045,5.5),(0,5.5)],chrome,24)
    lathe('Hopper tie rod',[(0,3.29),(.019,3.29),(.019,5.19),(0,5.19)],chrome,12)
    # The coin face and bottom delivery door both face store-local +Z (Blender -Y).
    cy=config.get('coin_front',-.59)
    h=(bodylo+bodyhi)/2
    box('Mechanism backing',(0,cy+.012,h),(.40,.052,.53),dark)
    box('Coin mechanism',(0,cy-.016,h),(.37,.052,.50),chrome)
    box('Coin slot',(0,cy-.047,h+.154),(.10,.014,.022),dark,.005)
    box('Turn handle',(0,cy-.105,h-.046),(.255,.108,.059),chrome,.018)
    for x in [-.148,.148]:
        for z in [h-.205,h+.205]:
            o=lathe('Screw',[(0,0),(.015,0),(.015,.012),(0,.012)],chrome,12);o.rotation_euler.x=math.pi/2;o.location=(x,cy-.05,z)
    box('Delivery recess',(0,-.57,.43),(.235,.10,.25),dark)
    box('Delivery flap',(0,-.628,.45),(.19,.035,.19),chrome,.015)
    colors=[(.85,.045,.045),(1,.59,.035),(.95,.86,.035),(.13,.60,.08),(.02,.60,.83),(.96,.32,.56),(.94,.91,.80)]
    gums=[material('Gum'+str(i),c,0,.24) for i,c in enumerate(colors)]
    rng=random.Random(729)
    for layer in range(6):
        z=3.4+layer*.115
        radius=config.get('fill_radii',[.77]*6)[layer]
        for iy in range(-10,11):
            for ix in range(-10,11):
                x=(ix+.5*(iy%2))*.112;y=iy*.097
                if x*x+y*y>radius*radius or x*x+y*y<.035**2:continue
                bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2,radius=rng.uniform(.047,.051),location=(x+rng.uniform(-.006,.006),y+rng.uniform(-.006,.006),z+rng.uniform(-.012,.012)))
                o=bpy.context.object;o.name='Gumball';o.rotation_euler=(rng.random()*math.tau,rng.random()*math.tau,rng.random()*math.tau);o.data.materials.append(rng.choice(gums))
                for f in o.data.polygons:f.use_smooth=True
                bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT');bpy.ops.uv.smart_project(island_margin=.02);bpy.ops.object.mode_set(mode='OBJECT')
    scene=bpy.context.scene;scene.unit_settings.system='IMPERIAL';scene.unit_settings.scale_length=.3048
    bpy.context.preferences.filepaths.save_version=0
    for a in bpy.data.screens:
        for area in a.areas:
            if area.type=='VIEW_3D':area.spaces.active.region_3d.view_distance=8;area.spaces.active.region_3d.view_location=(0,0,2.75)
    os.makedirs(os.path.dirname(source),exist_ok=True);os.makedirs(os.path.dirname(output),exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=source)
    # Export one mesh per finish, keeping transparent hopper and raceway separate.
    for mat in list(bpy.data.materials):
        if mat==clear:continue
        objects=[o for o in scene.objects if o.type=='MESH' and o.data.materials and o.data.materials[0]==mat]
        if len(objects)<2:continue
        bpy.ops.object.select_all(action='DESELECT')
        for o in objects:o.select_set(True)
        bpy.context.view_layer.objects.active=objects[0];bpy.ops.object.join();bpy.context.object.name=mat.name+' parts'
    bpy.ops.export_scene.gltf(filepath=output,export_format='GLB',export_yup=True,export_texcoords=True)
    triangles=sum(sum(len(p.vertices)-2 for p in o.data.polygons) for o in scene.objects if o.type=='MESH')
    print(json.dumps({'file':output,'bytes':os.path.getsize(output),'triangles':triangles,'meshes':sum(o.type=='MESH' for o in scene.objects)}))

if __name__=='__main__':
    build(output=os.path.join(ROOT,'public/models/gumball-machine.glb'),source=os.path.join(ROOT,'tools/models/gumball-machine.blend'))
