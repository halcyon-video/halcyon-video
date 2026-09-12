import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('shipped chair GLB retains child scale, UVs and one reusable plastic primitive', () => {
  const bytes=readFileSync(new URL('../public/models/children-chair.glb',import.meta.url));
  assert.equal(bytes.readUInt32LE(0),0x46546c67);
  const gltf=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)).toString());
  assert.equal(gltf.meshes.length,1);
  const [part]=gltf.meshes[0].primitives;
  assert.equal(gltf.meshes[0].primitives.length,1);
  assert.equal(gltf.materials[part.material].name,'ChairPlastic');
  assert.equal(gltf.images?.length??0,0);
  assert.ok(part.attributes.TEXCOORD_0!==undefined);
  const pos=gltf.accessors[part.attributes.POSITION];
  const size=pos.max.map((n:number,i:number)=>n-pos.min[i]);
  // Blender exports vertex positions Y-up; retain physical child dimensions.
  assert.ok(size[0]>=1 && size[0]<=1.25,`width ${size[0]}`);
  assert.ok(size[1]>=1.66 && size[1]<=2,`height ${size[1]}`);
  assert.ok(size[2]>=1 && size[2]<=1.25,`depth ${size[2]}`);
  assert.ok(Math.abs(pos.min[1])<.001,'floor origin');
  assert.ok(gltf.accessors[part.indices].count/3<7000,'triangle budget');
  assert.ok(bytes.length<200000,'download budget');
});
