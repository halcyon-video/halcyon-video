"""Fit customer six's immutable original head to his replacement body rig.
The mesh data, original albedo UVs and original head skin weights stay intact.
"""
import bpy,bmesh,json,hashlib
from pathlib import Path
from mathutils import Vector,Matrix

def fingerprint(obj):
 uv=obj.data.uv_layers.active.data
 faces=[[(tuple(obj.data.vertices[obj.data.loops[i].vertex_index].co),tuple(uv[i].uv),sorted((obj.vertex_groups[g.group].name,g.weight) for g in obj.data.vertices[obj.data.loops[i].vertex_index].groups)) for i in p.loop_indices] for p in obj.data.polygons]
 return hashlib.sha256(repr(faces).encode()).hexdigest()

def apply(body,arm,folder):
 if body.get('original_head_grafted'):return
 path=folder/'identity-head.blend'
 if not path.exists():raise RuntimeError('Missing checked original customer-six identity mesh')
 head_z=arm.data.bones['Head'].head_local.z;delete=[]
 for p in body.data.polygons:
  ws={}
  for vi in p.vertices:
   for g in body.data.vertices[vi].groups:
    n=body.vertex_groups[g.group].name;ws[n]=ws.get(n,0)+g.weight/len(p.vertices)
  if ws.get('Head',0)>.30 or (p.center.z>head_z-5 and ws.get('Head',0)+ws.get('neck',0)>.55):delete.append(p.index)
 bm=bmesh.new();bm.from_mesh(body.data);bm.faces.ensure_lookup_table();bmesh.ops.delete(bm,geom=[bm.faces[i] for i in delete],context='FACES');bmesh.ops.delete(bm,geom=[v for v in bm.verts if not v.link_faces],context='VERTS');bm.to_mesh(body.data);bm.free()
 names=['Customer 06 original head and face','Customer 06 fitted thick stubble']
 with bpy.data.libraries.load(str(path),link=False) as (src,dst):dst.objects=names
 head,stubble=dst.objects;old_arm=head.parent
 original_joint=old_arm.data.bones['Head'].head_local.copy();identity=json.loads((folder/'identity-head.json').read_text());old_scale=Vector(identity['bodyMatrixWorld'][0][:3]).length;new_scale=body.matrix_world.to_scale().x;ratio=old_scale/new_scale
 target=arm.data.bones['Head'].head_local.copy();offset=target-original_joint*ratio
 transform=Matrix.Translation(offset)@Matrix.Diagonal((ratio,ratio,ratio,1));col=bpy.data.collections['Casual outfit'];source_hash=head['identity_geometry_uv_weights_sha256']
 for obj in [head,stubble]:
  col.objects.link(obj);obj.parent=arm;obj.matrix_parent_inverse=Matrix.Identity(4);obj.matrix_world=body.matrix_world@transform
  for mod in obj.modifiers:
   if mod.type=='ARMATURE':mod.object=arm
  for group in obj.vertex_groups:
   if group.name not in arm.data.bones and any(group.index==g.group and g.weight>1e-8 for v in obj.data.vertices for g in v.groups):raise RuntimeError('Original identity uses an unavailable bone '+group.name)
 if fingerprint(head)!=source_hash:raise RuntimeError('Original head geometry, UVs or weights changed')
 body['original_head_grafted']=True
 result={'preservedHeadGeometryUVWeightsSHA256':source_hash,'protectedFaces':len(head.data.polygons),'replacedGeneratedHeadFaces':len(delete),'originalHeadScaleFeet':old_scale,'fittedHeadScaleFeet':head.matrix_world.to_scale().x,'localRigOffset':list(offset),'originalMeshDataUnchanged':True}
 (folder/'head-preservation.json').write_text(json.dumps(result,indent=2)+'\n');return head,stubble
