// The store's security camera — the 1993 footage has a beige camera watching
// the floor from up high, and our library-select mode has always been the
// "security cam" view. This prop closes the loop: a camera body hangs from
// the ceiling directly over OVERVIEW_POS, aimed the way the overview looks,
// so the vantage the player borrows in library-select visibly belongs to a
// real piece of store hardware.
import * as THREE from 'three';
import type { StoreScene } from '../three-scene';
import { OVERVIEW_POS } from '../scene-shared';

/**
 * `mountYAt` answers "what ceiling height is actually overhead at (x,z)" —
 * store-shell passes a resolver that returns the dropped cash-wrap soffit lid
 * when the point sits under it, so the camera never hangs hidden above it.
 */
export function buildSecurityCamera93(scene: StoreScene, mountYAt?: (x: number, z: number) => number): void {
  const storeWidth = scene.getStoreWidth();
  const rightWall = 11.0 + storeWidth / 2;
  const x = Math.min(OVERVIEW_POS.x, rightWall - 1.2);
  const z = OVERVIEW_POS.z;
  const ceilingY = mountYAt ? mountYAt(x, z) : scene.ceilingY;

  const group = new THREE.Group();
  group.name = 'security-camera-93';

  const beige = new THREE.MeshStandardMaterial({ color: 0xdfd8c6, roughness: 0.5, metalness: 0.1 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x1c1c20, roughness: 0.3, metalness: 0.4 });

  // Drop arm from the ceiling.
  const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.9, 8), dark);
  arm.position.set(0, -0.45, 0);
  group.add(arm);
  const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.03, 12), dark);
  plate.position.set(0, -0.015, 0);
  group.add(plate);

  // Camera body + lens hood, aimed with the overview's default look: across
  // the floor toward the shelf field.
  const head = new THREE.Group();
  head.position.set(0, -0.95, 0);
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.24, 0.26), beige);
  body.castShadow = true;
  head.add(body);
  const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 0.16, 12), dark);
  lens.rotation.z = Math.PI / 2;
  lens.position.set(-0.36, 0, 0);
  head.add(lens);
  // Little red REC bead. Emissive as a highlight only — bakeEmissiveOff keeps
  // the env bake from treating it as a lamp.
  const led = new THREE.Mesh(
    new THREE.SphereGeometry(0.02, 8, 8),
    new THREE.MeshStandardMaterial({ color: 0x300000, emissive: 0xdd2222, emissiveIntensity: 1.2 })
  );
  led.position.set(-0.1, 0.14, 0);
  led.userData.bakeEmissiveOff = true;
  head.add(led);

  // Aim: lens (-X of the head) toward the store centre at floor height.
  const target = new THREE.Vector3(11.0, 3.0, -6.0);
  const camPos = new THREE.Vector3(x, ceilingY - 0.95, z);
  const dir = target.clone().sub(camPos);
  head.rotation.y = Math.atan2(dir.z, -dir.x); // yaw turning the local -X lens onto dir (XZ)
  head.rotation.z = -Math.asin(dir.y / dir.length()); // then pitch the lens down
  head.traverse(o => { o.castShadow = true; });
  group.add(head);

  group.position.set(x, ceilingY, z);
  scene.scene.add(group);
  scene.activeSignageObjects.push(group);
}
