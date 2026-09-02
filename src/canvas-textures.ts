// Procedural 2D-canvas texture painters: overhead signs, brand emblem layers,
// the storefront facade, and the store-shell surfaces (ceiling tiles, carpet,
// walls). Every function here is stateless — it paints a canvas and returns
// textures; where the texture goes and how it repeats is the caller's business.
import * as THREE from 'three';
import { getActiveTheme, type StoreTheme } from './themes';
import { getActiveLogoSpec, storefrontBrandGold } from './logo-spec';
import { dressing93Active } from './genre-colors';
import { registerBrandRepaint } from './brand-live';
import {
  drawLogo, getLogoFontString, logoFontFamily, buildLogoShapePath, logoShapeInnerBox,
  logoShapeFitRect,
} from './logo-renderer';
import agencyFontUrl from './assets/sairasemicondensed-medium.ttf';
import { BB_ARCHIVO_BLACK, bundledFontsReady } from './bundled-fonts';
import { createCategoryPlate1993Texture } from './fixtures/category-plate-1993';
import { activeStoreFormat, isMomAndPop } from './store-format';


// ─── Anisotropic-filtering budget ────────────────────────────────────────────
// Grazing-angle surfaces (the carpet and walls receding toward the back wall,
// valances seen edge-on from below) shimmer and alias into the distance at low
// anisotropy. The cap is set ONCE by the scene from the renderer's capabilities,
// gated by quality tier (see StoreScene.initThree), before any texture here is
// built. High → the GPU's true max (typically 16); Medium/Low keep the previous
// ceiling of 8. `aniso(desired)` clamps to the cap, and every call site requests
// AT LEAST its historical value, so no surface is ever filtered *less* than
// before — the only effect is sharper grazing surfaces on a capable GPU.
// Anisotropic filtering is a per-sample GPU feature with negligible cost on a
// handful of large repeating textures, so this never touches the frame budget.
let maxAnisotropy = 8;
export function setMaxAnisotropy(n: number): void {
  if (Number.isFinite(n) && n >= 1) maxAnisotropy = Math.floor(n);
}

// Material budget hint, set by StoreScene.initThree() BEFORE the store is
// built. On quality 'low' (which includes every software-GL run) the big
// glazing materials drop their clearcoat lobe: on DoubleSide transparent
// panes that cover much of the frame it's a second specular BRDF + an extra
// normal fetch per fragment, and one more program variant for a software
// rasterizer's JIT to compile — while the ripple it adds is invisible at
// low tier's resolution anyway.
let cheapMaterials = false;
export function setCheapMaterials(on: boolean): void { cheapMaterials = on; }
export function useCheapMaterials(): boolean { return cheapMaterials; }
export function aniso(desired: number): number {
  return Math.min(desired, maxAnisotropy);
}

// Stamp a procedural feature with wrap-around so the canvas tiles seamlessly.
// `draw(ctx)` paints one feature at its natural coordinates; we repaint it at the
// 8 neighbouring tile offsets too, so anything crossing an edge reappears on the
// opposite edge. Without this, every feature clipped at a boundary becomes a hard
// seam once the texture is RepeatWrapping'd. One-time init cost, so the brute
// 3x3 stamp is fine.
export function stampTiled(
  ctx: CanvasRenderingContext2D,
  sizeX: number,
  draw: (ctx: CanvasRenderingContext2D) => void,
  sizeY: number = sizeX,
) {
  for (let ox = -sizeX; ox <= sizeX; ox += sizeX) {
    for (let oy = -sizeY; oy <= sizeY; oy += sizeY) {
      ctx.save();
      ctx.translate(ox, oy);
      draw(ctx);
      ctx.restore();
    }
  }
}

// Convert a grayscale height canvas into a tangent-space normal map texture via a
// Sobel gradient. Normals derived from a real height field read far more
// naturally than hand-drawn blue strokes, and the modulo sampling keeps the
// result tileable so it matches the wrapping albedo. Red channel = height.
export function heightToNormalTexture(src: HTMLCanvasElement, strength = 1.5): THREE.CanvasTexture {
  const w = src.width, h = src.height;
  const data = src.getContext('2d')!.getImageData(0, 0, w, h).data;
  const out = document.createElement('canvas');
  out.width = w; out.height = h;
  const octx = out.getContext('2d')!;
  const outImg = octx.createImageData(w, h);
  const O = outImg.data;
  const at = (x: number, y: number) => data[(((y + h) % h) * w + ((x + w) % w)) * 4] / 255;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = (at(x - 1, y) - at(x + 1, y)) * strength;
      const dy = (at(x, y - 1) - at(x, y + 1)) * strength;
      const len = Math.hypot(dx, dy, 1);
      const i = (y * w + x) * 4;
      O[i] = (-dx / len * 0.5 + 0.5) * 255;
      O[i + 1] = (-dy / len * 0.5 + 0.5) * 255;
      O[i + 2] = (1 / len * 0.5 + 0.5) * 255;
      O[i + 3] = 255;
    }
  }
  octx.putImageData(outImg, 0, 0);
  const tex = new THREE.CanvasTexture(out);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

// Shared finishing pass for sign textures: sRGB + trilinear mips + anisotropy.
// The hanging category/genre signs and the NEW RELEASES band are read down long
// sightlines and at grazing angles from the entrance — exactly where trilinear-
// only sampling (anisotropy 1, the CanvasTexture default) collapses the printed
// text into a crawling, shimmering blur. Requesting the aniso() cap costs nothing
// per frame (per-sample GPU feature on a handful of small textures) and is the
// single biggest win against far-wall / ceiling-sign shimmer.
function toSignTexture(canvas: HTMLCanvasElement): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = aniso(16);
  return tex;
}

// ─── The brand display face ────────────────────────────────────────────────
// Signs letter in the emblem's own family (LogoSpec.fontFamily), which resolves
// to a BUNDLED face for the committed brands and to a pack-registered runtime
// face for an installed brand pack. Canvas `ctx.font` falls back to sans-serif
// SILENTLY when a face hasn't resolved yet, and signs are painted ONCE at build
// time — so a fallback draw bakes the wrong glyphs into the texture for the
// whole session. So painters register a repaint that runs once every face has
// landed (bundled-fonts owns the actual loading, including a pack's).
export const BRAND_FONT = BB_ARCHIVO_BLACK;
let brandFontReady = false;
let brandFontRequested = false;
const brandFontCbs: (() => void)[] = [];
export function ensureBrandFont(onReady?: () => void): void {
  if (onReady) {
    if (brandFontReady) onReady();
    else brandFontCbs.push(onReady);
  }
  if (brandFontRequested || typeof document === 'undefined' || !document.fonts) return;
  brandFontRequested = true;
  const done = () => {
    brandFontReady = true;
    brandFontCbs.splice(0).forEach((cb) => cb());
  };
  bundledFontsReady().then(done, done);
}
// Kick the load at module eval, i.e. as early as this module can: it gives the
// fetch a head start on the store build. It does NOT win that race on its own
// (measured: the harness still paints its signs before the faces land), so the
// repaint below is what actually guarantees a fallback-free band.
ensureBrandFont();

// Best-effort nudge for the render-on-demand loop (issue #24) after a late
// repaint: if the font resolves once the scene has settled, nothing would
// composite the corrected glyphs until the next input. The scene publishes
// itself on window (main.ts: storeScene, harness: store).
function pokeRender(): void {
  if (typeof window === 'undefined') return;
  const w = window as unknown as Record<string, { requestRender?: () => void }>;
  (w.storeScene ?? w.store)?.requestRender?.();
}

// A faint, gently-rolling surface normal map for glass — the transparent-pane
// analog of the shrink-wrap wrinkle map (createPlasticWrinkleNormalMap in
// video-case.ts). Real float glass is never optically flat: slow, low-amplitude
// undulations make reflected highlights breathe as you move past a pane. We
// paint a handful of big, heavily-blurred radial bumps (bright = raised, dark =
// dished) into a height field — stampTiled'd so it wraps seamlessly — then run
// heightToNormalTexture at low strength. The caller applies it as a CLEARCOAT
// normal with a tiny clearcoatNormalScale so the base glass stays razor-clear;
// only the specular highlight ripples, never the transmitted image (no frost).
export function createGlassSurfaceNormalMap(): THREE.CanvasTexture {
  const SIZE = 256;
  const canvas = document.createElement('canvas');
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext('2d')!;
  // Mid-gray = flat (neutral height) baseline.
  ctx.fillStyle = '#808080';
  ctx.fillRect(0, 0, SIZE, SIZE);
  const blob = (cx: number, cy: number, r: number, raised: boolean) =>
    stampTiled(ctx, SIZE, (c) => {
      const level = raised ? 150 : 106; // gentle ±22 deviation from the 128 flat
      const g = c.createRadialGradient(cx, cy, 0, cx, cy, r);
      g.addColorStop(0, `rgba(${level},${level},${level},0.5)`);
      g.addColorStop(1, `rgba(${level},${level},${level},0)`);
      c.fillStyle = g;
      c.fillRect(cx - r, cy - r, r * 2, r * 2);
    });
  for (let i = 0; i < 16; i++) {
    blob(Math.random() * SIZE, Math.random() * SIZE, 40 + Math.random() * 55, i % 2 === 0);
  }
  const tex = heightToNormalTexture(canvas, 0.6); // low strength: subtle ripple
  tex.repeat.set(3, 3);
  return tex;
}

// Genre -> background color for ceiling-nav category signs (#34): each genre
// reads at a glance instead of every sign being the same theme blue. Keyed on
// the canonical uppercase section labels (CATEGORY_ORDER in store-layout.ts);
// anything else (e.g. an arbitrary Jellyfin library name) falls back to the
// active theme's primary color below.
const GENRE_SIGN_COLORS: Record<string, string> = {
  HORROR: '#4a0404',
  'SCI-FI & FANTASY': '#053d3d',
  FAMILY: '#43146b',
  ACTION: '#a8350f',
  COMEDY: '#a05c00',
  DRAMA: '#5c1a3d',
  SUSPENSE: '#1c1c2e',
  ROMANCE: '#8a2f52',
  MUSIC: '#4a2472',
  TELEVISION: '#20405c',
};

// Shared white-label text pass for the 1024×256 category/collection signs.
function drawSignLabel(ctx: CanvasRenderingContext2D, label: string): void {
  ctx.save();
  // Plain white text for reliable contrast against any sign background.
  ctx.fillStyle = '#ffffff';
  // Brand typography comes from the active LogoSpec, so a brand pack's own
  // face letters these signs too.
  ctx.font = getLogoFontString(getActiveLogoSpec(), 96);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = 'rgba(0, 0, 0, 0.7)';
  ctx.shadowBlur = 12;
  ctx.shadowOffsetX = 4;
  ctx.shadowOffsetY = 6;
  ctx.fillText(label.toUpperCase(), 512, 128 + 8);
  ctx.restore();
}

// ─── THE HALCYON BOARD: the title-sign standard ─────────────────────────────
// One shape language for every title surface in the store — library and genre
// signboards, the NEW RELEASES cards, the ceiling nav blades, the overview
// cursor. A cream card, an emerald field with all four corners closed, a brass
// double rule, cream caps. Deliberately a CLOSED frame: it is the opposite of
// a torn stub, and that is the point — this is Halcyon's own sign, not a
// recreation of anyone else's.
//
// THE SILHOUETTE FOLLOWS THE BRAND. A brand that brings its OWN emblem outline
// (LogoSpec shape 'path' + pathD — what a brand pack supplies) gets its
// signboards die-cut to that outline instead of the house rounded-rect: the
// field IS the mark. Everything else stays the same recipe, re-laid on the new
// shape — card, rules and caps all key off the outline's INK-SAFE BOX
// (logoShapeInnerBox), which is what keeps a wordmark centred on the shape the
// eye reads rather than on a bounding rectangle a notch or a ragged end has
// pulled off-centre. Nothing about ids, sizes or placements changes: this is
// art, and only art.
//
// Proportions are fractions of the card's HEIGHT, including the horizontal
// ones, so a physical sign's border, rule weight and cap height don't grow
// when the sign gets longer (the run-top boards are 14 x 8.5 in; the ceiling
// hangers 4.2 x 1.2 ft — the same art, cut to each face's aspect).
const TICKET_CARD_WHITE = '#f6efdc';   // the card stock the board is printed on
const HB_FIELD_INSET = 0.065;   // field inset from the card edge, all four sides
const HB_FIELD_RADIUS = 0.09;   // field corner radius
const HB_RULE_INSET = 0.04;     // outer brass rule, inset from the field edge
const HB_RULE_W = 0.016;        // outer rule stroke
const HB_RULE_RADIUS = 0.06;
const HB_HAIRLINE_INSET = 0.03; // inner hairline, a further inset from the outer rule
const HB_HAIRLINE_W = 0.008;
const HB_CAP_H = 0.46;          // cap height ceiling, fraction of card height
const HB_TEXT_FIT = 0.78;       // shrink-to-fit target, fraction of usable width

/**
 * Paint the Halcyon board onto a card of any aspect.
 *
 * `field` / `rule` / `ink` are the ACTIVE BRAND's colors (palette.primary,
 * palette.secondary and the emblem's textColor), never literals — which is
 * what makes an installed brand pack reach every one of these signs.
 *
 * `blade` is the ceiling-hung variant: the field runs edge to edge (no card
 * stock around it, since the hanger is die-cut to the art) and carries a
 * single rule instead of the double. It is a HOUSE cut: a board die-cut to a
 * brand's own outline keeps its card on the hanger too, or the corners the
 * outline doesn't reach would be holes in the sign.
 */
function drawTicketSign(
  c: CanvasRenderingContext2D, W: number, H: number, label: string,
  field: string, rule: string, ink: string, blade = false,
): void {
  const spec = getActiveLogoSpec();
  // The brand's own outline, or null for the house rounded-rect board. Shape
  // 'image' qualifies when a simple drop traced the PNG's alpha into pathD:
  // the board is cut to the art's silhouette even though the emblem itself is
  // the raster.
  const outline = (spec.shape === 'path' || spec.shape === 'image') && spec.pathD ? spec : null;
  const asBlade = blade && !outline;

  // 1. The card stock.
  if (!asBlade) {
    c.fillStyle = TICKET_CARD_WHITE;
    c.fillRect(0, 0, W, H);
  }

  // 2. The field — the house rounded-rect, or the brand's outline stretched
  //    onto the same rect (one silhouette source: buildLogoShapePath is what
  //    the emblem and the 3D storefront sign fill too).
  const fi = asBlade ? 0 : HB_FIELD_INSET * H;
  const fx0 = fi, fy0 = fi, fx1 = W - fi, fy1 = H - fi;
  const fw = fx1 - fx0, fh = fy1 - fy0;
  const fr = asBlade ? HB_FIELD_RADIUS * H * 0.45 : HB_FIELD_RADIUS * H;
  const fieldPath = outline ? buildLogoShapePath(outline, fw, fh) : null;
  c.fillStyle = field;
  if (fieldPath) {
    c.save();
    c.translate(fx0, fy0);
    c.fill(fieldPath);
    c.restore();
  } else {
    c.beginPath();
    c.roundRect(fx0, fy0, fw, fh, fr);
    c.fill();
  }

  // The ink-safe box inside the field: the whole field on the house board, the
  // largest rectangle inside the outline on a die-cut one — mapped through the
  // sub-rect the outline actually occupies (a contained mark is letterboxed).
  // Rules and caps both live in it, which is what re-centres the lettering on
  // an irregular shape.
  const ib = outline ? logoShapeInnerBox(outline) : null;
  const fit = outline ? logoShapeFitRect(outline, fw, fh) : null;
  const bx0 = ib && fit ? fx0 + fit.x + ib.x * fit.w : fx0;
  const by0 = ib && fit ? fy0 + fit.y + ib.y * fit.h : fy0;
  const bw = ib && fit ? ib.w * fit.w : fw;
  const bh = ib && fit ? ib.h * fit.h : fh;

  // 3. The rules — a closed frame on all four sides. Clipped to the field, so
  //    on a die-cut board a rule stops at the edge of the shape instead of
  //    running out across the card.
  c.save();
  if (fieldPath) {
    c.translate(fx0, fy0);
    c.clip(fieldPath);
    c.setTransform(1, 0, 0, 1, 0, 0);
  }
  const ri = HB_RULE_INSET * H;
  c.strokeStyle = rule;
  c.lineJoin = 'round';
  c.lineWidth = HB_RULE_W * H;
  c.beginPath();
  c.roundRect(bx0 + ri, by0 + ri, bw - 2 * ri, bh - 2 * ri, HB_RULE_RADIUS * H);
  c.stroke();
  let inner = ri;
  if (!asBlade) {
    inner = ri + HB_HAIRLINE_INSET * H;
    c.lineWidth = HB_HAIRLINE_W * H;
    c.beginPath();
    c.roundRect(bx0 + inner, by0 + inner, bw - 2 * inner, bh - 2 * inner,
      Math.max(1, HB_RULE_RADIUS * H - HB_HAIRLINE_INSET * H));
    c.stroke();
  }

  // 4. The caps, centred in the ink-safe box both ways. Size is dynamic per
  //    label: grow a short one to the cap ceiling, shrink a long one, and
  //    break at the word boundary nearest the middle when one line would fall
  //    too small — the same sign-shop fit the store's other lettering uses
  //    (size the visible CAPS, never the em, and never squash the face).
  const usableW = (bw - 2 * inner) * HB_TEXT_FIT;
  const cx = bx0 + bw / 2;
  const cy = by0 + bh / 2;
  // Archivo Black carries ~0.72 caps-per-em; a brand pack's display face
  // letters these boards in its own family (same cap ratio assumption).
  const family = logoFontFamily(spec);
  const fontFor = (cap: number) => `normal ${cap / 0.72}px ${family}`;
  const widthAt = (text: string, cap: number): number => {
    c.font = fontFor(cap);
    return c.measureText(text).width;
  };
  // A short ink-safe box (a die-cut shape that pinches vertically) lowers the
  // cap ceiling with it, so the type never crowds the rules.
  const capMax = Math.min(HB_CAP_H * H, bh * 0.55);
  const fitCap = (text: string): number =>
    Math.min(capMax, (capMax * usableW) / Math.max(1, widthAt(text, capMax)));
  const caps = label.toUpperCase();
  let lines = [caps];
  let cap = fitCap(caps);
  if (cap < capMax * 0.62 && caps.includes(' ')) {
    const words = caps.split(/\s+/);
    let best = 1, bestDelta = Infinity;
    for (let i = 1; i < words.length; i++) {
      const d = Math.abs(words.slice(0, i).join(' ').length - words.slice(i).join(' ').length);
      if (d < bestDelta) { bestDelta = d; best = i; }
    }
    lines = [words.slice(0, best).join(' '), words.slice(best).join(' ')];
    // Both lines share the tighter fit, and the two-line block keeps air top
    // and bottom inside the rules.
    cap = Math.min(...lines.map(fitCap), (bh - 2 * inner) / 2.9);
  }
  c.save();
  c.textAlign = 'center';
  c.textBaseline = 'alphabetic';
  c.font = fontFor(cap);
  c.fillStyle = ink;
  const gap = cap * 0.3;
  const blockH = lines.length === 1 ? cap : 2 * cap + gap;
  lines.forEach((line, i) => {
    c.fillText(line, cx, cy - blockH / 2 + cap + i * (cap + gap));
  });
  c.restore();
  c.restore(); // the field clip opened before the rules (a no-op on the house board)
}

/**
 * Mom-and-pop hand-lettered section / endcap / wall sign (GH #140).
 *
 * Style 'card': A warm cream Bristol / card-stock placard with bold dark
 * marker lettering and a subtle inked margin rule.
 *
 * Style 'wood': A stained wooden board with painted cream / off-white lettering.
 */
export function createHandLetteredSignTexture(
  text: string,
  subtitle?: string,
  aspect = 2,
  style: 'card' | 'wood' = 'card',
): THREE.Texture {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = Math.max(96, Math.round(1024 / Math.max(0.25, aspect)));
  const ctx = canvas.getContext('2d')!;

  const paint = () => {
    const W = canvas.width, H = canvas.height;
    ctx.clearRect(0, 0, W, H);

    if (style === 'wood') {
      const format = activeStoreFormat();
      ctx.fillStyle = format.shelfEndPanelHex ?? '#4a2c14';
      ctx.fillRect(0, 0, W, H);

      // Subtle painted inner rule
      ctx.strokeStyle = 'rgba(245, 237, 214, 0.45)';
      ctx.lineWidth = Math.max(2, Math.round(H * 0.025));
      const inset = Math.round(H * 0.06);
      ctx.strokeRect(inset, inset, W - 2 * inset, H - 2 * inset);

      ctx.fillStyle = '#f8f2e2'; // Painted cream
      ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
      ctx.shadowBlur = H * 0.03;
      ctx.shadowOffsetX = H * 0.005;
      ctx.shadowOffsetY = H * 0.01;
    } else {
      // Warm manilla / cream card stock with marker ink
      ctx.fillStyle = '#fbf5e6';
      ctx.fillRect(0, 0, W, H);

      // Subtle paper edge / inner marker rule
      ctx.strokeStyle = 'rgba(60, 45, 35, 0.45)';
      ctx.lineWidth = Math.max(2, Math.round(H * 0.02));
      const inset = Math.round(H * 0.05);
      ctx.strokeRect(inset, inset, W - 2 * inset, H - 2 * inset);

      ctx.fillStyle = '#221912'; // Dark charcoal/sepia marker ink
      ctx.shadowColor = 'rgba(40, 30, 20, 0.2)';
      ctx.shadowBlur = H * 0.01;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = H * 0.004;
    }

    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';

    const fontName = `${BB_ARCHIVO_BLACK}, sans-serif`;
    const usable = W * 0.84;
    const fit = (label: string, targetPx: number): number => {
      let size = Math.max(14, Math.round(targetPx));
      ctx.font = `bold ${size}px ${fontName}`;
      while (size > 14 && ctx.measureText(label).width > usable) {
        size -= 2;
        ctx.font = `bold ${size}px ${fontName}`;
      }
      return size;
    };

    const inner = H * 0.82;
    if (subtitle) {
      const TITLE = text.toUpperCase(), SUB = subtitle.toUpperCase();
      const titleSize = fit(TITLE, inner * 0.48);
      ctx.font = `bold ${titleSize}px ${fontName}`;
      const titleAsc = ctx.measureText(TITLE).actualBoundingBoxAscent || titleSize * 0.72;
      const subSize = fit(SUB, inner * 0.28);
      ctx.font = `bold ${subSize}px ${fontName}`;
      const subAsc = ctx.measureText(SUB).actualBoundingBoxAscent || subSize * 0.72;
      const gap = H * 0.10;
      const top = (H - (titleAsc + gap + subAsc)) / 2;

      ctx.font = `bold ${titleSize}px ${fontName}`;
      ctx.fillText(TITLE, W / 2, top + titleAsc);

      ctx.font = `bold ${subSize}px ${fontName}`;
      ctx.fillText(SUB, W / 2, top + titleAsc + gap + subAsc);
    } else {
      const TITLE = text.toUpperCase();
      const size = fit(TITLE, inner * 0.60);
      ctx.font = `bold ${size}px ${fontName}`;
      const asc = ctx.measureText(TITLE).actualBoundingBoxAscent || size * 0.72;
      ctx.fillText(TITLE, W / 2, (H + asc) / 2);
    }
  };
  paint();

  const tex = toSignTexture(canvas);
  registerBrandRepaint(tex, paint);
  return tex;
}

/**
 * A category / library TITLE sign: the 1990 ticket card (see the block above).
 *
 * `faceAspect` is the width:height of the 3D face this texture lands on, so the
 * canvas is cut to match and the art never stretches. Default 4.0 = the legacy
 * 1024x256 sheet. It is ignored by the `ribbon` path, which owns its own canvas.
 */
export function createCategorySignTexture(
  categoryName: string,
  // Optional rather than defaulted, so a caller that does NOT pin a palette
  // gets the LIVE one re-read on every brand refresh. A default parameter is
  // evaluated once at call time, which would freeze these signs on the palette
  // that happened to be active when the store was built.
  palette?: StoreTheme['palette'],
  ribbon = false,
  faceAspect = 4.0,
  blade = false,
): THREE.Texture {
  // 1993 ERA ONLY, and ceiling-nav only (`ribbon` is passed solely by the
  // ceiling-nav catalog entry so endcap placards etc. never restyle):
  // the 1993 ceiling CATEGORY PLATE. The measured reconstruction and its
  // mirrored-layout back twin live in fixtures/category-plate-1993.ts (one
  // source of truth shared with the solid-body fixture builder — frame
  // citations there). Other themes keep the muted rectangles + plain label.
  if (ribbon && dressing93Active()) {
    return createCategoryPlate1993Texture(categoryName, faceAspect);
  }

  // Mom-and-pop format signs in its own hand-lettered card idiom (GH #140).
  if (!palette && isMomAndPop()) {
    return createHandLetteredSignTexture(categoryName, undefined, faceAspect, 'card');
  }

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d')!;

  // The Halcyon board. Every title sign in the store wears the SAME board —
  // colour-coding a title card by genre is the invented bit, not the board
  // (GENRE_SIGN_COLORS lives on for createCollectionSignTexture below).
  //
  // Field, rule and ink all track the BRAND, which is what carries an
  // installed pack onto these signs: field = palette.primary, rule =
  // palette.secondary, letters = the emblem's own textColor.
  const paint = () => {
    const pal = palette ?? getActiveTheme().palette;
    canvas.width = 1024;
    canvas.height = Math.max(2, Math.round(1024 / faceAspect));
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawTicketSign(
      ctx, canvas.width, canvas.height, categoryName,
      pal.primary, pal.secondary, getActiveLogoSpec().textColor, blade,
    );
  };
  paint();

  const tex = toSignTexture(canvas);
  registerBrandRepaint(tex, paint);
  return tex;
}


/**
 * Collection sign for floor displays: the same 1024×256 card as
 * createCategorySignTexture, but built so the backdrop of one of the
 * collection's OWN movies can replace the solid-color background once its
 * image arrives. Paints the solid fallback immediately (backdrops load
 * async); the caller invokes redrawWithArt(art) when the image is ready —
 * it cover-crops the art behind a darkening wash so the white label stays
 * readable, then re-uploads the texture in place.
 */
export function createCollectionSignTexture(
  label: string,
  palette = getActiveTheme().palette,
): { texture: THREE.CanvasTexture; redrawWithArt: (art: ImageBitmap | HTMLImageElement) => void } {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = GENRE_SIGN_COLORS[label.toUpperCase()] ?? palette.primary;
  ctx.fillRect(0, 0, 1024, 256);
  drawSignLabel(ctx, label);

  const texture = toSignTexture(canvas);

  const redrawWithArt = (art: ImageBitmap | HTMLImageElement) => {
    const iw = art.width, ih = art.height;
    if (!iw || !ih) return;
    // Cover-crop the backdrop to the sign's wide 4:1 card. Backdrops are
    // ~16:9, so this keeps a horizontal band from the middle of the frame.
    const cardAspect = 1024 / 256;
    let sw = iw, sh = ih, sx = 0, sy = 0;
    if (iw / ih > cardAspect) {
      sw = ih * cardAspect;
      sx = (iw - sw) / 2;
    } else {
      sh = iw / cardAspect;
      sy = (ih - sh) / 2;
    }
    ctx.drawImage(art, sx, sy, sw, sh, 0, 0, 1024, 256);
    // Darkening wash, heavier at the bottom, so the white label always reads
    // regardless of how bright the still is.
    const wash = ctx.createLinearGradient(0, 0, 0, 256);
    wash.addColorStop(0, 'rgba(0, 0, 0, 0.35)');
    wash.addColorStop(1, 'rgba(0, 0, 0, 0.55)');
    ctx.fillStyle = wash;
    ctx.fillRect(0, 0, 1024, 256);
    drawSignLabel(ctx, label);
    texture.needsUpdate = true;
  };

  return { texture, redrawWithArt };
}

/** Load an arbitrary image URL for signage compositing. Silent on failure —
 *  the caller's card simply keeps whatever it already painted. */
export function loadSignImage(url: string, onLoad: (img: HTMLImageElement) => void): void {
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.onload = () => onLoad(img);
  img.onerror = () => { /* keep the existing card */ };
  img.src = url;
}

// Shelf-end library label: white card + the brand emblem carrying the
// library's name (drawLogo textOverride). The builtin fast paths in
// logo-renderer reproduce the old straightened-ticket / HV-badge label
// compositions exactly; customized specs get the procedural emblem.
export function createLibraryLabelTexture(categoryName: string, theme = getActiveTheme()): THREE.Texture {
  const canvas = document.createElement('canvas');
  canvas.width = 1400;
  canvas.height = 850;
  const ctx = canvas.getContext('2d')!;

  // Plain white background
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, 1400, 850);

  drawLogo(ctx, getActiveLogoSpec(theme), { x: 0, y: 0, w: 1400, h: 850, textOverride: categoryName });

  return toSignTexture(canvas);
}

// #63: label face for the modern flush shelf toppers (bb-2000s / hv-90s):
// elongated banner in the theme's sign color with white display-face
// lettering. The rounded top corners are geometry-level (see the flush-topper
// builder in shelving.ts), so the canvas is a plain filled rect.
export function createFlushTopperLabelTexture(label: string, theme = getActiveTheme()): THREE.Texture {
  const canvas = document.createElement('canvas');
  canvas.width = 512; // matches the half-section plaque's ~2.8:1 face aspect
  canvas.height = 192;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = theme.palette.primary; // theme's existing sign background color
  ctx.fillRect(0, 0, 512, 192);

  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const text = label.toUpperCase().trim();
  // Toppers letter in the active brand's own typography.
  const spec = getActiveLogoSpec(theme);
  const fontFor = (px: number) => getLogoFontString(spec, px);
  let fontSize = 110;
  ctx.font = fontFor(fontSize);
  while (ctx.measureText(text).width > 512 - 50 && fontSize > 34) {
    fontSize -= 6;
    ctx.font = fontFor(fontSize);
  }
  ctx.shadowColor = 'rgba(0,0,0,0.45)';
  ctx.shadowBlur = 6;
  ctx.shadowOffsetY = 3;
  ctx.fillText(text, 256, 96 + 8); // slight down-shift optically centers the display face

  return toSignTexture(canvas);
}

// ── 2000-era "ACTION"-style arched genre plaque (bb-2000 theme) ─────────────
// The Hamlet (2000) store caps every shelf run with a brick-red rounded-top
// plaque carrying the genre in cream caps over a faint tone-on-tone star. The
// plaque SHAPE is geometry (the arched-plaque path in shelving.ts /
// game-section.ts); this paints the brick field + star + centered label on its
// front face. Colors sampled from the footage (brightened out of the film's
// cold grade). The letterform is Agency Gothic condensed (per the user); Agency
// FB is proprietary, so the bundled face is Saira SemiCondensed Medium (OFL) —
// the closest condensed geometric-sans match (Aldrich too square/wide, Saira
// Condensed too narrow). The word is set in LARGE-INITIAL SMALL CAPS — the
// signature look of the real genre plaques (big "A", smaller "CTION").
export const BB2000_PLAQUE_RED = '#8a3b34';    // brick/maroon plaque body
export const BB2000_PLAQUE_CREAM = '#e9e0cc';  // warm off-white lettering
const BB2000_PLAQUE_STAR = '#9a4f49';          // faint lighter/mauve star behind the text (tone-on-tone ghost)
const BB2000_SMALLCAP_RATIO = 0.78;            // "CTION" height ÷ "A" height

const BB2000_SLAB_FONT = 'BB2000Agency';
let bb2000FontReady = false;
let bb2000FontRequested = false;
// One CanvasTexture per label, kept across scene rebuilds (teardown disposes
// materials, not their maps) so the font-load repaint below can find them.
const bb2000TopperCache = new Map<string, THREE.CanvasTexture>();

// A filled 5-point star (one point up) centered at (cx,cy), outer radius rOut.
function fillStar(ctx: CanvasRenderingContext2D, cx: number, cy: number, rOut: number, rIn: number): void {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? rOut : rIn;
    const a = -Math.PI / 2 + (i * Math.PI) / 5; // start at the top point
    const px = cx + r * Math.cos(a);
    const py = cy + r * Math.sin(a);
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fill();
}

function paintArchedTopper(canvas: HTMLCanvasElement, label: string): void {
  const ctx = canvas.getContext('2d')!;
  const W = canvas.width, H = canvas.height;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = BB2000_PLAQUE_RED;
  ctx.fillRect(0, 0, W, H);

  // Faint tone-on-tone star behind the text: top point up near the plaque top,
  // lower points spread toward the bottom corners (footage). Low contrast — a
  // hair lighter/mauve than the field, so it reads as a ghost, not a graphic.
  ctx.fillStyle = BB2000_PLAQUE_STAR;
  fillStar(ctx, W / 2, H * 0.5, H * 0.52, H * 0.52 * 0.42);

  const text = label.toUpperCase().trim();
  const family = bb2000FontReady ? `'${BB2000_SLAB_FONT}', Georgia, serif` : `Georgia, serif`;
  const first = text.slice(0, 1);
  const rest = text.slice(1);
  ctx.textBaseline = 'alphabetic';

  // Total advance of the small-caps word at a given initial-cap size `cap`.
  const wordWidth = (cap: number): number => {
    ctx.font = `${cap}px ${family}`;
    const wf = ctx.measureText(first).width;
    ctx.font = `${Math.round(cap * BB2000_SMALLCAP_RATIO)}px ${family}`;
    return wf + (rest ? ctx.measureText(rest).width : 0);
  };

  // Size the initial cap by MEASURED metrics: fit the word to ~80% of the
  // plaque width, but never let the big cap tower past the arched top.
  let cap = Math.floor(H * 0.6);
  const maxW = W * 0.8;
  const w0 = wordWidth(cap);
  if (w0 > maxW) cap = Math.floor(cap * maxW / w0);

  // Vertically center the initial cap's measured box in the plaque, nudged up
  // 3% (the plaque arches above the text, so optical center sits a hair high).
  ctx.font = `${cap}px ${family}`;
  const capAsc = ctx.measureText(first).actualBoundingBoxAscent;
  const baseline = (H + capAsc) / 2 - H * 0.03;

  ctx.fillStyle = BB2000_PLAQUE_CREAM;
  ctx.textAlign = 'left';
  let x = (W - wordWidth(cap)) / 2; // left edge of the centered word
  ctx.font = `${cap}px ${family}`;
  ctx.fillText(first, x, baseline);
  x += ctx.measureText(first).width;
  if (rest) {
    ctx.font = `${Math.round(cap * BB2000_SMALLCAP_RATIO)}px ${family}`;
    ctx.fillText(rest, x, baseline); // shared baseline → small caps sit level
  }
}

// Register `onReady` to run once the Agency-substitute face has loaded (or now,
// if it already has) and kick off the one-time load. Every BB2000 painter that
// sets type registers a repaint here so the fallback serif is replaced in place
// when the real font arrives (pattern mirrors ensureVarsityFont).
const bb2000FontCbs: (() => void)[] = [];
function ensureBB2000Font(onReady?: () => void): void {
  if (onReady) {
    if (bb2000FontReady) onReady();
    else bb2000FontCbs.push(onReady);
  }
  if (bb2000FontRequested || typeof document === 'undefined' || !document.fonts) return;
  bb2000FontRequested = true;
  const face = new FontFace(BB2000_SLAB_FONT, `url(${agencyFontUrl})`);
  face.load().then((f) => {
    document.fonts.add(f);
    bb2000FontReady = true;
    bb2000FontCbs.splice(0).forEach((cb) => cb());
  }, () => { /* fallback serif already painted */ });
}

export function createArchedTopperLabelTexture(label: string): THREE.Texture {
  const key = label.toUpperCase().trim();
  const cached = bb2000TopperCache.get(key);
  if (cached) return cached;
  const canvas = document.createElement('canvas');
  canvas.width = 512; // 2:1 — matches the arched plaque face (2.2 box-w × 0.6 box-h ≈ 2.0:1)
  canvas.height = 256;
  paintArchedTopper(canvas, key);
  const tex = toSignTexture(canvas);
  bb2000TopperCache.set(key, tex);
  ensureBB2000Font(() => { paintArchedTopper(canvas, key); tex.needsUpdate = true; });
  return tex;
}

// ── 2000-era NEW RELEASES gold-star badge (bb-2000 theme) ───────────────────
// From the Hamlet (2000) New Releases wall: a big gold disc, a cream 5-point
// star over it, a gold center roundel, and "New Releases" in purple small caps
// across the middle. Painted on a transparent canvas so it reads as a mounted
// emblem on the wall (see the wall-newrelease path in fixtures/signage.ts).
const BB2000_BADGE_GOLD = '#d4be6f';   // muted antique gold disc/roundel (desaturated — less neon)
const BB2000_BADGE_CREAM = '#efe8d6';  // cream star (a touch softer)
const BB2000_BADGE_PURPLE = '#413869';  // purple-navy lettering (slightly muted)
// Periwinkle backing disc = the 2000 wall color, so the badge reads as a gold
// disc directly on the periwinkle wall (footage) and covers the amber valance
// strip it mounts over. Keep in step with the bb-2000 theme palette.wall.
const BB2000_BADGE_BG = '#8b87bd';

// Advance width of a small-caps word (large initial + `ratio`-scaled rest).
function smallCapsWidth(ctx: CanvasRenderingContext2D, word: string, cap: number, ratio: number, family: string): number {
  ctx.font = `${cap}px ${family}`;
  let w = ctx.measureText(word[0]).width;
  if (word.length > 1) {
    ctx.font = `${Math.round(cap * ratio)}px ${family}`;
    w += ctx.measureText(word.slice(1)).width;
  }
  return w;
}
// Draw a small-caps word left-anchored at (x, baseline); returns its advance.
function drawSmallCapsWord(ctx: CanvasRenderingContext2D, word: string, x: number, baseline: number, cap: number, ratio: number, family: string): number {
  ctx.textAlign = 'left';
  ctx.font = `${cap}px ${family}`;
  ctx.fillText(word[0], x, baseline);
  let adv = ctx.measureText(word[0]).width;
  if (word.length > 1) {
    ctx.font = `${Math.round(cap * ratio)}px ${family}`;
    ctx.fillText(word.slice(1), x + adv, baseline);
    adv += ctx.measureText(word.slice(1)).width;
  }
  return adv;
}

function paintStarBadge(canvas: HTMLCanvasElement): void {
  const ctx = canvas.getContext('2d')!;
  const S = canvas.width;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, S, S);
  const cx = S / 2, cy = S / 2;
  // periwinkle backing (blends into the 2000 wall) → gold disc → cream star →
  // gold center roundel
  ctx.fillStyle = BB2000_BADGE_BG;
  ctx.beginPath(); ctx.arc(cx, cy, S * 0.5, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = BB2000_BADGE_GOLD;
  ctx.beginPath(); ctx.arc(cx, cy, S * 0.43, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = BB2000_BADGE_CREAM;
  fillStar(ctx, cx, cy, S * 0.42, S * 0.42 * 0.42); // points reach near the disc edge
  ctx.fillStyle = BB2000_BADGE_GOLD;
  ctx.beginPath(); ctx.arc(cx, cy, S * 0.19, 0, Math.PI * 2); ctx.fill();

  // "New Releases" — purple title-case small caps, one BIG line across the
  // middle (footage: the lettering spans nearly the whole badge, out onto the
  // star arms). A cream halo behind the purple keeps it legible over the gold.
  const family = bb2000FontReady ? `'${BB2000_SLAB_FONT}', Georgia, serif` : `Georgia, serif`;
  const ratio = BB2000_SMALLCAP_RATIO;
  const gap = (cap: number) => cap * 0.24; // inter-word space
  const total = (cap: number) =>
    smallCapsWidth(ctx, 'New', cap, ratio, family) + gap(cap) + smallCapsWidth(ctx, 'Releases', cap, ratio, family);
  let cap = Math.floor(S * 0.24);
  if (total(cap) > S * 0.9) cap = Math.floor(cap * (S * 0.9) / total(cap));
  ctx.font = `${cap}px ${family}`;
  const baseline = cy + ctx.measureText('N').actualBoundingBoxAscent / 2;
  const drawWord = (word: string, x: number): number => {
    // cream halo first, then the purple fill, at the same metrics
    ctx.fillStyle = BB2000_BADGE_CREAM;
    ctx.save();
    (ctx as CanvasRenderingContext2D & { filter: string }).filter = 'none';
    ctx.shadowColor = BB2000_BADGE_CREAM;
    ctx.shadowBlur = Math.max(3, cap * 0.14);
    drawSmallCapsWord(ctx, word, x, baseline, cap, ratio, family);
    drawSmallCapsWord(ctx, word, x, baseline, cap, ratio, family);
    ctx.restore();
    ctx.fillStyle = BB2000_BADGE_PURPLE;
    return drawSmallCapsWord(ctx, word, x, baseline, cap, ratio, family);
  };
  let x = (S - total(cap)) / 2;
  x += drawWord('New', x);
  x += gap(cap);
  drawWord('Releases', x);
}

let bb2000BadgeTex: THREE.CanvasTexture | null = null;
export function createNewReleasesStarBadgeTexture(): THREE.Texture {
  if (bb2000BadgeTex) return bb2000BadgeTex;
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  paintStarBadge(canvas);
  const tex = toSignTexture(canvas);
  bb2000BadgeTex = tex;
  ensureBB2000Font(() => { paintStarBadge(canvas); tex.needsUpdate = true; });
  return tex;
}

// The emblem's BODY board (ticket / badge, no wordmark) for the
// double-layered 3D signs — the wordmark board comes from
// createBrandLogoTextTexture and floats in front of this one.
export function createBrandLogoBodyTexture(theme = getActiveTheme()): THREE.Texture {
  const canvas = document.createElement('canvas');
  canvas.width = 1000;
  canvas.height = 600;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, 1000, 600);

  drawLogo(ctx, getActiveLogoSpec(theme), { x: 0, y: 0, w: 1000, h: 600, layer: 'body' });

  return toSignTexture(canvas);
}

// The emblem's WORDMARK board (lettering + pinstripe, transparent elsewhere)
// for the interior double-layered signs (New Releases wall).
export function createBrandLogoTextTexture(theme = getActiveTheme()): THREE.Texture {
  const canvas = document.createElement('canvas');
  canvas.width = 1000;
  canvas.height = 600;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, 1000, 600);

  drawLogo(ctx, getActiveLogoSpec(theme), {
    x: 0, y: 0, w: 1000, h: 600, layer: 'text',
    pinstripeWidth: 5, // the interior boards' thin border stroke
    shadow: { color: 'rgba(0,0,0,0.6)', blur: 6, ox: 2, oy: 3 },
  });

  return toSignTexture(canvas);
}
// The entrance tower's wordmark board: same as the interior lettering board
// but with slightly larger/deeper-shadowed lettering (and a near-interior-
// weight pinstripe — thin like the emblem's own inner rule). A storefront
// print can run a brighter ink than the interior boards do; storefrontBrandGold
// (logo-spec.ts) is that hook.
export function createStorefrontLogoYellowTexture(theme = getActiveTheme()): THREE.Texture {
  const canvas = document.createElement('canvas');
  canvas.width = 1000;
  canvas.height = 600;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, 1000, 600);

  const active = getActiveLogoSpec(theme);
  const spec = {
    ...active,
    textColor: storefrontBrandGold(active.textColor),
    borderColor: storefrontBrandGold(active.borderColor),
  };
  drawLogo(ctx, spec, {
    x: 0, y: 0, w: 1000, h: 600, layer: 'text',
    // Thin, crisp inner border (~1% of the emblem's width). A fat one reads as
    // a heavy box from the parking lot — see user feedback on the storefront.
    pinstripeWidth: 7,
    fontScale: 100 / 90, // storefront lettering runs ~11% over the interior boards
    shadow: { color: 'rgba(0,0,0,0.7)', blur: 8, ox: 3, oy: 4 },
  });

  return toSignTexture(canvas);
}

const NR_SIGN_TEXT = 'NEW RELEASES';

function paintNewReleasesSign(canvas: HTMLCanvasElement, theme: StoreTheme): void {
  const W = canvas.width, H = canvas.height;
  const ctx = canvas.getContext('2d')!;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, W, H);

  // Lettering color/typography follow the active LogoSpec. bodyColor, not
  // textColor: these letters mount on the wall itself, so they read as the
  // brand's emblem color — its own lettering ink would vanish into the band.
  const spec = getActiveLogoSpec(theme);
  ctx.textAlign = 'center';
  ctx.fillStyle = spec.bodyColor;
  // Fit from MEASURED metrics rather than a hardcoded size: display faces vary
  // wildly in condensation, so one fixed px can't suit both. Cap height drives
  // the fit (the band is a wide, shallow ribbon); width is only a clamp.
  const PROBE = 100;
  ctx.font = getLogoFontString(spec, PROBE);
  const probe = ctx.measureText(NR_SIGN_TEXT);
  const capPer = Math.max(1, probe.actualBoundingBoxAscent);
  const widthPer = Math.max(1, probe.width);
  const px = Math.max(40, Math.floor(PROBE * Math.min(H * 0.56 / capPer, W * 0.62 / widthPer)));
  ctx.font = getLogoFontString(spec, px);
  // Center the MEASURED glyph box: a display face's em box is not symmetric,
  // so textBaseline 'middle' floats the caps high.
  const m = ctx.measureText(NR_SIGN_TEXT);
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(NR_SIGN_TEXT, W / 2, (H + m.actualBoundingBoxAscent - m.actualBoundingBoxDescent) / 2);
}

export function createNewReleasesSignTexture(theme = getActiveTheme()): THREE.Texture {
  const canvas = document.createElement('canvas');
  canvas.width = 1706;
  canvas.height = 256;
  paintNewReleasesSign(canvas, theme);
  const tex = toSignTexture(canvas);
  // The wordmark face is a webfont: if it hasn't resolved yet this first pass
  // baked fallback glyphs, so repaint the band in place when it lands.
  if (!brandFontReady) {
    ensureBrandFont(() => {
      paintNewReleasesSign(canvas, theme);
      tex.needsUpdate = true;
      pokeRender();
    });
  }
  return tex;
}

export function createPromoSignTexture(): THREE.Texture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, 512, 128);

  // F8-006: muted retail-sticker albedo, not a glowing decal. The old
  // #cc0000 field + #ecac10 gold read as a bright saturated cling that
  // floated free of the store's dim lighting; toned the red field down to a
  // deeper, less-saturated stock red and the gold to a softer amber so the
  // material's shading (roughness/no metalness) sits it into the shelf. Kept
  // enough gold-on-red contrast that "3 for $12" stays legible.
  ctx.fillStyle = '#8f1e1e';
  ctx.fillRect(0, 0, 512, 128);

  ctx.fillStyle = '#d6a12e';
  ctx.font = `normal 64px ${BB_ARCHIVO_BLACK}, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText("3 for $12", 256, 64);

  return toSignTexture(canvas);
}

// ─── Store-shell surfaces (used by buildStore) ──────────────────────────────
// Each returns wrapping textures with repeat UNSET; the caller sets repeat from
// the actual room dimensions.

// Acoustic tile texture: one ceiling-module tile per repeat, off-white with a
// metal T-bar border. Canvas is wide-short (long axis on X, the canvas
// width) to match the store's ceiling module orientation — long side across
// the store, short side into it — set in three-scene.ts's TILE_X/TILE_Z
// (issue #129: a tile whose long side pointed down the main sightline
// foreshortened into a near-square).
export function createCeilingTileTexture(): THREE.CanvasTexture {
  const CW = 512, CH = 256;
  const ceilCanvas = document.createElement('canvas');
  ceilCanvas.width = CW;
  ceilCanvas.height = CH;
  const cCtx = ceilCanvas.getContext('2d')!;
  cCtx.fillStyle = '#e9e9e4';
  cCtx.fillRect(0, 0, CW, CH);
  // Acoustic fleck speckle
  for (let i = 0; i < 2000; i++) {
    cCtx.fillStyle = Math.random() > 0.5 ? '#dededa' : '#f2f2ee';
    cCtx.fillRect(Math.random() * CW, Math.random() * CH, 1.5, 1.5);
  }
  // Worm fissures, same mineral-fibre pocking as the instanced panels
  // (createAcousticPanelTexture) so the plane and the modules read as one grid.
  for (let i = 0; i < 260; i++) {
    const x = Math.random() * CW, y = Math.random() * CH;
    cCtx.strokeStyle = `rgba(104,100,92,${0.12 + Math.random() * 0.16})`;
    cCtx.lineWidth = 0.9;
    cCtx.beginPath();
    cCtx.moveTo(x, y);
    cCtx.lineTo(x + (Math.random() - 0.5) * 8, y + (Math.random() - 0.5) * 8);
    cCtx.stroke();
  }
  // T-bar grid border (the suspended-grid rails)
  cCtx.strokeStyle = '#c4c8cc';
  cCtx.lineWidth = 10;
  cCtx.strokeRect(0, 0, CW, CH);
  const ceilTex = new THREE.CanvasTexture(ceilCanvas);
  ceilTex.colorSpace = THREE.SRGBColorSpace;
  ceilTex.wrapS = THREE.RepeatWrapping;
  ceilTex.wrapT = THREE.RepeatWrapping;
  // 16, not 8: the whole ceiling plane is seen at a grazing angle from
  // everywhere on the floor, and the printed T-bar rails shimmer at 8 on the
  // far modules ("horrible aliasing on the ceiling tiles").
  ceilTex.anisotropy = aniso(16);
  return ceilTex;
}

// Fissured acoustic ceiling panel (the plain, unlit modules in the T-bar
// grid). Real mineral-fibre tile is pocked with worm-like fissures and pin
// holes — a flat color there was one of the "CG ceiling" tells. Borderless:
// the T-bar frames are separate meshes.
export function createAcousticPanelTexture(): THREE.CanvasTexture {
  const S = 256;
  const canvas = document.createElement('canvas');
  canvas.width = S; canvas.height = S;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#eceae4';
  ctx.fillRect(0, 0, S, S);
  // Soft tonal blotch so no two areas read identical.
  for (let i = 0; i < 14; i++) {
    const x = Math.random() * S, y = Math.random() * S, r = 30 + Math.random() * 90;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, Math.random() > 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(120,116,104,0.05)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    stampTiled(ctx, S, (c) => { c.fillStyle = g; c.fillRect(x - r, y - r, r * 2, r * 2); });
  }
  // Worm fissures: short dark meandering strokes.
  for (let i = 0; i < 380; i++) {
    const x = Math.random() * S, y = Math.random() * S;
    const segs = 2 + Math.floor(Math.random() * 3);
    stampTiled(ctx, S, (c) => {
      c.strokeStyle = `rgba(96,92,84,${0.18 + Math.random() * 0.2})`;
      c.lineWidth = 0.9 + Math.random() * 0.9;
      c.beginPath();
      let px = x, py = y;
      c.moveTo(px, py);
      for (let s2 = 0; s2 < segs; s2++) {
        px += (Math.random() - 0.5) * 7;
        py += (Math.random() - 0.5) * 7;
        c.lineTo(px, py);
      }
      c.stroke();
    });
  }
  // Pin holes.
  for (let i = 0; i < 900; i++) {
    const x = Math.random() * S, y = Math.random() * S;
    stampTiled(ctx, S, (c) => {
      c.fillStyle = `rgba(104,100,92,${0.15 + Math.random() * 0.2})`;
      c.fillRect(x, y, 1.2, 1.2);
    });
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  // Grazing-angle ceiling surface, same reasoning as the tile texture above.
  tex.anisotropy = aniso(16);
  return tex;
}

// Prismatic troffer lens: the acrylic diffuser sheet over a fluorescent
// fixture. A uniform emissive rectangle reads as "glowing quad"; the real
// thing has a fine refraction-dot lattice, brighter hot bands over the two
// tubes, and slightly dimmed corners. Used as BOTH map and emissiveMap so the
// pattern survives at any exposure.
export function createTrofferLensTexture(): THREE.CanvasTexture {
  const W = 256, H = 128;
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#f2f4f6';
  ctx.fillRect(0, 0, W, H);
  // Two soft hot bands where the tubes sit behind the lens (long axis = X).
  for (const fy of [0.32, 0.68]) {
    const g = ctx.createLinearGradient(0, H * (fy - 0.16), 0, H * (fy + 0.16));
    g.addColorStop(0, 'rgba(255,255,255,0)');
    g.addColorStop(0.5, 'rgba(255,255,255,0.55)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, H * (fy - 0.16), W, H * 0.32);
  }
  // Corner/edge falloff — lenses sit in a recess and darken at the rim. This
  // has to be DEEP: the panel's emissive sits well above 1.0 and AgX rolls
  // everything bright to white, so a subtle tint here vanishes — only a strong
  // multiplier survives tone mapping as visible structure.
  const edge = ctx.createLinearGradient(0, 0, 0, H);
  edge.addColorStop(0, 'rgba(88,96,110,0.62)');
  edge.addColorStop(0.14, 'rgba(88,96,110,0)');
  edge.addColorStop(0.86, 'rgba(88,96,110,0)');
  edge.addColorStop(1, 'rgba(88,96,110,0.62)');
  ctx.fillStyle = edge;
  ctx.fillRect(0, 0, W, H);
  const edgeX = ctx.createLinearGradient(0, 0, W, 0);
  edgeX.addColorStop(0, 'rgba(88,96,110,0.65)');
  edgeX.addColorStop(0.07, 'rgba(88,96,110,0)');
  edgeX.addColorStop(0.93, 'rgba(88,96,110,0)');
  edgeX.addColorStop(1, 'rgba(88,96,110,0.65)');
  ctx.fillStyle = edgeX;
  ctx.fillRect(0, 0, W, H);
  // Prismatic dot lattice: alternating light/dark micro-cells (deep enough to
  // survive the tone-map roll-off as a faint sparkle, not disappear).
  for (let y = 0; y < H; y += 4) {
    for (let x = 0; x < W; x += 4) {
      const on = ((x + y) / 4) % 2 === 0;
      ctx.fillStyle = on ? 'rgba(255,255,255,0.12)' : 'rgba(128,138,155,0.22)';
      ctx.fillRect(x, y, 2.2, 2.2);
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  // This one previously set NO anisotropy (default 1): the emissive dot
  // lattice sits above 1.0 pre-tonemap, so plain trilinear at a grazing
  // angle turned every distant troffer into crawling sparkle. Mips exist
  // (CanvasTexture default); aniso keeps them usable edge-on.
  tex.anisotropy = aniso(16);
  return tex;
}

// Photoreal navy loop-pile carpet. Albedo carries dye mottle + fibre fleck
// (so big areas vary in tone instead of reading as one flat colour); a
// Sobel-derived normal from a fibre height field gives real directional pile;
// a roughness map adds burnished traffic-wear variation.
/**
 * Re-tintable copy of a photo-scanned COLOR map: the scan's own hue is dropped
 * to luminance and normalized so its mean reads mid-gray, which lets a
 * material's `color` act as the paint over it. Without this a scan of, say,
 * navy carpet stays navy in every theme and the palette silently stops
 * mattering — the exact failure the wall avoids by shipping a NEUTRAL plaster
 * scan and multiplying the theme's wall color over it.
 *
 * Returns null if the image can't be read (a cross-origin texture, no DOM):
 * callers keep the scan as-is rather than losing the detail.
 */
export function neutralizeScanTexture(tex: THREE.Texture): THREE.CanvasTexture | null {
  const src = tex.image as CanvasImageSource & { width?: number; height?: number };
  const w = Math.round(Number(src?.width) || 0);
  const h = Math.round(Number(src?.height) || 0);
  if (!w || !h || typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(src, 0, 0, w, h);
  let data: ImageData;
  try {
    data = ctx.getImageData(0, 0, w, h);
  } catch {
    return null; // tainted canvas
  }
  const px = data.data;
  let sum = 0;
  for (let i = 0; i < px.length; i += 4) {
    const y = 0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2];
    px[i] = px[i + 1] = px[i + 2] = y;
    sum += y;
  }
  // Normalize the mean to mid-gray so `color` lands on its own value rather
  // than being darkened by however bright the scan happened to be.
  const mean = sum / (px.length / 4) || 1;
  const gain = 186 / mean;
  for (let i = 0; i < px.length; i += 4) {
    px[i] = px[i + 1] = px[i + 2] = Math.min(255, px[i] * gain);
  }
  ctx.putImageData(data, 0, 0);
  const out = new THREE.CanvasTexture(canvas);
  out.colorSpace = THREE.SRGBColorSpace;
  out.wrapS = tex.wrapS; out.wrapT = tex.wrapT;
  out.repeat.copy(tex.repeat);
  out.anisotropy = tex.anisotropy;
  return out;
}

export function createCarpetTextures(palette = getActiveTheme().palette): {
  map: THREE.CanvasTexture;
  normalMap: THREE.CanvasTexture;
  roughnessMap: THREE.CanvasTexture;
} {
  const CARPET = 512;
  const carpetCanvas = document.createElement('canvas');
  carpetCanvas.width = CARPET; carpetCanvas.height = CARPET;
  const carpCtx = carpetCanvas.getContext('2d')!;
  carpCtx.fillStyle = palette.carpet; // Theme carpet
  carpCtx.fillRect(0, 0, CARPET, CARPET);
  // Big low-frequency dye/grime layer FIRST: a few very large soft blobs so the
  // floor reads as a large dyed span with broad lighter/darker regions and
  // ground-in traffic grime, not one flat colour tiling. This is the single
  // strongest "real carpet" cue — real retail carpet is never uniform across a
  // room. Kept subtle (≤14%) so it never looks blotchy up close.
  for (let i = 0; i < 9; i++) {
    const x = Math.random() * CARPET, y = Math.random() * CARPET, r = 150 + Math.random() * 170;
    const g = carpCtx.createRadialGradient(x, y, 0, x, y, r);
    // Bias toward darkening (grime accumulates faster than it bleaches).
    const roll = Math.random();
    g.addColorStop(0, roll > 0.62 ? 'rgba(255,255,255,0.05)' : `rgba(0,0,0,${0.08 + roll * 0.06})`);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    stampTiled(carpCtx, CARPET, (c) => { c.fillStyle = g; c.fillRect(x - r, y - r, r * 2, r * 2); });
  }
  // Mid-frequency dye mottle so large areas vary in tone.
  for (let i = 0; i < 40; i++) {
    const x = Math.random() * CARPET, y = Math.random() * CARPET, r = 40 + Math.random() * 120;
    const g = carpCtx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, Math.random() > 0.5 ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.12)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    stampTiled(carpCtx, CARPET, (c) => { c.fillStyle = g; c.fillRect(x - r, y - r, r * 2, r * 2); });
  }
  // Fine fibre fleck.
  for (let i = 0; i < 6000; i++) {
    const v = Math.random();
    const col = v > 0.5 ? 'rgba(0,0,0,0.2)' : (v > 0.2 ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.04)');
    const x = Math.random() * CARPET, y = Math.random() * CARPET, fh = Math.random() * 3 + 1;
    stampTiled(carpCtx, CARPET, (c) => { c.fillStyle = col; c.fillRect(x, y, 1, fh); });
  }
  const carpetTex = new THREE.CanvasTexture(carpetCanvas);
  carpetTex.colorSpace = THREE.SRGBColorSpace;
  carpetTex.wrapS = carpetTex.wrapT = THREE.RepeatWrapping;
  carpetTex.anisotropy = aniso(16);

  // Fibre height field -> normal map (directional pile).
  const carpetHeight = document.createElement('canvas');
  carpetHeight.width = CARPET; carpetHeight.height = CARPET;
  const chCtx = carpetHeight.getContext('2d')!;
  chCtx.fillStyle = '#808080'; chCtx.fillRect(0, 0, CARPET, CARPET);
  chCtx.lineWidth = 1;
  for (let i = 0; i < 9000; i++) {
    const g = 80 + Math.floor(Math.random() * 140);
    const col = `rgb(${g},${g},${g})`;
    const x = Math.random() * CARPET, y = Math.random() * CARPET;
    const dx = Math.random() * 2 - 1, dy = Math.random() * 4 + 1;
    stampTiled(chCtx, CARPET, (c) => {
      c.strokeStyle = col;
      c.beginPath(); c.moveTo(x, y); c.lineTo(x + dx, y + dy); c.stroke();
    });
  }
  const carpetNormTex = heightToNormalTexture(carpetHeight, 1.4);
  carpetNormTex.anisotropy = aniso(16);

  // Roughness variation: matte pile, with burnished traffic patches. The
  // contrast is deliberately wider than the albedo mottle — flattened, walked-on
  // pile is measurably glossier than fresh pile, so troffer reflections shimmer
  // and travel as the camera moves through worn lanes (the eye reads that
  // moving specular as "a real floor" far more than any albedo detail can).
  const carpetRough = document.createElement('canvas');
  carpetRough.width = CARPET; carpetRough.height = CARPET;
  const crCtx = carpetRough.getContext('2d')!;
  crCtx.fillStyle = '#ececec'; crCtx.fillRect(0, 0, CARPET, CARPET); // ~0.925 base (fresh matte pile)
  // A few large, strongly-burnished traffic lanes (down to ~0.44 roughness).
  for (let i = 0; i < 10; i++) {
    const x = Math.random() * CARPET, y = Math.random() * CARPET, r = 90 + Math.random() * 150;
    const g = crCtx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, 'rgba(112,112,112,0.55)'); g.addColorStop(1, 'rgba(236,236,236,0)');
    stampTiled(crCtx, CARPET, (c) => { c.fillStyle = g; c.fillRect(x - r, y - r, r * 2, r * 2); });
  }
  // Finer scattered burnish so the shimmer has grain, not just broad pools.
  for (let i = 0; i < 30; i++) {
    const x = Math.random() * CARPET, y = Math.random() * CARPET, r = 30 + Math.random() * 90;
    const g = crCtx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, 'rgba(150,150,150,0.5)'); g.addColorStop(1, 'rgba(236,236,236,0)');
    stampTiled(crCtx, CARPET, (c) => { c.fillStyle = g; c.fillRect(x - r, y - r, r * 2, r * 2); });
  }
  const carpetRoughTex = new THREE.CanvasTexture(carpetRough);
  carpetRoughTex.wrapS = carpetRoughTex.wrapT = THREE.RepeatWrapping;

  return { map: carpetTex, normalMap: carpetNormTex, roughnessMap: carpetRoughTex };
}

// Store walls: deep amber-gold drywall with painted orange-peel relief.
// Large-scale tonal mottle breaks up the flat colour over big spans; a fine
// Sobel normal gives the stippled paint micro-relief that catches grazing light.
export function createWallTextures(palette = getActiveTheme().palette): {
  map: THREE.CanvasTexture;
  normalMap: THREE.CanvasTexture;
  roughnessMap: THREE.CanvasTexture;
} {
  const WALLT = 512;
  const wallCanvas = document.createElement('canvas');
  wallCanvas.width = WALLT; wallCanvas.height = WALLT;
  const wallCtx = wallCanvas.getContext('2d')!;
  wallCtx.fillStyle = palette.wall; // Theme wall
  wallCtx.fillRect(0, 0, WALLT, WALLT);
  // Large-scale tonal variation (paint unevenness, soft lighting gradients).
  for (let i = 0; i < 30; i++) {
    const x = Math.random() * WALLT, y = Math.random() * WALLT, r = 80 + Math.random() * 180;
    const g = wallCtx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, Math.random() > 0.5 ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.12)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    stampTiled(wallCtx, WALLT, (c) => { c.fillStyle = g; c.fillRect(x - r, y - r, r * 2, r * 2); });
  }
  // Fine stipple grain.
  for (let i = 0; i < 4000; i++) {
    const col = Math.random() > 0.5 ? 'rgba(0,0,0,0.15)' : 'rgba(255,255,255,0.15)';
    const x = Math.random() * WALLT, y = Math.random() * WALLT;
    stampTiled(wallCtx, WALLT, (c) => { c.fillStyle = col; c.fillRect(x, y, 1.5, 1.5); });
  }
  const wallTex = new THREE.CanvasTexture(wallCanvas);
  wallTex.colorSpace = THREE.SRGBColorSpace;
  wallTex.wrapS = wallTex.wrapT = THREE.RepeatWrapping;
  // 16, matching carpet/ceiling/asphalt in this module: the walls are the
  // longest sightline in the store, so they are the surface that most wants it.
  wallTex.anisotropy = aniso(16);

  // Orange-peel height -> normal map.
  const wallHeight = document.createElement('canvas');
  wallHeight.width = WALLT; wallHeight.height = WALLT;
  const whCtx = wallHeight.getContext('2d')!;
  whCtx.fillStyle = '#808080'; whCtx.fillRect(0, 0, WALLT, WALLT);
  for (let i = 0; i < 2500; i++) {
    const x = Math.random() * WALLT, y = Math.random() * WALLT, r = 2 + Math.random() * 5;
    const v = 110 + Math.floor(Math.random() * 70);
    const g = whCtx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(${v},${v},${v},0.6)`); g.addColorStop(1, 'rgba(128,128,128,0)');
    stampTiled(whCtx, WALLT, (c) => { c.fillStyle = g; c.fillRect(x - r, y - r, r * 2, r * 2); });
  }
  const wallNormTex = heightToNormalTexture(wallHeight, 1.0);

  // Sheen variation: painted drywall is satin, but touched-up patches, roller
  // overlaps and hand-rub burnish shift the gloss locally. When a light rakes
  // the wall, that drifting specular is a strong "real paint" cue a constant
  // roughness can't give.
  const wallRough = document.createElement('canvas');
  wallRough.width = WALLT; wallRough.height = WALLT;
  const wrCtx = wallRough.getContext('2d')!;
  wrCtx.fillStyle = '#b8b8b8'; // ~0.72 base, matching the old material constant
  wrCtx.fillRect(0, 0, WALLT, WALLT);
  for (let i = 0; i < 22; i++) {
    const x = Math.random() * WALLT, y = Math.random() * WALLT, r = 50 + Math.random() * 140;
    const g = wrCtx.createRadialGradient(x, y, 0, x, y, r);
    const glossier = Math.random() > 0.45;
    g.addColorStop(0, glossier ? 'rgba(140,140,140,0.4)' : 'rgba(210,210,210,0.35)');
    g.addColorStop(1, 'rgba(184,184,184,0)');
    stampTiled(wrCtx, WALLT, (c) => { c.fillStyle = g; c.fillRect(x - r, y - r, r * 2, r * 2); });
  }
  const wallRoughTex = new THREE.CanvasTexture(wallRough);
  wallRoughTex.wrapS = wallRoughTex.wrapT = THREE.RepeatWrapping;

  return { map: wallTex, normalMap: wallNormTex, roughnessMap: wallRoughTex };
}

export function createStuccoTexture(): {
  map: THREE.CanvasTexture;
  normalMap: THREE.CanvasTexture;
  roughnessMap: THREE.CanvasTexture;
} {
  const SIZE = 256;
  const canvas = document.createElement('canvas');
  canvas.width = SIZE; canvas.height = SIZE;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#f0ebe4'; // off-white stucco
  ctx.fillRect(0, 0, SIZE, SIZE);

  // Soft bumps / plaster mottle
  for (let i = 0; i < 40; i++) {
    const x = Math.random() * SIZE, y = Math.random() * SIZE, r = 10 + Math.random() * 30;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, Math.random() > 0.5 ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.06)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    stampTiled(ctx, SIZE, (c) => { c.fillStyle = g; c.fillRect(x - r, y - r, r * 2, r * 2); });
  }

  const map = new THREE.CanvasTexture(canvas);
  map.wrapS = map.wrapT = THREE.RepeatWrapping;

  // Stucco height -> normal map (for rough plaster stipple relief)
  const heightCanvas = document.createElement('canvas');
  heightCanvas.width = SIZE; heightCanvas.height = SIZE;
  const hCtx = heightCanvas.getContext('2d')!;
  hCtx.fillStyle = '#808080';
  hCtx.fillRect(0, 0, SIZE, SIZE);
  for (let i = 0; i < 6000; i++) {
    const x = Math.random() * SIZE, y = Math.random() * SIZE, r = 1 + Math.random() * 2;
    const v = Math.random() > 0.5 ? 140 : 110;
    const g = hCtx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(${v},${v},${v},0.4)`);
    g.addColorStop(1, 'rgba(128,128,128,0)');
    hCtx.fillStyle = g;
    stampTiled(hCtx, SIZE, (c) => { c.fillRect(x - r, y - r, r * 2, r * 2); });
  }
  const normalMap = heightToNormalTexture(heightCanvas, 0.8);

  const roughCanvas = document.createElement('canvas');
  roughCanvas.width = SIZE; roughCanvas.height = SIZE;
  const rCtx = roughCanvas.getContext('2d')!;
  rCtx.fillStyle = '#ededed'; // highly rough
  const roughnessMap = new THREE.CanvasTexture(roughCanvas);
  roughnessMap.wrapS = roughnessMap.wrapT = THREE.RepeatWrapping;

  return { map, normalMap, roughnessMap };
}

// ─── Exterior storefront dressing ───────────────────────────────────────────

// Reddish-brick running-bond veneer for the exterior facade (knee-wall veneer
// + corner piers). One tile = BRICK_FEET (see three-scene.ts) square of real
// wall. Running bond: alternate rows offset by half a brick. Mortar shows
// through as the base fill colour; each brick gets its own rust/red hue and
// lightness so big spans don't read as one flat swatch.
export function createBrickTexture(): {
  map: THREE.CanvasTexture;
  normalMap: THREE.CanvasTexture;
  roughnessMap: THREE.CanvasTexture;
} {
  const SIZE = 512;
  // Real modular brick coursing is ~8in long x ~2.67in tall (nominal, incl.
  // mortar joint) — a ~3:1 width:height ratio. rows=24 (was 16) gets us there:
  // width stays 4ft-tile/8cols=6in, height becomes 4ft-tile/24rows=2in, ~3:1.
  // (T15: previously rows=16 gave a stubby ~2:1 brick that read too tall.)
  const brickW = 64, mortar = 6;
  const cols = SIZE / brickW;   // 8
  const rows = 24;
  const brickH = SIZE / rows;   // ~21.3

  const paintBricks = (
    ctx: CanvasRenderingContext2D,
    brickFill: (r: number, c: number) => string,
  ) => {
    for (let r = -1; r <= rows; r++) {
      const y = r * brickH;
      const offset = (((r % 2) + 2) % 2 === 0) ? 0 : brickW / 2;
      for (let c = -1; c <= cols + 1; c++) {
        const x = c * brickW + offset;
        ctx.fillStyle = brickFill(r, c);
        ctx.fillRect(x + mortar / 2, y + mortar / 2, brickW - mortar, brickH - mortar);
      }
    }
  };

  // Albedo: mortar-grey base, reddish/rust bricks with per-brick variation.
  const canvas = document.createElement('canvas');
  canvas.width = SIZE; canvas.height = SIZE;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#8f867a'; // mortar
  ctx.fillRect(0, 0, SIZE, SIZE);
  paintBricks(ctx, () => {
    const hue = 6 + Math.random() * 12;       // reds through rust
    const sat = 42 + Math.random() * 22;
    const light = 30 + Math.random() * 16;
    return `hsl(${hue}, ${sat}%, ${light}%)`;
  });
  // Fine speckle grain on top so bricks aren't perfectly flat swatches.
  for (let i = 0; i < 3000; i++) {
    const v = Math.random();
    ctx.fillStyle = v > 0.5 ? 'rgba(40,15,10,0.12)' : 'rgba(200,150,120,0.10)';
    const x = Math.random() * SIZE, y = Math.random() * SIZE;
    stampTiled(ctx, SIZE, (c) => c.fillRect(x, y, 1.5, 1.5));
  }
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.anisotropy = aniso(8);

  // Roughness: bricks matte (~0.88), mortar a touch rougher/lighter (~0.95).
  const roughCanvas = document.createElement('canvas');
  roughCanvas.width = SIZE; roughCanvas.height = SIZE;
  const rCtx = roughCanvas.getContext('2d')!;
  rCtx.fillStyle = '#f2f2f2'; // mortar rough ~0.95
  rCtx.fillRect(0, 0, SIZE, SIZE);
  paintBricks(rCtx, () => {
    const g = 210 + Math.floor(Math.random() * 25); // ~0.82-0.90
    return `rgb(${g},${g},${g})`;
  });
  const roughnessMap = new THREE.CanvasTexture(roughCanvas);
  roughnessMap.wrapS = roughnessMap.wrapT = THREE.RepeatWrapping;

  // Height field (mortar recessed, bricks flat) -> normal map for the groove
  // relief that catches grazing light.
  const heightCanvas = document.createElement('canvas');
  heightCanvas.width = SIZE; heightCanvas.height = SIZE;
  const hCtx = heightCanvas.getContext('2d')!;
  hCtx.fillStyle = '#606060'; // recessed mortar
  hCtx.fillRect(0, 0, SIZE, SIZE);
  paintBricks(hCtx, () => {
    const g = 150 + Math.floor(Math.random() * 20);
    return `rgb(${g},${g},${g})`;
  });
  const normalMap = heightToNormalTexture(heightCanvas, 1.2);

  return { map, normalMap, roughnessMap };
}

// Full one-texture emblem (body + wordmark on a transparent background) for
// the protruding entrance sign panel — drawLogo's 'all' layer, same legacy
// compositions as the split body/yellow boards.
export function createEntranceTicketLogoTexture(theme = getActiveTheme()): THREE.Texture {
  const canvas = document.createElement('canvas');
  canvas.width = 1000;
  canvas.height = 600;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, 1000, 600);

  drawLogo(ctx, getActiveLogoSpec(theme), {
    x: 0, y: 0, w: 1000, h: 600, layer: 'all',
    pinstripeWidth: 5, // this panel always wore the thin interior-style stroke
  });

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = true;
  return tex;
}

// Dark asphalt with a repeating row of white parking-stall side-lines. One
// tile = one stall width across (U); the caller lays the tile out with a
// plane rotated flat so U follows the storefront's width (stalls side by
// side) and V follows depth. stallTopFrac/stallBottomFrac give the canvas-Y
// band the stall lines occupy (canvas top = near the store, canvas bottom =
// far edge of the lot), so a single V-repeat can hold a clean drive lane
// near the store and one stall row at the far side.
export function createAsphaltTexture(stallTopFrac = 0.12, stallBottomFrac = 0.92): THREE.CanvasTexture {
  const W = 256, H = 1024;
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d')!;

  // Base asphalt: dark neutral grey with a little tonal mottle.
  ctx.fillStyle = '#242424';
  ctx.fillRect(0, 0, W, H);
  for (let i = 0; i < 40; i++) {
    const x = Math.random() * W, y = Math.random() * H, r = 30 + Math.random() * 90;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, Math.random() > 0.5 ? 'rgba(60,60,60,0.25)' : 'rgba(10,10,10,0.3)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    stampTiled(ctx, W, (c) => { c.fillStyle = g; c.fillRect(x - r, y - r, r * 2, r * 2); }, H);
  }
  // Fine aggregate speckle.
  for (let i = 0; i < 5000; i++) {
    const g = 20 + Math.floor(Math.random() * 45);
    ctx.fillStyle = `rgb(${g},${g},${g})`;
    const x = Math.random() * W, y = Math.random() * H;
    stampTiled(ctx, W, (c) => c.fillRect(x, y, 1.5, 1.5), H);
  }
  // Hairline crack for grit (a few faint dark squiggles).
  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  ctx.lineWidth = 1;
  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    let x = Math.random() * W, y = Math.random() * H;
    ctx.moveTo(x, y);
    for (let s = 0; s < 5; s++) {
      x += (Math.random() - 0.5) * 60;
      y += (Math.random() - 0.5) * 60;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  // White stall side-line at the tile's left edge, running the depth of the
  // stall (leaves a gap at the far end for the drive aisle) — repeats every
  // tile into a continuous row of parking-stall boundaries.
  const lineW = 7;
  const stallTop = H * stallTopFrac;
  const stallBottom = H * stallBottomFrac;
  ctx.fillStyle = 'rgba(235,235,225,0.92)';
  ctx.fillRect(-lineW / 2, stallTop, lineW, stallBottom - stallTop);
  ctx.fillRect(W - lineW / 2, stallTop, lineW, stallBottom - stallTop);
  // Faint paint weathering on the lines.
  ctx.fillStyle = 'rgba(30,30,25,0.15)';
  for (let i = 0; i < 30; i++) {
    const y = stallTop + Math.random() * (stallBottom - stallTop);
    ctx.fillRect(-lineW / 2, y, lineW, 3 + Math.random() * 6);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = aniso(16);
  return tex;
}

// A handful of faded oil-stain blotches, painted once (not tiled) over a
// modest patch of lot near the storefront — the caller lays this as a second,
// larger-repeat plane just above the base asphalt.
export function createParkingStainsTexture(): THREE.CanvasTexture {
  const S = 1024;
  const canvas = document.createElement('canvas');
  canvas.width = S; canvas.height = S;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, S, S);

  const stains = 3 + Math.floor(Math.random() * 4); // 3-6 blotches
  for (let i = 0; i < stains; i++) {
    const x = 80 + Math.random() * (S - 160);
    const y = 80 + Math.random() * (S - 160);
    const r = 26 + Math.random() * 46;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, 'rgba(8,8,8,0.42)');
    g.addColorStop(0.55, 'rgba(8,8,8,0.22)');
    g.addColorStop(1, 'rgba(8,8,8,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(x, y, r, r * (0.6 + Math.random() * 0.3), Math.random() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  return tex;
}

// Frosted gloss shelf textures. Generates a roughness map (base ~0.65 with soft smudges
// and noise) and a micro-stipple normal map (fine height-field noise converted to normal map).
export function createShelfTextures(): {
  map: THREE.CanvasTexture;
  roughnessMap: THREE.CanvasTexture;
  normalMap: THREE.CanvasTexture;
} {
  const S = 512;

  // 0. Laminate albedo. The boards were previously a bare material color — a
  // perfectly uniform tone over every big flat face is the single loudest
  // "untextured CG" tell in the store. White melamine in a real shop is never
  // one value: it has faint warm/cool blotch from aging, wipe-down streaks,
  // and sparse handling scuffs. All kept a few percent deep so it reads as
  // "surface", not "dirty".
  const albCanvas = document.createElement('canvas');
  albCanvas.width = S;
  albCanvas.height = S;
  const aCtx = albCanvas.getContext('2d')!;
  aCtx.fillStyle = '#ffffff';
  aCtx.fillRect(0, 0, S, S);
  // Broad warm/cool aging blotches.
  for (let i = 0; i < 26; i++) {
    const x = Math.random() * S, y = Math.random() * S, r = 60 + Math.random() * 160;
    const g = aCtx.createRadialGradient(x, y, 0, x, y, r);
    const warm = Math.random() > 0.45;
    g.addColorStop(0, warm ? 'rgba(232,222,205,0.05)' : 'rgba(206,212,222,0.04)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    stampTiled(aCtx, S, (c) => { c.fillStyle = g; c.fillRect(x - r, y - r, r * 2, r * 2); });
  }
  // Horizontal wipe-down streaks (stockers dust shelves along their length).
  for (let i = 0; i < 26; i++) {
    const y = Math.random() * S, h = 2 + Math.random() * 8, x = Math.random() * S, w = 90 + Math.random() * 240;
    const dark = Math.random() > 0.5;
    stampTiled(aCtx, S, (c) => {
      const lg = c.createLinearGradient(x, 0, x + w, 0);
      lg.addColorStop(0, 'rgba(0,0,0,0)');
      lg.addColorStop(0.5, dark ? 'rgba(120,116,108,0.045)' : 'rgba(255,255,255,0.05)');
      lg.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = lg;
      c.fillRect(x, y, w, h);
    });
  }
  // Sparse fine scuffs/nicks.
  for (let i = 0; i < 220; i++) {
    const x = Math.random() * S, y = Math.random() * S;
    const len = 2 + Math.random() * 9, ang = Math.random() * Math.PI;
    const v = Math.random() > 0.6 ? 'rgba(105,100,94,0.10)' : 'rgba(255,255,255,0.12)';
    stampTiled(aCtx, S, (c) => {
      c.strokeStyle = v;
      c.lineWidth = 0.8;
      c.beginPath();
      c.moveTo(x, y);
      c.lineTo(x + Math.cos(ang) * len, y + Math.sin(ang) * len);
      c.stroke();
    });
  }
  const map = new THREE.CanvasTexture(albCanvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.anisotropy = aniso(8);

  // 1. Generate roughness map
  const roughCanvas = document.createElement('canvas');
  roughCanvas.width = S;
  roughCanvas.height = S;
  const rCtx = roughCanvas.getContext('2d')!;

  // Base roughness: ~0.65 (so it is diffused/matte but has clearcoat on top)
  rCtx.fillStyle = '#a6a6a6';
  rCtx.fillRect(0, 0, S, S);

  // Soft smudges / handling marks
  for (let i = 0; i < 20; i++) {
    const x = Math.random() * S;
    const y = Math.random() * S;
    const r = 40 + Math.random() * 80;
    const g = rCtx.createRadialGradient(x, y, 0, x, y, r);
    // vary the roughness around base
    const roughnessChange = Math.random() > 0.5 ? 40 : -40;
    const v = 166 + roughnessChange;
    g.addColorStop(0, `rgba(${v},${v},${v},0.35)`);
    g.addColorStop(1, 'rgba(166,166,166,0)');
    rCtx.fillStyle = g;
    stampTiled(rCtx, S, (c) => { c.fillRect(x - r, y - r, r * 2, r * 2); });
  }

  // Fine noise / grain in roughness
  for (let i = 0; i < 1500; i++) {
    const v = Math.random() > 0.5 ? 200 : 120;
    rCtx.fillStyle = `rgba(${v},${v},${v},0.15)`;
    const x = Math.random() * S;
    const y = Math.random() * S;
    stampTiled(rCtx, S, (c) => { c.fillRect(x, y, 1.5, 1.5); });
  }

  const roughnessMap = new THREE.CanvasTexture(roughCanvas);
  roughnessMap.wrapS = roughnessMap.wrapT = THREE.RepeatWrapping;
  roughnessMap.anisotropy = aniso(8);

  // 2. Generate height map -> normal map for micro-stipple (frosted finish)
  const heightCanvas = document.createElement('canvas');
  heightCanvas.width = S;
  heightCanvas.height = S;
  const hCtx = heightCanvas.getContext('2d')!;
  hCtx.fillStyle = '#808080';
  hCtx.fillRect(0, 0, S, S);

  // Create a high-frequency micro-pebble heightfield
  for (let i = 0; i < 8000; i++) {
    const x = Math.random() * S;
    const y = Math.random() * S;
    const r = 1 + Math.random() * 2;
    const v = Math.random() > 0.5 ? 150 : 100;
    const g = hCtx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(${v},${v},${v},0.4)`);
    g.addColorStop(1, 'rgba(128,128,128,0)');
    hCtx.fillStyle = g;
    stampTiled(hCtx, S, (c) => { c.fillRect(x - r, y - r, r * 2, r * 2); });
  }

  // Convert height map to normal map
  const normalMap = heightToNormalTexture(heightCanvas, 0.45); // subtle strength
  normalMap.wrapS = normalMap.wrapT = THREE.RepeatWrapping;
  normalMap.anisotropy = aniso(8);

  return { map, roughnessMap, normalMap };
}

// Vertical bounce-occlusion gradient for the wall-shelf backing panels: a soft
// dark band hugging the underside of every shelf board plus a gentle darkening
// toward the panel floor. This is the light a real bay loses to its own shelves
// (each board shadows the strip of backing directly beneath it) — GTAO's small
// contact radius can't reach it and the sun mostly can't see in there, so the
// backing used to render as one flat sheet. Baked once into an albedo-space
// multiplier (white = untouched), 1px wide since the shading only varies in Y.
export function createShelfBayShadeTexture(shelfHeights: number[], panelBottomY: number, panelTopY: number): THREE.CanvasTexture {
  const H = 512;
  const canvas = document.createElement('canvas');
  canvas.width = 4;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, 4, H);
  const span = panelTopY - panelBottomY;
  // Canvas row 0 = top of texture = v1 = TOP of the box face.
  const rowFor = (worldY: number) => Math.round((1 - (worldY - panelBottomY) / span) * (H - 1));
  for (const shelfY of shelfHeights) {
    const row = rowFor(shelfY);
    // Occlusion pocket under the board: strongest right at the board, fading
    // out over ~0.9 ft below it; a much shorter soft lip above (cases resting
    // on the board block a sliver of light there too).
    const below = Math.round((0.9 / span) * H);
    const above = Math.round((0.18 / span) * H);
    const g = ctx.createLinearGradient(0, row - above, 0, row + below);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(above / (above + below), 'rgba(24,20,16,0.32)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, row - above, 4, above + below);
  }
  // Floor-side falloff: the bottom of the panel sits in the room's darkest pocket.
  const floorG = ctx.createLinearGradient(0, H * 0.9, 0, H);
  floorG.addColorStop(0, 'rgba(0,0,0,0)');
  floorG.addColorStop(1, 'rgba(18,15,12,0.28)');
  ctx.fillStyle = floorG;
  ctx.fillRect(0, H * 0.9, 4, H * 0.1);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  return tex;
}

export function createWireMeshTexture(): THREE.Texture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;

  // Clear to full transparency
  ctx.clearRect(0, 0, 128, 128);

  // Draw black wire grid lines
  ctx.strokeStyle = '#121212';
  ctx.lineWidth = 10; // Wire thickness

  // Draw outer borders
  ctx.strokeRect(0, 0, 128, 128);

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  // The 2000s wire shelving is seen edge-on down the length of every aisle —
  // the grazing-angle case the rest of this module sets anisotropy for. Without
  // it the grid collapses into mip mush exactly where the run is longest.
  tex.anisotropy = aniso(16);

  return tex;
}

export function createSignTextTexture(
  text: string,
  subtitle?: string,
  style: 'standard' | 'promo' | 'yellow' | 'yellow-navy' | 'white' = 'standard',
  // Card aspect (w:h in FEET, from the catalog's SignDef.size). The canvas is
  // stretched onto the card, so a canvas cut to a different aspect than the
  // card it prints on distorts the letterforms — the legacy fixed 1024x512
  // put a 2:1 canvas on a 0.9 x 0.7 (1.29:1) tent and squeezed every glyph
  // 1.55x taller than it is wide. Callers pass size.w / size.h.
  aspect = 2,
): THREE.Texture {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = Math.max(96, Math.round(1024 / Math.max(0.25, aspect)));
  const ctx = canvas.getContext('2d')!;
  // Whole body is a closure so a brand edit can re-run it against the same
  // canvas (see brand-live.ts). Theme and palette are read INSIDE, never
  // captured, or a refresh would repaint with the colours it was built on.
  const paint = () => {
    const W = canvas.width, H = canvas.height;
    const theme = getActiveTheme();
    const palette = theme.palette;
    // Determine colors based on style.
    //
    // House ink comes from the EMBLEM's knockout, not palette.accent. Those had
    // drifted into two competing sources of "the house letter colour": the board
    // painters (drawTicketSign, paintTicketLabel, genre-fascia, promo-topper)
    // all ink from LogoSpec.textColor, while this — the general store-sign
    // painter, and so the overhead category blades and most generic signs — inked
    // from palette.accent. A brand change moved one and not the other, which is
    // exactly the failure signage rule 2 exists to prevent. accent stays what it
    // says on the tin: a safety/highlight accent, not lettering.
    let bg = palette.primary;
    let textCol = getActiveLogoSpec().textColor;
    let borderCol = palette.accent;
    // #34: 'standard' used the same theme-accent gold trim as the old ceiling
    // signs — dropped here too (grep for other signage accent strokes on any
    // future style; promo/yellow/white already use their own explicit colors,
    // not the theme accent, so they're left alone). yellow-navy is borderless:
    // the real tents are a plain yellow card.
    const hasBorder = style !== 'standard' && style !== 'yellow-navy';

    if (style === 'promo') {
      bg = '#cc0000'; // Retro red
      textCol = '#ffffff'; // White text
      borderCol = palette.accent; // house accent, was a hardcoded #ecac10 gold
    } else if (style === 'yellow') {
      bg = '#ffcc00'; // Retro yellow
      textCol = '#000000'; // Black text
      borderCol = '#000000';
    } else if (style === 'yellow-navy') {
      // The 1993 counter tents: bold-italic house ink on a plain card, no border
      // box. Measured off the footage's "NEXT REGISTER PLEASE" close-up — but
      // only the LAYOUT is the reference's to give. Its colours (yellow #ffd400,
      // navy #1a2a6b) were a real chain's exact livery, hardcoded onto a shipped
      // fixture, which both froze the tent against any brand change (signage
      // rule 2) and made it the most brand-specific surface in the store. Card
      // and ink now come from the house.
      bg = palette.secondary;
      textCol = palette.primary;
      borderCol = palette.primary;
    } else if (style === 'white') {
      bg = '#ffffff';
      textCol = '#111111';
      borderCol = '#333333';
    }

    // Draw background
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    // Draw border
    const borderW = Math.round(H * 0.047);
    if (hasBorder) {
      ctx.strokeStyle = borderCol;
      ctx.lineWidth = borderW;
      ctx.strokeRect(borderW / 2, borderW / 2, W - borderW, H - borderW);
    }

    // Draw text
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.shadowColor = 'rgba(0, 0, 0, 0.6)';
    ctx.shadowBlur = H * 0.02;
    ctx.shadowOffsetX = H * 0.006;
    ctx.shadowOffsetY = H * 0.008;

    ctx.fillStyle = textCol;

    const fontName = `${BB_ARCHIVO_BLACK}, sans-serif`;
    // yellow-navy tents print in heavy oblique, per the footage.
    const fontPrefix = style === 'yellow-navy' ? 'italic ' : 'normal ';

    // These cards are read across a counter, so the copy fills the plate the way
    // a real printed insert does. The legacy layout hard-coded 76px/48px into a
    // 512-tall canvas — ~15% of the card height, i.e. a postage stamp floating in
    // a field of blue (user report: "the text is way too small"). Sizes are now
    // fractions of the card, shrunk only as far as the measured run needs to fit
    // the usable width (never trust a point size against a substituted face).
    const usable = W - 2 * (hasBorder ? borderW * 2 : W * 0.06);
    const fit = (label: string, targetPx: number): number => {
      let size = Math.max(14, Math.round(targetPx));
      ctx.font = `${fontPrefix}${size}px ${fontName}`;
      while (size > 14 && ctx.measureText(label).width > usable) {
        size -= 2;
        ctx.font = `${fontPrefix}${size}px ${fontName}`;
      }
      return size;
    };
    const inner = H - (hasBorder ? borderW * 3 : H * 0.12);

    if (subtitle) {
      const TITLE = text.toUpperCase(), SUB = subtitle.toUpperCase();
      const titleSize = fit(TITLE, inner * 0.46);
      ctx.font = `${fontPrefix}${titleSize}px ${fontName}`;
      const titleAsc = ctx.measureText(TITLE).actualBoundingBoxAscent || titleSize * 0.72;
      const subSize = fit(SUB, inner * 0.30);
      ctx.font = `${fontPrefix}${subSize}px ${fontName}`;
      const subAsc = ctx.measureText(SUB).actualBoundingBoxAscent || subSize * 0.72;
      // Centre the two cap bands (all-caps copy: ascent IS the visible height)
      // as one block, with a leading gap proportional to the card.
      const gap = H * 0.10;
      const top = (H - (titleAsc + gap + subAsc)) / 2;

      ctx.font = `${fontPrefix}${titleSize}px ${fontName}`;
      ctx.fillText(TITLE, W / 2, top + titleAsc);

      ctx.font = `${fontPrefix}${subSize}px ${fontName}`;
      ctx.fillStyle = style === 'promo' ? '#ffcc00' : textCol; // Yellow subtitle for promo
      ctx.fillText(SUB, W / 2, top + titleAsc + gap + subAsc);
    } else {
      const TITLE = text.toUpperCase();
      const size = fit(TITLE, inner * 0.62);
      ctx.font = `${fontPrefix}${size}px ${fontName}`;
      const asc = ctx.measureText(TITLE).actualBoundingBoxAscent || size * 0.72;
      ctx.fillText(TITLE, W / 2, (H + asc) / 2);
    }
  };
  paint();

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = aniso(16);
  registerBrandRepaint(tex, paint);
  return tex;
}

// ─── T15 exterior/environment pass ─────────────────────────────────────────

// A radial "light pool" decal for asphalt under a street lamp, or the warm
// glow spilling from a lit storefront window onto the sidewalk at night.
// Painted once and reused for both (the caller tints/positions/scales the
// mesh); a soft warm core fading to fully transparent at the rim so it drops
// cleanly onto the ground texture beneath it with no hard edge.
// Broom-finished concrete sidewalk: one texture tile = one slab, so the
// expansion joint at the tile edge repeats into the real 4-5 ft joint rhythm.
// The sidewalk was a flat single-color box — dead center of the entrance view
// once the glass stopped veiling it.
export function createConcreteSidewalkTexture(): THREE.CanvasTexture {
  const S = 256;
  const canvas = document.createElement('canvas');
  canvas.width = S; canvas.height = S;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#9a968c';
  ctx.fillRect(0, 0, S, S);
  // Tonal blotch (cure marks, damp history).
  for (let i = 0; i < 16; i++) {
    const x = Math.random() * S, y = Math.random() * S, r = 40 + Math.random() * 90;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, Math.random() > 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(40,38,34,0.08)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    stampTiled(ctx, S, (c) => { c.fillStyle = g; c.fillRect(x - r, y - r, r * 2, r * 2); });
  }
  // Fine aggregate speckle.
  for (let i = 0; i < 2600; i++) {
    const v = 120 + Math.floor(Math.random() * 70);
    const a = 0.08 + Math.random() * 0.12;
    const x = Math.random() * S, y = Math.random() * S;
    stampTiled(ctx, S, (c) => { c.fillStyle = `rgba(${v},${v},${v - 6},${a})`; c.fillRect(x, y, 1.3, 1.3); });
  }
  // Faint broom-finish striations across the slab (perpendicular to the curb).
  for (let y = 0; y < S; y += 2) {
    ctx.fillStyle = `rgba(${Math.random() > 0.5 ? 255 : 60},${Math.random() > 0.5 ? 255 : 60},60,0.018)`;
    ctx.fillRect(0, y, S, 1);
  }
  // Expansion joint at the left tile edge (repeats every slab): dark groove
  // with a lighter worn shoulder.
  ctx.fillStyle = 'rgba(255,255,255,0.10)';
  ctx.fillRect(0, 0, 7, S);
  ctx.fillStyle = 'rgba(30,28,25,0.55)';
  ctx.fillRect(0, 0, 3, S);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = aniso(8);
  return tex;
}

// Slotted HVAC supply-diffuser face for a drop-ceiling module: painted metal
// with rows of dark louver slots. Swapped in for a sparse handful of plain
// panels — a real drop ceiling is never 100% tile.
export function createHvacVentTexture(): THREE.CanvasTexture {
  const W = 256, H = 128;
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#dfe1e3';
  ctx.fillRect(0, 0, W, H);
  // Slight brushed shading.
  for (let i = 0; i < 500; i++) {
    const y = Math.random() * H;
    ctx.fillStyle = Math.random() > 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(90,94,100,0.05)';
    ctx.fillRect(Math.random() * W, y, 10 + Math.random() * 30, 1);
  }
  // Louver slot rows in a recessed center field.
  const inset = 18;
  ctx.fillStyle = '#c6c9cd';
  ctx.fillRect(inset, inset, W - inset * 2, H - inset * 2);
  const rows = 4;
  const fieldH = H - inset * 2;
  for (let r = 0; r < rows; r++) {
    const y = inset + fieldH * ((r + 0.5) / rows) - 4;
    // Slot: dark opening with a bright lip below (light catches the vane).
    ctx.fillStyle = '#3c4046';
    ctx.fillRect(inset + 6, y, W - inset * 2 - 12, 8);
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.fillRect(inset + 6, y + 8, W - inset * 2 - 12, 2);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  return tex;
}

// Ribbed rubber-backed walk-off mat (the charcoal entrance mat every retail
// vestibule has). Ribs run along U; scuff/grime mottle keeps it from reading
// as extruded plastic.
export function createWalkOffMatTexture(): { map: THREE.CanvasTexture; normalMap: THREE.CanvasTexture } {
  const S = 256;
  const canvas = document.createElement('canvas');
  canvas.width = S; canvas.height = S;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#26282a';
  ctx.fillRect(0, 0, S, S);
  // Rib stripes.
  for (let y = 0; y < S; y += 8) {
    ctx.fillStyle = 'rgba(255,255,255,0.05)';
    ctx.fillRect(0, y, S, 3);
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(0, y + 5, S, 2);
  }
  // Traffic grime toward the middle.
  for (let i = 0; i < 12; i++) {
    const x = Math.random() * S, y = Math.random() * S, r = 30 + Math.random() * 70;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, Math.random() > 0.4 ? 'rgba(70,66,58,0.12)' : 'rgba(255,255,255,0.03)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    stampTiled(ctx, S, (c) => { c.fillStyle = g; c.fillRect(x - r, y - r, r * 2, r * 2); });
  }
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.anisotropy = aniso(8);

  // Rib height field -> normal map.
  const h = document.createElement('canvas');
  h.width = S; h.height = S;
  const hCtx = h.getContext('2d')!;
  hCtx.fillStyle = '#808080';
  hCtx.fillRect(0, 0, S, S);
  for (let y = 0; y < S; y += 8) {
    hCtx.fillStyle = '#a8a8a8';
    hCtx.fillRect(0, y, S, 4);
    hCtx.fillStyle = '#585858';
    hCtx.fillRect(0, y + 5, S, 2);
  }
  const normalMap = heightToNormalTexture(h, 1.2);
  normalMap.wrapS = normalMap.wrapT = THREE.RepeatWrapping;
  return { map, normalMap };
}

// Soft elliptical contact-shadow blob (white-alpha radial falloff, tinted at
// use-site via material color/opacity). Draped under exterior props (cars)
// that can't rely on the sun shadow alone — at night the sun is off entirely
// and everything outside floated on the asphalt.
export function createSoftShadowTexture(): THREE.CanvasTexture {
  const SIZE = 128;
  const canvas = document.createElement('canvas');
  canvas.width = SIZE; canvas.height = SIZE;
  const ctx = canvas.getContext('2d')!;
  const g = ctx.createRadialGradient(SIZE / 2, SIZE / 2, 0, SIZE / 2, SIZE / 2, SIZE / 2);
  g.addColorStop(0, 'rgba(0,0,0,0.85)');
  g.addColorStop(0.55, 'rgba(0,0,0,0.55)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, SIZE, SIZE);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  return tex;
}

export function createLightPoolTexture(color = '#ffdca0'): THREE.CanvasTexture {
  const SIZE = 256;
  const canvas = document.createElement('canvas');
  canvas.width = SIZE; canvas.height = SIZE;
  const ctx = canvas.getContext('2d')!;
  const cx = SIZE / 2, cy = SIZE / 2;
  const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, SIZE / 2);
  grad.addColorStop(0, color);
  grad.addColorStop(0.35, color);
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, SIZE, SIZE);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
