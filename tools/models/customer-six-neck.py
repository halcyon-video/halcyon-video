"""Fit a smooth neck surface between the torso opening and the original head.
The immutable facial geometry and approved clothes stay intact.
"""
import bpy,bmesh,math,json
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[2]
def apply(body,arm,folder):
 head=bpy.data.objects['Customer 06 original head and face'];col=bpy.data.collections['Casual outfit'];name='Customer 06 flush neck transition'
 old=bpy.data.objects.get(name)
 if old:bpy.data.objects.remove(old,do_unlink=True)
 # The old lower neck overlaps the donor neck with ragged extraction edges.
 # Hide only those nonfacial triangles while retaining their immutable data.
 hidden=bpy.data.materials.get('Customer 06 concealed source neck')
 if hidden is None:
  hidden=bpy.data.materials.new('Customer 06 concealed source neck');hidden.use_nodes=True;bs=hidden.node_tree.nodes['Principled BSDF'];bs.inputs['Alpha'].default_value=0;hidden.surface_render_method='DITHERED'
 if hidden.name not in [m.name for m in head.data.materials]:head.data.materials.append(hidden)
 slot=list(head.data.materials).index(hidden);count=0
 for p in head.data.polygons:
  if p.material_index==slot:p.material_index=0
  neckweight=sum(g.weight for i in p.vertices for g in head.data.vertices[i].groups if head.vertex_groups[g.group].name in ['neck','Spine','Spine01','Spine02'])/len(p.vertices)
  if p.center.z<133.0 and p.center.y>-4.5 and abs(p.center.x)<7.5 and neckweight>.18:p.material_index=slot;count+=1
 bm=bmesh.new();bm.from_mesh(body.data);bm.verts.ensure_lookup_table();edges={e for e in bm.edges if e.is_boundary};loops=[]
 while edges:
  e=edges.pop();found={e};pending=[e]
  while pending:
   for v in pending.pop().verts:
    for other in v.link_edges:
     if other in edges:edges.remove(other);found.add(other);pending.append(other)
  vertices={v for e in found for v in e.verts}
  if len(vertices)>20 and min(v.co.z for v in vertices)>120:loops.append(found)
 if len(loops)!=1:raise RuntimeError('Cannot identify the torso neck opening')
 edges=loops[0];adj={}
 for e in edges:
  a,b=(v.index for v in e.verts);adj.setdefault(a,[]).append(b);adj.setdefault(b,[]).append(a)
 start=min(adj,key=lambda i:bm.verts[i].co.y);ids=[start];previous=None;at=start
 while True:
  nxt=next(i for i in adj[at] if i!=previous)
  if nxt==start:break
  ids.append(nxt);previous,at=at,nxt
 points=[body.data.vertices[i].co.copy() for i in ids];bm.free()
 area=sum(points[i].x*points[(i+1)%len(points)].y-points[(i+1)%len(points)].x*points[i].y for i in range(len(points)))
 if area<0:ids=list(reversed(ids));points=list(reversed(points))
 N=len(ids);verts=[];binding=[];faces=[];anchors=[]
 from mathutils.bvhtree import BVHTree
 transform=body.matrix_world.inverted()@head.matrix_world
 tree=BVHTree.FromPolygons([transform@v.co for v in head.data.vertices],[list(p.vertices) for p in head.data.polygons if p.material_index!=slot])
 from mathutils.interpolate import poly_3d_calc
 headpoints=[transform@v.co for v in head.data.vertices];visible=[p for p in head.data.polygons if p.material_index!=slot]
 top=[];topweights=[];topreferences=[]
 for p in points:
  angle=math.atan2((p.y-3.1)/6.1,p.x/6.4);depth=6.1 if math.sin(angle)<0 else 4.4
  q=Vector((4.2*math.cos(angle),3.1+depth*math.sin(angle),136.4+.30*max(0,math.sin(angle))))
  hit,normal,index,distance=tree.find_nearest(q)
  if hit is None:raise RuntimeError('Upper neck contour misses the original head')
  polygon=visible[index];bary=poly_3d_calc([headpoints[i] for i in polygon.vertices],hit);ws={}
  for i,factor in zip(polygon.vertices,bary):
   for g in head.data.vertices[i].groups:
    n=head.vertex_groups[g.group].name;ws[n]=ws.get(n,0)+g.weight*factor
  ws={n:max(0,w) for n,w in ws.items() if w>1e-8};total=sum(ws.values());topweights.append({n:w/total for n,w in ws.items()})
  top.append(hit-normal*.02);topreferences.append({'indices':list(polygon.vertices),'weights':list(bary)})
 for row in range(7):
  blend=row/6;eased=blend*blend*(3-2*blend)
  for i,(p,q) in enumerate(zip(points,top)):
   position=p.lerp(q,blend*blend);position.z=p.z+(q.z-p.z)*blend;verts.append(position)
   ws={body.vertex_groups[g.group].name:g.weight*(1-eased) for g in body.data.vertices[ids[i]].groups}
   for n,w in topweights[i].items():ws[n]=ws.get(n,0)+w*eased
   binding.append(ws)
   if row==0:anchors.append({'vertex':len(verts)-1,'source':[body.name,ids[i],ids[i],0]})
 for row in range(6):
  for i in range(N):faces.append((row*N+i,row*N+(i+1)%N,(row+1)*N+(i+1)%N,(row+1)*N+i))
 me=bpy.data.meshes.new(name);me.from_pydata(verts,[],faces);me.update();o=bpy.data.objects.new(name,me);col.objects.link(o);o.parent=arm;o.matrix_world=body.matrix_world.copy()
 for n in sorted({n for ws in binding for n in ws}):o.vertex_groups.new(name=n)
 for i,ws in enumerate(binding):
  total=sum(ws.values())
  for n,w in ws.items():
   if w>1e-8:o.vertex_groups[n].add([i],w/total,'REPLACE')
 mod=o.modifiers.new('Matched torso and head skin','ARMATURE');mod.object=arm
 # A clean cheek texel supplies the unchanged original skin tone.
 skin=min(head.data.vertices,key=lambda v:(v.co-Vector((6,-8,141))).length_squared);loop=next(loop for loop in head.data.loops if loop.vertex_index==skin.index);uv=tuple(head.data.uv_layers.active.data[loop.index].uv)
 layer=me.uv_layers.new(name='UVMap')
 for item in layer.data:item.uv=uv
 me.materials.append(head.data.materials[0].copy());me.materials[0].name='Customer 06 original neck skin transition'
 for p in me.polygons:p.use_smooth=True
 o['source_seam_anchors']=json.dumps(anchors);o['upper_source_anchors']=json.dumps([{'vertex':6*N+i,**ref} for i,ref in enumerate(topreferences)])
 report={'bodySeamVertices':N,'fittedRings':7,'concealedOriginalNeckFaces':count,'headGeometryUVWeightsUnmodified':True,'bodyMeshUnmodified':True,'construction':'smooth neck surface matched to the actual torso boundary and tucked inside the unchanged original jaw'}
 (folder/'neck-fit.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report));return o
if __name__=='__main__':
 folder=ROOT/'tools/models/cast/customer-06';bpy.ops.wm.open_mainfile(filepath=str(folder/'character.blend'));a=bpy.data.objects['Armature'];body=bpy.data.objects['customer-06 body'];apply(body,a,folder)
 bpy.context.preferences.filepaths.save_version=0;bpy.ops.file.pack_all();bpy.ops.wm.save_as_mainfile(filepath=str(folder/'character.blend'))
