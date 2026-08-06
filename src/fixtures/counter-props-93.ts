// 1993 checkout-counter dressing, straight from the store footage: the
// customer-facing VFD pole display, a cluster of latex balloons tied to the
// band, the "HOT PIX" preview-guide boxes, a dot-matrix receipt printer with
// fanfold paper, and the "RENT A GAME / GET A CARD" trading-card counter
// display (only when the store actually has a game department).
//
// Everything is static geometry parented under ONE group that registers in
// scene.activeSignageObjects, so the signage rebuild path tears it down with
// full geometry/material disposal like every other sign. Canvas textures are
// module-cached and survive rebuilds (material.dispose never disposes maps).
import * as THREE from 'three';
import type { StoreScene } from '../three-scene';
import { seededRandom01 } from '../store-layout';
import { markSignMesh } from '../sign-builders';
import { loadProp } from '../props';
import { BB_ARCHIVO_BLACK } from '../bundled-fonts';

const texCache = new Map<string, THREE.CanvasTexture>();

function cachedTex(key: string, w: number, h: number, paint: (ctx: CanvasRenderingContext2D, w: number, h: number) => void): THREE.CanvasTexture {
  let tex = texCache.get(key);
  if (tex) return tex;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  paint(canvas.getContext('2d')!, w, h);
  tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  texCache.set(key, tex);
  return tex;
}

// ── texture painters ────────────────────────────────────────────────────────

function vfdTex(): THREE.CanvasTexture {
  // The Part-II close-up (t_0020): two-line VFD, glowing cyan-green
  // dot-matrix segments on a near-black window, white housing. The promo copy
  // is period-styled but fictional (the reference ran a real studio title).
  return cachedTex('vfd3', 1024, 224, (ctx, w, h) => {
    ctx.fillStyle = '#060a09';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#3ee8c8';
    ctx.shadowColor = '#3ee8c8';
    ctx.shadowBlur = 10;
    ctx.font = '700 72px "Courier New", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('HOLIDAY PRESALE PLUS', w / 2, 64);
    ctx.fillText('8 RENTALS ONLY $24.95', w / 2, 158);
  });
}

function hotPixTopTex(): THREE.CanvasTexture {
  return cachedTex('hotpix-top', 512, 352, (ctx, w, h) => {
    ctx.fillStyle = '#f4f1ea';
    ctx.fillRect(0, 0, w, h);
    // Checkerboard band along the bottom edge, like the real carton print.
    const sq = 16;
    for (let x = 0; x < w; x += sq) {
      for (let y = h - sq * 2; y < h; y += sq) {
        if (((x + y) / sq) % 2 < 1) {
          ctx.fillStyle = '#c22417';
          ctx.fillRect(x, y, sq, sq);
        }
      }
    }
    ctx.fillStyle = '#c22417';
    ctx.font = `900 96px ${BB_ARCHIVO_BLACK}, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.save();
    ctx.translate(w / 2, h / 2 - 30);
    ctx.rotate(-0.06);
    ctx.fillText('HOT PIX', 0, 0);
    ctx.restore();
    ctx.font = '700 28px Arial, sans-serif';
    ctx.fillText('FREE PREVIEW GUIDE — TAKE ONE', w / 2, h / 2 + 52);
  });
}

function hotPixSideTex(): THREE.CanvasTexture {
  return cachedTex('hotpix-side', 512, 64, (ctx, w, h) => {
    ctx.fillStyle = '#f4f1ea';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#c22417';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    // FIT the ticker to the carton side instead of trusting a point size: at
    // 40px this run measured 597px into a 512px face even in the substituted
    // face, and Archivo Black (~17% wider here) pushed it to 697 — i.e. the
    // outer "HOT"s were being cut in half by the canvas edge.
    const ticker = 'HOT PIX  •  HOT PIX  •  HOT PIX';
    const usable = w - 16;
    ctx.font = `900 40px ${BB_ARCHIVO_BLACK}, sans-serif`;
    const natural = Math.max(1, ctx.measureText(ticker).width);
    ctx.font = `900 ${Math.min(40, Math.floor(40 * (usable / natural)))}px ${BB_ARCHIVO_BLACK}, sans-serif`;
    ctx.fillText(ticker, w / 2, h / 2 + 2);
  });
}

function rentAGameTex(): THREE.CanvasTexture {
  return cachedTex('rentagame', 512, 320, (ctx, w, h) => {
    ctx.fillStyle = '#14092a';
    ctx.fillRect(0, 0, w, h);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ff4fa0';
    ctx.font = `italic 900 64px ${BB_ARCHIVO_BLACK}, sans-serif`;
    ctx.fillText('RENT A GAME', w / 2, 84);
    ctx.fillStyle = '#39e6d0';
    ctx.fillText('GET A CARD', w / 2, 158);
    ctx.fillStyle = '#ffd54a';
    ctx.font = '700 34px Arial, sans-serif';
    ctx.fillText("COLLECT 'EM  •  TRADE 'EM", w / 2, 222);
    ctx.fillStyle = '#ffffff';
    ctx.font = '700 26px Arial, sans-serif';
    ctx.fillText('COLLECT ALL 50', w / 2, 270);
  });
}

function fanfoldTex(): THREE.CanvasTexture {
  return cachedTex('fanfold', 256, 512, (ctx, w, h) => {
    ctx.fillStyle = '#fbfaf4';
    ctx.fillRect(0, 0, w, h);
    // Green-bar rows and tractor sprocket holes.
    ctx.fillStyle = '#d9ead9';
    for (let y = 0; y < h; y += 48) ctx.fillRect(18, y, w - 36, 24);
    ctx.fillStyle = '#9a9a90';
    for (let y = 10; y < h; y += 26) {
      ctx.beginPath(); ctx.arc(9, y, 4, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(w - 9, y, 4, 0, Math.PI * 2); ctx.fill();
    }
  });
}

// ── build ───────────────────────────────────────────────────────────────────

const BALLOON_COLORS = [0x8e44ad, 0x27ae60, 0xd81b60, 0x1e6fd8, 0xe23a2e, 0xf4c400];

export function buildCounterProps93(scene: StoreScene): void {
  const entrance = scene.entrance;
  if (!entrance) return;
  const inner = entrance.getCounterTopAnchor();
  if (!inner) return;
  const anchors = entrance.getSignAnchors();
  const bandLeft = anchors.find(a => a.id === 'register-left');

  const group = new THREE.Group();
  group.name = 'counter-props-93';
  scene.scene.add(group);
  scene.activeSignageObjects.push(group);

  const cx = inner.x;
  const matte = (color: number, roughness = 0.6) =>
    new THREE.MeshStandardMaterial({ color, roughness, metalness: 0.05 });
  const printed = (tex: THREE.CanvasTexture) => {
    const m = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6, metalness: 0.0 });
    return m;
  };
  // Along-the-counter tangent for a given yaw (the direction sign anchors
  // space themselves along the band).
  const tangent = (yaw: number) => new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
  const normal = (yaw: number) => new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));

  // 1. Customer pole display beside the register, screen turned to the
  // customer side of the inner counter. Proportions per the Part-II close-up:
  // white pole, wide white head (~16in x 4.5in), pale LCD.
  // It stands on the island's LEFT arm, 1.5 ft off the apex the clerk works
  // from (counter.ts registerStanding is at cx). It used to sit at cx + 2.9 —
  // which is x = 13.9, exactly where store-fixtures-config.ts parks the
  // 'tape-rewinder-counter' placement, so the pole grew straight up through
  // the rewinder's lid (user report: "the register display is sitting inside
  // the tape rewinder?"). The right arm has no clear stretch left: the
  // register-middle snap frame owns 12.8, the rewinder 13.9, the rental
  // terminal 15.0 and the receipt printer 15.3.
  {
    const a = entrance.getCounterTopAnchor(cx - 1.5)!;
    const poleH = 0.95;
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.034, poleH, 10), matte(0xf0eee8, 0.45));
    pole.position.set(a.x, a.y + poleH / 2, a.z);
    pole.castShadow = true;
    group.add(pole);
    // getCounterTopAnchor's rotY is the counter edge's inward normal (it faces
    // the CLERK side) — the customer side is the opposite way. NOTE this is
    // the raw counter-spine anchor, NOT getSignAnchors(), whose yaw already
    // carries this half-turn.
    const faceYaw = a.rotY + Math.PI;
    const head = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.4, 0.16), matte(0xf3f1ec, 0.5));
    head.position.set(a.x, a.y + poleH + 0.19, a.z);
    head.rotation.y = faceYaw;
    head.castShadow = true;
    group.add(head);
    const screen = new THREE.Mesh(
      new THREE.PlaneGeometry(0.98, 0.29),
      new THREE.MeshBasicMaterial({ map: vfdTex(), toneMapped: false })
    );
    // Sit just proud of the head's customer face.
    screen.position.set(a.x, a.y + poleH + 0.19, a.z).add(normal(faceYaw).multiplyScalar(0.085));
    screen.rotation.y = faceYaw;
    // The lit panel must not become a lamp in the environment bake.
    screen.userData.bakeEmissiveOff = true;
    group.add(screen);
  }

  // 2. Balloon cluster tied to the band top near the left register.
  // Ring layout with alternating heights: balloons can't interpenetrate
  // (user report: the random cluster clipped). Positions are shared by both
  // render paths below.
  // (Sign-anchor yaws face the CUSTOMER, so their tangent runs the opposite
  // way along the band from the counter-spine rotY the props above use.)
  if (bandLeft) {
    const tie = bandLeft.pos.clone().add(tangent(bandLeft.yaw).multiplyScalar(1.1));
    const spots = BALLOON_COLORS.map((color, i) => {
      const angle = (i / BALLOON_COLORS.length) * Math.PI * 2;
      const jit = (seededRandom01(`bal-${i}`) - 0.5) * 0.1;
      return {
        color,
        x: tie.x + Math.cos(angle) * 0.52 + jit,
        y: tie.y + 2.35 + (i % 2) * 0.75 + jit,
        z: tie.z + Math.sin(angle) * 0.52,
        yaw: seededRandom01(`bal-yaw-${i}`) * Math.PI * 2,
      };
    });

    // Primitive path — used until the GLB lands (and forever if it can't).
    const buildPrimitiveBalloons = () => {
      const balloonGeo = new THREE.SphereGeometry(0.42, 14, 12);
      const stringMat = matte(0xd8d8d8, 0.8);
      spots.forEach((s) => {
        const balloon = new THREE.Mesh(balloonGeo, new THREE.MeshPhysicalMaterial({
          color: s.color, roughness: 0.15, metalness: 0.0,
          transparent: true, opacity: 0.88, // latex translucency
          clearcoat: 0.6, clearcoatRoughness: 0.2,
        }));
        balloon.position.set(s.x, s.y, s.z);
        balloon.scale.set(1, 1.18, 1);
        balloon.castShadow = true;
        group.add(balloon);
        const stringLen = s.y - 0.36 - tie.y;
        const str = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, stringLen, 4), stringMat);
        // Lean each string from the shared tie point up to its balloon.
        const mid = new THREE.Vector3((s.x + tie.x) / 2, tie.y + stringLen / 2, (s.z + tie.z) / 2);
        str.position.copy(mid);
        const dir = new THREE.Vector3(s.x - tie.x, stringLen, s.z - tie.z);
        str.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
        group.add(str);
      });
    };

    // Real GLB path ("Balloon", Poly by Google — see props.ts): one shared
    // geometry, per-color tinted material clones, the model's own knot +
    // curly string replacing the taut cylinders. loadProp caches, so scene
    // rebuilds resolve instantly; guard against a rebuild having torn the
    // group down while the very first load was in flight.
    loadProp('balloon').then((handle) => {
      if (!handle) { buildPrimitiveBalloons(); return; }
      if (!group.parent) return;
      const h = handle.size.y;
      spots.forEach((s) => {
        const inst = handle.instantiate();
        inst.traverse((o) => {
          const mesh = o as THREE.Mesh;
          if (!mesh.isMesh) return;
          const tint = (m: THREE.Material): THREE.Material => {
            const t = new THREE.MeshPhysicalMaterial({ color: s.color, roughness: 0.15, metalness: 0, clearcoat: 0.6, clearcoatRoughness: 0.2 });
            const src = m as THREE.MeshStandardMaterial; if (src.map) t.map = src.map;
            return t;
          };
          mesh.material = Array.isArray(mesh.material) ? mesh.material.map(tint) : tint(mesh.material);
        });
        // Prepped model: bbox bottom (string end) at y=0, balloon at the
        // top — seat it so the balloon body sits at the ring spot.
        inst.position.set(s.x, s.y - (h - 0.5), s.z);
        inst.rotation.y = s.yaw;
        group.add(inst);
      });
      scene.requestRender();
    });
  }

  // 3. HOT PIX preview-guide boxes stacked on the inner counter's far end.
  {
    const a = entrance.getCounterTopAnchor(cx - 3.6)!;
    const boxGeo = new THREE.BoxGeometry(1.0, 0.13, 0.68);
    const side = printed(hotPixSideTex());
    const plainTop = matte(0xf4f1ea, 0.7);
    for (let i = 0; i < 4; i++) {
      const topMat = i === 3 ? printed(hotPixTopTex()) : plainTop;
      const box = new THREE.Mesh(boxGeo, [side, side, topMat, plainTop, side, side]);
      const jx = (seededRandom01(`hp-x-${i}`) - 0.5) * 0.06;
      const jz = (seededRandom01(`hp-z-${i}`) - 0.5) * 0.06;
      box.position.set(a.x + jx, a.y + 0.065 + i * 0.13, a.z + jz);
      box.rotation.y = a.rotY + (seededRandom01(`hp-r-${i}`) - 0.5) * 0.12;
      box.castShadow = true;
      box.receiveShadow = true;
      group.add(box);
    }
  }

  // 4. Dot-matrix printer with fanfold paper, back of the inner counter.
  {
    const a = entrance.getCounterTopAnchor(cx + 4.3)!;
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.3, 0.6), matte(0xd9cdb2, 0.6));
    body.position.set(a.x, a.y + 0.15, a.z);
    body.rotation.y = a.rotY;
    body.castShadow = true;
    body.receiveShadow = true;
    group.add(body);
    const lid = new THREE.Mesh(new THREE.BoxGeometry(0.86, 0.03, 0.3), matte(0xbfb49a, 0.4));
    lid.position.set(a.x, a.y + 0.31, a.z);
    lid.rotation.y = a.rotY;
    group.add(lid);
    // Sheet rising out of the platen, leaning back.
    const paperMat = new THREE.MeshStandardMaterial({ map: fanfoldTex(), roughness: 0.9, metalness: 0, side: THREE.DoubleSide });
    const sheet = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.5), paperMat);
    sheet.position.set(a.x, a.y + 0.52, a.z).add(normal(a.rotY).multiplyScalar(-0.12));
    sheet.rotation.y = a.rotY;
    sheet.rotation.x = -0.35;
    markSignMesh(sheet); // printed sheet: must darken with the counter under it
    group.add(sheet);
    // Fanfold stack feeding it from behind.
    const stack = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.16, 0.5), matte(0xfbfaf4, 0.85));
    stack.position.set(a.x, a.y + 0.08, a.z).add(normal(a.rotY).multiplyScalar(-0.5));
    stack.rotation.y = a.rotY;
    stack.castShadow = true;
    stack.receiveShadow = true;
    group.add(stack);

    // Beige corded desk phone beside the station — every register in the
    // footage keeps one. It sits on the CLERK side of the counter spine:
    // the 'register-right' snap frame stands ON the spine at cx + 5.4 (see
    // entrance/index.ts signAnchors), and the phone used to share that exact
    // spot, so the sign's pole grew straight out of the phone body and its
    // cord loops read as loose rings scattered on the counter (feedback/047).
    const pPos = entrance.getCounterTopAnchor(cx + 5.3)!;
    const pYaw = pPos.rotY + 0.2;
    const pt = tangent(pYaw);
    const pn = normal(pYaw);
    const pOrigin = new THREE.Vector3(pPos.x, pPos.y, pPos.z).add(normal(pPos.rotY).multiplyScalar(0.5));
    const phoneAt = (dt: number, dn: number, dy: number) =>
      pOrigin.clone().addScaledVector(pt, dt).addScaledVector(pn, dn).setY(pOrigin.y + dy);
    const phoneBase = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.1, 0.4), matte(0xd9cdb2, 0.55));
    phoneBase.position.copy(phoneAt(0, 0, 0.05));
    phoneBase.rotation.y = pYaw;
    phoneBase.castShadow = true;
    phoneBase.receiveShadow = true;
    group.add(phoneBase);
    // Darker keypad plate inset on the deck's far half.
    const keypad = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.014, 0.22), matte(0xbfb49a, 0.5));
    keypad.position.copy(phoneAt(0.1, 0.07, 0.105));
    keypad.rotation.y = pYaw;
    group.add(keypad);
    // Handset lying along the near long edge on two cradle ridges, with
    // ear/mouth lumps hanging over its ends — the flat slab didn't read.
    for (const dt of [-0.13, 0.13]) {
      const ridge = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.1), matte(0xcfc3a8, 0.55));
      ridge.position.copy(phoneAt(dt, -0.09, 0.12));
      ridge.rotation.y = pYaw;
      group.add(ridge);
    }
    const handset = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.05, 0.12), matte(0xcfc3a8, 0.5));
    handset.position.copy(phoneAt(0, -0.09, 0.175));
    handset.rotation.y = pYaw;
    handset.castShadow = true;
    group.add(handset);
    for (const dt of [-0.2, 0.2]) {
      const lump = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.06, 0.135), matte(0xcfc3a8, 0.5));
      lump.position.copy(phoneAt(dt, -0.09, 0.155));
      lump.rotation.y = pYaw;
      lump.castShadow = true;
      group.add(lump);
    }
    // Coiled cord: an actual helix wound along a short sagging run from the
    // mouth end of the handset to the base's corner, instead of the old
    // "few small tori" suggestion (the rings of feedback/047).
    const cordMat = matte(0xbfb49a, 0.6);
    {
      const a = phoneAt(-0.24, -0.09, 0.16);
      const b = phoneAt(-0.44, -0.13, 0.05);
      const c = phoneAt(-0.31, 0.02, 0.035);
      const spine = new THREE.QuadraticBezierCurve3(a, b, c);
      const SAMPLES = 160, turns = 13, coilR = 0.016;
      const pts: THREE.Vector3[] = [];
      const tan = new THREE.Vector3(), side = new THREE.Vector3(), bin = new THREE.Vector3();
      const worldUp = new THREE.Vector3(0, 1, 0);
      for (let i = 0; i <= SAMPLES; i++) {
        const u = i / SAMPLES;
        const p = spine.getPoint(u);
        spine.getTangent(u, tan);
        side.crossVectors(worldUp, tan).normalize();
        bin.crossVectors(tan, side).normalize();
        const ang = u * turns * Math.PI * 2;
        pts.push(p.addScaledVector(side, Math.cos(ang) * coilR).addScaledVector(bin, Math.sin(ang) * coilR));
      }
      const cord = new THREE.Mesh(
        new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), SAMPLES * 2, 0.0055, 5, false),
        cordMat
      );
      group.add(cord);
    }
  }

  // 6. RENT A GAME / GET A CARD counter display — only when the game
  // department actually exists, because the card it promises comes with a
  // game rental.
  if (bandLeft && scene.gameMovies.length > 0) {
    const pos = bandLeft.pos.clone().add(tangent(bandLeft.yaw).multiplyScalar(-1.35));
    const yaw = bandLeft.yaw; // sign-anchor yaw already faces the customer
    const base = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.24, 0.46), matte(0xf0eee8, 0.7));
    base.position.set(pos.x, pos.y + 0.12, pos.z);
    base.rotation.y = yaw;
    base.castShadow = true;
    base.receiveShadow = true;
    group.add(base);
    const header = new THREE.Mesh(
      new THREE.BoxGeometry(0.62, 0.4, 0.025),
      [matte(0x14092a), matte(0x14092a), matte(0x14092a), matte(0x14092a), printed(rentAGameTex()), matte(0x14092a)]
    );
    header.position.set(pos.x, pos.y + 0.45, pos.z).add(normal(yaw).multiplyScalar(-0.2));
    header.rotation.y = yaw;
    header.rotation.x = -0.08;
    markSignMesh(header, { casts: true });
    group.add(header);
    // Loose card packs on the base.
    const packGeo = new THREE.BoxGeometry(0.13, 0.02, 0.18);
    const packColors = [0x2f86d4, 0xe23a2e, 0x27ae60, 0xf4c400, 0x8e44ad, 0x39e6d0];
    packColors.forEach((color, i) => {
      const pack = new THREE.Mesh(packGeo, matte(color, 0.4));
      const px = (i % 3 - 1) * 0.17;
      const pz = (Math.floor(i / 3) - 0.5) * 0.2;
      pack.position.set(pos.x, pos.y + 0.25, pos.z)
        .add(tangent(yaw).multiplyScalar(px))
        .add(normal(yaw).multiplyScalar(pz));
      pack.rotation.y = yaw + (seededRandom01(`pack-${i}`) - 0.5) * 0.5;
      group.add(pack);
    });
  }
}
