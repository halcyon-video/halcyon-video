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
//   'sliding'  — the leaf translates sideways into a pocket instead of
//     rotating, proving the swappable-door-style path end to end.
import * as THREE from 'three';
import { addGlassReflectionPane } from '../glass-reflection';
import { FixtureContext } from '../fixtures';
import { StorefrontSpec } from '../store-layout';

export interface VestibuleDoor {
  group: THREE.Group;
  // The leaf's closed-position local coordinates (doorGroup.position at build
  // time), so a sliding leaf's open position is basePosition + currentOffset
  // rather than something re-derived from the group's already-moved position.
  basePosition: THREE.Vector3;
  center: THREE.Vector3;
  kind: 'swing' | 'slide';
  // 'swing': target rotation (radians) when open. 'slide': target local
  // translation along the wall when open.
  openAngle: number;
  openOffset: THREE.Vector3;
  currentAngle: number;
  currentOffset: THREE.Vector3;
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
// swings or slides open (see entrance/index.ts's per-frame door loop).
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
  const isSliding = spec.doorStyle === 'sliding';
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
  if (!isSliding) {
    // Swing/single leaves pivot at a jamb.
    if (alongX) {
      hingeX = hingeOnLeftOrInner ? (doorX - w / 2) : (doorX + w / 2);
      doorGroup.position.set(hingeX, 0, doorZ);
    } else {
      hingeZ = hingeOnLeftOrInner ? (doorZ - w / 2) : (doorZ + w / 2);
      doorGroup.position.set(doorX, 0, hingeZ);
    }
  } else {
    // Sliding leaves start centred on the opening; update() translates the
    // whole group sideways along the wall's run direction to "open" it.
    doorGroup.position.set(doorX, 0, doorZ);
  }
  group.add(doorGroup);

  const addToDoorGroup = (mesh: THREE.Mesh) => {
    doorGroup.add(mesh);
    ctx.addCollider(mesh);
  };

  const glassThick = isSingle ? 0.035 : 0.05;
  const frameShrink = isSingle ? 0.12 : 0.2;
  const localOffset = isSliding ? 0 : (alongX ? (hingeOnLeftOrInner ? w / 2 : -w / 2) : (hingeOnLeftOrInner ? w / 2 : -w / 2));

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
      // Vertical pull handle near the leaf's free edge instead of a push bar.
      const handleMesh = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.1, 0.08), chrome);
      handleMesh.position.set(localOffset + (hingeOnLeftOrInner ? -0.55 : 0.55), barY, -0.14);
      handleMesh.castShadow = true;
      handleMesh.receiveShadow = true;
      addToDoorGroup(handleMesh);
    } else {
      const pushBarMesh = new THREE.Mesh(new THREE.BoxGeometry(w - 0.7, 0.14, 0.1), chrome);
      pushBarMesh.position.set(localOffset, barY, -0.14);
      pushBarMesh.castShadow = true;
      pushBarMesh.receiveShadow = true;
      addToDoorGroup(pushBarMesh);
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
      const handleMesh = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.1, 0.06), chrome);
      handleMesh.position.set(-0.14, barY, localOffset + (hingeOnLeftOrInner ? -0.55 : 0.55));
      handleMesh.castShadow = true;
      handleMesh.receiveShadow = true;
      addToDoorGroup(handleMesh);
    } else {
      const pushBarMesh = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.14, w - 0.7), chrome);
      pushBarMesh.position.set(-0.14, barY, localOffset);
      pushBarMesh.castShadow = true;
      pushBarMesh.receiveShadow = true;
      addToDoorGroup(pushBarMesh);
    }
  }

  // Static frame: header + jambs (any of them suppressible via `frame`, see
  // DoorFrameOpts). The sliding variant also gets a shallow pocket panel
  // beside the opening the leaf disappears behind when open.
  const frameT = isSingle ? 0.1 : 0.16;
  const wantHeader = frame?.header !== false;
  const wantJambLeft = frame?.jambLeft !== false;
  const wantJambRight = frame?.jambRight !== false;
  if (alongX) {
    if (wantHeader) box(w + 0.3, 0.25, 0.3, frameMat, doorX, doorH + 0.1, doorZ);
    if (wantJambLeft) box(frameT, doorH, 0.3, frameMat, doorX - w / 2, doorH / 2, doorZ);
    if (wantJambRight) box(frameT, doorH, 0.3, frameMat, doorX + w / 2, doorH / 2, doorZ);
    if (isSliding) {
      const pocketX = doorX + (hingeOnLeftOrInner ? w : -w);
      box(w, 0.06, 0.28, frameMat, pocketX, doorH + 0.02, doorZ);
    }
  } else {
    if (wantHeader) box(0.3, 0.25, w + 0.3, frameMat, doorX, doorH + 0.1, doorZ);
    if (wantJambLeft) box(0.3, doorH, frameT, frameMat, doorX, doorH / 2, doorZ - w / 2);
    if (wantJambRight) box(0.3, doorH, frameT, frameMat, doorX, doorH / 2, doorZ + w / 2);
    if (isSliding) {
      const pocketZ = doorZ + (hingeOnLeftOrInner ? w : -w);
      box(0.28, 0.06, w, frameMat, doorX, doorH + 0.02, pocketZ);
    }
  }

  if (isSliding) {
    // Slide toward whichever side the "hinge" flag nominally points away
    // from, so the leaf tucks into the pocket built above.
    const dir = hingeOnLeftOrInner ? 1 : -1;
    const openOffset = alongX ? new THREE.Vector3(dir * w, 0, 0) : new THREE.Vector3(0, 0, dir * w);
    return {
      group: doorGroup,
      basePosition: doorGroup.position.clone(),
      center: new THREE.Vector3(doorX, doorH / 2, doorZ),
      kind: 'slide',
      openAngle: 0,
      openOffset,
      currentAngle: 0,
      currentOffset: new THREE.Vector3(),
      wasOpen: false,
    };
  }

  return {
    group: doorGroup,
    basePosition: doorGroup.position.clone(),
    center: new THREE.Vector3(doorX, doorH / 2, doorZ),
    kind: 'swing',
    openAngle,
    openOffset: new THREE.Vector3(),
    currentAngle: 0,
    currentOffset: new THREE.Vector3(),
    wasOpen: false,
  };
}

// Per-frame: swing or slide every door open/closed based on proximity to
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
    if (door.kind === 'slide') {
      const targetX = open ? door.openOffset.x : 0;
      const targetZ = open ? door.openOffset.z : 0;
      door.currentOffset.x = THREE.MathUtils.lerp(door.currentOffset.x, targetX, 0.12);
      door.currentOffset.z = THREE.MathUtils.lerp(door.currentOffset.z, targetZ, 0.12);
      door.group.position.set(
        door.basePosition.x + door.currentOffset.x,
        door.basePosition.y,
        door.basePosition.z + door.currentOffset.z,
      );
    } else {
      const targetAngle = open ? door.openAngle : 0;
      door.currentAngle = THREE.MathUtils.lerp(door.currentAngle, targetAngle, 0.1);
      door.group.rotation.y = door.currentAngle;
    }
  }
  return justOpened;
}
