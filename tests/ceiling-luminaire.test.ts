import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { exposedCeilingEnabled, aimLuminaire } from '../src/ceiling-luminaire.ts';

test('exposed fixtures are optional and never hang into a low shop',()=>{
  for(const h of [13.5,18]) assert.ok(exposedCeilingEnabled('corporate',h,'exposed'));
  for(const [f,h,s] of [['corporate',13.5,null],['corporate',9,'exposed'],['mom-and-pop',18,'exposed']] as const) assert.equal(exposedCeilingEnabled(f,h,s),false);
});
for(const variant of ['dome','directional'] as const) test(`${variant} exported attachment, UVs, scale and beam contract`,async()=>{
  const bytes=fs.readFileSync(new URL(`../public/models/ceiling-luminaire-${variant}.glb`,import.meta.url));
  const {scene}=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
  scene.updateMatrixWorld(true);const bounds=new THREE.Box3().setFromObject(scene);
  assert.ok(Math.abs(bounds.max.y)<.001); assert.ok(bounds.min.y>=-1.961);
  assert.ok(bounds.max.x-bounds.min.x<=1.501);
  const roles=new Set<string>();let triangles=0;
  scene.traverse(o=>{if(o instanceof THREE.Mesh){assert.ok(o.geometry.getAttribute('uv'));triangles+=o.geometry.index!.count/3;for(const m of Array.isArray(o.material)?o.material:[o.material])roles.add(m.name);}});
  assert.ok(triangles<3500);for(const role of ['OuterPaint','InnerReflector','Lamp','Hardware'])assert.ok(roles.has(role));
  const key=new THREE.SpotLight();aimLuminaire(key,{x:4,y:13.5,z:-20,variant});
  const lamp=scene.getObjectByName(variant+'_Lamp_anchor')!.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(4,13.5,-20));
  assert.ok(lamp.distanceTo(key.position)<.001);
  const direction=key.target.position.clone().sub(key.position).normalize();
  assert.ok(direction.y<-.9);if(variant==='directional')assert.ok(Math.abs(direction.z+Math.sin(25*Math.PI/180))<.005);
  assert.ok(13.5+bounds.min.y>11.5,'clear of navigation and shelf/sign bodies');
});
