// CD jewel-case construction for the disc platforms that really used one —
// the clear polycarbonate lid and base that a flat art box cannot fake. The
// scans landed on the faces first (game-case-art.ts); this module adds the
// CASE: additive gloss over every printed face (the lid), and the layered
// top/bottom edge — clear rim / white paper edge / dark tray / paper / rim —
// that says "jewel case" from any angle but dead-on.
//
// What is deliberately NOT built: molded hinge teeth (the PSX front scans
// carry the ribbed hinge printed into the art, and geometry teeth under a
// scan of teeth would double them), an openable lid, and visible discs — a
// CLOSED case shows its booklet, not its media, so the `physical` label art
// stays unused here. If an open-case inspect flourish ever exists, that is
// where the label goes.
//
// The gloss recipe is glass-reflection.ts's additive pane — black base +
// AdditiveBlending, reflection from the scene environment — NOT a transparent
// overlay: alpha attenuates the reflection to nothing (the exact bug that
// module exists to fix). See makeGlassReflectionMaterial's notes.
//
// Perf shape: the dressing exists on INSPECTED/held cases and the asset
// viewer, not the shelf instances — a browse aisle renders hundreds of boxes
// and this adds six transparent quads per dressed case. One case is ever
// dressed at a time in the store (the hero pair), so the cost is fixed.
import * as THREE from 'three';
import { makeGlassReflectionMaterial } from './glass-reflection';
import { Movie } from './jellyfin';

// Platforms whose retail case was a jewel case (clear lid over a paper
// inlay). The keep-case consoles (PS2/GC/Xbox-era and the handheld cases)
// are molded opaque polypropylene — a different object, never dressed.
const JEWEL_PLATFORMS = new Set(['PLAYSTATION', 'SEGA SATURN', 'SEGA CD', 'DREAMCAST']);

export function isJewelCasePlatform(platform?: string): boolean {
  return !!platform && JEWEL_PLATFORMS.has(platform);
}

// Multi-disc "fat" jewel box depth, inches. Single-disc depth stays the
// platform's GAME_BOX_IN entry (0.4 in ≈ the real 10.4 mm). Was 0.87 (the
// commonly cited quad-tray figure) — owner judged the spine too thick
// against the box3d reference renders, so this now sits at the double-case
// figure; the teeth column + two natural-width flap prints fill it almost
// exactly, which corroborates the size.
export const JEWEL_FAT_DEPTH_IN = 0.72;

// ── Layered edge (the sandwich) ─────────────────────────────────────────────
// Looking at a real jewel case's top edge you read the construction in
// cross-section: smoked clear lid, the white edge of the front booklet, the
// dark tray interior, the white edge of the back inlay, clear base. Drawn
// symmetric front-to-back so the same texture serves the top and bottom
// faces regardless of plane orientation.
const edgeTextureCache = new Map<string, THREE.CanvasTexture>();

function edgeSandwichTexture(fat: boolean): THREE.CanvasTexture {
  const key = fat ? 'fat' : 'single';
  let tex = edgeTextureCache.get(key);
  if (tex) return tex;
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d')!;
  const band = (y0: number, y1: number, fill: string) => {
    ctx.fillStyle = fill;
    ctx.fillRect(0, Math.round(y0 * 64), 64, Math.ceil((y1 - y0) * 64));
  };
  band(0.0, 1.0, '#101214');       // tray interior — the default between layers
  // The lid/base clear rims are BRIGHT — the box3d renders show the case
  // framed by a lit silver-gray polycarbonate lip (measured #6a-#9e grays),
  // not smoked plastic. Gradient: brightest at the outer face edge.
  for (const side of [0, 1]) {
    const y0 = side === 0 ? 0 : Math.round(0.87 * 64);
    const y1 = side === 0 ? Math.round(0.13 * 64) : 64;
    const grad = side === 0
      ? ctx.createLinearGradient(0, y0, 0, y1)
      : ctx.createLinearGradient(0, y1, 0, y0);
    grad.addColorStop(0, '#c2c8ce'); // bright outer edge of the lip
    grad.addColorStop(0.55, '#82888e');
    grad.addColorStop(1, '#4a4f54');
    ctx.fillStyle = grad;
    ctx.fillRect(0, y0, 64, y1 - y0);
  }
  band(0.13, 0.19, '#d9d4c9');     // booklet paper edge
  band(0.81, 0.87, '#d9d4c9');     // back-inlay paper edge
  if (fat) {
    // The hinged inner trays of a multi-disc box: faint seams in the interior.
    band(0.42, 0.44, '#23272b');
    band(0.56, 0.58, '#23272b');
  }
  tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.minFilter = THREE.LinearFilter; // 64px of flat bands needs no mip chain
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  edgeTextureCache.set(key, tex);
  return tex;
}

// ── The dressing ────────────────────────────────────────────────────────────
// Six planes parented to the case mesh so every transform — flip animation,
// carry, checkout ritual — carries them for free:
//   front + back   additive gloss (the lid's reflection)
//   left + right   additive gloss, dimmer (polycarbonate over the spine flaps)
//   top + bottom   the opaque sandwich, floated over the box's edge faces
const EDGE_EPS = 0.0006; // ft — proud of the face, under any z-fight

function glossPane(w: number, h: number, intensity: number): THREE.Mesh {
  const pane = new THREE.Mesh(
    new THREE.PlaneGeometry(w, h),
    makeGlassReflectionMaterial({
      envMapIntensity: intensity,
      // THE ACTUAL BUG behind the white-patch blowout: makeGlassReflectionMaterial
      // puts `clearcoat`/`specularIntensity` at `layerGain`, which DEFAULTS TO 1
      // when omitted — so every envMapIntensity value tried here (1.35, 0.8, 0.5,
      // down to 0.05) left a full-strength, near-mirror (clearcoatRoughness 0.05)
      // second specular layer completely unthrottled on top. envMapIntensity
      // alone was NEVER going to fix this; layerGain had to move too. Tie it to
      // the same intensity so both layers scale together.
      layerGain: intensity,
      // A FLAT plane's reflection sweeps the environment across the face as
      // view direction shifts pixel to pixel — a bright room feature can land
      // as a clean white band rather than a small highlight. Root cause of
      // just how HOT that band gets: RoomEnvironment.js bakes a PointLight at
      // intensity 900 (three/examples/jsm/environments/RoomEnvironment.js) —
      // built for soft diffuse IBL fill, never meant for a near-mirror to
      // stare straight into.
      roughness: 0.22,
      // Read head-on like the CRT tubes, and indoors besides — the night
      // clamp exists for exterior glazing at grazing angles (see
      // glass-reflection.ts on holdAtDayGain).
      holdAtDayGain: false,
    }),
  );
  pane.castShadow = false;
  pane.receiveShadow = false;
  return pane;
}

function buildDressing(dims: { w: number; h: number; d: number }, fat: boolean, renderOrder: number): THREE.Group {
  const { w, h, d } = dims;
  const g = new THREE.Group();

  // 1.35 blew out to a flat white patch once the void-viewer's environment
  // bake was fixed to match the store's blur (see asset-viewer.ts sigma
  // comment) — a bright patch of the now-SMOOTH room reflects as one
  // concentrated hotspot instead of the fine speckle that used to mask it.
  // Cut hard, not just softened: RoomEnvironment's bake point light is
  // intensity 900 (see glossPane) — 0.06 was verified clipping to flat
  // (255,255,255) across the top of a dead-on shot even after the roughness
  // widened above. 0.05 is enough for the fresnel sheen at grazing angles
  // (where the case is actually seen) without eating the print head-on.
  // FULL face coverage (was 0.985): the inset stopped the gloss short of the
  // margin frame's outer half, so the case's own plastic edge was the one
  // part of the lid with no reflection on it at all. The round-over is
  // d*0.06 on a jewel case (~0.02in), so a near-full pane cannot overhang
  // the silhouette.
  const front = glossPane(w * 0.998, h * 0.998, 0.05);
  front.position.z = d / 2 + EDGE_EPS;
  const back = glossPane(w * 0.998, h * 0.998, 0.05);
  back.position.z = -d / 2 - EDGE_EPS;
  back.rotation.y = Math.PI;

  // The narrow faces: dimmer — the spine flap sits right against the plastic,
  // so less air, less mirror; and the spine is the face read for its TEXT.
  const left = glossPane(d * 0.985, h * 0.985, 0.15);
  left.position.x = -w / 2 - EDGE_EPS;
  left.rotation.y = -Math.PI / 2;
  const right = glossPane(d * 0.985, h * 0.985, 0.15);
  right.position.x = w / 2 + EDGE_EPS;
  right.rotation.y = Math.PI / 2;

  // The art does NOT reach the lid's edge on a real case: the inlay sheet is
  // a touch smaller than the case on EVERY side, so a gray plastic margin
  // frames it — top, bottom, AND left/right — front and back. Measured off
  // the box3d renders at ~1.8%, then cut by 1/5 on owner review (read too
  // thick in practice) -> ~1.44%, mid-gray #70-#7c. Drawn as a picture-frame
  // border floated on the faces (equivalent to "the art slightly smaller";
  // the case dims are already the real 125 mm, it is the art that
  // overreached). Same fractional thickness on both axes, taken off h since
  // the case is taller than it is wide on the fat platforms too.
  const MARGIN_FRAC = 0.0144;
  // The frame is CLEAR POLYCARBONATE, not painted trim: light and glossy,
  // with its own reflection rather than borrowing the lid pane's. Measured
  // #70-#7c off the box3d renders, but that is the colour inside ScreenScraper's
  // own studio lighting — under the store's dimmer shelf lighting it read as
  // dull grey card, so the base is lifted and given a clearcoat.
  // MeshPhysicalMaterial picks up scene.environment automatically, so this
  // reflects the real room; unlike the additive gloss panes it composites
  // normally, so it cannot blow out the way those did (see glossPane).
  const marginMat = new THREE.MeshPhysicalMaterial({
    color: 0x9aa1a8,
    roughness: 0.14,
    metalness: 0,
    clearcoat: 0.85,
    clearcoatRoughness: 0.07,
    envMapIntensity: 1.1,
  });
  // Flush to the TRUE case edge (w/h, not the 0.985-inset the gloss panes
  // use for their own unrelated reason) and mitered exactly at the corners:
  // vStrip's height is h - 2*margin, which lands its top/bottom edges dead on
  // hStrip's inner edge — no seam, no overlap. Using w*0.985/h*0.985 here (as
  // the gloss panes do) was the bug: it shrank the strips off that baseline
  // instead of off the true edges the OTHER strips were flush to, leaving a
  // ~0.0075h gap between the two where they were meant to meet at each corner.
  const margin = h * MARGIN_FRAC;
  const hStripGeo = new THREE.PlaneGeometry(w, margin);           // top/bottom, full case width
  const vStripGeo = new THREE.PlaneGeometry(margin, h - 2 * margin); // left/right, flush to hStrip's inner edge
  for (const zSide of [1, -1]) {
    const zPos = zSide * (d / 2 + EDGE_EPS * 0.5);
    const flip = zSide < 0 ? Math.PI : 0;
    for (const ySide of [1, -1]) {
      const strip = new THREE.Mesh(hStripGeo, marginMat);
      strip.position.set(0, ySide * (h / 2 - margin / 2), zPos);
      strip.rotation.y = flip;
      strip.castShadow = false;
      strip.receiveShadow = false;
      g.add(strip);
    }
    for (const xSide of [1, -1]) {
      const strip = new THREE.Mesh(vStripGeo, marginMat);
      strip.position.set(xSide * (w / 2 - margin / 2), 0, zPos);
      strip.rotation.y = flip;
      strip.castShadow = false;
      strip.receiveShadow = false;
      g.add(strip);
    }
  }

  const edgeMat = new THREE.MeshStandardMaterial({
    map: edgeSandwichTexture(fat),
    roughness: 0.22, // polished plastic sheen without reading as metal
    metalness: 0,
  });
  // PlaneGeometry v runs along the plane's height; after the ±90° X rotation
  // that axis lies along the case's DEPTH, which is exactly the axis the
  // sandwich layers stack on. The texture is front/back symmetric, so the two
  // faces' opposite v directions cannot misread.
  const top = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.985, d * 0.985), edgeMat);
  top.position.y = h / 2 + EDGE_EPS;
  top.rotation.x = -Math.PI / 2;
  const bottom = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.985, d * 0.985), edgeMat);
  bottom.position.y = -h / 2 - EDGE_EPS;
  bottom.rotation.x = Math.PI / 2;
  [top, bottom].forEach((m) => { m.castShadow = false; m.receiveShadow = false; });

  for (const pane of [front, back, left, right]) pane.renderOrder = renderOrder + 1;
  g.add(front, back, left, right, top, bottom);
  return g;
}

/**
 * Attach/refresh/remove the jewel-case dressing on a case mesh, keyed on the
 * movie and dims so a hero mesh that persists across titles (ensureHeroCases
 * swaps geometry + material on two long-lived meshes) sheds a PSX dressing
 * when a cartridge game — or a movie — takes the mesh over.
 */
export function syncJewelDressing(
  mesh: THREE.Mesh,
  movie: Movie | null,
  dims?: { w: number; h: number; d: number },
): void {
  const fat = !!movie && (movie.discCount ?? 1) >= 2;
  const want = movie?.game && dims && isJewelCasePlatform(movie.platform)
    ? `${movie.platform}_${dims.d.toFixed(4)}_${fat}`
    : null;
  if (mesh.userData.jewelKey === want) return;

  const old = mesh.userData.jewelGroup as THREE.Group | undefined;
  if (old) {
    mesh.remove(old);
    old.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.geometry.dispose();
        // Materials are per-dressing EXCEPT the sandwich texture singletons,
        // which the material dispose leaves alone (dispose() does not cascade
        // to .map in three) — exactly what the cache wants.
        (o.material as THREE.Material).dispose();
      }
    });
    mesh.userData.jewelGroup = undefined;
  }
  mesh.userData.jewelKey = want;
  if (!want || !dims) return;
  const g = buildDressing(dims, fat, mesh.renderOrder);
  mesh.add(g);
  mesh.userData.jewelGroup = g;
}
