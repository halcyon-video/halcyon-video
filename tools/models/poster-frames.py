"""Original generic frame family, scripted mesh authoring. No replica claim.
Rebuild: blender -b -P tools/models/poster-frames.py
Store feet; author (x,-depth,height) -> glTF (x,height,depth), front +Z.
Origin at existing artwork center/plane. No artwork is exported.
"""
import bpy, bmesh, json
from pathlib import Path
from mathutils import Quaternion
ROOT=Path(__file__).resolve().parents[2]
bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
scene=bpy.context.scene
scene.unit_settings.system='IMPERIAL'; scene.unit_settings.scale_length=.3048

def mat(name,color,metal,rough):
 m=bpy.data.materials.new(name);m.diffuse_color=(*color,1);m.use_nodes=True
 p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*color,1);p.inputs['Metallic'].default_value=metal;p.inputs['Roughness'].default_value=rough
 return m
finish=mat('FrameFinish',(.66,.70,.76),1,.12)
seat=mat('GlazingSeat',(.025,.029,.032),.1,.65)
back=mat('Backing',(.10,.11,.12),.15,.7)
metrics={}
def mesh(name,verts,faces,material,collection):
 me=bpy.data.meshes.new(name);me.from_pydata([(x,-z,y) for x,y,z in verts],[],faces);me.update()
 bm=bmesh.new();bm.from_mesh(me);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));assert all(e.is_manifold for e in bm.edges),name;bm.to_mesh(me);bm.free()
 o=bpy.data.objects.new(name,me);collection.objects.link(o);me.materials.append(material)
 bpy.ops.object.select_all(action='DESELECT');o.select_set(True);bpy.context.view_layer.objects.active=o
 bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT');bpy.ops.uv.smart_project(island_margin=.02);bpy.ops.object.mode_set(mode='OBJECT')
 return o
# Sweep a closed cross-section between exact 45-degree corner planes.
# Insets are measured outward from the unchanged artwork aperture.
def rail(name,w,h,profile,side,material,col):
 corners=[(-1,-1),(1,-1),(1,1),(-1,1)]
 a,b=corners[side],corners[(side+1)%4];n=len(profile)
 verts=[(sx*(w/2+d),sy*(h/2+d),z) for sx,sy in [a,b] for d,z in profile]
 faces=[tuple(reversed(range(n))),tuple(range(n,2*n))]+[(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)]
 return mesh(name,verts,faces,material,col)
for variant,w,h,t,zback,zfront in [('window',2.5,3.75,.32,-.11,.11),('wall',4.7*2/3,4.7,.09,-.025,.055)]:
 col=bpy.data.collections.new('Poster frame — '+variant);scene.collection.children.link(col)
 # Recessed inner shoulder, broad marquee land, eased outer lip, rear return.
 p=[(0,-.009),(0,.013),(t*.13,.013),(t*.23,zfront-.012),(t*.29,zfront),(t*.84,zfront),(t,zfront-.015),(t,zback+.009),(t-.009,zback),(.014,zback),(.014,-.009)]
 parts=[rail('Moulding_'+side,w,h,p,i,finish,col) for i,side in enumerate(['Bottom','Right','Top','Left'])]
 # Seat is an actual recessed rabbet outside the image area, never an overlay.
 seatparts=[rail('Seat_'+str(i),w,h,[(0,-.008),(.014,-.008),(.014,-.001),(0,-.001)],i,seat,col) for i in range(4)]
 # Backing ends inside the return; its front remains safely behind the artwork.
 bw,bh=w+.022,h+.022; bz=zback+.003;fz=-.012
 verts=[(x*bw/2,y*bh/2,z) for z in [bz,fz] for y in [-1,1] for x in [-1,1]]
 backing=mesh('RecessedBacking',verts,[(0,2,3,1),(4,5,7,6),(0,1,5,4),(2,6,7,3),(0,4,6,2),(1,3,7,5)],back,col)
 # Keep four individually editable mitred members in the source; merge by role
 # for three runtime draws, without welding the physical corner joints away.
 export=[]
 for name,objects in [('MitredMoulding',parts),('GlazingSeat',seatparts),('RecessedBacking',[backing])]:
  copies=[]
  for o in objects:
   c=o.copy();c.data=o.data.copy();col.objects.link(c);copies.append(c)
  bpy.ops.object.select_all(action='DESELECT')
  for c in copies:c.select_set(True)
  bpy.context.view_layer.objects.active=copies[0];bpy.ops.object.join();o=bpy.context.object;o.name=variant+'_'+name;export.append(o)
  o['role']=name;o['units']='feet';o['artwork_plane']=0.0;o['front_axis']='+Z in glTF'
 bpy.ops.object.select_all(action='DESELECT')
 for o in export:o.select_set(True)
 path=ROOT/'public/models'/('poster-frame-'+variant+'.glb')
 bpy.ops.export_scene.gltf(filepath=str(path),export_format='GLB',use_selection=True,export_extras=True)
 triangles=0
 for o in export:o.data.calc_loop_triangles();triangles+=len(o.data.loop_triangles)
 metrics[variant]={'aperture':[w,h],'bounds':[-w/2-t,w/2+t,-h/2-t,h/2+t,zback,zfront],'triangles':triangles,'runtime_meshes':3,'material_roles':['FrameFinish','GlazingSeat','Backing'],'texture_images':0,'bytes':path.stat().st_size,'manifold':True,'uv':True}
 for o in export:bpy.data.objects.remove(o,do_unlink=True)
 for o in col.objects:
  o['variant']=variant;o['provenance']='Original generic Halcyon fixture; issue #240';o['units']='feet'
 # Display source variants alongside one another. Exports above stay centered.
 for o in col.objects:o.location.x= -2.5 if variant=='window' else 2.5
for area in bpy.context.screen.areas:
 if area.type=='VIEW_3D':
  area.spaces.active.region_3d.view_distance=15
  area.spaces.active.region_3d.view_rotation=Quaternion((.88,.44,.08,.16)).normalized()
  area.spaces.active.shading.type='MATERIAL'
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'tools/models/poster-frames.blend'))
(ROOT/'docs/poster-frames-cost.json').write_text(json.dumps(metrics,indent=2)+'\n')
