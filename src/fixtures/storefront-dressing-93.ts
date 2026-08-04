// 1993 storefront dressing, from the store footage: the gold "FAST DROP"
// window lettering (with its taped-up instruction sheet) on the vestibule
// glazing nearest the return chute, the STORE HOURS panel on the entrance sidelight glass
// (moved off a chain-hung window-bay board 2026-08-02 — feedback/018; see the
// block itself), the red evening-rental term cards inside the entry glass, and the cream
// EAS anti-theft pedestals gating each vestibule chamber's store-side door.
//
// REMOVED 2026-08-02 (owner, feedback/014 "this looks like shit. remove it"):
// the pair of red "CHECK OUT TODAY / ANYTIME / RETURN BY MIDNIGHT" clock
// posters that used to flank the vestibule on the front glass. They were
// invented artwork — a drawn clock face and copy with no reference behind them
// — which is the same failure as the invented exit clock. Do not re-add this
// or anything like it without a real reference and the sign-lab gate
// (.claude/skills/match-real-asset/SKILL.md).
//
// Window graphics face OUT (they're for the parking lot); from inside the
// store they read mirrored, exactly like the footage shot them. Everything is
// static geometry in one group registered in scene.activeSignageObjects so
// the signage rebuild path tears it down.
import * as THREE from 'three';
import type { StoreScene } from '../three-scene';
import { getStorefrontSpec, ENTRANCE_SIDELIGHT_WIDTH } from '../store-layout';
import { markSignMesh } from '../sign-builders';
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

function fastDropTex(): THREE.CanvasTexture {
  return cachedTex('fastdrop', 1024, 256, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `900 150px ${BB_ARCHIVO_BLACK}, sans-serif`;
    ctx.lineWidth = 10;
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#4a3200';
    ctx.strokeText('FAST DROP', w / 2, h / 2);
    const grad = ctx.createLinearGradient(0, h / 2 - 70, 0, h / 2 + 70);
    grad.addColorStop(0, '#ffe27a');
    grad.addColorStop(0.5, '#f4b400');
    grad.addColorStop(1, '#c98d00');
    ctx.fillStyle = grad;
    ctx.fillText('FAST DROP', w / 2, h / 2);
  });
}

function dropNoticeTex(): THREE.CanvasTexture {
  return cachedTex('dropnotice', 512, 640, (ctx, w, h) => {
    ctx.fillStyle = '#f6f4ec';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#222222';
    ctx.textAlign = 'center';
    ctx.font = '900 54px Arial, sans-serif';
    ctx.fillText('FAST DROP', w / 2, 80);
    ctx.font = '700 40px Arial, sans-serif';
    ctx.fillText('OPEN 24 HOURS', w / 2, 150);
    ctx.font = '400 28px Arial, sans-serif';
    const lines = [
      'Drop tapes through the slot',
      'any time, day or night.',
      '',
      'Tapes not rewound',
      'will be charged.',
      '',
      'THANK YOU!',
    ];
    lines.forEach((line, i) => ctx.fillText(line, w / 2, 220 + i * 48));
    // Tape strips at the corners, like a sheet stuck up from inside.
    ctx.fillStyle = 'rgba(200,195,170,0.8)';
    ctx.fillRect(10, 10, 90, 34);
    ctx.fillRect(w - 100, 10, 90, 34);
    ctx.fillRect(10, h - 44, 90, 34);
    ctx.fillRect(w - 100, h - 44, 90, 34);
  });
}

function letterboardTex(): THREE.CanvasTexture {
  return cachedTex('letterboard', 768, 512, (ctx, w, h) => {
    ctx.fillStyle = '#141414';
    ctx.fillRect(0, 0, w, h);
    // Grooved felt rows.
    ctx.strokeStyle = '#242424';
    ctx.lineWidth = 2;
    for (let y = 24; y < h; y += 24) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }
    ctx.textAlign = 'center';
    ctx.fillStyle = '#f2f2ee';
    ctx.font = '700 58px "Courier New", monospace';
    ctx.fillText('STORE HOURS', w / 2, 110);
    ctx.font = '700 44px "Courier New", monospace';
    ctx.fillText('10 AM - MIDNIGHT', w / 2, 200);
    ctx.fillText('365 DAYS A YEAR', w / 2, 270);
    // feedback/037 (owner: reword all "be kind rewind" to "please rewind") —
    // two shorter words on the existing pair of felt rows reads the same as
    // the old two-line "PLEASE BE KIND" / "REWIND" arrangement without
    // leaving one line short.
    ctx.fillStyle = '#ffd54a';
    ctx.fillText('PLEASE', w / 2, 380);
    ctx.fillText('REWIND', w / 2, 440);
  });
}

export function buildStorefrontDressing93(scene: StoreScene): void {
  const group = new THREE.Group();
  group.name = 'storefront-dressing-93';
  scene.scene.add(group);
  scene.activeSignageObjects.push(group);

  const storeWidth = scene.getStoreWidth();
  const glassZ = 15.0;

  const printedOut = (tex: THREE.CanvasTexture, transparent = false) =>
    new THREE.MeshStandardMaterial({
      map: tex,
      roughness: 0.7,
      metalness: 0.0,
      transparent,
      side: THREE.DoubleSide,
      ...(transparent ? { alphaTest: 0.05 } : {}),
    });

  // 1. FAST DROP gold vinyl (feedback/033 — was "QUIK DROP", owner: "we cant
  // say quick drop"), on the entrance VESTIBULE's own glazing rather than a
  // random front window-bay pane. It used to hunt the store shell's
  // `window-bay-<i>` panes for the first one clear of the entrance tower
  // masonry, which routinely landed it thirty-plus feet down the facade from
  // the counter — gold lettering floating mid-store with nothing connecting
  // it to a return chute (owner: "this isnot placed in a way that makes
  // sense... it needs to connect with the back of the front counter").
  //
  // The return chute (src/entrance/return-slot.ts) grows off the counter's
  // entrance-side shoulder, anchored just past the vestibule's store-side
  // door (see entrance/index.ts's `returnSlot` placement, x ~ cx+7..10,
  // z hugging backZ). The vestibule's own RIGHT wall — glazed, running along
  // Z at x = vest.xR, with the walk-in door punched into it at sideDoorZ
  // (entrance/index.ts: `buildGlazedWall('Z', xR, backZ, frontZ,
  // [sideDoorZ])`, "right wall -> into store") — is the one pane of glass
  // that is BOTH real vestibule glazing AND physically beside that counter
  // shoulder. Mounting there (on the panel between the door frame and the
  // front glass, since the sliver behind the door is too narrow for text)
  // puts the sign right where a customer either steps past it heading for
  // the door, or sees it through the glass as they cross the chamber —
  // "connects with the back of the front counter" as closely as the real
  // geometry allows. Facing -X (into the vestibule) so a customer WALKING IN
  // reads it correctly (feedback/033); from the sales-floor side, through the
  // glass, it reads mirrored — the same convention the rest of this file's
  // window graphics use, just aimed at the opposite door.
  {
    const vest = scene.entrance?.getVestibuleInfo();
    if (vest) {
      const doorGapZ0 = vest.sideDoorZ - vest.doorW / 2;
      const doorGapZ1 = vest.sideDoorZ + vest.doorW / 2;
      // The two glazed panels either side of the walk-in door gap; take
      // whichever is wide enough to carry the lettering (the door-to-backZ
      // sliver is usually under a foot — the door-to-frontZ run is the real
      // pane). Hug the door-frame edge of that panel: the end nearest the
      // gap the customer (and the counter beyond it) actually stands at.
      const panels: { z0: number; z1: number; hugMax: boolean }[] = [
        { z0: vest.backZ, z1: doorGapZ0, hugMax: true },   // hug its far (door) edge
        { z0: doorGapZ1, z1: vest.frontZ, hugMax: false }, // hug its near (door) edge
      ];
      const panel = panels.filter((p) => p.z1 - p.z0 > 1.2).sort((a, b) => (a.z1 - a.z0) - (b.z1 - b.z0))[0];
      if (panel) {
        const margin = 0.3;
        const avail = panel.z1 - panel.z0 - margin;
        const lettersW = Math.min(2.6, avail - 0.3);
        const centerZ = panel.hugMax
          ? panel.z1 - margin - lettersW / 2
          : panel.z0 + margin + lettersW / 2;
        const x = vest.xR - 0.06; // just inside the vestibule chamber, off the glass
        const faceYaw = -Math.PI / 2; // normal -X: reads correctly walking IN through the vestibule

        const letters = new THREE.Mesh(
          new THREE.PlaneGeometry(lettersW, lettersW / 4),
          printedOut(fastDropTex(), true),
        );
        letters.position.set(x, 5.6, centerZ);
        letters.rotation.y = faceYaw;
        markSignMesh(letters);
        group.add(letters);

        const notice = new THREE.Mesh(new THREE.PlaneGeometry(0.85, 1.06), printedOut(dropNoticeTex()));
        notice.position.set(x - 0.01, 4.4, centerZ);
        notice.rotation.y = faceYaw;
        markSignMesh(notice);
        group.add(notice);
      }
    }
  }

  // 3. STORE HOURS panel, on the entrance glass (feedback pin 018: "seems
  // like it should be on a door, not here"). A store-hours notice is read
  // with a hand already on the door, so it lives on the entry composition —
  // never hung on chains out in a display window bay thirty feet down the
  // facade, which is where this shipped. It goes on the RIGHT SIDELIGHT, the
  // static pane immediately outboard of the door pair: the two leaves
  // swing/slide (buildVestibuleDoor / updateVestibuleDoors) and a decal
  // parented to this static group would float clear of an opening leaf.
  // Applied to the inside face reading OUT to the lot, like the QUIK DROP
  // vinyl above, at the ~4.8 ft eye line a posted notice sits at.
  //
  // OPEN — the ARTWORK is not fixed here and is not attested. It is a black
  // changeable-letter board, and nothing in the reference corpus shows one
  // carrying store hours (the letterboard family in INVENTORY.md is all
  // COMING SOON / RECOMMENDED RELEASES / marquee-tower boards). Repainting it
  // as the small white-and-blue door decal these really were needs a photo of
  // one — a rule-6 ask, not something to invent — so this pass moves the
  // object and leaves letterboardTex() exactly as it was.
  {
    const spec = scene.storefrontSpec ?? getStorefrontSpec(storeWidth);
    // Sidelight centre: the entry runs sidelight | door | door | sidelight
    // about the centreline (see buildGlazedWall's extraMullions in
    // src/entrance/index.ts).
    const x = 11.0 + spec.doorWidth + ENTRANCE_SIDELIGHT_WIDTH / 2;
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(1.35, 0.9), printedOut(letterboardTex()));
    panel.position.set(x, 4.8, glassZ - 0.06);
    markSignMesh(panel);
    group.add(panel);
  }

  // 3b. Red rental-term cards hung inside the entry glass FACING IN (T25
  // item 30, measured ~32x9in): '3 EVENING RENTAL' and '2 EVENING RENTAL',
  // white straight caps on flat red, one each side of the door head.
  {
    const cardTex = (line: string) => cachedTex(`term-${line}`, 768, 216, (ctx, w, h) => {
      ctx.fillStyle = '#c8102e';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = '700 108px Arial, sans-serif';
      ctx.fillText(line, w / 2, h / 2 + 4);
    });
    for (const [i, line] of ['3 EVENING RENTAL', '2 EVENING RENTAL'].entries()) {
      const card = new THREE.Mesh(
        new THREE.PlaneGeometry(2.7, 0.76),
        new THREE.MeshStandardMaterial({ map: cardTex(line), roughness: 0.7, metalness: 0 })
      );
      // Inside face of the vestibule glass, flanking the door head, print
      // toward the store (rotation.y = PI turns +Z away from the lot).
      card.position.set(11.0 + (i === 0 ? -1.75 : 1.75), 8.6, glassZ - 0.12);
      card.rotation.y = Math.PI;
      markSignMesh(card);
      group.add(card);
    }
  }

  // 4. EAS anti-theft pedestals — the cream rounded-top gates, EXIT DOOR ONLY
  // (feedback/035, owner: "we don't need these theft venters in the
  // entrance. only the exit"). Real stores gate the walk-OUT with the
  // sensors (that's what's stopping a shoplifter) and leave the walk-in
  // clear, so this now stands one pair on the carpet just outside the exit
  // chamber's store-side door, and none at the entrance.
  //
  // The vestibule is two chambers split by a full-depth glass divider on the
  // centreline (entrance on +X, exit on -X — see src/entrance/index.ts), and
  // each has its own door into the store in its outer side wall. An earlier
  // pass put pedestals at BOTH doors (before that, at x = 11 ± 2.2, which
  // straddled the DIVIDER: one leg of the "gate" stood in the entrance
  // chamber and the other in the exit chamber, with a sealed pane of glass
  // down the middle and neither walk line passing between them — user
  // report: "the placement of these detectors makes no sense"). Geometry
  // still comes from the entrance fixture itself (getVestibuleInfo) rather
  // than being re-derived here, so the gate tracks the real exit door for any
  // doorWidth/storefront preset.
  const vest = scene.entrance?.getVestibuleInfo();
  if (vest) {
    const pedestalShape = new THREE.Shape();
    const pw = 0.5, ph = 3.4, r = 0.24;
    pedestalShape.moveTo(-pw / 2, 0);
    pedestalShape.lineTo(pw / 2, 0);
    pedestalShape.lineTo(pw / 2, ph - r);
    pedestalShape.quadraticCurveTo(pw / 2, ph, pw / 2 - r, ph);
    pedestalShape.lineTo(-pw / 2 + r, ph);
    pedestalShape.quadraticCurveTo(-pw / 2, ph, -pw / 2, ph - r);
    pedestalShape.closePath();
    const geo = new THREE.ExtrudeGeometry(pedestalShape, { depth: 0.09, bevelEnabled: false });
    geo.translate(0, 0, -0.045);
    const cream = new THREE.MeshStandardMaterial({ color: 0xe9e4d6, roughness: 0.5, metalness: 0.02 });
    const baseGeo = new THREE.BoxGeometry(0.62, 0.06, 0.5);
    // Gate half-span: clear of the leaf's own opening (doorW/2) plus enough
    // that an opening leaf sweeps between the panels, never into one.
    const gateHalf = vest.doorW / 2 + 0.55;
    // Stand-off from the side wall, on the SALES-FLOOR side. Inside the
    // chamber there is no room for this gate: the near pedestal would have to
    // stand at z = sideDoorZ - gateHalf = 8.45, which is through the
    // vestibule's own back glass at z = backZ.
    const standOff = 0.62;
    const gates: { x: number; z: number }[] = [];
    for (const dz of [-gateHalf, gateHalf]) {
      gates.push({ x: vest.xL - standOff, z: vest.sideDoorZ + dz }); // walk-out door only
    }
    for (const g of gates) {
      const ped = new THREE.Mesh(geo, cream);
      // Panels stand parallel to the walk line through the side door (which
      // runs along X), so their broad faces greet you side-on as you pass
      // between them.
      ped.position.set(g.x, 0.03, g.z);
      ped.castShadow = true;
      ped.receiveShadow = true;
      group.add(ped);
      scene.fixtureContext().addCollider(ped);
      const base = new THREE.Mesh(baseGeo, cream);
      base.position.set(g.x, 0.03, g.z);
      base.receiveShadow = true;
      group.add(base);
    }
  }
}
