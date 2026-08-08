// Actor-portrait wall + floating film-strip ribbon — pin 052 rebuild
// (feedback/052, GitHub issue #25), widened 2026-08 to span all three back
// walls (feedback: "the actor posters... are supposed to span the entire
// back three walls with the film strip. not just a tiny portion of one").
//
// The previous version of this feature (deleted from store-shell.ts) hung a
// fixed-size row of movie posters + a "mural" band at a hardcoded width/Z,
// sized off nothing but its own entry.width — so on any store deep/shallow
// enough it clipped straight through the EXIT door, its frame, and the side
// window ribbon. Owner verdict: "looks terrible and makes no sense... should
// NEVER CLIP with other objects especially like this."
//
// This version:
//  - Only builds on the high-ceiling variant (bb_ceiling=high): that's the
//    only shell with a tall wall band above the door/window line to hang
//    anything in. The gate lives HERE (not just in the shell spec) so it
//    can't drift out of sync with the setting that actually grew the wall.
//  - Computes EACH of the three back walls' (left, back, right) CLEAR
//    run(s) from the real shell geometry before placing anything: the
//    side window ribbon (shared/mirrored on both left and right — see
//    buildSideWall in store-shell.ts, which draws both from the same
//    scene.sideRibbon span), the service door + EXIT sign (right wall
//    only, shared from storefront-facade.ts, the same numbers the door
//    itself is built from), and the stepped back-right corner's short
//    perpendicular connector face — which is NOT one of the three named
//    walls, so it stays undecorated and simply splits the back/right runs
//    apart when the step is present. Obstacles are excluded, never
//    overlapped, and a wall breaks into per-span segments if it produces
//    more than one clear run — see computeClearSpans/planPortraitSlots.
//  - The three walls' bands read as ONE continuous run around the two
//    corners they actually share (left-back always; back-right too when
//    the store has no stepped corner): each side butts its span right up
//    to the OTHER wall's own flush-mounted plane (WALL_INSET, not the
//    bigger CORNER_MARGIN breathing room reserved for corners with no
//    décor on the other side, e.g. the step notch or the ribbon/door) so
//    the two perpendicular planes meet edge-to-edge with no gap and no
//    poke-through.
//  - Content is the library's actual most-featured actors: tallies
//    Movie.castPeople (top-billed cast, Jellyfin Person id + portrait image)
//    across every library, keeps only people with a real portrait image, and
//    takes the top MAX_PORTRAITS by appearance count, evenly spread across
//    every wall's spans in proportion to their length. Zero qualifying
//    actors (e.g. the synthetic demo/harness catalog, which has no Person
//    image data) still gets the film strip — just no portraits, per spec
//    ("zero = just the film strip").
//  - The film strip is CONSTRUCTED as the object it is — sprocket-hole rails
//    along both edges, frame lines dividing cells — not a blur or a generic
//    stripe (owner's tone-on-tone-ghost-art rule). Its accent color pulls
//    from the active theme's palette instead of a hardcoded house red.
import * as THREE from 'three';
import type { StoreScene } from './three-scene';
import { STORE_CENTER_X, HIGH_CEILING_Y } from './store-layout';
import { SIDE_RIBBON_FRONT_Z, rightSideDoorZone } from './storefront-facade';
import { CORNICE_DROP } from './store-shell';
import { getActiveTheme, themeTrimDarkHex, type StoreTheme } from './themes';

// ── Tunables ─────────────────────────────────────────────────────────────
const WALL_INSET = 0.06;        // flush-mount depth off the wall plane (matches the old rightX inset); also
                                 // used as the "clean butt" gap between two walls' décor planes at a shared corner
const CORNER_MARGIN = 0.6;      // breathing room off a corner that has NO décor on the other side (the step notch, the vestibule end)
const DOOR_MARGIN = 0.4;        // extra clearance beyond the door/frame's own footprint
// Clearance below the VISIBLE ceiling line: the chrome mirror cornice hangs
// CORNICE_DROP below the true ceiling and occludes anything painted above
// that from every normal viewing angle (see wall-stripe-1990.ts), and on
// bb-1990 the painted wall stripe itself sits in the top ~1.5 ft below that
// line. Staying this far clear keeps the décor visible and clear of both.
const CEILING_MARGIN = 2.3;
const MIN_SPAN_LEN = 3.0;       // a clear run shorter than this isn't worth decorating
const MIN_PORTRAIT_GAP = 1.2;   // minimum breathing room between/around frames — "evenly spread", never crammed

// Was 6 for a single wall's one span; the décor now runs the combined
// left+back+right wall length (roughly 3x), so the cap scales with it. Still
// just a ceiling — planPortraitSlots drops slots (fewer, or none per span)
// rather than ever crowding past MIN_PORTRAIT_GAP.
const MAX_PORTRAITS = 18;
const PORTRAIT_H = 2.4;
const PORTRAIT_ASPECT = 2 / 3;  // width / height, matching the poster-card convention elsewhere
const PORTRAIT_W = PORTRAIT_H * PORTRAIT_ASPECT;
const FRAME_PAD = 0.09;         // per side
const PORTRAIT_FRAMED_W = PORTRAIT_W + FRAME_PAD * 2;
const PORTRAIT_FRAMED_H = PORTRAIT_H + FRAME_PAD * 2;

const STRIP_H = 1.3;
const STRIP_CELL_FT = 1.3;      // world-space width baked into one texture "cell"

type WallId = 'left' | 'back' | 'right';

// A clear run on one of the three walls. `s0`/`s1` are a coordinate ALONG
// the wall's own run direction — world Z for the left/right walls, world X
// for the back wall — not necessarily x/z uniformly, which is why every
// consumer goes through wallFrame/wallPoint below instead of touching x/z
// directly.
interface ClearSpan { wall: WallId; s0: number; s1: number } // s0 < s1

/**
 * The wall's fixed (perpendicular-to-its-run) world coordinate — flush-mount
 * inset off the true wall plane — and the yaw that faces a Y-up group's
 * local +Z (its "forward"/proud-of-the-strip axis) into the store interior.
 */
function wallFrame(wall: WallId, storeWidth: number, backWallZ: number): { fixed: number; rotY: number } {
  switch (wall) {
    case 'left': return { fixed: STORE_CENTER_X - storeWidth / 2 + WALL_INSET, rotY: Math.PI / 2 };
    case 'right': return { fixed: STORE_CENTER_X + storeWidth / 2 - WALL_INSET, rotY: -Math.PI / 2 };
    case 'back': return { fixed: backWallZ + WALL_INSET, rotY: 0 };
  }
}

/** World (x, z) for the point at run-coordinate `s` on `wall`. */
function wallPoint(wall: WallId, s: number, fixed: number): { x: number; z: number } {
  return wall === 'back' ? { x: s, z: fixed } : { x: fixed, z: s };
}

/**
 * Clear run(s) across all three back walls, computed from real shell
 * geometry. Never overlaps an obstacle — obstacles are excluded, not
 * clipped around, per rule 3 ("skip a spot rather than risk overlapping").
 *
 * Obstacles: the side window ribbon (shared scene.sideRibbon span, mirrored
 * onto both the left and right walls by buildSideWall in store-shell.ts),
 * the right wall's service door + EXIT sign footprint (rightSideDoorZone),
 * and the stepped back-right corner's perpendicular connector face — which
 * is real wall but not one of the three NAMED walls, so it is treated the
 * same as any other obstacle and simply left undecorated, splitting the
 * back and right runs apart when a step is present.
 *
 * Where two of the three walls share a plain corner (left-back always;
 * back-right too when the store has no step), their spans butt right up to
 * WALL_INSET of the corner — the depth the OTHER wall's own plane sits at —
 * so the two bands meet edge-to-edge with no gap and no poke-through. Where
 * a wall's run ends at an obstacle instead (the step notch, the ribbon, the
 * door), it keeps the bigger CORNER_MARGIN breathing room, same as before.
 */
function computeClearSpans(scene: StoreScene, storeWidth: number, backWallZ: number): ClearSpan[] {
  const wallLeft = STORE_CENTER_X - storeWidth / 2;
  const wallRight = STORE_CENTER_X + storeWidth / 2;
  // The floor (and the right wall) only reaches back to the stepped
  // corner's forward face when the notch is present — the true back-wall Z
  // is behind it, walled off by the perpendicular connector face (see the
  // baseboard logic in store-shell.ts, which uses this same rule).
  const stepWallZ = scene.hasStep ? backWallZ + scene.stepDepth : backWallZ;

  const ribbonBackZ = scene.sideRibbon ? scene.sideRibbon.backZ : SIDE_RIBBON_FRONT_Z;
  const spans: ClearSpan[] = [];

  // Back wall: wallLeft -> stepX (or all the way to wallRight when the
  // store has no stepped corner). Left end always butts the left wall;
  // right end either clears the step's connector face (breathing room) or
  // butts the right wall directly.
  const backLeft = wallLeft + WALL_INSET;
  const backRight = scene.hasStep ? scene.stepX - CORNER_MARGIN : wallRight - WALL_INSET;
  if (backRight - backLeft >= MIN_SPAN_LEN) spans.push({ wall: 'back', s0: backLeft, s1: backRight });

  // Left wall: the step is always back-RIGHT (store-layout.ts only ever
  // builds 'back-right'), so the left wall's back corner is always a plain
  // butt against the back wall. Front end clears the ribbon.
  const leftRear = backWallZ + WALL_INSET;
  if (ribbonBackZ - leftRear >= MIN_SPAN_LEN) spans.push({ wall: 'left', s0: leftRear, s1: ribbonBackZ });

  // Right wall: butts the back wall directly when the corner is flat,
  // otherwise clears the step's connector face with breathing room. Front
  // end clears the ribbon AND the service door + EXIT sign footprint.
  const rightRear = scene.hasStep ? stepWallZ + CORNER_MARGIN : backWallZ + WALL_INSET;
  const door = rightSideDoorZone(scene.sideRibbon);
  const rightFront = door ? Math.min(ribbonBackZ, door.z0 - DOOR_MARGIN) : ribbonBackZ;
  if (rightFront - rightRear >= MIN_SPAN_LEN) spans.push({ wall: 'right', s0: rightRear, s1: rightFront });

  return spans;
}

interface FeaturedActor { id: string; name: string; imageUrl: string; count: number }

/** Tallies the library's most-featured actors from Movie.castPeople across
 * every library (deduped by movie id), keeping only people with a real
 * portrait image, sorted by appearance count. */
function tallyFeaturedActors(scene: StoreScene, max: number): FeaturedActor[] {
  const counts = new Map<string, FeaturedActor>();
  const seenMovies = new Set<string>();
  for (const lib of scene.libraries) {
    for (const movie of lib.movies) {
      if (seenMovies.has(movie.id)) continue;
      seenMovies.add(movie.id);
      for (const p of movie.castPeople ?? []) {
        if (!p.imageUrl) continue;
        const existing = counts.get(p.id);
        if (existing) existing.count++;
        else counts.set(p.id, { id: p.id, name: p.name, imageUrl: p.imageUrl, count: 1 });
      }
    }
  }
  return Array.from(counts.values())
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    .slice(0, max);
}

interface PortraitSlot { wall: WallId; s: number }

/**
 * Evenly spreads `desiredCount` portrait slots across one or more clear
 * spans (which may sit on different walls), proportional to each span's
 * length, with even gaps within each span (and never packed tighter than
 * MIN_PORTRAIT_GAP — a span that can't fit its share just gets fewer, or
 * none).
 */
function planPortraitSlots(spans: ClearSpan[], desiredCount: number): PortraitSlot[] {
  const lens = spans.map((s) => s.s1 - s.s0);
  const totalLen = lens.reduce((a, b) => a + b, 0) || 1;

  const raw = lens.map((l) => (desiredCount * l) / totalLen);
  const counts = raw.map((v) => Math.floor(v));
  let remainder = desiredCount - counts.reduce((a, b) => a + b, 0);
  const byFracDesc = raw
    .map((v, i) => ({ i, frac: v - Math.floor(v) }))
    .sort((a, b) => b.frac - a.frac);
  for (const { i } of byFracDesc) {
    if (remainder <= 0) break;
    counts[i]++;
    remainder--;
  }

  const slots: PortraitSlot[] = [];
  spans.forEach((span, i) => {
    let n = counts[i];
    const len = span.s1 - span.s0;
    while (n > 0 && (len - n * PORTRAIT_FRAMED_W) / (n + 1) < MIN_PORTRAIT_GAP) n--;
    if (n <= 0) return;
    const gap = (len - n * PORTRAIT_FRAMED_W) / (n + 1);
    for (let k = 0; k < n; k++) {
      slots.push({ wall: span.wall, s: span.s0 + gap + PORTRAIT_FRAMED_W / 2 + k * (PORTRAIT_FRAMED_W + gap) });
    }
  });
  return slots;
}

/**
 * Procedural film-strip texture, constructed as the object it actually is:
 * sprocket-hole rails along both edges, and cells divided by dark frame
 * lines — not a blur or a generic stripe. Sized to exactly `spanLen` feet so
 * it drops onto one clear span with no tiling seam. Accent color comes from
 * the active theme's palette, never a hardcoded house color.
 */
function makeFilmStripTexture(theme: StoreTheme, spanLen: number): THREE.CanvasTexture {
  const pxPerFt = 96;
  const cellsCount = Math.max(2, Math.round(spanLen / STRIP_CELL_FT));
  const cellPx = Math.round(pxPerFt * STRIP_CELL_FT);
  const cv = document.createElement('canvas');
  cv.width = cellPx * cellsCount;
  cv.height = Math.round(pxPerFt * STRIP_H);
  const c = cv.getContext('2d')!;

  // Base: dark celluloid.
  c.fillStyle = '#15110d';
  c.fillRect(0, 0, cv.width, cv.height);

  // Sprocket-hole rails, top and bottom.
  const sprocketW = cellPx * 0.16;
  const sprocketH = cv.height * 0.16;
  const railMargin = cv.height * 0.1;
  const pitch = cellPx / 2;
  c.fillStyle = '#d9d2be';
  for (let x = pitch / 2; x < cv.width; x += pitch) {
    c.beginPath();
    c.roundRect(x - sprocketW / 2, railMargin, sprocketW, sprocketH, 3);
    c.fill();
    c.beginPath();
    c.roundRect(x - sprocketW / 2, cv.height - railMargin - sprocketH, sprocketW, sprocketH, 3);
    c.fill();
  }

  // Frame cells between the sprocket rails, divided by dark frame lines, with
  // a theme-tinted border on each cell (like a projector gate's edge glow).
  const cellTop = railMargin + sprocketH + cv.height * 0.06;
  const cellBottom = cv.height - railMargin - sprocketH - cv.height * 0.06;
  const accent = theme.palette.primary;
  for (let i = 0; i < cellsCount; i++) {
    const fx = i * cellPx;
    const cx0 = fx + cellPx * 0.06;
    const cw = cellPx * 0.88;
    const grad = c.createLinearGradient(fx, cellTop, fx, cellBottom);
    grad.addColorStop(0, i % 2 === 0 ? '#2d2721' : '#342d25');
    grad.addColorStop(1, '#1c1712');
    c.fillStyle = grad;
    c.fillRect(cx0, cellTop, cw, cellBottom - cellTop);
    c.strokeStyle = accent;
    c.globalAlpha = 0.5;
    c.lineWidth = Math.max(1, cv.height * 0.012);
    c.strokeRect(cx0, cellTop, cw, cellBottom - cellTop);
    c.globalAlpha = 1;
    c.fillStyle = '#0b0908';
    c.fillRect(fx, 0, Math.max(2, cellPx * 0.04), cv.height);
  }

  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

// Portrait textures are keyed by URL and kept for the scene's lifetime, same
// tradeoff as the fixture-pinned decor poster textures this replaces (GH
// #97) — at most MAX_PORTRAITS of these exist at once.
const personTextureCache = new Map<string, THREE.Texture>();
function loadPersonPortrait(url: string, onReady: (tex: THREE.Texture) => void): void {
  const cached = personTextureCache.get(url);
  if (cached) { onReady(cached); return; }
  new THREE.TextureLoader().load(
    url,
    (tex) => {
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = 4;
      personTextureCache.set(url, tex);
      onReady(tex);
    },
    undefined,
    (err) => console.warn('[wall-decor] failed to load actor portrait', url, err),
  );
}

export function buildWallDecor(scene: StoreScene, storeWidth: number, backWallZ: number): void {
  if (!scene.shellSpec.wallDecorEnabled) return;
  // Requirement: this décor exists only on the high-ceiling variant — the
  // tall wall band it hangs on doesn't exist otherwise.
  if (scene.ceilingY < HIGH_CEILING_Y - 0.01) return;

  const spans = computeClearSpans(scene, storeWidth, backWallZ);
  if (spans.length === 0) return;

  const theme = getActiveTheme();
  const visibleCeilingY = scene.ceilingY - CORNICE_DROP;
  const centerY = visibleCeilingY - CEILING_MARGIN - PORTRAIT_H / 2;

  // Film strip: one segment per clear span (on whichever of the three walls
  // it belongs to), floating flush on the wall. Always built when décor is
  // enabled — "zero [actors] = just the film strip" — the portraits (if
  // any) hang proud of it below. Adjoining spans butt at WALL_INSET of a
  // shared corner (see computeClearSpans), so consecutive segments read as
  // one continuous ribbon turning the corner rather than separate pieces.
  spans.forEach((span) => {
    const len = span.s1 - span.s0;
    const { fixed, rotY } = wallFrame(span.wall, storeWidth, backWallZ);
    const mid = wallPoint(span.wall, (span.s0 + span.s1) / 2, fixed);
    const mat = new THREE.MeshStandardMaterial({
      map: makeFilmStripTexture(theme, len),
      roughness: 0.85,
      metalness: 0.0,
      emissive: new THREE.Color(theme.palette.primary).multiplyScalar(0.12),
      emissiveIntensity: 1.0,
    });
    const band = new THREE.Mesh(new THREE.PlaneGeometry(len, STRIP_H), mat);
    const group = new THREE.Group();
    group.position.set(mid.x, centerY, mid.z);
    group.rotation.y = rotY; // face into the store; local +Z -> world "into the room" for every wall
    group.add(band);
    scene.scene.add(group);
  });

  const actors = tallyFeaturedActors(scene, MAX_PORTRAITS);
  if (actors.length === 0) return;

  const frameMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(themeTrimDarkHex(theme)),
    roughness: 0.55,
    metalness: 0.15,
  });

  const slots = planPortraitSlots(spans, actors.length);
  slots.forEach((slot, i) => {
    const actor = actors[i];
    if (!actor) return;
    const { fixed, rotY } = wallFrame(slot.wall, storeWidth, backWallZ);
    const p = wallPoint(slot.wall, slot.s, fixed);
    const group = new THREE.Group();
    group.position.set(p.x, centerY, p.z);
    group.rotation.y = rotY;

    const frame = new THREE.Mesh(new THREE.PlaneGeometry(PORTRAIT_FRAMED_W, PORTRAIT_FRAMED_H), frameMat);
    frame.position.z = 0.02; // proud of the strip (local +Z -> toward the store interior)
    group.add(frame);

    // Neutral placeholder fill until the real portrait decodes; never a
    // broken/missing-texture look.
    const portraitMat = new THREE.MeshBasicMaterial({ color: 0x2a2620, side: THREE.DoubleSide });
    const portrait = new THREE.Mesh(new THREE.PlaneGeometry(PORTRAIT_W, PORTRAIT_H), portraitMat);
    portrait.position.z = 0.035;
    group.add(portrait);

    loadPersonPortrait(actor.imageUrl, (tex) => {
      portraitMat.map = tex;
      portraitMat.color.set(0xffffff);
      portraitMat.needsUpdate = true;
      scene.requestRender();
    });

    scene.scene.add(group);
  });
}
