"""Native Blender mesh refinement for the existing motion candidate.
Keep the source UVs and character topology, fit shirt details to actual cloth,
and transfer interpolated skin weights so sewn details follow that cloth.
"""
import bpy, bmesh, math
from mathutils import Vector
from mathutils.bvhtree import BVHTree
from mathutils.kdtree import KDTree

def refine_cloth(arm, body, ox, extras):
    report={}
    def ease(t):
        t=max(0,min(1,t));return t*t*(3-2*t)
    for obj in [body,ox]:
        mesh=obj.data
        bm=bmesh.new();bm.from_mesh(mesh)
        bmesh.ops.remove_doubles(bm,verts=[v for v in bm.verts if 77<v.co.z<114 and any(f.material_index in {1,2,3} for f in v.link_faces)],dist=.15)
        bmesh.ops.dissolve_degenerate(bm,edges=list(bm.edges),dist=.001)
        bm.to_mesh(mesh);bm.free();mesh.update()
        source=[v.co.copy() for v in mesh.vertices]
        sleeve_vertices=set()
        if obj==ox:
            # The Oxford inherits a rolled short polo cuff. Refit that entire
            # region to one continuous sleeve instead of stretching the lip.
            for v in mesh.vertices:
                side='Left' if v.co.x>0 else 'Right'
                shoulder=arm.data.bones[side+'Arm'].head_local
                elbow=arm.data.bones[side+'ForeArm'].head_local
                wrist=arm.data.bones[side+'Hand'].head_local
                up=elbow-shoulder;fore=wrist-elbow
                t=(v.co-shoulder).dot(up)/up.length_squared
                u=(v.co-elbow).dot(fore)/fore.length_squared
                if abs(v.co.x)<17:continue
                if .18<t<1.03 and u<.04:
                    centre=shoulder+up*t;radial=v.co-centre
                    target=6.1*(1-t)+4.8*t;blend=ease((t-.18)/.18)
                elif .0<=u<.96:
                    centre=elbow+fore*u;radial=v.co-centre
                    target=4.8*(1-u)+3.3*u;blend=1-ease((u-.84)/.12)
                else:continue
                if not .2<radial.length<10:continue
                v.co=centre+radial.normalized()*(radial.length*(1-blend)+target*blend)
                sleeve_vertices.add(v.index)
            for face in mesh.polygons:
                if any(i in sleeve_vertices for i in face.vertices):face.material_index=3

        adjacency=[set() for v in mesh.vertices]
        roles=[set() for v in mesh.vertices]
        for edge in mesh.edges:
            a,b=edge.vertices;adjacency[a].add(b);adjacency[b].add(a)
        for face in mesh.polygons:
            for i in face.vertices:roles[i].add(face.material_index)
        cloth={i for i,r in enumerate(roles) if r and r.issubset({1,3})}|sleeve_vertices
        # Suppress small generated ridges on cloth, preserving neckline, trim,
        # skin, trousers and all material boundaries.
        for iteration in range(4):
            positions=[v.co.copy() for v in mesh.vertices]
            for i in cloth:
                v=mesh.vertices[i]
                if adjacency[i]:
                    mean=sum((positions[j] for j in adjacency[i]),Vector())/len(adjacency[i])
                    v.co=positions[i].lerp(mean,.22)
        mesh.update()
        # Tension runs from bust apex to the tucked waist: no hollow under-bust
        # contour. Each vertical line uses the real mesh's apex and waist depth.
        mesh.calc_loop_triangles()
        bvh=BVHTree.FromPolygons([v.co for v in mesh.vertices],[t.vertices for t in mesh.loop_triangles],all_triangles=True)
        profiles={}
        for xi in range(-36,37):
            x=xi*.5
            samples=[]
            for j in range(32):
                z=89+j*.5;hit=bvh.ray_cast(Vector((x,-60,z)),Vector((0,1,0)))
                if hit[0] is not None:samples.append((hit[0].y,z))
            foot=bvh.ray_cast(Vector((x,-60,77.5)),Vector((0,1,0)))
            if samples and foot[0] is not None:
                apex_y,apex_z=min(samples)
                profiles[xi]=(foot[0].y,apex_y,apex_z)
        changed=0
        # Apply a continuous displacement field around the whole cross-section.
        # A front-only vertex cutoff tears generated material/UV seams.
        for v in mesh.vertices:
            x,y,z=v.co
            if abs(x)>17.5 or not 77.5<z<105:continue
            a=math.floor(x*2);b=a+1
            if a not in profiles or b not in profiles:continue
            t=x*2-a
            waist,apex,top=[profiles[a][j]*(1-t)+profiles[b][j]*t for j in range(3)]
            if z>=top:continue
            hit=bvh.ray_cast(Vector((x,-60,z)),Vector((0,1,0)))[0]
            if hit is None:continue
            u=(z-77.5)/(top-77.5)
            drape=waist+(apex-waist)*(1-(1-u)**1.45)
            blend=ease((17.5-abs(x))/3)*ease((z-77.5)/2)
            # Retain the side and back, smoothly distributing forward cloth ease.
            blend*=math.exp(-((y-hit.y)/6)**2)
            delta=min(0,drape-hit.y)*blend
            v.co.y+=delta
            if abs(delta)>.01:changed+=1
        mesh.update()
        normals=[tuple(n.vector) for n in mesh.corner_normals]
        for face in mesh.polygons:
            if face.material_index in {1,3}:
                face.use_smooth=True
                for li in face.loop_indices:normals[li]=(0,0,0)
        mesh.normals_split_custom_set(normals)
        report[obj.name]={'drapedVertices':changed,'maxDisplacementCm':max((v.co-source[v.index]).length for v in mesh.vertices) if len(mesh.vertices)==len(source) else None}
    # Match the unprinted Oxford cloth exactly across inner/outer surfaces.
    # Preserve the original pixel mask where the shirt meets skin or trousers.
    material=ox.data.materials[1];nodes=material.node_tree.nodes;links=material.node_tree.links
    pigment=nodes.get('Cloth colour')
    for node in nodes:
        if node.type=='MIX_RGB' and node.inputs[0].is_linked and node.inputs[0].links[0].from_node.name=='Coverage':
            links.new(pigment.outputs[0],node.inputs[2])
    # Blender voxel remeshing resolves the inherited overlapping cuff folds.
    # Transfer skinning from the intact rest mesh, and replace only shirt faces.
    source_mesh=ox.data
    source_mesh.calc_loop_triangles()
    source_triangles=list(source_mesh.loop_triangles)
    source_bvh=BVHTree.FromPolygons([v.co for v in source_mesh.vertices],[t.vertices for t in source_triangles],all_triangles=True)
    def sleeve_point(co):
        if abs(co.x)<17:return False
        side='Left' if co.x>0 else 'Right'
        sh=arm.data.bones[side+'Arm'].head_local;el=arm.data.bones[side+'ForeArm'].head_local;wr=arm.data.bones[side+'Hand'].head_local
        up=el-sh;fore=wr-el;t=(co-sh).dot(up)/up.length_squared;u=(co-el).dot(fore)/fore.length_squared
        return (.15<t<1.05 and (co-(sh+up*t)).length<12) or (0<u<.94 and (co-(el+fore*u)).length<8)
    edge_roles={}
    for face in source_mesh.polygons:
        for edge in face.edge_keys:edge_roles.setdefault(tuple(sorted(edge)),set()).add(face.material_index)
    seam_vertices={i for edge,roles in edge_roles.items() if roles&{1,3} and roles-{1,3} for i in edge}
    seam_vertices={i for i in seam_vertices if not sleeve_point(source_mesh.vertices[i].co) and (source_mesh.vertices[i].co.z<82 or source_mesh.vertices[i].co.z>103 or (3<source_mesh.vertices[i].co.x<11 and source_mesh.vertices[i].co.z>101))}
    seams=KDTree(len(seam_vertices))
    for n,i in enumerate(seam_vertices):seams.insert(source_mesh.vertices[i].co,n)
    seams.balance()
    shirt=ox.copy();shirt.data=ox.data.copy();bpy.context.collection.objects.link(shirt)
    shirt.name='Oxford continuous shirt surface';shirt.modifiers.clear();shirt.hide_set(False)
    bpy.ops.object.select_all(action='DESELECT');shirt.select_set(True);bpy.context.view_layer.objects.active=shirt
    remesh=shirt.modifiers.new('Clean garment topology','REMESH');remesh.mode='VOXEL';remesh.voxel_size=.55;remesh.use_smooth_shade=True
    bpy.ops.object.modifier_apply(modifier=remesh.name)
    smooth=shirt.modifiers.new('Relax generated cloth ridges','SMOOTH');smooth.factor=.65;smooth.iterations=5
    bpy.ops.object.modifier_apply(modifier=smooth.name)
    uv_name=source_mesh.uv_layers.active.name
    if not shirt.data.uv_layers.get(uv_name):shirt.data.uv_layers.new(name=uv_name)
    transfer=shirt.modifiers.new('Transfer source skin weights','DATA_TRANSFER');transfer.object=ox;transfer.use_vert_data=True;transfer.data_types_verts={'VGROUP_WEIGHTS'};transfer.vert_mapping='POLYINTERP_NEAREST';transfer.layers_vgroup_select_src='ALL';transfer.layers_vgroup_select_dst='NAME';transfer.use_object_transform=False
    bpy.ops.object.modifier_apply(modifier=transfer.name)
    # A small cloth allowance keeps the remeshed surface outside its sewn edge.
    shirt.data.update()
    outward=[v.normal.copy() for v in shirt.data.vertices]
    for v,n in zip(shirt.data.vertices,outward):
        distance=seams.find(v.co)[2];blend=ease((distance-2)/2)
        point=source_bvh.find_nearest(v.co)[0]
        v.co=point.lerp(v.co,blend)+n*(.02+.10*blend)
        # Keep the overlapping edge outside the original surface; let the
        # lining recede only once the continuous outer surface fully covers it.
        v.co+=n*(max(0,.03-(v.co-point).dot(n))*(1-ease((distance-4)/1.0)))
    shirt.data.update()
    # Match the original cut edge's shading as well as its position. The
    # smooth rebuilt sleeves retain their own normals away from actual seams.
    seam_group=shirt.vertex_groups.new(name='Temporary seam normal blend')
    for v in shirt.data.vertices:
        strength=1-ease((seams.find(v.co)[2]-2)/1.5)
        if strength:seam_group.add([v.index],strength,'REPLACE')
    normal_transfer=shirt.modifiers.new('Continuous shading at sewn edges','DATA_TRANSFER');normal_transfer.object=ox;normal_transfer.use_loop_data=True;normal_transfer.data_types_loops={'CUSTOM_NORMAL'};normal_transfer.loop_mapping='POLYINTERP_NEAREST';normal_transfer.vertex_group=seam_group.name;normal_transfer.use_object_transform=False
    bpy.ops.object.modifier_apply(modifier=normal_transfer.name)
    seam_group=shirt.vertex_groups.get('Temporary seam normal blend')
    if seam_group:shirt.vertex_groups.remove(seam_group)
    bm=bmesh.new();bm.from_mesh(shirt.data)
    remove=[]
    for f in bm.faces:
        centre=f.calc_center_median();hit=source_bvh.find_nearest(centre)
        role=source_mesh.polygons[source_triangles[hit[2]].polygon_index].material_index
        if (role not in {1,3} and not sleeve_point(centre)) or seams.find(centre)[2]<2:remove.append(f)
        else:f.material_index=3;f.smooth=True
    bmesh.ops.delete(bm,geom=remove,context='FACES')
    bm.to_mesh(shirt.data);bm.free()
    # Retain a continuous inner cloth surface to close the source's fine cut
    # edges. Recess it beneath the rebuilt shirt while fixing its sewn boundary.
    cloth_vertices={i for f in ox.data.polygons if f.material_index in {1,3} for i in f.vertices}|{v.index for v in ox.data.vertices if sleeve_point(v.co)}
    for i in cloth_vertices:
        v=ox.data.vertices[i];distance=seams.find(v.co)[2]
        is_sleeve=sleeve_point(v.co)
        if is_sleeve:
            side='Left' if v.co.x>0 else 'Right'
            sh=arm.data.bones[side+'Arm'].head_local;el=arm.data.bones[side+'ForeArm'].head_local;wr=arm.data.bones[side+'Hand'].head_local
            centres=[]
            for a,b in [(sh,el),(el,wr)]:
                axis=b-a;t=max(0,min(1,(v.co-a).dot(axis)/axis.length_squared));centres.append(a+axis*t)
            centre=min(centres,key=lambda c:(v.co-c).length_squared)
            inward=(v.co-centre).normalized()
        else:inward=Vector((v.co.x,v.co.y+1,0)).normalized()
        v.co-=inward*((1.2 if is_sleeve else .45)*ease((distance-4)/1.0))
    ox.data.update()
    bpy.ops.object.select_all(action='DESELECT');ox.hide_set(False);ox.select_set(True);shirt.select_set(True);bpy.context.view_layer.objects.active=ox
    bpy.ops.object.join();ox.data.update()
    report['oxfordRemeshedVertices']=len(ox.data.vertices)
    # Rebuild the pocket as a sewn cloth patch, rather than one planar n-gon.
    pocket=next(o for o in extras if o.name=='Oxford chest pocket')
    mat=pocket.data.materials[0];verts=[];faces=[];nx=12;nz=14
    for j in range(nz+1):
        for i in range(nx+1):
            x=4+6*i/nx;bottom=94+1.1*abs(x-7)/3
            verts.append((x,0,bottom+(101.7-bottom)*j/nz))
            if i and j:
                k=j*(nx+1)+i;faces.append((k-nx-2,k-nx-1,k,k-1))
    me=bpy.data.meshes.new('Oxford pocket conforming cloth grid');me.from_pydata(verts,[],faces);me.update();pocket.data=me;me.materials.append(mat)
    for p in me.polygons:p.use_smooth=True
    for modifier in pocket.modifiers:
        if modifier.type=='SOLIDIFY':modifier.thickness=.10;modifier.offset=0
    # Fit front details and use barycentric skin interpolation from the exact
    # triangle under each vertex. Shared transforms keep clearance in motion.
    mesh=ox.data;mesh.calc_loop_triangles();triangles=list(mesh.loop_triangles)
    bvh=BVHTree.FromPolygons([v.co for v in mesh.vertices],[t.vertices for t in triangles],all_triangles=True)
    for obj in extras:
        if not any(key in obj.name for key in ['chest pocket','button','placket']):continue
        # Placket needs enough samples to follow the drape and spine bends.
        if 'placket' in obj.name:
            bm=bmesh.new();bm.from_mesh(obj.data);bmesh.ops.subdivide_edges(bm,edges=list(bm.edges),cuts=2,use_grid_fill=True);bm.to_mesh(obj.data);bm.free()
        obj.vertex_groups.clear()
        for group in ox.vertex_groups:obj.vertex_groups.new(name=group.name)
        for v in obj.data.vertices:
            x,_,z=v.co
            loc,normal,index,_=bvh.ray_cast(Vector((x,-60,z)),Vector((0,1,0)))
            if loc is None:raise RuntimeError('No cloth under '+obj.name)
            tri=triangles[index];a,b,c=[mesh.vertices[i].co for i in tri.vertices]
            v0=b-a;v1=c-a;v2=loc-a
            d00=v0.dot(v0);d01=v0.dot(v1);d11=v1.dot(v1);d20=v2.dot(v0);d21=v2.dot(v1)
            den=d00*d11-d01*d01
            bv=(d11*d20-d01*d21)/den;cv=(d00*d21-d01*d20)/den
            ws={}
            for vi,factor in zip(tri.vertices,[1-bv-cv,bv,cv]):
                for g in mesh.vertices[vi].groups:ws[g.group]=ws.get(g.group,0)+g.weight*max(0,factor)
            total=sum(ws.values())
            for group,w in ws.items():obj.vertex_groups[group].add([v.index],w/total,'REPLACE')
            clearance=.38 if 'button ' in obj.name else .24
            v.co=Vector((x,loc.y-clearance,z))
        obj.data.update()
    report['pocketVertices']=len(pocket.data.vertices)
    return report
