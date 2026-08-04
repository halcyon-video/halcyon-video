// Era campaign window banner on the front glass — first in-store consumer of
// the sign-lab redraw pipeline (tools/sign-lab/, match-real-asset skill).
//
// Gated by POP PERIOD, not theme (pop-period.ts): the campaign kit is
// attested [2005..2006] — its window space went to the next campaign by
// 2007 (ERAS.md intervals). Under the owner's fabric-vs-kit model that
// means it renders on any fabric REFIT BY 2005 (bb-2000 and older) when
// the store's POP period is 2005 — and never on bb-2010, whose 2008-refresh
// fabric postdates the campaign's death. (This reverses the earlier
// theme-year gate: a newer building can't display an older, discontinued
// mailing.)
// Reference: the 2005 "End of Late Fees" banner (Flickr photo 38151087;
// measured spec in public/user-assets/fixtures/late-fees-window-poster/
// NOTES.md — 78 x 47.8 in, aspect exact via single-view metrology). The
// committed fallback below is a GENERIC brand-free banner in the same
// measured layout; installing the git-ignored recreation's front.png swaps
// the real campaign art in.
//
// Faces OUT like all storefront-dressing window graphics (they're for the
// parking lot; from inside they read mirrored, as the footage shows). Placed
// on the LEFT wing; the glass it claims is exported as campaignBannerSpan()
// so store-shell's suspended-lightbox loop leaves those bays EMPTY — a
// lightbox hanging in front of the campaign banner was the first thing the
// user flagged.
import * as THREE from 'three';
import type { StoreScene } from '../three-scene';
import { vestibuleHalfWidth, getStorefrontSpec, FRONT_WINDOW_CORNER_MARGIN } from '../store-layout';
import { markSignMesh } from '../sign-builders';
import { popKitVisible } from '../pop-period';
import { tryLoadUserAssetTexture } from '../user-assets';

// Measured physical size (NOTES.md): 78 x 47.8 in.
const POSTER_W_FT = 78 / 12;
const POSTER_H_FT = 47.8 / 12;

// Loaded user art survives signage rebuilds (clearActiveSignage disposes
// materials, not maps) and is only fetched once per session.
let userTex: THREE.Texture | null = null;
let userTexMissing = false;

// Generic fallback: the measured band layout (band 0.347..0.838 of H, caps
// per NOTES.md) with brand-free copy — believable at parking-lot distance,
// no campaign trademark in the repo.
function fallbackTexture(): THREE.CanvasTexture {
  const w = 1024, h = Math.round(1024 / (POSTER_W_FT / POSTER_H_FT));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#FFC60A';
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#1D3EAD';
  ctx.fillRect(0, 0.347 * h, w, (0.838 - 0.347) * h);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#1D3EAD';
  ctx.font = `900 ${0.13 * h}px Arial, sans-serif`;
  ctx.fillText('WELCOME TO', w / 2, 0.235 * h);
  ctx.fillStyle = '#ffffff';
  ctx.font = `900 ${0.17 * h}px Arial, sans-serif`;
  ctx.fillText('GREAT MOVIE', w / 2, 0.475 * h);
  ctx.fillText('NIGHTS', w / 2, 0.70 * h);
  ctx.fillStyle = '#3F3F3A';
  ctx.font = `${0.026 * h}px Arial, sans-serif`;
  ctx.textAlign = 'left';
  ctx.fillText('See store for details.', 0.027 * w, 0.955 * h);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

// The stretch of front glass the banner occupies (world-x span), or null when
// the theme/storefront doesn't carry it. Single source of truth for BOTH the
// banner placement below and store-shell's suspended-poster loop, which skips
// any window bay this span touches (the banner gets the prime glass, exactly
// like a real campaign rollout did).
export function campaignBannerSpan(scene: StoreScene): { x0: number; x1: number } | null {
  if (!popKitVisible(2005, 2006)) return null;
  const storeWidth = scene.getStoreWidth();
  const vestHalf = vestibuleHalfWidth(scene.storefrontSpec ?? getStorefrontSpec(storeWidth));
  // Left wing of the front glass: corner margin to the vestibule edge.
  const wingLeft = 11.0 - storeWidth / 2 + FRONT_WINDOW_CORNER_MARGIN;
  const wingRight = 11.0 - vestHalf;
  if (wingRight - wingLeft < POSTER_W_FT + 0.5) return null; // storefront too narrow
  const cx = (wingLeft + wingRight) / 2;
  return { x0: cx - POSTER_W_FT / 2, x1: cx + POSTER_W_FT / 2 };
}

export function buildStorefrontCampaignPoster(scene: StoreScene): void {
  const span = campaignBannerSpan(scene);
  if (!span) return;

  const group = new THREE.Group();
  group.name = 'storefront-campaign-poster';
  scene.scene.add(group);
  scene.activeSignageObjects.push(group);

  const mat = new THREE.MeshStandardMaterial({
    map: userTex ?? fallbackTexture(),
    roughness: 0.45, // gloss poster paper (NOTES.md substrate), not the 93 matte stock
    metalness: 0.0,
    side: THREE.DoubleSide,
  });
  const poster = new THREE.Mesh(new THREE.PlaneGeometry(POSTER_W_FT, POSTER_H_FT), mat);
  // Top edge just under the 9 ft glass head — where the reference photo
  // hangs it in the pane.
  poster.position.set((span.x0 + span.x1) / 2, 8.5 - POSTER_H_FT / 2, 15.0 - 0.07);
  markSignMesh(poster);
  group.add(poster);

  if (!userTex && !userTexMissing) {
    tryLoadUserAssetTexture('fixtures/late-fees-window-poster/front.png', (tex) => {
      tex.anisotropy = 8;
      userTex = tex; // cache across rebuilds; teardown never disposes maps
      mat.map = tex; // harmless if this build was already torn down
      mat.needsUpdate = true;
      scene.requestRender();
    }, { onMiss: () => { userTexMissing = true; } });
  }
}
