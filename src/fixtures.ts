// Shared contract between StoreScene and its swappable fixtures (ambient TVs,
// entrance/checkout, future gondolas, kiosks, ...). A fixture gets everything it
// needs through this context instead of reaching into StoreScene, so alternate
// implementations (different TV layouts, a different checkout counter) can be
// dropped in without touching the scene core.
import * as THREE from 'three';
import { JellyfinLibrary } from './jellyfin';
import { StorefrontSpec, FixturePlacement } from './store-layout';
import { Footprint } from './layout-validator';
import { StoreTheme } from './themes';
import { GondolaMaterials } from './shelving';

export interface FixtureContext {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  // Store shell dimensions in feet (store centreline is X = 11).
  storeWidth: number;
  backWallZ: number;
  // Live ceiling height in feet (T07 shell option; defaults to CEILING_Y).
  ceilingY: number;
  // Doors/windows/counter style options for the front wall (T05 storefront
  // options; defaults reproduce the original storefront exactly).
  storefrontSpec: StorefrontSpec;
  // Media catalog + server access for fixtures that stream or show artwork.
  libraries: JellyfinLibrary[];
  jellyfinUrl: string;
  jellyfinToken: string;
  // T18: video-game titles from an (optional) Romm server -- see romm.ts's
  // fetchGames and the game-section fixture. Empty when Romm isn't
  // configured/reachable, so the VIDEO GAMES section simply never builds.
  gameMovies: Movie[];
  // Watch-history recommendation candidates NOT in the library (see
  // staff-picks.ts) -- the genre endcaps resolve their order-candidate stock
  // ids against this pool. Empty when there's no watch history or Jellyseerr.
  staffPickMovies: Movie[];
  log: (msg: string, type: 'system' | 'cec' | 'video') => void;
  // Register an object for the walk-mode collision/raycast set.
  addCollider: (obj: THREE.Object3D) => void;
  // Ask the renderer to re-render its static shadow map for a few frames
  // (call after adding/removing/moving a shadow caster).
  requestShadowRefresh: () => void;
  // Request a frame render.
  requestRender: () => void;
  // Active store shelving theme.
  activeTheme: StoreTheme;
  // Gondola materials for theme-aware shelving.
  gondolaMaterials: GondolaMaterials;
}

import { Movie } from './jellyfin';

export interface FixtureSlot {
  movie: Movie;
  side: 'front' | 'back' | 'left' | 'right';
  shelfIdx: number;
  col: number;
  restingX: number;
  restingY: number;
  restingZ: number;
  restingRotY: number;
  restingRotX?: number;
  depth: number;
  key: string;
}

export interface SlottedFixture extends StoreFixture {
  placement: FixturePlacement;
  getSlots(): FixtureSlot[];
  capacity: number;
  shelfHeights: number[];
  genre: string;
}

// Lifecycle every fixture implements. build() constructs the meshes; update()
// runs once per animation frame; dispose() must release GPU/DOM/audio resources.
export interface StoreFixture {
  build(): void;
  update(timeMs: number): void;
  dispose(): void;
  // Ground-plan (X/Z) collision rectangle for src/layout-validator.ts, derived
  // from the SAME constants/expressions build() actually uses. Optional (not
  // every fixture occupies its own floor footprint — e.g. TapeRewinder sits on
  // the checkout counter); null means "no floor footprint to validate".
  getFootprint?(): Footprint | null;
}
