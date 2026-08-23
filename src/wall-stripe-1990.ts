// The 1990 two-tone WALL STRIPE — bb-1990 store fabric, painted in the active
// theme's own livery.
//
// Not a soffit — there's no overhang or dropped bulkhead here, just a stripe
// painted directly on a flat vertical wall. (The original video-corpus notes
// called this "soffit height," which was loose phrasing for "near the top of
// the wall"; that language leaked into this module's old name/comments and
// was wrong — renamed 2026-08-03.)
//
// WHAT IT IS (owner spec, 2026-08-03 — supersedes an earlier video-measured
// attempt that overcomplicated this): a single blue band painted directly on
// the white wall, running the entire length of the wall, seated about half a
// foot down from the ceiling. The band is 1 ft tall overall, with a yellow
// stripe painted in the middle of it about a third of a foot tall — i.e.
// three equal thirds, blue / yellow / blue. No cream gaps, no separate thin
// pinstripe, no lettering, no logos. It is FABRIC, not signage.
//
// The wall itself is plain white (themes.ts, BB_ROOM_PALETTE override on
// bb-1990) with no painted lettering — the "NEW RELEASES" wall lettering and
// the emblem that used to stand in front of this band are
// removed on bb-1990 (fixtures/signage.ts, wall-newrelease category, early
// return for theme.id === 'bb-1990'); genre signage in this era lives on
// propped ticket cards on the gondola tops instead
// (genre-signboard-1990), not on the wall. The prebaked warm
// up-glow that used to wash the upper wall (store-shell.ts buildCeilingFrame)
// is also skipped on bb-1990 — it was tuned for the old amber-gold wall and
// isn't wanted here.
//
// It is painted on EVERY wall of the sales floor, as one contiguous loop
// (owner spec, 2026-08-03 — it used to follow only the wall-bay shelving runs,
// which left the band hanging over the New Releases wall and nowhere else).
// The loop traces the room's real wall line: back wall, both faces of the
// stepped back-right corner, the two side walls, and the front wall above the
// storefront glazing, broken only where the entrance vestibule's glass shaft
// takes the wall out. Corners are butted, not mitred — each run pushes into
// the corner by the standoff so the two walls' paint meets there.
//
// Performance: one material, one merged BufferGeometry for every run in the
// store (single draw call), one small texture, zero per-frame work. The
// committed procedural paint IS the real thing here (abstract brand-free
// stripes), so the user-asset swap is only an upgrade hook for a future
// photo-derived strip (wear, paint texture), not the fidelity path itself.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { getActiveTheme, type StoreTheme } from './themes';
import { formatWallIsPrefinished } from './format-surfaces';
import { tryLoadUserAssetTexture } from './user-assets';
import { markSignMesh } from './sign-builders';
import { CORNICE_DROP } from './store-shell';
import { STORE_CENTER_X, FRONT_GLASS_Z, vestibuleHalfWidth } from './store-layout';
import { WINDOW_HEAD_Y } from './storefront-facade';
import type { StoreScene } from './three-scene';

// ── Geometry (owner spec) ────────────────────────────────────────────────────
const BAND_H_FT = 1.0;          // overall band height
const YELLOW_FRAC = 1 / 3;      // trim stripe, centered — the other 2/3 splits evenly above/below
// "About half a foot from the ceiling" — but this store's true ceiling
// (scene.ceilingY) is hidden above a 2.7 ft mirrored chrome cornice
// (CORNICE_DROP, store-shell.ts) that hangs the whole way around the room;
// anything painted on the wall above (ceilingY - CORNICE_DROP) is invisible
// from every normal viewing angle. The visible "ceiling line" as experienced
// from inside the store is that cornice's bottom edge, so the gap is measured
// from THERE, not from the true ceiling plane.
const CEILING_GAP_FT = 0.5;     // band TOP sits this far below the VISIBLE ceiling line

const WALL_STANDOFF = 0.04;     // ft off the wall plane — behind every wall fixture

// One texture tile = this many feet of wall, so a future user asset with real
// horizontal detail (wear, paint texture) has a defined physical scale. The
// procedural paint is horizontally featureless, so the repeat is invisible.
const TILE_LEN_FT = 8;

const USER_ASSET = 'fixtures/wall-stripe-1990/front.png';

/** Single source of truth for the gate: the 1990 store paints this stripe. */
export function wallStripe1990Active(theme: StoreTheme = getActiveTheme()): boolean {
  // Never on a PREFINISHED wall. This band is house livery PAINTED onto flat
  // drywall — that is the whole reason the 1990 store has it instead of a
  // soffit. A format whose walls are tongue-and-groove timber (mom-and-pop,
  // GH #33) has nothing to paint it on: a chain stripe ruled across wood
  // panelling reads as a decal stuck to someone else's wall, which is exactly
  // what it would be.
  if (formatWallIsPrefinished()) return false;
  return theme.id === 'bb-1990';
}

// Bumped per build so an in-flight user-asset load from a torn-down store
// discards itself instead of swapping onto a dead material (same guard shape
// as the retired wall-band's bandGeneration).
let bandGeneration = 0;

/** One straight painted run: centre point, length along the wall, facing yaw. */
interface StripeRun { cx: number; cz: number; len: number; yaw: number }

/**
 * The interior wall line of the sales floor, as the contiguous loop the paint
 * follows. `yaw` is the run's facing: the strip's normal after rotateY(yaw) is
 * (sin yaw, 0, cos yaw), so 0 faces +Z (into the store off the back wall),
 * ±PI/2 face ∓X off the side walls, PI faces -Z off the front wall.
 */
function perimeterRuns(scene: StoreScene, bandBottomY: number): StripeRun[] {
  const storeWidth = scene.getStoreWidth();
  const leftX = STORE_CENTER_X - storeWidth / 2;
  const rightX = STORE_CENTER_X + storeWidth / 2;
  const backZ = scene.backWallZ;
  // With bb_corner 'none' there is no notch: the back wall is flat, so the
  // step's two faces collapse to zero length and drop out below.
  const stepX = scene.hasStep ? scene.stepX : rightX;
  const stepZ = scene.hasStep ? backZ + scene.stepDepth : backZ;

  const runs: StripeRun[] = [];
  // Ends that die into a corner push INTO it by the standoff, so this run's
  // paint reaches the plane the perpendicular wall's paint stands on and the
  // corner reads solid instead of showing a standoff-wide slot.
  const add = (
    ax: number, az: number, bx: number, bz: number, yaw: number,
    extA = true, extB = true,
  ) => {
    const dx = bx - ax, dz = bz - az;
    const raw = Math.hypot(dx, dz);
    if (raw < 0.05) return; // degenerate (no step, or a shell with no room here)
    const ux = dx / raw, uz = dz / raw;
    const a = extA ? WALL_STANDOFF : 0;
    const len = raw + a + (extB ? WALL_STANDOFF : 0);
    runs.push({
      cx: ax - ux * a + ux * len / 2,
      cz: az - uz * a + uz * len / 2,
      len,
      yaw,
    });
  };

  // The front glazing (and the side-window ribbons) run up to WINDOW_HEAD_Y;
  // paint only exists on the solid wall above it. At every ceiling height this
  // store ships the band clears that head — this is the guard, not a normal
  // path: sink the band below the window heads and it retreats to the walls
  // that are still solid there rather than painting across glass.
  const clearsGlazing = bandBottomY >= WINDOW_HEAD_Y;
  const sideFrontZ = clearsGlazing || !scene.sideRibbon ? FRONT_GLASS_Z : scene.sideRibbon.backZ;

  add(leftX, backZ, stepX, backZ, 0);                       // back wall
  add(stepX, backZ, stepX, stepZ, -Math.PI / 2);            // notch connector (faces -X)
  add(stepX, stepZ, rightX, stepZ, 0);                      // stepped-forward face
  add(rightX, stepZ, rightX, sideFrontZ, -Math.PI / 2);     // right wall
  add(leftX, backZ, leftX, sideFrontZ, Math.PI / 2);        // left wall
  if (clearsGlazing) {
    // Front wall, in the two spans that flank the vestibule — the same pair
    // the interior wall band above the glazing is built in (store-shell.ts).
    // The vestibule is a floor-to-ceiling glass shaft, so there is no wall
    // between them to paint.
    const vestHalf = vestibuleHalfWidth(scene.storefrontSpec);
    add(leftX, FRONT_GLASS_Z, STORE_CENTER_X - vestHalf, FRONT_GLASS_Z, Math.PI, true, false);
    add(STORE_CENTER_X + vestHalf, FRONT_GLASS_Z, rightX, FRONT_GLASS_Z, Math.PI, false, true);
  }
  return runs;
}

/**
 * Paint the 1990 wall stripe around every wall of the sales floor. No-op on
 * every theme but bb-1990.
 */
export function buildWallStripe1990(scene: StoreScene): void {
  if (!wallStripe1990Active()) return;

  const visibleCeilingY = scene.ceilingY - CORNICE_DROP;
  const bandTopY = visibleCeilingY - CEILING_GAP_FT;
  const centerY = bandTopY - BAND_H_FT / 2;

  const runs = perimeterRuns(scene, bandTopY - BAND_H_FT);
  if (runs.length === 0) return;

  const parts: THREE.BufferGeometry[] = [];
  for (const run of runs) {
    const geo = new THREE.PlaneGeometry(run.len, BAND_H_FT);
    // Bake the physical tile scale into the UVs so every run shares ONE map
    // and merges into ONE draw call.
    const repeat = run.len / TILE_LEN_FT;
    const uv = geo.attributes.uv as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * repeat);
    // Local +Z is the face direction; stand the strip just off the wall so it
    // sits proud of the wall plane like real paint.
    geo.rotateY(run.yaw);
    geo.translate(
      run.cx + Math.sin(run.yaw) * WALL_STANDOFF,
      centerY,
      run.cz + Math.cos(run.yaw) * WALL_STANDOFF,
    );
    parts.push(geo);
  }

  const merged = parts.length === 1 ? parts[0] : mergeGeometries(parts);
  if (parts.length > 1) parts.forEach((g) => g.dispose());

  const fallback = createWallStripeTexture();
  const mat = new THREE.MeshStandardMaterial({
    map: fallback,
    // Matte paint on drywall, same finish family as the wall material it sits
    // on — the band must take the troffer gradient, never broadcast it.
    roughness: 0.9,
    metalness: 0.0,
  });
  const mesh = markSignMesh(new THREE.Mesh(merged, mat));
  mesh.name = 'wall-stripe-1990';
  scene.scene.add(mesh);

  // Optional photo-derived upgrade strip, if the owner ever installs one.
  // A 404 is the normal committed case and leaves the procedural paint up.
  const gen = ++bandGeneration;
  tryLoadUserAssetTexture(USER_ASSET, (tex) => {
    if (gen !== bandGeneration || !mesh.parent) { tex.dispose(); return; }
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.anisotropy = 8; // matches the wall signage textures (toSignTexture)
    mat.map = tex;
    mat.needsUpdate = true;
    fallback.dispose();
    scene.requestRender();
  });
}

// Scale an #rrggbb by `f`, clamped — one-line local color math.
function liftHex(hex: string, f: number): string {
  const c = hex.replace('#', '');
  const ch = (i: number) =>
    Math.max(0, Math.min(255, Math.round(parseInt(c.substring(i, i + 2), 16) * f)));
  return `#${[ch(0), ch(2), ch(4)].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

// ── Procedural stripe paint ─────────────────────────────────────────────────
// Three equal thirds: house color / trim / house color. Canvas top row =
// texture v=1 = top of the plane (three.js flipY default), so the body band is
// drawn first (top), then the trim (middle), then the body again (bottom) —
// same order either way since both body thirds are identical.
//
// Both bands come from the ACTIVE THEME's palette, so the stripe is house
// livery in every brand rather than one chain's colors painted on the wall:
// primary lifted slightly (a painted band reads a touch brighter than the
// emblem's ink under room light), and the trim band straight off secondary.
function createWallStripeTexture(): THREE.CanvasTexture {
  const { primary, secondary } = getActiveTheme().palette;
  const bandBody = liftHex(primary, 1.12);
  const canvas = document.createElement('canvas');
  canvas.width = 32;
  canvas.height = 192;
  const ctx = canvas.getContext('2d')!;
  const yellowH = Math.round(YELLOW_FRAC * canvas.height);
  const blueH = Math.round((canvas.height - yellowH) / 2);
  ctx.fillStyle = bandBody;
  ctx.fillRect(0, 0, canvas.width, blueH);
  ctx.fillStyle = secondary;
  ctx.fillRect(0, blueH, canvas.width, yellowH);
  ctx.fillStyle = bandBody;
  ctx.fillRect(0, blueH + yellowH, canvas.width, canvas.height - blueH - yellowH);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.anisotropy = 8;
  return tex;
}
