// Vestibule door builder (T05): one glass door leaf + its static frame,
// honoring StorefrontSpec.doorStyle/doorWidth. Extracted out of the old
// entrance.ts monolith's `buildSwingingDoor` closure so `doorStyle` can pick
// between real alternatives instead of always building the same swing leaf.
//
//   'double-swing' (default) — today's look: a single leaf that swings open
//     on player approach and settles shut again (the "double" refers to it
//     swinging both in and out, not to a second leaf).
//   'single'   — a lighter pull-door variant: thinner frame, a vertical pull
//     handle instead of a push bar, opens one direction only.
import * as THREE from 'three';
import { addGlassReflectionPane } from '../glass-reflection';
import { FixtureContext } from '../fixtures';
import { StorefrontSpec } from '../store-layout';
import { createDoorLeafFrame, createDoorPushBarGeometry } from './door-leaf';

export interface VestibuleDoor {
  group: THREE.Group;
  center: THREE.Vector3;
  openAngle: number;
  currentAngle: number;
  // Proximity latch for the door-open chime: set when the player crosses the
  // open threshold, re-armed (with hysteresis) once they clearly walk away.
  wasOpen: boolean;
}

export interface DoorMaterials {
  frameMat: THREE.Material;
  glassMat: THREE.Material;
  chrome: THREE.Material;
}

// Build one door opening: the static header/jambs (added straight to `group`,
// registered as colliders) plus a leaf that update()-time proximity logic
// swings open (see entrance/index.ts's per-frame door loop).
// `alongX`/`hingeOnLeftOrInner` describe the opening's orientation exactly
// like the original buildSwingingDoor did.
//
// `frame` selectively suppresses static frame parts: a PAIR of adjacent
// leaves meeting at a center stile (the reference-photo double door,
// entrance/index.ts) shares ONE header and must not double-build the jamb at
// the shared meeting edge — two coincident boxes would z-fight.
export interface DoorFrameOpts {
  header?: boolean;    // default true
  jambLeft?: boolean;  // the doorX - w/2 (alongX) / doorZ - w/2 jamb, default true
  jambRight?: boolean; // the doorX + w/2 (alongX) / doorZ + w/2 jamb, default true
}

export function buildVestibuleDoor(
  ctx: FixtureContext,
  group: THREE.Group,
  mats: DoorMaterials,
  spec: Pick<StorefrontSpec, 'doorStyle' | 'doorWidth'>,
  doorX: number,
  doorZ: number,
  doorH: number,
  alongX: boolean,
  hingeOnLeftOrInner: boolean,
  openAngle: number,
  frame?: DoorFrameOpts,
): VestibuleDoor {
  const { frameMat, glassMat, chrome } = mats;
  const w = spec.doorWidth;
  const isSingle = spec.doorStyle === 'single';
  const barY = 3.4; // push-bar / handle height

  const box = (bw: number, bh: number, bd: number, mat: THREE.Material, x: number, y: number, z: number): THREE.Mesh => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, bd), mat);
    m.position.set(x, y, z);
    m.castShadow = !(mat instanceof THREE.MeshPhysicalMaterial && (mat as THREE.MeshPhysicalMaterial).transparent);
    m.receiveShadow = true;
    group.add(m);
    ctx.addCollider(m);
    return m;
  };

  const doorGroup = new THREE.Group();
  let hingeX = doorX;
  let hingeZ = doorZ;
    // Swing/single leaves pivot at a jamb.
    if (alongX) {
      hingeX = hingeOnLeftOrInner ? (doorX - w / 2) : (doorX + w / 2);
      doorGroup.position.set(hingeX, 0, doorZ);
    } else {
      hingeZ = hingeOnLeftOrInner ? (doorZ - w / 2) : (doorZ + w / 2);
      doorGroup.position.set(doorX, 0, hingeZ);
    }
  group.add(doorGroup);

  const addToDoorGroup = (mesh: THREE.Mesh) => {
    doorGroup.add(mesh);
    ctx.addCollider(mesh);
  };

  const glassThick = isSingle ? 0.035 : 0.05;
  const frameShrink = isSingle ? 0.12 : 0.2;
  const localOffset = (alongX ? (hingeOnLeftOrInner ? w / 2 : -w / 2) : (hingeOnLeftOrInner ? w / 2 : -w / 2));

  const leafFrame = new THREE.Mesh(createDoorLeafFrame(w, doorH, isSingle), frameMat);
  leafFrame.name = 'movingDoorLeafFrame';
  if (alongX) leafFrame.position.x = localOffset;
  else { leafFrame.rotation.y = Math.PI / 2; leafFrame.position.z = localOffset; }
  leafFrame.castShadow = leafFrame.receiveShadow = true;
  addToDoorGroup(leafFrame);

  if (alongX) {
    const glassMesh = new THREE.Mesh(new THREE.BoxGeometry(w - frameShrink, doorH - 0.4, glassThick), glassMat);
    glassMesh.position.set(localOffset, doorH / 2, 0);
    glassMesh.castShadow = false;
    glassMesh.receiveShadow = true;
    addToDoorGroup(glassMesh);
    // Reflection the leaf's 0.06-opacity glass can't show on its own — see
    // glass-reflection.ts. FrontSide because the leaf is a slab (outward
    // normals; the far faces depth-reject behind the near one), and it goes on
    // doorGroup directly so it swings with the leaf but never becomes a collider.
    addGlassReflectionPane(glassMesh, doorGroup, { side: THREE.FrontSide });

    if (isSingle) {
      // Vertical pull handles on both interior and exterior near the leaf's free edge (latch stile).
      const latchOffset = hingeOnLeftOrInner ? (w / 2 - 0.22) : -(w / 2 - 0.22);
      for (const zSide of [-0.09, 0.09]) {
        const handleMesh = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.1, 0.08), chrome);
        handleMesh.position.set(localOffset + latchOffset, barY, zSide);
        handleMesh.castShadow = true;
        handleMesh.receiveShadow = true;
        addToDoorGroup(handleMesh);
      }
    } else {
      const pushBarGeo = createDoorPushBarGeometry(w);
      const pushBar = new THREE.Mesh(pushBarGeo, frameMat);
      pushBar.name = 'doorPushBar';
      pushBar.position.set(localOffset, barY, -0.0575);
      pushBar.rotation.y = Math.PI;
      pushBar.castShadow = pushBar.receiveShadow = true;
      addToDoorGroup(pushBar);

      const pullBar = new THREE.Mesh(pushBarGeo, frameMat);
      pullBar.name = 'exteriorDoorPull';
      pullBar.position.set(localOffset, barY, 0.0575);
      pullBar.rotation.y = 0;
      pullBar.castShadow = pullBar.receiveShadow = true;
      addToDoorGroup(pullBar);
    }
  } else {
    const glassMesh = new THREE.Mesh(new THREE.BoxGeometry(glassThick, doorH - 0.4, w - frameShrink), glassMat);
    glassMesh.position.set(0, doorH / 2, localOffset);
    glassMesh.castShadow = false;
    glassMesh.receiveShadow = true;
    addToDoorGroup(glassMesh);
    // Reflection the leaf's 0.06-opacity glass can't show on its own — see
    // glass-reflection.ts. FrontSide because the leaf is a slab (outward
    // normals; the far faces depth-reject behind the near one), and it goes on
    // doorGroup directly so it swings with the leaf but never becomes a collider.
    addGlassReflectionPane(glassMesh, doorGroup, { side: THREE.FrontSide });

    if (isSingle) {
      const latchOffset = hingeOnLeftOrInner ? (w / 2 - 0.22) : -(w / 2 - 0.22);
      for (const xSide of [-0.09, 0.09]) {
        const handleMesh = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.1, 0.06), chrome);
        handleMesh.position.set(xSide, barY, localOffset + latchOffset);
        handleMesh.castShadow = true;
        handleMesh.receiveShadow = true;
        addToDoorGroup(handleMesh);
      }
    } else {
      const pushBarGeo = createDoorPushBarGeometry(w);
      const pushBar = new THREE.Mesh(pushBarGeo, frameMat);
      pushBar.name = 'doorPushBar';
      pushBar.position.set(0.0575, barY, localOffset);
      pushBar.rotation.y = Math.PI / 2;
      pushBar.castShadow = pushBar.receiveShadow = true;
      addToDoorGroup(pushBar);

      const pullBar = new THREE.Mesh(pushBarGeo, frameMat);
      pullBar.name = 'exteriorDoorPull';
      pullBar.position.set(-0.0575, barY, localOffset);
      pullBar.rotation.y = -Math.PI / 2;
      pullBar.castShadow = pullBar.receiveShadow = true;
      addToDoorGroup(pullBar);
    }
  }

  // Static frame: header + jambs (any of them suppressible via `frame`, see
  // DoorFrameOpts).
  const frameT = isSingle ? 0.08 : 0.16;
  const frameD = isSingle ? 0.38 : 0.30;
  const headerW = isSingle ? w + frameT * 2 : w + 0.3;
  const headerH = isSingle ? 0.20 : 0.25;
  const wantHeader = frame?.header !== false;
  const wantJambLeft = frame?.jambLeft !== false;
  const wantJambRight = frame?.jambRight !== false;
  if (alongX) {
    if (wantHeader) box(headerW, headerH, frameD, frameMat, doorX, doorH + 0.10, doorZ);
    if (wantJambLeft) box(frameT, doorH, frameD, frameMat, doorX - w / 2, doorH / 2, doorZ);
    if (wantJambRight) box(frameT, doorH, frameD, frameMat, doorX + w / 2, doorH / 2, doorZ);

  } else {
    if (wantHeader) box(frameD, headerH, headerW, frameMat, doorX, doorH + 0.10, doorZ);
    if (wantJambLeft) box(frameD, doorH, frameT, frameMat, doorX, doorH / 2, doorZ - w / 2);
    if (wantJambRight) box(frameD, doorH, frameT, frameMat, doorX, doorH / 2, doorZ + w / 2);

  }



  return {
    group: doorGroup,
    center: new THREE.Vector3(doorX, doorH / 2, doorZ),
    openAngle,
    currentAngle: 0,
    wasOpen: false,
  };
}

// Per-frame: swing every door open/closed based on proximity to
// `playerPos`. Returns true when any door just crossed from closed to open
// this frame (the caller rings the shop bell on that edge). The re-arm
// threshold sits past the open one so hovering right at the boundary can't
// machine-gun the chime.
export function updateVestibuleDoors(doors: VestibuleDoor[], playerPos: THREE.Vector3): boolean {
  let justOpened = false;
  for (const door of doors) {
    const dist = playerPos.distanceTo(door.center);
    const open = dist < 7.0;
    if (open && !door.wasOpen) {
      door.wasOpen = true;
      justOpened = true;
    } else if (door.wasOpen && dist > 7.6) {
      door.wasOpen = false;
    }
      const targetAngle = open ? door.openAngle : 0;
      door.currentAngle = THREE.MathUtils.lerp(door.currentAngle, targetAngle, 0.1);
      door.group.rotation.y = door.currentAngle;
  }
  return justOpened;
}
