"""Original generic suspended ceiling kit, scripted mesh authoring; no third-party assets.
Blender 5.2: blender -b -t 2 -P tools/models/ceiling-grid.py
Store feet: author (x,-z,y), export Y-up. Spans run X=0..1, tile centered at origin.
"""
from pathlib import Path
import bpy, bmesh, json, math
ROOT=Path(__file__).resolve().parents[2]
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
scene=bpy.context.scene;scene.unit_settings.system='IMPERIAL';scene.unit_settings.scale_length=.3048
paint=bpy.data.materials.new('GridPaint');paint.diffuse_color=(.88,.88,.86,1);paint.use_nodes=True
paint.node_tree.nodes.get('Principled BSDF').inputs['Roughness'].default_value=.5
fiber=bpy.data.materials.new('AcousticFiber');fiber.diffuse_color=(.92,.91,.88,1);fiber.use_nodes=True
fiber.node_tree.nodes.get('Principled BSDF').inputs['Roughness'].default_value=.92
parts=[];stats={}
def mesh(name,verts,faces,mat):
 m=bpy.data.meshes.new(name);m.from_pydata([(x,-z,y) for x,y,z in verts],[],faces);m.update()
 o=bpy.data.objects.new(name,m);bpy.context.collection.objects.link(o);m.materials.append(mat)
 bm=bmesh.new();bm.from_mesh(m);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));assert all(e.is_manifold for e in bm.edges),name;bm.to_mesh(m);bm.free()
 uv=m.uv_layers.new(name='SurfaceFeet')
 for p in m.polygons:
  axis=max(range(3),key=lambda i:abs(p.normal[i]));axes=[i for i in range(3) if i!=axis]
  for li in p.loop_indices:
   co=m.vertices[m.loops[li].vertex_index].co;uv.data[li].uv=(co[axes[0]],co[axes[1]])
 o['units']='feet';o['provenance']='Original Halcyon generic construction, scripted Blender mesh';parts.append(o)
 m.calc_loop_triangles();stats[name]={'triangles':len(m.loop_triangles),'vertices':len(m.vertices),'manifold':True,'dimensions_store_xyz_feet':[o.dimensions.x,o.dimensions.z,o.dimensions.y]}
 return o

def span(name,profile):
 n=len(profile);return mesh(name,[(x,y,z) for x in (0,1) for z,y in profile],[(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)]+[tuple(reversed(range(n))),tuple(range(n,2*n))],paint)
# Continuous rolled/eased exposed flange, narrow web and folded stiffening bulb.
span('TBar', [(-.05,-.075),(.05,-.075),(.054,-.071),(.054,-.063),(.05,-.059),(.006,-.059),(.006,.085),(.018,.085),(.018,.11),(-.018,.11),(-.018,.085),(-.006,.085),(-.006,-.059),(-.05,-.059),(-.054,-.063),(-.054,-.071)])
# Wall angle has a finished toe, a return leg and constant sheet thickness. +Z is inward.
span('EdgeAngle',[(0,-.077),(.07,-.077),(.074,-.073),(.074,-.061),(.012,-.061),(.012,.08),(0,.08)])
# A stamped connector with a continuous flange and welded cruciform upright.
# Boundary extraction across occupied cells produces a single closed solid.
xs=[-.054,-.006,.006,.054];zs=xs;ys=[-.075,-.059,.11]
cells={(i,j,k) for i in range(3) for j in range(2) for k in range(3) if j==0 or i==1 or k==1}
verts=[];faces=[];lookup={}
for i,j,k in sorted(cells):
 for di,dj,dk,corners in [(-1,0,0,[(i,j,k),(i,j,k+1),(i,j+1,k+1),(i,j+1,k)]),(1,0,0,[(i+1,j,k),(i+1,j+1,k),(i+1,j+1,k+1),(i+1,j,k+1)]),(0,-1,0,[(i,j,k),(i+1,j,k),(i+1,j,k+1),(i,j,k+1)]),(0,1,0,[(i,j+1,k),(i,j+1,k+1),(i+1,j+1,k+1),(i+1,j+1,k)]),(0,0,-1,[(i,j,k),(i,j+1,k),(i+1,j+1,k),(i+1,j,k)]),(0,0,1,[(i,j,k+1),(i+1,j,k+1),(i+1,j+1,k+1),(i,j+1,k+1)])]:
  if (i+di,j+dj,k+dk) in cells:continue
  face=[]
  for a,b,c in corners:
   co=(xs[a],ys[b],zs[c])
   if co not in lookup:lookup[co]=len(verts);verts.append(co)
   face.append(lookup[co])
  faces.append(face)
mesh('CrossTee',verts,faces,paint)
# Closed stepped mineral-fibre tile: eased exposed face, shallow recessed rim and back.
rings=[(2.44,1.19,.018),(2.44,1.19,-.035),(2.423,1.173,-.035),(2.414,1.164,-.055)]
verts=[(x,y,z) for hx,hz,y in rings for x,z in [(-hx,-hz),(hx,-hz),(hx,hz),(-hx,hz)]]
faces=[(r*4+i,r*4+(i+1)%4,(r+1)*4+(i+1)%4,(r+1)*4+i) for r in range(len(rings)-1) for i in range(4)]
faces += [(3,2,1,0),(12,13,14,15)]
tile=mesh('TileRim',verts,faces,fiber)
# Tile faces use one grain repeat per module, shared by every runtime instance.
for p in tile.data.polygons:
 if abs(p.normal.z)<.5:continue
 for li in p.loop_indices:
  co=tile.data.vertices[tile.data.loops[li].vertex_index].co;tile.data.uv_layers.active.data[li].uv=(co.x/4.88+.5,-co.y/2.38+.5)
# Bake original procedural mineral-fibre grain into one reusable 256² texture.
nodes=fiber.node_tree.nodes;links=fiber.node_tree.links
texcoord=nodes.new('ShaderNodeTexCoord');noise=nodes.new('ShaderNodeTexNoise');noise.inputs['Scale'].default_value=135;noise.inputs['Detail'].default_value=2
links.new(texcoord.outputs['UV'],noise.inputs['Vector']);ramp=nodes.new('ShaderNodeValToRGB')
ramp.color_ramp.elements[0].position=.28;ramp.color_ramp.elements[0].color=(.32,.31,.29,1)
ramp.color_ramp.elements[1].position=.57;ramp.color_ramp.elements[1].color=(.95,.94,.90,1)
links.new(noise.outputs['Fac'],ramp.inputs['Fac']);emit=nodes.new('ShaderNodeEmission');links.new(ramp.outputs['Color'],emit.inputs['Color']);links.new(emit.outputs[0],nodes.get('Material Output').inputs['Surface'])
img=bpy.data.images.new('Baked mineral fibre grain',width=256,height=256);target=nodes.new('ShaderNodeTexImage');target.image=img;nodes.active=target
bpy.ops.object.select_all(action='DESELECT');tile.select_set(True);bpy.context.view_layer.objects.active=tile
scene.render.engine='CYCLES';scene.cycles.samples=8;scene.render.bake.margin=8
bpy.ops.object.bake(type='EMIT')
img.filepath_raw=str(ROOT/'public/models/ceiling-tile-grain.png');img.file_format='PNG';img.save();img.pack()
links.new(nodes.get('Principled BSDF').outputs[0],nodes.get('Material Output').inputs['Surface'])
# Keep procedural bake graph editable; runtime supplies shared theme materials.
bpy.ops.object.select_all(action='DESELECT')
for o in parts:o.select_set(True)
out=ROOT/'public/models/ceiling-grid.glb';bpy.ops.export_scene.gltf(filepath=str(out),export_format='GLB',use_selection=True,export_extras=True,export_yup=True)
# Linked overview copies make the editable source readable without changing the
# runtime origin contract. These are created AFTER the selection-only export.
preview=bpy.data.collections.new('Authoring overview - not exported');scene.collection.children.link(preview)
for original,offset in zip(parts,[(-2,2,0),(-2,3,0),(0,2,0),(0,-1,0)]):
 copy=original.copy();copy.name=original.name+' overview';copy.location=offset;preview.objects.link(copy)
 original.hide_set(True)
for area in bpy.context.screen.areas:
 if area.type=='VIEW_3D':area.spaces.active.region_3d.view_distance=7
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'tools/models/ceiling-grid.blend'))
stats['resources']={'glb_bytes':out.stat().st_size,'grain_bytes':(ROOT/'public/models/ceiling-tile-grain.png').stat().st_size,'texture_size':[256,256],'material_roles':2}
(ROOT/'docs/ceiling-grid-cost.json').write_text(json.dumps(stats,indent=2)+'\n')
