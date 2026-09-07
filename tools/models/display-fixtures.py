"""Original display-family millwork, authored with Blender meshes.
Run: blender -b -t 2 --python tools/models/display-fixtures.py
Feet; helpers accept store (x, height, z), exported Y-up. No reference-derived art.
"""
import bpy, bmesh, math, json
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'public/models'
MATS={}
PARTS=[]
REPORT={}
bpy.context.preferences.filepaths.save_version=0

def reset():
    global PARTS
    bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
    PARTS=[]

def material(name,color,rough=.55):
    if name in MATS:return MATS[name]
    m=bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.diffuse_color=(*color,1);m.use_nodes=True
    n=m.node_tree.nodes.get('Principled BSDF');n.inputs['Base Color'].default_value=(*color,1);n.inputs['Roughness'].default_value=rough
    MATS[name]=m;return m

for name,col in [('DisplayBody',(.018,.085,.46)),('DisplayShelf',(.9,.92,.94)),('DisplayTrim',(.85,.58,.045)),('DisplayHardware',(.055,.065,.085)),('DisplayBed',(.045,.033,.025))]:material(name,col)

def mesh(name,verts,faces,role,bevel=0):
    data=bpy.data.meshes.new(name)
    data.from_pydata([(x,-z,y) for x,y,z in verts],[],faces);data.update()
    o=bpy.data.objects.new(name,data);bpy.context.collection.objects.link(o);data.materials.append(MATS[role])
    bpy.context.view_layer.objects.active=o;o.select_set(True)
    bm=bmesh.new();bm.from_mesh(data);bmesh.ops.recalc_face_normals(bm,faces=bm.faces);bm.to_mesh(data);bm.free()
    if bevel:
        mod=o.modifiers.new('Eased manufactured edges','BEVEL');mod.width=bevel;mod.segments=2
        bpy.ops.object.modifier_apply(modifier=mod.name)
    # Per-face box projection, scaled in feet; front panels use normalized height.
    uv=data.uv_layers.new(name='FinishUV')
    for p in data.polygons:
        n=p.normal;axis=max(range(3),key=lambda i:abs(n[i]))
        for li in p.loop_indices:
            co=data.vertices[data.loops[li].vertex_index].co
            a,b=((co.x,co.z) if axis==1 else ((co.x,co.y) if axis==2 else (co.y,co.z)))
            uv.data[li].uv=(a/2.16+.5,b/4.6)
    bm=bmesh.new();bm.from_mesh(data)
    assert all(e.is_manifold for e in bm.edges),name+' nonmanifold'
    bm.free();o.select_set(False);PARTS.append(o);return o

def extrude(name,profile,width,role,bevel=.008,x=0):
    # Profile is (height, store-z); solid, fitted cut ends.
    n=len(profile);v=[(sx+x,y,z) for sx in [-width/2,width/2] for y,z in profile]
    f=[tuple(range(n-1,-1,-1)),tuple(range(n,2*n))]
    f += [(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)]
    return mesh(name,v,f,role,bevel)

def box(name,x,y,z,w,h,d,role,bevel=.01):
    return extrude(name,[(y-h/2,z-d/2),(y+h/2,z-d/2),(y+h/2,z+d/2),(y-h/2,z+d/2)],w,role,bevel,x)

def rounded_ring(a,r=.06,n=4):
    return [(sx*(a-r)+r*math.cos(t),sz*(a-r)+r*math.sin(t)) for sx,sz,start in [(1,1,0),(-1,1,90),(-1,-1,180),(1,-1,270)] for t in [math.radians(start+k*90/n) for k in range(n+1)]]

def vessel(name,profiles,role,cap=True):
    # Welded perimeter rings; a closed profile can form a hollow rim, open profile caps a solid.
    rings=[[(x,y,z) for x,z in rounded_ring(a,r)] for y,a,r in profiles];n=len(rings[0]);v=sum(rings,[])
    f=[(j*n+i,j*n+(i+1)%n,(j+1)*n+(i+1)%n,(j+1)*n+i) for j in range(len(rings)-1) for i in range(n)]
    if cap:f += [tuple(range(n-1,-1,-1)),tuple((len(rings)-1)*n+i for i in range(n))]
    else:f += [((len(rings)-1)*n+i,(len(rings)-1)*n+(i+1)%n,(i+1)%n,i) for i in range(n)]
    return mesh(name,v,f,role)

def rotate_parts(start,angle):
    for o in PARTS[start:]:
        # Blender Z rotation is the store's Y rotation.
        o.rotation_euler.z=angle

def underside(y,zc,lean,z):
    return y - .035/math.cos(lean) - (z-zc)*math.tan(lean)

def shelf(name,y,zc,width,lean,role='DisplayShelf'):
    # Continuous folded/eased nosing, not an applied floating strip.
    p=[(-.035,-.25),(.015,-.25),(.015,.216),(.055,.222),(.065,.240),(.049,.25),(-.025,.25),(-.035,.235)]
    c,s=math.cos(lean),math.sin(lean)
    p=[(y+dy*c-dz*s,zc+dy*s+dz*c) for dy,dz in p]
    return extrude(name,p,width,role,.005)

def endcap(taper=True):
    reset();width=lambda y:2.16-(.9*y/5.1 if taper else 0)
    # A single continuous routed panel, grooves cut into its front surface.
    levels=[(.18,.07)]
    for j in range(1,19):
        y=j*.25
        if .18 < y-.025 and y+.02<4.564:levels.extend([(y-.025,.07),(y-.018,.044),(y+.009,.044),(y+.019,.07)])
    levels.append((4.564,.07))
    verts=[]
    for y,z in levels:
        w=width(y)/2
        verts.extend([(-w,y,-.07),(w,y,-.07),(w,y,z),(-w,y,z)])
    faces=[(3,2,1,0)]
    for i in range(len(levels)-1):faces.extend([(i*4+k,i*4+(k+1)%4,(i+1)*4+(k+1)%4,(i+1)*4+k) for k in range(4)])
    faces.append(tuple(range((len(levels)-1)*4,len(levels)*4)))
    mesh('Routed slatwall carcass',verts,faces,'DisplayBody',.003)
    # Cap fits inside the run's terminal envelope.
    box('Crown cap',0,4.582,0,width(4.6),.036,.14,'DisplayHardware',.008)
    box('Base shoe',0,.09,0,2.16,.18,.14,'DisplayTrim',.015)
    for row,y in enumerate([1.5,2.6,3.7]):
        w=max(width(y)-.12,1.62)
        shelf(f'Shelf {row+1} with eased retaining nose',y,.32,w,-.2)
        # Triangular stamped bracket seats underneath each deck and into panel.
        for x in [-w*.32,w*.32]:
            extrude(f'Shelf {row+1} bracket {x:+.2f}',[(underside(y,.32,-.2,.055),.055),(y-.30,.055),(underside(y,.32,-.2,.50),.50)],.038,'DisplayHardware',.006,x)
    export('genre-endcap-'+('tapered' if taper else 'straight'))

def tub():
    reset()
    # One watertight molded shell: underside, outside, lip return, inside, solid bottom.
    vessel('Continuous tub shell and interior',[(.13,1.19,.085),(.17,1.219,.085),(2.58,1.487,.09),(2.64,1.48,.085),(2.64,1.40,.08),(.30,1.14,.06),(.25,1.13,.06)],'DisplayBody')
    vessel('Rolled rim',[(2.53,1.482,.09),(2.60,1.5,.10),(2.665,1.493,.095),(2.70,1.46,.08),(2.70,1.414,.07),(2.672,1.394,.07),(2.61,1.397,.07),(2.54,1.412,.07)],'DisplayTrim',False)
    vessel('Recessed base bumper',[(.14,1.19,.085),(.23,1.23,.085),(.32,1.24,.085),(.34,1.224,.085),(.32,1.19,.07)],'DisplayTrim',False)
    # A removable stock bed supported within the shell; keeps the pile visibly full.
    vessel('Recessed product bed',[(1.94,1.386,.065),(1.98,1.389,.065)],'DisplayBed')
    for x in [-.99,.99]:
        for z in [-.99,.99]:box('Recessed rubber glide',x,.065,z,.24,.13,.24,'DisplayHardware',.035)
    export('bargain-tub')

def tower(width=2,heights=(1.5,2.4,3.3),height=4,lean=-.25):
    reset()
    vessel('Fitted four-face cabinet',[(.19,width/2-.055,.025),(height-.045,width/2-.15,.025)],'DisplayBody')
    vessel('Stepped plinth with recessed toe',[(.02,width/2-.085,.035),(.12,width/2-.085,.035),(.14,width/2+.015,.045),(.22,width/2+.03,.045),(.27,width/2,.035)],'DisplayHardware')
    vessel('Crown collar',[(height-.34,width/2-.132,.025),(height-.20,width/2-.128,.025)],'DisplayTrim')
    vessel('Topper mounting cap',[(height-.045,width/2-.15,.025),(height-.015,width/2,.025),(height,width/2,.025)],'DisplayHardware')
    for face in range(4):
        start=len(PARTS)
        for i,y in enumerate(heights):
            shelf(f'Face {face+1} tray {i+1}',y,width/2+.25,width-.2,lean)
            # The visible raked rear support follows the cases, below their back plane.
            h=.68;z=width/2+.25
            p=[(y+.01,z-.20),(y+h,z-.20+h*math.tan(lean)),(y+h,z-.24+h*math.tan(lean)),(y+.01,z-.24)]
            extrude(f'Face {face+1} raked back {i+1}',p,width-.26,'DisplayBody',.005)
            for x in [-width*.30,width*.30]:
                extrude(f'Face {face+1} tray bracket {i+1}',[(underside(y,width/2+.25,lean,width/2-.16),width/2-.16),(y-.32,width/2-.16),(underside(y,width/2+.25,lean,width/2+.46),width/2+.46)],.045,'DisplayHardware',.005,x)
        rotate_parts(start,face*math.pi/2)
    export('four-sided-merchandiser')

def export(name,out=OUT,source=None):
    out.mkdir(parents=True,exist_ok=True)
    # Save the editable, named physical parts before merging by material for runtime.
    for o in PARTS:o.select_set(True)
    bpy.context.view_layer.objects.active=PARTS[0]
    for a in bpy.context.screen.areas:
        if a.type=='VIEW_3D':a.spaces.active.region_3d.view_distance=8
    bpy.ops.wm.save_as_mainfile(filepath=str((source or ROOT/'tools/models')/f'{name}.blend'))
    bpy.ops.object.join();o=bpy.context.object;o.name=name
    # Joining retains named finish roles but exports one primitive per role.
    bpy.ops.export_scene.gltf(filepath=str(out/f'{name}.glb'),export_format='GLB',use_selection=True,export_yup=True,export_texcoords=True,export_normals=True,export_materials='EXPORT',export_cameras=False,export_lights=False)
    o.data.calc_loop_triangles()
    corners=[o.matrix_world@v.co for v in o.data.vertices]
    REPORT[name]={'triangles':len(o.data.loop_triangles),'vertices':len(o.data.vertices),'material_roles':sorted(set(m.name for m in o.data.materials)),'bytes':(out/f'{name}.glb').stat().st_size,'bounds_blender':[[round(min(v[i] for v in corners),5),round(max(v[i] for v in corners),5)] for i in range(3)]}

if __name__=='__main__':
    endcap(True);endcap(False);tub();tower()
    (ROOT/'tools/models/display-fixtures-metrics.json').write_text(json.dumps(REPORT,indent=2)+'\n')
