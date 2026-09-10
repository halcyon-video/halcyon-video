import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { buildFrontSoffit, frontSoffitY, FRONT_SOFFIT_DROP } from '../src/ceiling-soffit.ts';
import { installDownlightModels, DOWNLIGHT_APERTURE_RADIUS, DOWNLIGHT_CAN_DEPTH, DOWNLIGHT_TRIM_DROP } from '../src/downlight-model.ts';
import { auditStoreMaterials, selfLit } from '../src/material-lighting.ts';

const dummyMaterial = new THREE.MeshStandardMaterial({ color: 0xcccccc, roughness: 0.8 });
const validSpec = { counterShape: 'shield', doorWidth: 3.5, entryStyle: 'vestibule' as const };

test('buildFrontSoffit plainWhite: shield counter places verified cans and cuts slab holes', async () => {
  const scene = new THREE.Scene();
  const ceilingY = 11.5;
  const result = buildFrontSoffit({
    scene,
    ceilingY,
    storefrontSpec: validSpec,
    storeWidth: 60,
    corniceWallGap: 0.5,
    corniceBand: 1.0,
    corniceDrop: 2.7,
    tileMaterial: dummyMaterial,
    trofferPanelMaterial: dummyMaterial,
    trofferFrameMaterial: dummyMaterial,
    tileX: 2.5,
    tileZ: 2.5,
    softwareGL: false,
    reflectorSize: { w: 100, h: 100 },
    plainWhite: true,
  });

  // Shield counter has 4 downlights fitting along the front chain
  assert.equal(result.troffers.length, 4);
  assert.equal(result.soffitY, frontSoffitY(ceilingY));

  // The fallback group is present
  const fallback = result.group.getObjectByName('downlightFallback');
  assert.ok(fallback, 'downlightFallback group should exist');
  assert.equal(fallback.children.length, 8); // 4 trim + 4 light discs

  // Verify slab has holes cut out
  const slab = result.group.children.find(c => c instanceof THREE.Mesh && c.name !== 'downlightFallback') as THREE.Mesh;
  assert.ok(slab, 'Slab mesh should exist');
  assert.ok(slab.geometry instanceof THREE.ShapeGeometry);
  // Shape with holes will have significantly more vertices than plain 4-vertex polygon
  assert.ok(slab.geometry.attributes.position.count > 30, 'Slab geometry should have hole triangulations');

  // Verify clearance: fixture can depth (0.55 ft) fits inside the 2.0 ft drop
  assert.ok(DOWNLIGHT_CAN_DEPTH < FRONT_SOFFIT_DROP);
  // Floor clearance at standard 11.5 ft ceiling: soffit at 9.5 ft, trim lip at 9.485 ft (well above 7ft door/nav limit)
  const soffitHeadroom = result.soffitY - DOWNLIGHT_TRIM_DROP;
  assert.ok(soffitHeadroom > 7.0, `Headroom ${soffitHeadroom} should exceed 7 ft`);

  // Wait for async model loader to attach 3D downlights
  for (let i = 0; i < 50 && fallback.visible; i++) {
    await new Promise(r => setTimeout(r, 50));
  }
  assert.equal(fallback.visible, false, 'Fallback should be hidden once models load');
  const hardware = result.group.getObjectByName('recessed-downlights');
  assert.ok(hardware, 'recessed-downlights group should be attached');
  assert.equal(hardware.children.length, 4, 'Should have 4 3D downlight instances');

  // Verify material lighting audit passes with zero problems
  const audit = auditStoreMaterials(result.group);
  assert.deepEqual(audit.problems, [], `auditStoreMaterials found problems: ${audit.problems.join(', ')}`);
});

test('buildFrontSoffit plainWhite across desk and usquare shapes', () => {
  const scene = new THREE.Scene();
  // Desk counter has no soffit
  const deskResult = buildFrontSoffit({
    scene,
    ceilingY: 10.0,
    storefrontSpec: { counterShape: 'desk', doorWidth: 3.5, entryStyle: 'vestibule' as const },
    storeWidth: 40,
    corniceWallGap: 0.5,
    corniceBand: 1.0,
    corniceDrop: 2.7,
    tileMaterial: dummyMaterial,
    trofferPanelMaterial: dummyMaterial,
    trofferFrameMaterial: dummyMaterial,
    tileX: 2.5,
    tileZ: 2.5,
    softwareGL: false,
    reflectorSize: { w: 100, h: 100 },
    plainWhite: true,
  });
  assert.equal(deskResult.troffers.length, 0);

  // U-square counter
  const usquareResult = buildFrontSoffit({
    scene,
    ceilingY: 10.0,
    storefrontSpec: { counterShape: 'usquare', doorWidth: 3.5, entryStyle: 'vestibule' as const },
    storeWidth: 50,
    corniceWallGap: 0.5,
    corniceBand: 1.0,
    corniceDrop: 2.7,
    tileMaterial: dummyMaterial,
    trofferPanelMaterial: dummyMaterial,
    trofferFrameMaterial: dummyMaterial,
    tileX: 2.5,
    tileZ: 2.5,
    softwareGL: false,
    reflectorSize: { w: 100, h: 100 },
    plainWhite: true,
  });
  assert.ok(usquareResult.troffers.length > 0);
});

test('buildFrontSoffit non-plainWhite keeps rectangular troffers without holes', () => {
  const scene = new THREE.Scene();
  const result = buildFrontSoffit({
    scene,
    ceilingY: 11.5,
    storefrontSpec: validSpec,
    storeWidth: 60,
    corniceWallGap: 0.5,
    corniceBand: 1.0,
    corniceDrop: 2.7,
    tileMaterial: dummyMaterial,
    trofferPanelMaterial: dummyMaterial,
    trofferFrameMaterial: dummyMaterial,
    tileX: 2.5,
    tileZ: 2.5,
    softwareGL: false,
    reflectorSize: { w: 100, h: 100 },
    plainWhite: false,
  });
  assert.equal(result.troffers.length, 2);
  assert.equal(result.group.getObjectByName('downlightFallback'), undefined);
});

test('installDownlightModels: lifecycle, fallback hiding, and material lighting audit', async () => {
  const scene = new THREE.Scene();
  const parent = new THREE.Group();
  scene.add(parent);

  const fallback = new THREE.Group();
  fallback.name = 'downlightFallback';
  const g = new THREE.CircleGeometry(DOWNLIGHT_APERTURE_RADIUS);
  const m = selfLit(new THREE.MeshStandardMaterial(), 'light-source');
  fallback.add(new THREE.Mesh(g, m));
  parent.add(fallback);

  const positions = [
    { x: -5, y: 9.5, z: 2 },
    { x: 0, y: 9.5, z: -3 },
    { x: 5, y: 9.5, z: 2 },
  ];

  let loaded = false;
  const dispose = installDownlightModels(parent, positions, fallback, () => {
    loaded = true;
  });

  // Wait for async load to complete
  for (let i = 0; i < 50 && !loaded; i++) {
    await new Promise(r => setTimeout(r, 50));
  }
  assert.ok(loaded, 'Model should load successfully');

  // Fallback hidden and 3D downlights added
  assert.equal(fallback.visible, false, 'Fallback should be hidden after load');
  const hardware = parent.getObjectByName('recessed-downlights');
  assert.ok(hardware, 'recessed-downlights group should exist');
  assert.equal(hardware.children.length, 3, 'Should have 3 downlight instances');

  // Audit materials: must pass with 0 problems
  const audit = auditStoreMaterials(parent);
  assert.deepEqual(audit.problems, [], `auditStoreMaterials found problems: ${audit.problems.join(', ')}`);
  assert.ok(audit.exceptions['light-source'] >= 1, 'Lamp should have light-source exception');

  // Test disposal
  dispose();
  assert.equal(parent.getObjectByName('recessed-downlights'), undefined, 'Hardware should be detached');
});
