"""Original generic late-era 4:3 checkout LCD. Feet; Blender +Y front, Z up.
Reuses the CRT/keyboard mesh, UV and export helpers without regenerating them.
Run: blender -b -P tools/models/flat-panel-terminal.py
See docs/flat-panel-terminal-model.md for evidence limits and attachment contract.
"""
import importlib.util
import json
import pathlib
import sys
import bpy
import numpy as np
from mathutils import Quaternion

sys.dont_write_bytecode = True
ROOT = pathlib.Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('terminal_parts', ROOT/'tools/models/counter-terminal.py')
h = importlib.util.module_from_spec(spec)
spec.loader.exec_module(h)
P = h.Part
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.context.preferences.filepaths.save_version = 0
scene = bpy.context.scene
scene.unit_settings.system = 'IMPERIAL'
scene.unit_settings.scale_length = .3048
scene.unit_settings.length_unit = 'FEET'
col = bpy.data.collections.new('Flat panel — editable physical parts')
excol = bpy.data.collections.new('Runtime — joined by material role')
scene.collection.children.link(col); scene.collection.children.link(excol)
grain = h.grain_image(seed=189)
# Linear roughness image; glTF uses green and keeps the metallic factor at zero.
rng = np.random.default_rng(189)
rgba = np.ones((128,128,4), dtype=np.float32)
rgba[:,:,:3] = np.clip(.91 + rng.normal(0,.025,(128,128,1)), .82, 1)
rough = bpy.data.images.new('LCD_molded_finish_roughness',128,128,alpha=False)
rough.colorspace_settings.name='Non-Color';rough.pixels.foreach_set(rgba.ravel());rough.pack()
def mat(name,rgb,r):
    m=h.material(name,rgb,rough=r,grain=grain,grain_scale=18,grain_strength=.22)
    m.use_backface_culling=True
    nt=m.node_tree
    tex=nt.nodes.new('ShaderNodeTexImage');tex.image=rough
    mapping=next(n for n in nt.nodes if n.type=='MAPPING')
    nt.links.new(mapping.outputs['Vector'],tex.inputs['Vector'])
    nt.links.new(tex.outputs['Color'],nt.nodes['Principled BSDF'].inputs['Roughness'])
    # glTF exports a calibrated roughness factor through multiply.
    mult=nt.nodes.new('ShaderNodeMath');mult.operation='MULTIPLY';mult.inputs[1].default_value=r/.91
    nt.links.new(tex.outputs['Color'],mult.inputs[0]);nt.links.new(mult.outputs[0],nt.nodes['Principled BSDF'].inputs['Roughness'])
    return m
M={
 'shell':mat('LCDShellABS',(.11,.12,.135),.52),
 'bezel':mat('LCDBezelABS',(.095,.105,.12),.43),
 'trim':mat('LCDInsetABS',(.08,.085,.09),.66),
 'cable':mat('LCDCableRubber',(.08,.08,.085),.76),
 'screen':h.material('LCDScreen',(.08,.095,.10),rough=.26),
 'led':h.material('LCDPowerLed',(.12,.48,.16),rough=.32),
}
parts=[]
def finish(p,bevel=.004):
    ob=p.finish(col,closed=True,bevel=bevel,smooth=False)
    h.unwrap_object(ob);parts.append(ob);return ob
# Welded bezel frame with actual inner return and recessed picture area.
p=P('Bezel — continuous aperture and chin',[M['bezel']])
a=p.rect(.70,.48,1.55,.065);b=p.rect(.696,.484,1.546,.11)
c=p.rect(.61,.575,1.49,.11);d=p.rect(.61,.575,1.49,.09)
e=p.rect(.61,.575,1.49,.065)
p.bridge(a,b,M['bezel']);p.bridge(b,c,M['bezel']);p.bridge(c,d,M['bezel']);p.bridge(d,e,M['bezel']);p.bridge(e,a,M['bezel'])
finish(p,.004)
# Tapered rear shell, seam step, and deeply recessed cooling slots cut in the shell.
p=P('Rear shell — recessed cooling grille',[M['shell'],M['trim']])
p.loft([p.rect(.70,.48,1.55,.065),p.rect(.696,.484,1.546,.045),p.rect(.675,.50,1.53,.025),p.rect(.64,.53,1.50,-.115)],M['shell'],caps=(M['shell'],M['shell']))
p.bm.normal_update();h.bmesh.ops.recalc_face_normals(p.bm,faces=p.bm.faces)
rear=lambda f:f.normal.y<-.99 and f.calc_center_median().y<-.11
p.carve(rear,[((0,0,1.27),(0,0,1)),((0,0,1.41),(0,0,1))],lambda c:1.27<c.z<1.41,0,M['shell'])
band=lambda f:rear(f) and 1.27<f.calc_center_median().z<1.41
slots=[(-.49+i*.055,-.49+i*.055+.019) for i in range(19)]
p.carve(band,[((x,0,0),(1,0,0)) for pair in slots for x in pair],lambda c:any(a<c.x<b for a,b in slots),.025,M['trim'],M['shell'])
finish(p,.003)
# Thin matte panel; runtime replaces this named surface with the shared live menu.
p=P('LiveScreenSurface',[M['screen']]);p.cap(list(reversed(p.rect(.61,.575,1.49,.089))),M['screen'])
ob=p.finish(col,closed=False,smooth=False);h.unwrap_object(ob);parts.append(ob)
# Low elliptical foot, tapered mast, real tilt barrel.
p=P('Pedestal foot — molded elliptical profile',[M['shell']])
p.loft([p.ellipse(.35,.29,.006,32,cy=-.04),p.ellipse(.38,.32,.025,32,cy=-.04),p.ellipse(.365,.305,.055,32,cy=-.04),p.ellipse(.29,.23,.078,32,cy=-.04)],M['shell'],caps=(M['shell'],M['shell']))
finish(p,.003)
p=P('Pedestal mast',[M['shell']])
p.loft([p.rect_xy(-.10,.10,-.17,-.02,.06),p.rect_xy(-.075,.075,-.19,-.09,.67),p.rect_xy(-.075,.075,-.19,-.09,.81)],M['shell'],caps=(M['shell'],M['shell']))
finish(p,.008)
p=P('Tilt hinge barrel',[M['trim']]);p.tube([(-.14,-.15,.77),(.14,-.15,.77)],.057,M['trim'],n=16);finish(p,None)
p=P('Connector sockets and strain relief',[M['trim']])
p.box(.20,.33,-.139,-.112,.56,.60,M['trim']);p.box(.40,.45,-.148,-.11,.555,.615,M['trim']);finish(p,.003)
p=P('Control buttons',[M['trim']])
for x in [.32,.38,.44,.50]:p.front_button(x-.019,x+.019,.512,.532,.11,.118,M['trim'],inset=.002,lip=.002)
finish(p,None)
p=P('Power indicator',[M['led']]);p.box(.548,.566,.11,.118,.516,.526,M['led']);finish(p,.001)
p=P('Rubber desk contact pads',[M['trim']])
for x in [-.23,.23]:
 for y in [-.21,.13]:p.box(x-.034,x+.034,y-.025,y+.025,0,.009,M['trim'])
finish(p,.002)
# Both cables run down the rear mast and bend along the deck away from keyboard.
p=P('Cable route — power and signal',[M['cable']])
for x,dx in [(.26,0),(.425,.025)]:
 p.tube([(x,-.14,.578),(x,-.20,.54),(.17+dx,-.25,.40),(.13+dx,-.27,.13),(.16+dx,-.32,.035),(.22+dx,-.40,.012),(.34+dx,-.46,.012)],.009,M['cable'],n=8)
finish(p,None)
# Export joined copies by role (six primitives), editable originals retain part names.
export=h.export_copy(parts,'LateEraFlatPanel',excol)
export['dimensions_feet']='1.40 W x 1.55 H x 0.747 D including cable'
export['provenance']='Original generic Halcyon design; estimated dimensions; no external geometry or imagery'
export['screen_role']='LCDScreen'
export['front_axis']='-Z after glTF Y-up export'
out=ROOT/'public/models/flat-panel-terminal.glb'
h.export_glb([export],out)
export.data.calc_loop_triangles()
metrics={'bytes':out.stat().st_size,'triangles':len(export.data.loop_triangles),'editable_parts':len(parts),'material_roles':[m.name for m in export.data.materials],'dimensions_blender_feet':list(export.dimensions),'all_parts_uv':all(bool(o.data.uv_layers) for o in parts),'closed_parts_manifold':'Checked in Part.finish; LiveScreenSurface intentionally open','texture_sources':['ABS grain normal 128x128','roughness 128x128']}
(ROOT/'tools/models/flat-panel-terminal-metrics.json').write_text(json.dumps(metrics,indent=2)+'\n')
excol.hide_viewport=True;excol.hide_render=True
for screen in bpy.data.screens:
 for area in screen.areas:
  if area.type=='VIEW_3D':
   area.spaces.active.region_3d.view_distance=3.8
   area.spaces.active.region_3d.view_location=(0,0,.8)
   area.spaces.active.region_3d.view_rotation=Quaternion((.82,.52,.13,.20)).normalized()
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'tools/models/flat-panel-terminal.blend'),compress=True)
print(json.dumps(metrics))
