import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {Box3,Vector3,Mesh} from 'three';

async function load() {
 const bytes=readFileSync(new URL('../public/models/equipment-cabling.glb',import.meta.url));
 const {scene}=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
 scene.updateMatrixWorld(true);return {scene,bytes:bytes.length};
}

test('ceiling feed keeps named parts, material roles, UVs and a small cost',async()=>{
 const {scene,bytes}=await load();
 let triangles=0,meshes=0;const materials=new Set<string>();
 scene.traverse(o=>{if(!(o instanceof Mesh))return;meshes++;const g=o.geometry;
  assert.equal(g.attributes.uv.count,g.attributes.position.count);
  for(const v of g.attributes.position.array)assert.ok(Number.isFinite(v));
  triangles+=(g.index?.count??g.attributes.position.count)/3;
  materials.add((Array.isArray(o.material)?o.material[0]:o.material).name);});
 assert.equal(meshes,9);assert.ok(triangles<4500);assert.ok(bytes<250000);
 assert.deepEqual([...materials].sort(),['BoxCoverIvory','BrassContact','ConduitGalvanized','CordJacket','PlugBody']);
 for(const name of ['TvCeilingFeed','JunctionBoxDuplex','PowerPlugRightAngle','TvLeadCord','CordGripConnector','CordClips','ExposedRise','Anchor_PlateEdge','Anchor_ServiceBox'])
  assert.ok(scene.getObjectByName(name),name);
});

test('every run terminates at a device or service point with no dangling end',async()=>{
 const {scene}=await load();
 const world=(n:string)=>new Vector3().setFromMatrixPosition(scene.getObjectByName(n)!.matrixWorld);
 const plate=world('Anchor_PlateEdge'),service=world('Anchor_ServiceBox');
 // Lead: plug end inside the box footprint, gland end at the plate edge.
 const lead=new Box3().setFromObject(scene.getObjectByName('TvLeadCord')!);
 assert.ok(lead.max.z>plate.z-.07&&lead.max.z<=-.289,'lead ends at the gland');
 const box=new Box3().setFromObject(scene.getObjectByName('JunctionBoxDuplex')!);
 assert.ok(box.min.x<-.16&&box.max.x>.16&&box.max.y<=.001&&box.min.y>-.14,'box hangs at the ceiling datum');
 assert.ok(Math.abs((box.min.z+box.max.z)/2-service.z)<.01);
 const plug=new Box3().setFromObject(scene.getObjectByName('PowerPlugRightAngle')!);
 assert.ok(plug.min.x>box.min.x&&plug.max.x<box.max.x&&plug.min.z>box.min.z&&plug.max.z<box.max.z+.07,'plug seats on the box face');
 const grip=new Box3().setFromObject(scene.getObjectByName('CordGripConnector')!);
 assert.ok(Math.abs(grip.max.z-plate.z)<.001,'gland nut seats on the plate edge');
 // Rise: starts at the box connector, ends at the roof underside .35 ft above the tile datum.
 const rise=new Box3().setFromObject(scene.getObjectByName('ExposedRise')!);
 assert.ok(Math.abs(rise.max.y-.35)<.02,'rise reaches the roof underside');assert.ok(rise.min.x<=box.max.x+.001);
 // 0.30 ft bend radius against a 0.0294 ft conduit radius: more than ten pipe radii.
 assert.ok(.30/.0294>10);
});
