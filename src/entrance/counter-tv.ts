import { selfLit } from '../material-lighting';
// Small set on a wall-style bracket behind the checkout counter (GH #110): the
// "something to watch" a format without ceiling headroom for AmbientTvs still
// gets (StoreFormatSpec.counterTv — see that field's doc comment for why the
// ceiling rig doesn't fit under a 9 ft lid). Set dressing, not another
// peekable screen: the picture is always crt-tube.ts's static test card, no
// <video> element, no per-frame cost.
import * as THREE from 'three';
import { FixtureContext } from '../fixtures';
import { makeCurvedScreenGeometry, makeTubeOverlayMaterial, makeCrtTestCardTexture } from '../crt-tube';
import { makeCrtGlassMaterial } from '../glass-reflection';

// Mounts at (x, mountY, z) on the counter top, rising on a short arm to
// standing eye height, the set swivelled to face `rotY` (the same yaw
// convention as ClerkStanding/getInnerCounterSpine — the counter's own
// inward-facing direction).
export function buildCounterTv(
  ctx: FixtureContext,
  parent: THREE.Group,
  x: number,
  mountY: number,
  z: number,
  rotY: number,
): void {
  const g = new THREE.Group();
  g.position.set(x, mountY, z);
  g.rotation.y = rotY;
  parent.add(g);

  const armMat = new THREE.MeshStandardMaterial({ color: 0x3c3f43, roughness: 0.4, metalness: 0.75 });
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0xc3c7cb, roughness: 0.55, metalness: 0.04 });
  const bezelMat = new THREE.MeshStandardMaterial({ color: 0x93989d, roughness: 0.6, metalness: 0.04 });

  // Wall-bracket arm: a short post off the counter top with a swivel knuckle,
  // the small-shop answer to the ceiling sets' pole (ambient-tvs.ts).
  const armLen = 2.15;
  const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.055, armLen, 8), armMat);
  arm.position.y = armLen / 2;
  arm.castShadow = true;
  g.add(arm);
  ctx.addCollider(arm);

  const knuckle = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8), armMat);
  knuckle.position.y = armLen;
  g.add(knuckle);

  const bodyW = 1.05, bodyH = 0.82, bodyD = 0.85;
  const screenW = 0.8, screenH = 0.6;
  const tvG = new THREE.Group();
  tvG.position.y = armLen + bodyH * 0.42;
  g.add(tvG);

  const body = new THREE.Mesh(new THREE.BoxGeometry(bodyW, bodyH, bodyD), bodyMat);
  body.castShadow = true;
  body.receiveShadow = true;
  tvG.add(body);
  ctx.addCollider(body);

  const bezel = new THREE.Mesh(new THREE.BoxGeometry(bodyW - 0.06, bodyH - 0.06, 0.04), bezelMat);
  bezel.position.z = bodyD / 2 + 0.02;
  bezel.castShadow = true;
  tvG.add(bezel);

  const bulge = 0.04;
  const screenTex = makeCrtTestCardTexture();
  const screenMat = selfLit(new THREE.MeshBasicMaterial({ map: screenTex, toneMapped: false }), 'light-source');
  const screen = new THREE.Mesh(makeCurvedScreenGeometry(screenW, screenH, bulge), screenMat);
  screen.position.z = bodyD / 2 + 0.03;
  tvG.add(screen);

  const scan = new THREE.Mesh(makeCurvedScreenGeometry(screenW, screenH, bulge), makeTubeOverlayMaterial());
  scan.position.z = screen.position.z + 0.002;
  tvG.add(scan);

  const gloss = new THREE.Mesh(makeCurvedScreenGeometry(screenW, screenH, bulge), makeCrtGlassMaterial());
  gloss.position.z = scan.position.z + 0.002;
  gloss.renderOrder = 1;
  tvG.add(gloss);
}
