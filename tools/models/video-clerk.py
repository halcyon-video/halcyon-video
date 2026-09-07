"""Original Halcyon clerk, authored as fitted meshes in Blender.

blender -b -t 4 --python tools/models/video-clerk.py -- --preview
blender -b -t 4 --python tools/models/video-clerk.py -- --render

Feet, Z up, facing -Y. Orthographic cells retain the existing 256x384,
16-column / 5-direction sprite contract. The neutral polo has a separate
occlusion-correct livery mask so every store can supply its own uniform color.
No external models, textures, fonts or character likenesses are used.
"""
import bpy
import math
import json
import sys
import subprocess
from pathlib import Path
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'scratch/clerk-render'
OUT.mkdir(parents=True, exist_ok=True)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
for mat in list(bpy.data.materials):
    bpy.data.materials.remove(mat)

def material(name, color, rough=.6, metallic=0):
    m = bpy.data.materials.new(name)
    m.diffuse_color = (*color, 1)
    m.use_nodes = True
    p = m.node_tree.nodes.get('Principled BSDF')
    p.inputs['Base Color'].default_value = (*color, 1)
    p.inputs['Roughness'].default_value = rough
    p.inputs['Metallic'].default_value = metallic
    return m

skin = material('Warm peach skin', (.64, .345, .205), .66)
hair = material('Chestnut bob', (.075, .031, .018), .62)
hair_light = material('Soft chestnut highlights', (.105, .046, .025), .66)
hair_dark = material('Hair part and lashes', (.024, .009, .006), .6)
polo = material('Uniform - replaceable livery', (.7, .7, .7), .82)
khaki = material('Sand cotton twill', (.39, .28, .16), .86)
seam = material('Trouser stitch', (.27, .18, .105), .85)
shoe = material('Charcoal canvas sneakers', (.025, .03, .032), .8)
sole = material('Cream rubber sole', (.58, .55, .46), .8)
white = material('Warm ivory', (.89, .85, .75), .55)
iris = material('Hazel iris', (.19, .085, .025), .4)
pupil = material('Pupil', (.009, .005, .003), .25)
lip = material('Muted rose lips', (.36, .092, .071), .72)
blush = material('Cheek warmth', (.63, .255, .175), .85)
nail = material('Natural fingernails', (.76, .49, .36), .76)
gold = material('Brass fastenings', (.48, .30, .075), .4, .65)
belt = material('Brown leather belt', (.061, .027, .014), .65)
case_mat = material('Midnight video case', (.021, .041, .047), .55)

def mesh(name, vertices, faces, mat, parent=None, sub=1):
    data = bpy.data.meshes.new(name)
    data.from_pydata(vertices, [], faces)
    data.update()
    obj = bpy.data.objects.new(name, data)
    bpy.context.collection.objects.link(obj)
    obj.data.materials.append(mat)
    for p in data.polygons:
        p.use_smooth = True
    if parent:
        obj.parent = parent
    if sub:
        mod = obj.modifiers.new('Tailored smooth surface', 'SUBSURF')
        mod.levels = sub
    return obj

def empty(name, at, parent=None):
    o = bpy.data.objects.new(name, None)
    bpy.context.collection.objects.link(o)
    o.location = at
    o.parent = parent
    o.empty_display_size = .10
    return o

root = empty('Clerk - heading', (0, 0, 0))
body = empty('Body - breathing and crouch', (0, 0, 0), root)
head = empty('Head - attentive tilt', (0, 0, 4.24), body)

def rings(name, profile, mat, parent=body, n=32, sub=2):
    # profile: z, x radius, y radius, y center, x center (optional)
    vertices = []
    for row in profile:
        z, rx, ry, cy = row[:4]
        cx = row[4] if len(row) > 4 else 0
        for k in range(n):
            a = k * math.tau / n
            vertices.append((cx + rx*math.cos(a), cy + ry*math.sin(a), z))
    faces = [tuple(reversed(range(n)))]
    for j in range(len(profile)-1):
        for k in range(n):
            a=j*n+k; b=j*n+(k+1)%n
            faces.append((a,b,b+n,a+n))
    faces.append(tuple((len(profile)-1)*n+k for k in range(n)))
    return mesh(name, vertices, faces, mat, parent, sub)

def ellipsoid(name, at, scale, mat, parent=body, n=32, m=20):
    # Latitudinal quad surface; small capped poles keep the topology closed.
    profile=[]
    for j in range(m+1):
        a=.002+(math.pi-.004)*j/m
        profile.append((at[2]-scale[2]*math.cos(a), scale[0]*math.sin(a),
                        scale[1]*math.sin(a), at[1], at[0]))
    return rings(name, profile, mat, parent, n, 1)

def tube(name, pts, radii, mat, parent=body, sides=12):
    verts=[]
    for i, p in enumerate(pts):
        tangent=Vector(pts[min(i+1,len(pts)-1)])-Vector(pts[max(0,i-1)])
        tangent.normalize()
        u=tangent.cross(Vector((0,1,0)))
        if u.length < .1: u=tangent.cross(Vector((1,0,0)))
        u.normalize(); v=tangent.cross(u).normalized()
        r=radii[i] if isinstance(radii,list) else radii
        rx,ry = r if isinstance(r,tuple) else (r,r)
        for k in range(sides):
            a=math.tau*k/sides
            verts.append(Vector(p)+u*math.cos(a)*rx+v*math.sin(a)*ry)
    faces=[tuple(reversed(range(sides)))]
    for j in range(len(pts)-1):
        for k in range(sides):
            a=j*sides+k; b=j*sides+(k+1)%sides
            faces.append((a,b,b+sides,a+sides))
    faces.append(tuple((len(pts)-1)*sides+k for k in range(sides)))
    return mesh(name,verts,faces,mat,parent,1)

def line(name, pts, width, mat, parent=body):
    return tube(name, pts, width, mat, parent, 8)

def patch(name, vertices, mat, parent=body, thickness=.014):
    o=mesh(name,vertices,[tuple(range(len(vertices)))],mat,parent,0)
    s=o.modifiers.new('Fabric thickness','SOLIDIFY'); s.thickness=thickness
    b=o.modifiers.new('Soft finished edge','BEVEL'); b.width=.015; b.segments=3
    return o

def rounded_box(name, at, scale, mat, parent=body, bevel=.04):
    x,y,z=scale
    vertices=[(at[0]+a*x/2,at[1]+b*y/2,at[2]+c*z/2)
              for a,b,c in [(-1,-1,-1),(-1,-1,1),(-1,1,-1),(-1,1,1),(1,-1,-1),(1,-1,1),(1,1,-1),(1,1,1)]]
    faces=[(0,4,6,2),(1,3,7,5),(0,1,5,4),(2,6,7,3),(0,2,3,1),(4,5,7,6)]
    o=mesh(name,vertices,faces,mat,parent,0)
    m=o.modifiers.new('Rounded manufactured edges','BEVEL');m.width=bevel;m.segments=3
    return o

# The polo is one contoured surface, with sewn collar leaves and placket.
rings('Polo body',[(2.49,.33,.20,0),(2.51,.39,.235,0),(2.63,.40,.245,0),
 (2.91,.34,.235,0),(3.19,.365,.26,-.01),(3.44,.44,.28,-.015),
 (3.66,.49,.225,.015),(3.78,.40,.185,.02),(3.91,.19,.155,.015)],polo)
rings('Neck',[(3.73,.155,.14,.018),(3.95,.155,.14,.018),(4.29,.17,.15,.025)],skin)
for side in [-1,1]:
    patch('Polo collar leaf',[(side*.05,-.158,3.97),(side*.24,-.13,3.82),
          (side*.25,-.24,3.61),(side*.045,-.25,3.77)],polo)
rounded_box('Polo button placket',(0,-.266,3.59),(.075,.024,.35),polo,bevel=.014)
for z in [3.67,3.54]: ellipsoid('Polo button',(0,-.285,z),(.017,.014,.017),white)
rounded_box('Name badge',(-.245,-.272,3.40),(.27,.039,.13),white,bevel=.025)
rounded_box('Badge brass clip',(-.245,-.3,3.465),(.06,.014,.03),gold,bevel=.008)
for x, width in [(-.25,.14),(-.275,.09)]:
    rounded_box('Badge embossed rule',(x,-.295,3.40 if width==.14 else 3.365),(width,.009,.012),case_mat,bevel=.004)
seat=rings('Trouser seat',[(2.12,.27,.19,.02),(2.30,.405,.245,.02),(2.47,.40,.25,.015),(2.56,.37,.24,0)],khaki)
rings('Leather belt',[(2.47,.401,.247,0),(2.49,.405,.25,0),(2.56,.385,.245,0),(2.575,.377,.24,0)],belt,sub=1)
rounded_box('Belt buckle',(0,-.253,2.525),(.17,.045,.115),gold,bevel=.022)
rounded_box('Buckle opening',(0,-.279,2.525),(.105,.011,.06),belt,bevel=.01)
for side in [-1,1]:
    line('Slanted pocket opening',[(side*.37,-.105,2.45),(side*.355,-.19,2.34),(side*.30,-.23,2.24)],.012,seam)
    rounded_box('Back welt pocket',(side*.205,.248,2.34),(.22,.018,.018),seam,bevel=.008)

# Sculpted chin, cheeks and forehead, rather than an unshaped sphere.
rings('Face and cranium',[(-.30,.10,.13,-.017),(-.265,.19,.20,-.012),
 (-.17,.29,.26,0),(-.02,.365,.285,.005),(.17,.38,.275,.02),
 (.35,.37,.28,.025),(.50,.31,.255,.035),(.61,.18,.17,.045),(.65,.02,.03,.05)],skin,head,48,2)
for s in [-1,1]:
    ellipsoid('Ear',(s*.37,.015,.05),(.087,.076,.135),skin,head)
    ellipsoid('Ear concha',(s*.411,-.037,.05),(.038,.026,.068),blush,head)
    ellipsoid('Tiny brass stud',(s*.405,-.042,-.033),(.031,.025,.033),gold,head)
    # Almond white, warm iris, defined upper lash and tiny catchlight.
    eye=ellipsoid('Almond eye',(s*.155,-.258,.20),(.114,.043,.079),white,head)
    eye.rotation_euler.y=s*.06
    ellipsoid('Hazel iris',(s*.15,-.298,.20),(.046,.018,.057),iris,head)
    ellipsoid('Pupil',(s*.148,-.313,.201),(.024,.009,.038),pupil,head)
    ellipsoid('Eye catchlight',(s*.148-.012,-.322,.224),(.012,.006,.015),white,head)
    line('Upper eyelid',[(s*.046,-.272,.21),(s*.105,-.293,.271),
         (s*.18,-.293,.282),(s*.254,-.253,.237)],.014,hair_dark,head)
    line('Outer eyelash',[(s*.24,-.262,.25),(s*.282,-.238,.27)],.012,hair_dark,head)
    line('Expressive eyebrow',[(s*.064,-.248,.365),(s*.14,-.269,.392),
         (s*.22,-.252,.382),(s*.27,-.225,.35)],.021,hair,head)
    # Sit the warmth on the cheek surface.  The old centre was almost half an
    # inch in front of the face, which made the mark detach in three-quarter
    # and profile frames instead of reading as skin colour.
    ellipsoid('Soft cheek',(s*.258,-.194,.035),(.040,.006,.021),blush,head)
    for k in range(3):
        ellipsoid('Freckle',(s*(.211+k*.03),-.218+k*.021,.082+(k%2)*.015),(.006,.005,.005),hair_light,head,n=12,m=8)
# Soft bridge and a rounded nose tip with two restrained nostril marks.
ellipsoid('Nose bridge',(0,-.276,.10),(.044,.050,.105),skin,head)
ellipsoid('Nose tip',(0,-.319,.045),(.063,.045,.046),skin,head)
for s in [-1,1]: ellipsoid('Nostril',(s*.032,-.346,.025),(.017,.01,.009),lip,head)
line('Friendly smile',[(-.116,-.241,-.116),(-.065,-.268,-.15),(0,-.28,-.159),(.065,-.268,-.15),(.116,-.241,-.116)],.011,lip,head)
line('Lower lip',[(-.063,-.262,-.174),(0,-.273,-.184),(.063,-.262,-.174)],.012,lip,head)
mouth_open=ellipsoid('Speaking mouth',(0,-.277,-.15),(.07,.015,.039),lip,head)

# A bob built as a continuous cap with a shaped face opening and turned-under
# hem.  Keep the crown close to the skull and slightly flatter at the rear: the
# first pass used an almost spherical shell plus eight rope-like side locks,
# which read as a glossy helmet at sprite scale.
verts=[]; faces=[]; hn=64; hm=18
for j in range(hm+1):
    t=j/hm
    for k in range(hn):
        a=math.tau*k/hn
        front=max(0,-math.sin(a))
        edge=2.48-1.25*(front**.40)
        theta=.003+t*edge
        x=.405*math.sin(theta)*math.cos(a)
        y=.035+.315*math.sin(theta)*math.sin(a)
        z=.245+.475*math.cos(theta)
        # Bob length on the sides and rear; open face and nape remain shaped.
        z-=.17*(t**5)*(1-front**.4)
        verts.append((x,y,z))
for j in range(hm):
    for k in range(hn):
        a=j*hn+k;b=j*hn+(k+1)%hn;faces.append((a,b,b+hn,a+hn))
cap=mesh('Sculpted bob cap',verts,faces,hair,head,2)
solid=cap.modifiers.new('Hair volume','SOLIDIFY');solid.thickness=.04
# Broad tapered locks follow the scalp and tuck under, with deliberate parting.
for i in range(4):
    shift=i*.054
    pts=[(.15+shift*.12,-.06,.717),(.07-shift*.30,-.235,.63),
         (-.08-shift*.55,-.324,.50),(-.23-shift*.37,-.30,.365),(-.315-shift*.12,-.23,.24)]
    tube('Side swept fringe',pts,[(.018,.014),(.046,.024),(.052,.030),(.038,.026),(.006,.007)],hair if i%3 else hair_light,head,12)
for s in [-1,1]:
    for i in range(2):
        y=-.13+i*.16
        tube('Bob side lock',[(s*.30,y,.54),(s*.398,y-.012,.34),(s*.418,y,.06),
             (s*.398,y+.014,-.20),(s*.335,y+.022,-.285)],
             [(.018,.026),(.034,.044),(.037,.047),(.034,.042),(.009,.013)],hair if i else hair_light,head)
line('Hair part',[(.13,.025,.742),(.16,-.085,.70),(.19,-.18,.62)],.009,hair_dark,head)

# Named joint pivots make all poses editable. Each clothed limb is a single
# continuous ring mesh, deformed around its elbow/knee by the pose authoring.
limbs=[]
hands=[]
feet=[]
def limb_geometry(name, start, joint, end, radii, mat):
    a,b,c=map(Vector,[start,joint,end])
    ts=[0,.07,.26,.48,.64,.82,1]
    pts=[a.lerp(b,t) for t in ts]+[b.lerp(c,t) for t in ts[1:]]
    return tube(name,pts,radii,mat,root,16)

for s in [-1,1]:
    # Sleeve belongs to the moving arm pivot, finished at a sewn cuff.
    pivot=empty(('Left' if s<0 else 'Right')+' shoulder',(s*.435,.015,3.65),body)
    sleeve=rings('Polo sleeve',[(.07,.18,.17,0),(.0,.205,.185,0),(-.18,.18,.17,0),
           (-.41,.14,.145,0),(-.43,.14,.145,0)],polo,pivot,32,2)
    hand=empty(('Left' if s<0 else 'Right')+' wrist',(0,0,0),root)
    ellipsoid('Palm',(0,0,0),(.10,.075,.16),skin,hand)
    for k in range(4):
        x=(k-1.5)*.044
        tube('Relaxed finger',[(x,-.005,-.075),(x,-.02,-.16),(x,-.033,-.205+(abs(k-1.5))*.018)],
             [.031,.027,.018],skin,hand,10)
        # Dorsal nail marks make palm orientation readable in the tiny atlas:
        # hidden from a palm-forward idle, visible on top after pronation.
        ellipsoid('Fingernail',(x,.030,-.174+(abs(k-1.5))*.010),(.018,.007,.026),nail,hand,n=12,m=8)
    tube('Thumb',[(s*.063,-.014,.045),(s*.12,-.02,-.018),(s*.119,-.05,-.085)],
         [.045,.036,.023],skin,hand)
    foot=empty(('Left' if s<0 else 'Right')+' shoe',(0,0,0),root)
    ellipsoid('Sneaker outsole',(0,-.10,.097),(.18,.325,.085),sole,foot)
    ellipsoid('Canvas sneaker',(0,-.08,.184),(.174,.295,.13),shoe,foot)
    ellipsoid('Rubber toe cap',(0,-.275,.169),(.165,.113,.086),sole,foot)
    for k in range(3): line('Cream shoelace',[(-.085,-.08-k*.045,.291-k*.009),(.085,-.08-k*.045,.291-k*.009)],.013,white,foot)
    hands.append((s,hand,pivot));feet.append((s,foot))

video=rounded_box('Restock video case',(0,-.04,-.07),(.29,.12,.46),case_mat,hands[1][1],.025)
label=rounded_box('Video case paper insert',(0,-.105,-.06),(.225,.012,.335),white,hands[1][1],.012)
video_mark=rounded_box('Video insert stripe',(0,-.115,-.06),(.20,.009,.065),polo,hands[1][1],.006)

def pose(anim='idle', f=0):
    for o in limbs:
        bpy.data.objects.remove(o,do_unlink=True)
    limbs.clear()
    crouch=.84 if anim=='stockLow' else 0
    bob=(.018 if f else 0) if anim in ['idle','talk'] else 0
    body.location=(0,0,-crouch+bob)
    head.rotation_euler=(.10 if anim=='stockHigh' else -.025, -.04 if anim=='talk' else .015, .025 if f else 0)
    mouth_open.hide_render=anim!='talk' or f==0
    hold=anim.startswith('stock')
    for o in [video,label,video_mark]:o.hide_render=not hold
    stride=[.36,.04,-.36,-.04][f] if anim=='walk' else 0
    for s,hand,pivot in hands:
        shoulder=Vector((s*.435,.015,3.65-crouch+bob))
        angle=.055
        bend=.13
        spread=s*.055
        if anim=='walk':angle=-stride*s*1.3;bend=.22
        if anim=='talk' and s>0: angle=.40+f*.1;bend=.90
        if anim=='type':angle=.36;bend=1.15+f*.10
        if anim=='stockMid':angle=.80;bend=.62+f*.09
        if anim=='stockHigh':angle=2.37+f*.10;bend=.16
        if anim=='stockLow':angle=.50;bend=.62
        elbow=shoulder+Vector((spread,-math.sin(angle)*.70,-math.cos(angle)*.70))
        wrist=elbow+Vector((spread*.2,-math.sin(angle+bend)*.63,-math.cos(angle+bend)*.63))
        pivot.rotation_euler.x=-angle
        pivot.rotation_euler.y=-s*.09
        # Arm extends beneath the real short sleeve to the wrist.
        arm_start=shoulder.lerp(elbow,.42)
        rr=[.127,.13,.13,.126,.116,.108,.102,.102,.103,.099,.083,.067,.06]
        arm=limb_geometry('Continuous arm',arm_start,elbow,wrist,rr,skin);limbs.append(arm)
        hand.location=wrist
        wrist_pitch = .45 if anim == 'type' else (.20 if anim in ['stockMid','stockLow'] else 0)
        hand.rotation_euler.x=-(angle+bend)+wrist_pitch
        # The neutral hand is authored palm-forward with the thumb outside.
        # When both forearms swing forward to type or shelve a low/mid case,
        # pronate them: palms face down and the thumbs face one another.  The
        # old pose merely tipped the neutral hand through 90 degrees, leaving
        # both palms and thumbs visibly upside-down.
        hand.rotation_euler.z=math.pi if anim in ['type','stockMid','stockLow'] else 0
        hip=Vector((s*.215,.018,2.49-crouch+bob))
        foot=next(o for side,o in feet if side==s)
        forward=stride*s
        lift=(.16 if f in [1,3] and (f==1)==(s>0) else 0) if anim=='walk' else 0
        ankle=Vector((s*(.24 if not crouch else .36),-forward,.22+lift))
        knee=hip.lerp(ankle,.52)+Vector((0,-.04-(.56 if crouch else 0),0))
        rr=[(.213,.236),(.222,.242),(.22,.234),(.197,.21),(.18,.195),(.168,.18),
            (.157,.17),(.155,.167),(.15,.158),(.146,.153),(.145,.147),(.143,.14),(.14,.14)]
        leg=limb_geometry('Tailored trouser leg',hip,knee,ankle,rr,khaki);limbs.append(leg)
        foot.location=(ankle.x,ankle.y,lift)
        foot.rotation_euler.z=s*-.065
    # Voxel-union the seat and both tailored leg surfaces to eliminate seams
    # at the crotch while retaining the deliberately modeled pant profiles.
    seat.hide_render=True
    seat_copy=seat.copy();seat_copy.data=seat.data.copy()
    bpy.context.collection.objects.link(seat_copy)
    seat_copy.hide_render=False
    bpy.context.view_layer.update()
    seat_world=seat.matrix_world.copy()
    seat_copy.parent=None
    seat_copy.matrix_world=seat_world
    pieces=[o for o in limbs if o.name.startswith('Tailored trouser')]+[seat_copy]
    bpy.ops.object.select_all(action='DESELECT')
    for o in pieces:o.select_set(True)
    bpy.context.view_layer.objects.active=seat_copy
    bpy.ops.object.convert(target='MESH')
    bpy.ops.object.join()
    seat_copy.name='Continuous tailored trousers'
    mod=seat_copy.modifiers.new('Welded cloth sculpt','REMESH');mod.mode='VOXEL';mod.voxel_size=.022
    smooth=seat_copy.modifiers.new('Relax cloth junctions','SMOOTH');smooth.factor=.65;smooth.iterations=4
    trouser_world=seat_copy.matrix_world.copy()
    seat_copy.parent=root
    seat_copy.matrix_world=trouser_world
    limbs[:]=[o for o in limbs if o not in pieces]+[seat_copy]

pose()

# Transparent, softly lit orthographic output. Lighting remains camera-fixed
# across directions; the runtime still receives the store's lights and shadows.
scene=bpy.context.scene
scene.render.engine='CYCLES'
scene.cycles.samples=24
scene.cycles.use_denoising=True
scene.render.film_transparent=True
scene.render.resolution_x=256;scene.render.resolution_y=384
scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG'
scene.render.image_settings.color_mode='RGBA'
scene.world.color=(.45,.45,.45)
scene.view_settings.view_transform='Standard'
scene.view_settings.look='None'
scene.view_settings.exposure=0
scene.view_settings.gamma=1
def area(name, at, power, size):
    d=bpy.data.lights.new(name,'AREA');d.energy=power;d.shape='DISK';d.size=size
    o=bpy.data.objects.new(name,d);bpy.context.collection.objects.link(o);o.location=at
    o.rotation_euler=(Vector((0,0,2.8))-o.location).to_track_quat('-Z','Y').to_euler()
area('Large softbox',(-3,-5,8),450,5)
area('Soft fill',(4,-3,4.5),240,5)
area('Hair rim',(-1,3,7),380,4)
camera_data=bpy.data.cameras.new('Orthographic sprite camera')
camera=bpy.data.objects.new('Orthographic sprite camera',camera_data)
bpy.context.collection.objects.link(camera)
camera.location=(0,-12,2.80)
camera.rotation_euler=(math.pi/2,0,0)
camera_data.type='ORTHO';camera_data.ortho_scale=5.7
scene.camera=camera

def render(path):
    scene.render.filepath=str(path)
    bpy.ops.render.render(write_still=True)

def save_source():
    bpy.context.preferences.filepaths.save_version=0
    # Every surface gets a useful non-overlapping UV layout for later painting.
    for o in list(bpy.context.scene.objects):
        if o.type!='MESH':continue
        bpy.ops.object.select_all(action='DESELECT');o.select_set(True);bpy.context.view_layer.objects.active=o
        # Unwrap the final cloth surface, since a voxel weld discards the UVs
        # of its inputs. Other modifiers preserve their authored UV layers.
        if any(mod.type=='REMESH' for mod in o.modifiers):
            for mod in list(o.modifiers):
                bpy.ops.object.modifier_apply(modifier=mod.name)
        bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT')
        bpy.ops.uv.smart_project(island_margin=.02)
        bpy.ops.object.mode_set(mode='OBJECT')
    bpy.ops.object.select_all(action='DESELECT')
    root.select_set(True);bpy.context.view_layer.objects.active=root
    for screen in bpy.data.screens:
        for ar in screen.areas:
            if ar.type=='VIEW_3D':
                ar.spaces.active.region_3d.view_distance=8
                ar.spaces.active.region_3d.view_location=(0,0,2.6)
    bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'tools/models/video-clerk.blend'))

args=sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else []
save_source()
if '--preview' in args:
    scene.render.resolution_x=512;scene.render.resolution_y=768;scene.cycles.samples=32
    render(OUT/'preview-front.png')
    root.rotation_euler.z=math.pi/4
    render(OUT/'preview-quarter.png')
elif '--preview-type' in args:
    scene.render.resolution_x=512;scene.render.resolution_y=768;scene.cycles.samples=32
    pose('type', 0)
    render(OUT/'preview-type.png')
elif '--render' in args:
    dirs=['front','frontSide','side','backSide','back']
    anims=[('idle',2),('walk',4),('stockHigh',2),('stockMid',2),('stockLow',2),('talk',2),('type',2)]
    metadata=[]
    for row,direction in enumerate(dirs):
        root.rotation_euler.z=row*math.pi/4
        col=0
        for anim,count in anims:
            for f in range(count):
                pose(anim,f)
                filename=f'{row:02d}-{col:02d}_{direction}_{anim}{f}.png'
                render(OUT/filename)
                metadata.append(dict(row=row,col=col,direction=direction,animation=anim,frame=f,file=filename))
                col+=1
    (OUT/'frames.json').write_text(json.dumps(metadata,indent=2)+'\n')
    # Unlit material-ID render, with identical camera, geometry and occlusion.
    # The RGB mask is used as coverage, the color pass supplies cloth shading.
    for m in bpy.data.materials:
        m.use_nodes=True;m.node_tree.nodes.clear()
        out=m.node_tree.nodes.new('ShaderNodeOutputMaterial')
        em=m.node_tree.nodes.new('ShaderNodeEmission')
        em.inputs['Color'].default_value=(1,1,1,1) if m==polo else (0,0,0,1)
        m.node_tree.links.new(em.outputs[0],out.inputs['Surface'])
    scene.cycles.samples=8;scene.cycles.use_denoising=False
    maskdir=OUT/'mask';maskdir.mkdir(exist_ok=True)
    for frame in metadata:
        root.rotation_euler.z=frame['row']*math.pi/4
        pose(frame['animation'],frame['frame'])
        render(maskdir/frame['file'])
    target=ROOT/'public/textures/clerk'
    target.mkdir(parents=True,exist_ok=True)
    for source,filename in [(OUT,'color.png'),(maskdir,'livery.png')]:
        subprocess.run(['node',str(ROOT/'tools/clerk-sheet.mjs'),'stitch',
                        str(source),str(target/filename)],check=True)
    subprocess.run(['node',str(ROOT/'tools/clerk-sheet.mjs'),'check',
                    str(target/'color.png')],check=True)
