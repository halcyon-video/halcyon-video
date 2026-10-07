"""Original counter accessories. Run Blender -b -t 2 -P this file.

Store coordinates are feet, Y up and +Z customer-facing. Author with (x,-z,y).
No reference imagery, logos, fonts or downloaded geometry are embedded.
"""
from pathlib import Path
import bpy, bmesh, math, json
from mathutils import Vector, Euler

ROOT = Path(__file__).resolve().parents[2]
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
bpy.context.preferences.filepaths.save_version = 0
bpy.context.scene.unit_settings.system = 'IMPERIAL'
bpy.context.scene.unit_settings.scale_length = .3048
bpy.context.scene['provenance'] = 'Original scripted mesh authoring for Halcyon counter accessories.'
materials = {}
for name, color, rough, metal in [
    ('MugGlaze', (.025,.085,.16), .24, .03),
    ('MugAccent', (.55,.37,.09), .32, .25),
    ('MugInterior', (.78,.76,.68), .28, 0),
    ('MugFoot', (.48,.39,.27), .88, 0),
    ('TipPaper', (.65,.69,.52), .95, 0),
    ('Acrylic', (.72,.82,.87), .08, 0),
    ('TrayBoard', (.58,.51,.36), .85, 0),
]:
    m = bpy.data.materials.new(name); m.use_nodes = True
    m.diffuse_color = (*color, .18 if name == 'Acrylic' else 1)
    p = m.node_tree.nodes['Principled BSDF']
    p.inputs['Base Color'].default_value = m.diffuse_color
    p.inputs['Roughness'].default_value = rough
    p.inputs['Metallic'].default_value = metal
    if name == 'Acrylic':
        p.inputs['Alpha'].default_value = .18
        m.surface_render_method = 'DITHERED'
    materials[name] = m

def point(x,y,z): return (x,-z,y)

def mesh(name, verts, faces, role):
    data=bpy.data.meshes.new(name)
    data.from_pydata(verts,[],faces);data.update()
    obj=bpy.data.objects.new(name,data);bpy.context.collection.objects.link(obj)
    data.materials.append(materials[role])
    bm=bmesh.new();bm.from_mesh(data)
    bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=1e-7)
    bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces))
    bm.to_mesh(data);bm.free()
    return obj

def activate(obj):
    bpy.ops.object.select_all(action='DESELECT');obj.select_set(True)
    bpy.context.view_layer.objects.active=obj

def uv(obj):
    activate(obj);bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT');bpy.ops.uv.smart_project(island_margin=.015)
    bpy.ops.object.mode_set(mode='OBJECT')

def bevel(obj, width=.002, segments=2):
    activate(obj);mod=obj.modifiers.new('Finished edge','BEVEL')
    mod.width=width;mod.segments=segments
    bpy.ops.object.modifier_apply(modifier=mod.name)

def profile_x(name, yz, width, role, edge=.001):
    n=len(yz)
    vs=[point(x,y,z) for x in [-width/2,width/2] for y,z in yz]
    fs=[tuple(reversed(range(n))),tuple(range(n,2*n))]
    fs += [(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)]
    obj=mesh(name,vs,fs,role)
    if edge: bevel(obj,edge)
    return obj

def lathe(name, profile, role, n=64):
    vs=[point(r*math.cos(a*math.tau/n),y,r*math.sin(a*math.tau/n))
        for r,y in profile for a in range(n)]
    fs=[]
    for j in range(len(profile)-1):
        for i in range(n): fs.append((j*n+i,j*n+(i+1)%n,(j+1)*n+(i+1)%n,(j+1)*n+i))
    obj=mesh(name,vs,fs,role)
    for face in obj.data.polygons: face.use_smooth=True
    return obj

def tube(name, path, radius, role, sides=12):
    vs=[]
    for i,p in enumerate(path):
        tangent=Vector(path[min(i+1,len(path)-1)])-Vector(path[max(i-1,0)])
        tangent.normalize();a=tangent.cross(Vector((0,0,1))).normalized();b=tangent.cross(a).normalized()
        for j in range(sides):
            q=Vector(p)+radius*(a*math.cos(j*math.tau/sides)+b*math.sin(j*math.tau/sides))
            vs.append(point(*q))
    fs=[tuple(reversed(range(sides))),tuple(range((len(path)-1)*sides,len(path)*sides))]
    for i in range(len(path)-1):
        for j in range(sides): fs.append((i*sides+j,i*sides+(j+1)%sides,(i+1)*sides+(j+1)%sides,(i+1)*sides+j))
    obj=mesh(name,vs,fs,role)
    for face in obj.data.polygons:face.use_smooth=True
    return obj

families={}
def family(name, parts):
    col=bpy.data.collections.new(name);bpy.context.scene.collection.children.link(col)
    for o in parts:
        for c in list(o.users_collection):c.objects.unlink(o)
        col.objects.link(o);o['units']='feet';o['source']='original scripted Blender mesh'
        uv(o)
    families[name]=parts

# A continuous hollow stoneware vessel: flat inner floor, rolled rim, recessed
# unglazed foot ring. The handle is boolean-welded into the wall at both roots.
p=[(0,.012),(.103,.012),(.108,0),(.125,0),(.136,.017),(.138,.04),
   (.156,.29),(.158,.302),(.160,.320),(.165,.340),(.165,.351),(.162,.359),(.154,.362),
   (.147,.359),(.143,.351),(.144,.338),(.140,.315),(.116,.065),
   (.108,.048),(.095,.043),(0,.043)]
mug=lathe('Mug continuous body',p,'MugGlaze')
handle_path=[]
for i in range(33):
    a=-math.pi/2+math.pi*i/32
    handle_path.append((-.131-.121*math.cos(a),.190+.108*math.sin(a),0))
handle=tube('Handle before ceramic join',handle_path,.025,'MugGlaze')
activate(mug);mod=mug.modifiers.new('Fused ceramic handle roots','BOOLEAN')
mod.operation='UNION';mod.solver='EXACT';mod.object=handle
bpy.ops.object.modifier_apply(modifier=mod.name);bpy.data.objects.remove(handle,do_unlink=True)
mug.data.materials.append(materials['MugInterior']);mug.data.materials.append(materials['MugFoot'])
mug.data.materials.append(materials['MugAccent'])
for poly in mug.data.polygons:
    c=poly.center;y=c.z;r=math.hypot(c.x,c.y)
    if y<.014: poly.material_index=2
    elif .302<y<.320 and .157<r<.165 and c.x>-.165: poly.material_index=3
    elif y>.04 and r<.143 and poly.normal.dot(Vector((c.x,c.y,0)))<0:poly.material_index=1
    elif .039<y<.055:poly.material_index=1

bills=[]
for number,(cx,cz,heading,lean) in enumerate([(-.047,.025,.42,.14),(.048,-.028,-.7,-.18)]):
    vs=[];faces=[];cols=8;rows=8
    for j in range(rows+1):
        v=j/rows;y=.12+.30*v
        for i in range(cols+1):
            u=i/cols-.5;x=.068*u*2
            z=.013*abs(u*2)+.004*math.sin(v*math.pi*2+number)+lean*(y-.25)
            vs.append(point(cx+x*math.cos(heading)+z*math.sin(heading),y,
                            cz-x*math.sin(heading)+z*math.cos(heading)))
    for j in range(rows):
        for i in range(cols):
            k=j*(cols+1)+i;faces.append((k,k+1,k+cols+2,k+cols+1))
    bill=mesh('Folded generic tip note %d'%(number+1),vs,faces,'TipPaper')
    activate(bill);mod=bill.modifiers.new('Paper thickness','SOLIDIFY');mod.thickness=.00065
    bpy.ops.object.modifier_apply(modifier=mod.name);bills.append(bill)
family('tip-mug',[mug,*bills])

# Bent L support, authored in the same local coordinates as the existing QR
# insert: 1.0 by .8 feet, bottom lip y=.07, 0.2-radian lean, counter datum y=0.
lean=.2;c=math.cos(lean);s=math.sin(lean);h=.90;t=.022
def bend(y,z): return (.022+y*c+z*s,-y*s+z*c)
outline=[(0,-.310),(0,.028),(.015,.035),(.028,.037),bend(.02,-.001),
         bend(h,-.001),bend(h,-.023),bend(.02,-.023),(.035,-.016),(.032,-.310)]
holder=profile_x('Heat bent L holder',outline,1.10,'Acrylic',.0015)
lip=profile_x('Rounded insert seat',[bend(.054,.001),bend(.07,.001),bend(.07,.035),bend(.054,.035)],1.10,'Acrylic',.001)
family('acrylic-l-holder',[holder,lip])

# Tent support uses a unit-sized insert. The runtime scales width and height
# independently, with the angle preserved. Both printed inserts remain live.
a=math.radians(10);c=math.cos(a);s=math.sin(a);t=.012
tent=profile_x('Continuous bent tent shell',[(0,s+.02),(.018,s+.02),(c+.019,.007),
    (c+.022,0),(c+.019,-.007),(.018,-s-.02),(0,-s-.02),
    (0,-s-.004),(c-.012,0),(0,s+.004)],1.04,'Acrylic',.0015)
family('acrylic-tent-holder',[tent])

# Cleaner stock retains its established floor y=.35. A hollow folded riser
# supports the deck without turning the cardboard display into a solid block.
tray=profile_x('Folded tray deck and retaining lips',[(.33,-.25),(.33,.25),(.52,.25),
    (.52,.232),(.35,.232),(.35,-.231),(1.14,-.231),(1.17,-.25),
    (1.17,-.269),(.33,-.269)],2.2,'TrayBoard',.0015)
riser=profile_x('Folded hollow base riser',[(0,-.22),(0,-.205),(.318,-.205),
    (.318,.205),(0,.205),(0,.22),(.335,.22),(.335,-.22)],2.16,'TrayBoard',.001)
ends=[]
for sx in [-1,1]:
    side=profile_x('Folded end cheek '+str(sx),[(.35,-.231),(.35,.232),(.52,.232),(.57,.17),(.92,-.231)],.018,'TrayBoard',.001)
    side.location.x=sx*1.091;ends.append(side)
family('cleaner-display-tray',[tray,riser,*ends])

# Triangulated runtime geometry supplements GLB where the existing sign helper
# is synchronous. It is exported FROM these exact Blender meshes, not a second
# independently authored approximation.
geometry={};metrics={}
for name,parts in families.items():
    bpy.ops.object.select_all(action='DESELECT')
    for o in parts:o.select_set(True)
    path=ROOT/'public/models'/f'{name}.glb';path.parent.mkdir(parents=True,exist_ok=True)
    bpy.ops.export_scene.gltf(filepath=str(path),export_format='GLB',use_selection=True,
        export_yup=True,export_apply=True,export_extras=True)
    summary={'bytes':path.stat().st_size,'parts':[],'triangles':0,'provenance':'original Blender authoring'}
    if name=='acrylic-tent-holder':geometry[name]=[]
    for o in parts:
        data=o.data;data.calc_loop_triangles();bm=bmesh.new();bm.from_mesh(data)
        open_edges=sum(not e.is_manifold for e in bm.edges);bm.free()
        assert not open_edges,(name,o.name,open_edges)
        assert data.uv_layers,(name,o.name,'missing UVs')
        coords=[o.matrix_world@v.co for v in data.vertices]
        summary['parts'].append({'name':o.name,'triangles':len(data.loop_triangles),
            'manifold':True,'uv':True,'bounds_blender_ft':[[min(v[i] for v in coords),max(v[i] for v in coords)] for i in range(3)]})
        summary['triangles']+=len(data.loop_triangles)
        if name=='acrylic-tent-holder':
            pos=[];norm=[];tex=[]
            for tri in data.loop_triangles:
                for vi,li in zip(tri.vertices,tri.loops):
                    v=coords[vi];n=data.corner_normals[li].vector;uvv=data.uv_layers.active.data[li].uv
                    pos.extend([round(v.x,7),round(v.z,7),round(-v.y,7)])
                    norm.extend([round(n.x,7),round(n.z,7),round(-n.y,7)])
                    tex.extend([round(uvv.x,7),round(uvv.y,7)])
            geometry[name].append({'position':pos,'normal':norm,'uv':tex})
    metrics[name]=summary
(ROOT/'public/models/acrylic-holders.geometry.json').write_text(json.dumps(geometry,separators=(',',':'))+'\n')
(ROOT/'tools/models/counter-accessories-metrics.json').write_text(json.dumps(metrics,indent=2)+'\n')
for i,(name,parts) in enumerate(families.items()):
    for o in parts:o.location.x+=i*3
for screen in bpy.data.screens:
    for area in screen.areas:
        if area.type=='VIEW_3D':
            view=area.spaces.active.region_3d;view.view_location=Vector((4.5,0,.4));view.view_distance=14
            view.view_rotation=Euler((math.radians(68),0,math.radians(18)),'XYZ').to_quaternion()
bpy.ops.object.select_all(action='SELECT')
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'tools/models/counter-accessories.blend'))
print(json.dumps(metrics,indent=2))
