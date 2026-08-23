// 1993 storefront dressing, from the store footage: the STORE HOURS panel on
// the entrance sidelight glass (moved off a chain-hung window-bay board
// 2026-08-02 — feedback/018; see the block itself), the red evening-rental
// term cards inside the entry glass, and the cream EAS anti-theft pedestals
// gating each vestibule chamber's store-side door.
//
// REMOVED 2026-08-06 (owner, feedback/040 "makes no sense for fast drop to be
// here. remove it for now"): the gold FAST DROP vinyl + taped instruction
// sheet that sat on the vestibule's right-wall glazing. A future drop point
// should come back as its own fixture with a real slot, not as lettering on
// a pane with nothing behind it.
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

  // 3. STORE HOURS panel, on the entrance glass (feedback pin 018: "seems
  // like it should be on a door, not here"). A store-hours notice is read
  // with a hand already on the door, so it lives on the entry composition —
  // never hung on chains out in a display window bay thirty feet down the
  // facade, which is where this shipped. It goes on the RIGHT SIDELIGHT, the
  // static pane immediately outboard of the door pair: the two leaves
  // swing/slide (buildVestibuleDoor / updateVestibuleDoors) and a decal
  // parented to this static group would float clear of an opening leaf.
  // Applied to the inside face reading OUT to the lot, at the ~4.8 ft eye
  // line a posted notice sits at.
  //
  // OPEN — the ARTWORK is not fixed here and is not attested. It is a black
  // changeable-letter board, and nothing in the reference corpus shows one
  // carrying store hours (the letterboard family in INVENTORY.md is all
  // COMING SOON / RECOMMENDED RELEASES / marquee-tower boards). Repainting it
  // as the small white-and-blue door decal these really were needs a photo of
  // one — a rule-6 ask, not something to invent — so this pass moves the
  // object and leaves letterboardTex() exactly as it was.
  if ((scene.storefrontSpec ?? getStorefrontSpec(storeWidth)).entryStyle === 'vestibule') {
    const spec = scene.storefrontSpec ?? getStorefrontSpec(storeWidth);
    // Sidelight centre: the entry runs sidelight | door | door | sidelight
    // about the centreline (see buildGlazedWall's extraMullions in
    // src/entrance/index.ts). A storefront-door entrance has no sidelight to
    // hang this on (GH #110) — see the gate above the EAS pedestals below.
    const x = 11.0 + spec.doorWidth + ENTRANCE_SIDELIGHT_WIDTH / 2;
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(1.35, 0.9), printedOut(letterboardTex()));
    panel.position.set(x, 4.8, glassZ - 0.06);
    markSignMesh(panel);
    group.add(panel);
  }

  // (3b. The red '3 EVENING RENTAL' / '2 EVENING RENTAL' cards that used to
  // hang inside the entry glass, flanking the door head, were removed
  // entirely by owner request — GH #3.)

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
  // Both this gate and the STORE HOURS panel above assume the real chamber
  // composition (sidelights, a side door into the sales floor) — neither
  // exists on a storefront-door entrance (GH #110), and there is nothing
  // sensible to gate them off instead: one door in a plain wall has no
  // sidelight to hang a notice on and no side-door choke point to gate.
  if (vest && vest.hasChamber) {
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
