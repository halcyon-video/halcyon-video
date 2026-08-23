// Phase B1 of the LogoSpec system: the storefront sign in TRUE 3D. Two modes
// beyond the classic flat layered quads:
//
//  - EXTRUDED EMBLEM (storefront.mode 'emblem', extrudeDepth > 0): the emblem
//    silhouette from buildLogoShapePoints() lifted into THREE.Shape and
//    extruded extrudeDepth feet. The front cap wears a drawLogo()-composited
//    canvas (bodyColor fill + the 'text' layer with the storefront's heavy
//    pinstripe), the side walls wear spec.borderColor — a real channel-can
//    read instead of the stepped-plane fake.
//  - FREESTANDING LETTERS (storefront.mode 'letters'): no emblem —
//    spec.mainText as ACTUAL letter-shaped extruded geometry (glyphs traced
//    from the spec's font, counters and all), sized by
//    storefront.letterHeightFt: small rows sit on the gable, big rows span
//    the whole front fascia, chain-storefront style.
//
// The key alignment trick for the emblem: geometry loops are laid out in the
// SAME 1000×600 canvas frame drawLogo paints in (per-composition placement
// transforms below mirror the painter's), so the front-cap texture lines up
// with the silhouette by construction — the texture never needs to know where
// the geometry put the shape, only the frame they share.
//
// Everything here is built ONCE at boot: static meshes, no per-frame work.
// three-scene.ts calls buildStorefrontLogo3D(); a null return means "keep
// today's flat sign path" (the default: emblem mode at depth 0, or a spec
// with nothing to extrude).
import * as THREE from 'three';
import type { LogoSpec } from './logo-spec';
import {
  getActiveLogoSpec,
  LETTER_HEIGHT_DEFAULT_FT,
  storefrontBrandGold,
} from './logo-spec';
import {
  buildLogoShapePoints, drawLogo, getLogoFontString, logoShapeFitRect,
} from './logo-renderer';
import type { LogoPoint } from './logo-renderer';
import {
  ALPHA_THRESHOLD, loopArea, nestLoops, simplifyLoop, traceAlphaContours,
} from './alpha-trace';
import type { FacadeLogoAnchor } from './storefront-facade';

export interface StorefrontLogo3D {
  group: THREE.Group;
  dispose(): void;
}

// The canvas frame every placement below is expressed in — the same 1000×600
// the flat storefront boards use, so texture sharpness matches the old sign.
const FRAME_W = 1000;
const FRAME_H = 600;

// Night treatment carried over from the flat sign's materials: the wordmark
// board glowed at emissiveIntensity 3.5 and the body board a faint 0x020825 at
// 1.0. A single cap material can't split intensities, so the emissive MAP
// bakes both: lettering at full brightness, background at 0x020825 / 3.5 so
// intensity 3.5 lands it back on the flat sign's value.
const EMISSIVE_INTENSITY = 3.5;
const BODY_GLOW_BG = 'rgb(1, 2, 11)'; // 0x020825 pre-divided by 3.5
// See buildExtrudedEmblem: a whole composed emblem face glows at this fraction
// of the lettering's strength.
const EMBLEM_GLOW_ALPHA = 0.3;

function rotate(p: LogoPoint, rad: number): LogoPoint {
  const c = Math.cos(rad), s = Math.sin(rad);
  // Canvas y-down rotation — same convention as ctx.rotate()/DOMMatrix.
  return { x: p.x * c - p.y * s, y: p.x * s + p.y * c };
}

// The emblem silhouette as loops in canvas-fraction space (0..1 over the
// FRAME, y-down) — each composition's placement transform mirrors the one
// drawLogo paints with, which is what keeps cap texture and geometry aligned.
function emblemLoopsInFrame(spec: LogoSpec): LogoPoint[][] {
  const loops = buildLogoShapePoints(spec);
  if (loops.length === 0) return [];
  const tiltRad = (spec.textTilt * Math.PI) / 180;

  // Generic painter placement (drawGeneric): emblem box 0.82w wide, 0.52h
  // tall (0.42h with a tagline, box centre nudged up), whole box rotated by
  // -textTilt about its centre. Rotation happens in PIXEL space — the frame
  // isn't square, so rotate before normalizing.
  const hasTagline = spec.taglineText !== '';
  const ew = FRAME_W * 0.82;
  const eh = FRAME_H * (hasTagline ? 0.42 : 0.52);
  const ecx = FRAME_W / 2;
  const ecy = FRAME_H / 2 - (hasTagline ? FRAME_H * 0.07 : 0);
  const boxTilt = -tiltRad;
  const fit = logoShapeFitRect(spec, ew, eh);
  return loops.map((loop) => loop.map((p) => {
    // Inside the box, 'circle' stays round (inscribed at min(ew,eh), matching
    // the painter's arc special-case); a brand outline asking to be CONTAINED
    // keeps its authored aspect, letterboxed, exactly as buildLogoShapePath
    // draws it; every other shape stretches to fill the box like the painter's
    // polygon route does.
    let bx: number, by: number;
    if (spec.shape === 'circle') {
      const s = Math.min(ew, eh);
      bx = (p.x - 0.5) * s; by = (p.y - 0.5) * s;
    } else {
      bx = fit.x + p.x * fit.w - ew / 2;
      by = fit.y + p.y * fit.h - eh / 2;
    }
    const r = rotate({ x: bx, y: by }, boxTilt);
    return { x: (ecx + r.x) / FRAME_W, y: (ecy + r.y) / FRAME_H };
  }));
}

function toSignTexture(canvas: HTMLCanvasElement): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = true;
  return tex;
}

// The storefront wears ~11% larger lettering and a deeper shadow than the
// interior boards — same treatment createStorefrontLogoYellowTexture applies.
// The pinstripe matches the emblem's thin inner rule (7 units at this scale).
function drawStorefrontLogoLayer(
  ctx: CanvasRenderingContext2D, spec: LogoSpec, layer: 'body' | 'text',
): void {
  const textSpec = {
    ...spec,
    textColor: storefrontBrandGold(spec.textColor),
    borderColor: storefrontBrandGold(spec.borderColor),
  };
  drawLogo(ctx, textSpec, {
    x: 0, y: 0, w: FRAME_W, h: FRAME_H, layer,
    pinstripeWidth: 7,
    fontScale: 100 / 90,
    shadow: { color: 'rgba(0,0,0,0.7)', blur: 8, ox: 3, oy: 4 },
  });
}

function drawStorefrontTextLayer(ctx: CanvasRenderingContext2D, spec: LogoSpec): void {
  drawStorefrontLogoLayer(ctx, spec, 'text');
}

// ─── Extruded emblem ─────────────────────────────────────────────────────────

function buildExtrudedEmblem(spec: LogoSpec, anchor: FacadeLogoAnchor): StorefrontLogo3D | null {
  const frameLoops = emblemLoopsInFrame(spec);
  if (frameLoops.length === 0) return null; // shape 'none': nothing to extrude

  const logoW = anchor.width;
  const logoH = anchor.height;

  // Front cap: bodyColor across the WHOLE frame (the silhouette is the
  // geometry's job — a full fill also covers the clamped texels where a
  // tilted emblem pokes past the frame), then the wordmark layer on top.
  const faceCanvas = document.createElement('canvas');
  faceCanvas.width = FRAME_W; faceCanvas.height = FRAME_H;
  const faceCtx = faceCanvas.getContext('2d')!;
  faceCtx.fillStyle = spec.bodyColor;
  faceCtx.fillRect(0, 0, FRAME_W, FRAME_H);
  // A composed emblem's artwork lives on the BODY layer (see drawGeneric), so
  // the cap has to take both passes or the sign extrudes the right shape and
  // wears none of the art.
  if (spec.emblem) drawStorefrontLogoLayer(faceCtx, spec, 'body');
  drawStorefrontTextLayer(faceCtx, spec);
  const faceTex = toSignTexture(faceCanvas);

  // Emissive map: same lettering over the faint body glow (see the constants
  // above). The sign glows in the brand's own lettering ink.
  const glowCanvas = document.createElement('canvas');
  glowCanvas.width = FRAME_W; glowCanvas.height = FRAME_H;
  const glowCtx = glowCanvas.getContext('2d')!;
  glowCtx.fillStyle = BODY_GLOW_BG;
  glowCtx.fillRect(0, 0, FRAME_W, FRAME_H);
  // A COMPOSED emblem's whole face is artwork, and at the lettering's emissive
  // strength it would read as a white slab after dark. The face goes on at a
  // lit-lightbox level instead — EMBLEM_GLOW_ALPHA x EMISSIVE_INTENSITY lands
  // it near 1.0, in the brand's own colours — and the wordmark over it keeps
  // full strength, so the store's NAME is what actually glows.
  if (spec.emblem) {
    glowCtx.globalAlpha = EMBLEM_GLOW_ALPHA;
    drawStorefrontLogoLayer(glowCtx, spec, 'body');
    glowCtx.globalAlpha = 1;
  }
  drawStorefrontTextLayer(glowCtx, spec);
  const glowTex = toSignTexture(glowCanvas);

  // Loops → world-feet shapes, y flipped (canvas is y-down), centred on the
  // anchor like the flat quads were. ExtrudeGeometry fixes winding itself.
  // Nested, not flat: a composed emblem can carry real windows (a ring, a
  // counter, a punched hole), and a hole handed to the extruder as a sibling
  // shape comes back as a solid plug sitting in the middle of the sign. Every
  // built-in outline is a single loop, so nesting is a no-op for them.
  const toV2 = (p: LogoPoint) => new THREE.Vector2((p.x - 0.5) * logoW, (0.5 - p.y) * logoH);
  const shapes = nestLoops(frameLoops).map(({ outer, holes }) => {
    const shape = new THREE.Shape(outer.map(toV2));
    for (const hole of holes) shape.holes.push(new THREE.Path(hole.map(toV2)));
    return shape;
  });
  const geo = new THREE.ExtrudeGeometry(shapes, {
    depth: spec.storefront.extrudeDepth,
    bevelEnabled: false, // a bevel would push the rim past the texture-aligned silhouette
  });
  // Extrude UVs come out in shape units (feet); remap every vertex back into
  // the shared canvas frame. Sides get the same mapping — harmless, their
  // material is untextured.
  const pos = geo.getAttribute('position');
  const uv = geo.getAttribute('uv');
  for (let i = 0; i < uv.count; i++) {
    uv.setXY(i, pos.getX(i) / logoW + 0.5, pos.getY(i) / logoH + 0.5);
  }

  const capMat = new THREE.MeshStandardMaterial({
    map: faceTex,
    emissiveMap: glowTex,
    emissive: new THREE.Color(0xffffff),
    emissiveIntensity: EMISSIVE_INTENSITY,
    // Between the flat body board (0.2/0.2) and its glossy gold board
    // (0.1/0.9): one cap can't split finishes per-texel, and at sign distance
    // the emissive lettering is what actually sells the night read.
    roughness: 0.2,
    metalness: 0.3,
  });
  const sideMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(spec.borderColor),
    roughness: 0.3,
    metalness: 0.55,
    // The old stepped gold layers all self-glowed; give the real returns a
    // modest version of that so the sign edge still reads lit at night.
    emissive: new THREE.Color(spec.borderColor),
    emissiveIntensity: 0.4,
  });

  // ExtrudeGeometry group 0 = front+back caps, group 1 = side walls.
  const mesh = new THREE.Mesh(geo, [capMat, sideMat]);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.userData.excludeFromSSAO = true;

  const group = new THREE.Group();
  group.name = 'storefrontLogo3D';
  group.add(mesh); // extrusion runs z 0..depth: back cap flush with the anchor plane
  group.position.set(anchor.x, anchor.y, anchor.z);

  return {
    group,
    dispose: () => {
      geo.dispose();
      capMat.dispose();
      sideMat.dispose();
      faceTex.dispose();
      glowTex.dispose();
    },
  };
}

// ─── Freestanding letters ────────────────────────────────────────────────────
//
// TRUE letter-shaped geometry: each glyph is rasterized large on an offscreen
// canvas in the spec's font, its alpha field is contour-traced with marching
// squares (sub-pixel crossings via alpha interpolation, holes for counters
// like O/B/R falling out of the nesting), the polylines are Douglas-Peucker
// simplified, and the result becomes THREE.Shape(+holes) → ExtrudeGeometry
// per character. Traced outlines are cached per distinct font|character;
// geometry is rebuilt per boot at the requested letter height.
//
// Layout: spec.storefront.letterHeightFt is the letter CAP HEIGHT in feet.
// A row that fits inside the gable triangle at that height mounts there
// (today's placement); a bigger row lays out along the front fascia band,
// centred on the whole facade — the big-letters look — shrinking only
// when the name simply cannot fit the facade at the requested height.

const GLYPH_FONT_PX = 320;   // raster size: big enough for smooth traces
const GLYPH_ALPHA_T = ALPHA_THRESHOLD; // inside/outside threshold on the alpha channel
const GLYPH_SIMPLIFY_EPS = GLYPH_FONT_PX * 0.004; // ~1.3px: kills stairsteps, keeps curves
const LETTER_GAP_N = 0.10;   // gap between letters, in cap-height units
const SPACE_ADV_N = 0.42;    // word-space advance, in cap-height units

interface TracedGlyph {
  // Outer outline + its counter holes, y-UP, baseline at y=0, pen origin at
  // x=0, normalized so 1.0 = cap height.
  loops: { outer: LogoPoint[]; holes: LogoPoint[][] }[];
  advance: number; // normalized pen advance
}

// Traced outlines survive rebuilds (theme/spec changes re-enter here) — pure
// data, no GPU resources.
const tracedGlyphCache = new Map<string, TracedGlyph | null>();

// Glyph tracing lives in src/alpha-trace.ts — the same marching-squares pass
// the emblem composer flattens a whole layered composition with, so a
// freestanding letter and the sign beside it agree about where an edge is.

// Rasterize + trace one glyph. Returns null for characters with no ink.
function traceGlyph(ch: string, fontStr: string, capPx: number): TracedGlyph | null {
  const measure = document.createElement('canvas').getContext('2d')!;
  measure.font = fontStr;
  const m = measure.measureText(ch);
  const advance = m.width / capPx;
  const left = Math.ceil(Math.max(0, m.actualBoundingBoxLeft ?? 0));
  const right = Math.ceil(Math.max(1, m.actualBoundingBoxRight ?? m.width));
  const asc = Math.ceil(Math.max(1, m.actualBoundingBoxAscent ?? GLYPH_FONT_PX));
  const desc = Math.ceil(Math.max(0, m.actualBoundingBoxDescent ?? 0));
  const pad = 4; // empty border so every contour closes inside the grid
  const cw = left + right + 2 * pad;
  const chh = asc + desc + 2 * pad;
  if (cw <= 2 * pad || chh <= 2 * pad) return null;

  const canvas = document.createElement('canvas');
  canvas.width = cw; canvas.height = chh;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  const penX = pad + left;
  const baseY = pad + asc;
  ctx.font = fontStr;
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(ch, penX, baseY);

  const img = ctx.getImageData(0, 0, cw, chh).data;
  const alpha = new Float32Array(cw * chh);
  let ink = 0;
  for (let i = 0; i < alpha.length; i++) {
    const a = img[i * 4 + 3];
    alpha[i] = a;
    if (a >= GLYPH_ALPHA_T) ink++;
  }
  if (ink === 0) return null;

  const raw = traceAlphaContours(alpha, cw, chh)
    .map((loop) => simplifyLoop(loop, GLYPH_SIMPLIFY_EPS))
    .filter((loop) => loopArea(loop) > 4); // drop speck contours
  if (raw.length === 0) return null;

  // Nest the counters (O/B/R) into the outlines that contain them, then
  // normalize into cap-height units with the baseline at y=0, y UP.
  const norm = (p: LogoPoint): LogoPoint => ({ x: (p.x - penX) / capPx, y: (baseY - p.y) / capPx });
  return {
    loops: nestLoops(raw).map(({ outer, holes }) => ({
      outer: outer.map(norm),
      holes: holes.map((hole) => hole.map(norm)),
    })),
    advance,
  };
}

function getTracedGlyph(ch: string, fontStr: string, capPx: number): TracedGlyph | null {
  const key = `${fontStr}|${ch}`;
  let glyph = tracedGlyphCache.get(key);
  if (glyph === undefined) {
    glyph = traceGlyph(ch, fontStr, capPx);
    tracedGlyphCache.set(key, glyph);
  }
  return glyph;
}

function buildFreestandingLetters(spec: LogoSpec, anchor: FacadeLogoAnchor): StorefrontLogo3D | null {
  const text = spec.mainText.toUpperCase().trim();
  if (text === '') return null;
  // Letters always have SOME body — zero depth would degenerate the extrude.
  const depth = Math.max(0.1, spec.storefront.extrudeDepth);

  const fontStr = getLogoFontString(spec, GLYPH_FONT_PX);
  const measure = document.createElement('canvas').getContext('2d')!;
  measure.font = fontStr;
  // Cap height anchors the feet scale: letterHeightFt is the height of an 'H'.
  const capPx = Math.max(1, measure.measureText('H').actualBoundingBoxAscent || GLYPH_FONT_PX * 0.72);

  // Resolve the run: traced glyph or space advance per character.
  const run: { glyph: TracedGlyph | null; advance: number }[] = [];
  let glyphCount = 0;
  for (const ch of text) {
    if (ch === ' ') {
      run.push({ glyph: null, advance: SPACE_ADV_N });
      continue;
    }
    const glyph = getTracedGlyph(ch, fontStr, capPx);
    if (glyph) glyphCount++;
    run.push({ glyph, advance: glyph ? glyph.advance : SPACE_ADV_N });
  }
  if (glyphCount === 0) return null;
  const totalN = run.reduce((s, r) => s + r.advance, 0) + LETTER_GAP_N * (run.length - 1);

  // ── Row height + placement ────────────────────────────────────────────────
  let rowH = Math.min(10, Math.max(0.5, spec.storefront.letterHeightFt ?? LETTER_HEIGHT_DEFAULT_FT));
  const g = anchor.gable;
  const slope = (2 * g.halfWidth) / g.height; // triangle narrowing per foot of rise
  const gableYBot = g.baseY + 1.0;
  const gableAvail = 2 * (g.halfWidth - 0.7) - slope * (gableYBot + rowH - g.baseY);
  let baselineY: number;
  if (totalN * rowH <= gableAvail) {
    // Fits the gable at the requested height → today's placement, a foot
    // above the spring line, top corners clear of the raking copings.
    baselineY = gableYBot;
  } else {
    // Too big for the gable: span the front fascia band across the whole
    // facade, centred. Shrink ONLY if the name cannot fit at the requested
    // height (row wider than the facade, or taller than the band).
    const f = anchor.fascia;
    const availW = f.width - 1.6; // clear of the corner piers
    const bandH = f.topY - f.bottomY;
    if (rowH > bandH - 0.3) rowH = bandH - 0.3;
    if (totalN * rowH > availW) rowH = availW / totalN;
    rowH = Math.max(0.4, rowH);
    baselineY = (f.bottomY + f.topY) / 2 - rowH / 2; // caps centred on the band
  }

  const group = new THREE.Group();
  group.name = 'storefrontLogo3D';
  // anchor.z sits just proud of the tower face — the one mounting plane that
  // clears every facade layer, so a full-width row never buries its middle
  // letters inside the protruding entrance tower.
  group.position.set(anchor.x, baselineY, anchor.z);

  // Front/back caps: the brand's letter color, self-lit like the flat sign's
  // wordmark board (same emissive treatment at night). Returns/sides: the
  // border color, with the modest edge glow the sign trims always had.
  const faceMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(spec.textColor),
    emissive: new THREE.Color(spec.textColor),
    emissiveIntensity: EMISSIVE_INTENSITY,
    roughness: 0.25,
    metalness: 0.2,
  });
  const sideMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(spec.borderColor),
    roughness: 0.3,
    metalness: 0.55,
    emissive: new THREE.Color(spec.borderColor),
    emissiveIntensity: 0.4,
  });

  const disposables: { dispose(): void }[] = [faceMat, sideMat];
  // One extruded geometry per DISTINCT character (at this row height), shared
  // by repeats. ExtrudeGeometry groups: 0 = front+back caps, 1 = side walls.
  const perChar = new Map<TracedGlyph, THREE.ExtrudeGeometry>();
  const getGeometry = (glyph: TracedGlyph): THREE.ExtrudeGeometry => {
    let geo = perChar.get(glyph);
    if (!geo) {
      const shapes = glyph.loops.map(({ outer, holes }) => {
        const shape = new THREE.Shape(outer.map((p) => new THREE.Vector2(p.x * rowH, p.y * rowH)));
        for (const hole of holes) {
          shape.holes.push(new THREE.Path(hole.map((p) => new THREE.Vector2(p.x * rowH, p.y * rowH))));
        }
        return shape;
      });
      geo = new THREE.ExtrudeGeometry(shapes, { depth, bevelEnabled: false });
      perChar.set(glyph, geo);
      disposables.push(geo);
    }
    return geo;
  };

  let cursor = -(totalN * rowH) / 2;
  for (const r of run) {
    if (r.glyph) {
      const mesh = new THREE.Mesh(getGeometry(r.glyph), [faceMat, sideMat]);
      mesh.position.set(cursor, 0, 0.02); // baseline at group origin, extrude runs z 0.02..0.02+depth
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.userData.excludeFromSSAO = true;
      group.add(mesh);
    }
    cursor += (r.advance + LETTER_GAP_N) * rowH;
  }

  return {
    group,
    dispose: () => disposables.forEach((d) => d.dispose()),
  };
}

/**
 * Build the 3D storefront sign for the active spec, or return null when the
 * spec calls for today's flat layered sign (emblem mode at extrudeDepth 0 —
 * the default — or a silhouette-less/text-less spec the 3D modes can't
 * represent, which falls back to the flat painter that can).
 */
export function buildStorefrontLogo3D(
  anchor: FacadeLogoAnchor,
  spec: LogoSpec = getActiveLogoSpec(),
): StorefrontLogo3D | null {
  if (spec.storefront.mode === 'letters') return buildFreestandingLetters(spec, anchor);
  if (spec.storefront.extrudeDepth > 0) return buildExtrudedEmblem(spec, anchor);
  return null;
}
