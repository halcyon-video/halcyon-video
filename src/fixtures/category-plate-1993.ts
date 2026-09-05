import * as THREE from 'three';
import { BB_ARCHIVO_BLACK } from '../bundled-fonts';
import { getBackTexture, registerBackTexture } from './sign-fixtures';

/**
 * The 1993 ceiling category WEDGE — genre wayfinding hung over aisle mouths
 * and the counter.
 *
 * FINAL FORM (owner spec, 2026-08-09, third pass — supersedes both die-cut
 * builds): a SIMPLE SOLID WEDGE. End-on the profile is an EQUILATERAL
 * triangle pointing down (all three sides equal: flat top of depth
 * s = 2h/√3, two sloped faces of the same length meeting in a sharp bottom
 * edge). One body, no extra pieces: no slash bar, no arrow, no cream strip,
 * no dark rim. The family-color field covers everything — both sloped
 * faces AND the triangular end caps ("the end should have that same orange
 * coloring, it shouldn't be solid black"). Each sloped face carries the
 * NAVY NAMEPLATE exactly as measured from rUhRHo44CIA f0013: rounded rect,
 * white inset keyline, genre in white bold-italic caps, counter-tilted
 * ~-2.4°; the back face repeats it so the genre reads from both sides.
 *
 * Mount stays per feedback/049: attached at the ceiling on a short
 * bar-and-two-drops — no long wires.
 *
 * History: the plates measured off the footage are flat layered die-cuts
 * (backer + slash + curved thick arrow — measurements and gates preserved
 * in user-assets/fixtures/ceiling-category-plates-1993/); the owner chose
 * the plain wedge as the app's form and kept only the nameplate from that
 * spec.
 */

const SPEC = {
  navy: '#1a2a6e',
  trimColor: '#15171f',    // near-black edge trim on EVERY corner edge,
                           // including the top (owner, 2026-08-09)
  trimT: 0.055,            // ft — "thicker" border, ~0.66 in square section
  vignette: 0.30,          // edge darkening painted into the lit face
  plateHFrac: 0.72,       // nameplate height / sign height h
  plateAspect: 2.23,      // nameplate w:h (f0013)
  plateTiltDeg: -2.4,     // counter-tilt, right end high (f0013)
  plateDXFrac: 0.044,     // nameplate center offset right, / h
  plateCornerR: 0.15,     // of plate height
  keyInset: 0.075,        // white keyline inset, of plate height
  keyStroke: 0.065,
  capHeightFrac: 0.51,    // letter cap height, of plate height
  textWidthFrac: 0.87,    // letters fill this much of the plate width
};

const rad = (d: number) => (d * Math.PI) / 180;
const SQRT3 = Math.sqrt(3);

// ── Per-genre body color ───────────────────────────────────────────────────
// Owner 2026-08-09: every DIFFERENT genre/library above gets a DIFFERENT
// body color (the shared bb93 family grouping is too coarse for the wedges).
// Attested anchors first; everything else draws a stable distinct pick from
// a 1993-ish POP palette, with per-session collision probing.
const WEDGE_COLORS: Record<string, string> = {
  'COMEDY': '#d9571f',            // rUhRHo44CIA f0013
  'DRAMA': '#1f6fc4',             // rUhRHo44CIA f0026
  'ACTION': '#c13066',            // HFNfVDQdMxs f0016 (magenta)
  'HORROR': '#5b4ba0',
  'SCI-FI & FANTASY': '#7a3fa8',
  'ROMANCE': '#d84f8e',
  'SUSPENSE': '#0f8f8a',
  'GAMES': '#2e8f4e',             // the games-department wedge
};
const WEDGE_PALETTE = [
  '#d9571f', '#1f6fc4', '#c13066', '#5b4ba0', '#0f8f8a', '#d84f8e',
  '#b8860b', '#2e8f4e', '#c2452d', '#3f6fd8', '#8a6d1f', '#7a3fa8',
  '#1f8fb8', '#a83f3f', '#4f8f2e', '#b84fd8',
];
const assignedWedgeColors = new Map<string, string>();
export function wedgeGenreColor(label: string): string {
  const key = label.toUpperCase();
  if (WEDGE_COLORS[key]) return WEDGE_COLORS[key];
  const got = assignedWedgeColors.get(key);
  if (got) return got;
  let hash = 0;
  for (let i = 0; i < key.length; i++) hash = ((hash << 5) - hash + key.charCodeAt(i)) | 0;
  const taken = new Set([...Object.values(WEDGE_COLORS), ...assignedWedgeColors.values()]);
  let pick = WEDGE_PALETTE[Math.abs(hash) % WEDGE_PALETTE.length];
  for (let probe = 0; probe < WEDGE_PALETTE.length && taken.has(pick); probe++) {
    pick = WEDGE_PALETTE[(Math.abs(hash) + probe + 1) % WEDGE_PALETTE.length];
  }
  assignedWedgeColors.set(key, pick);
  return pick;
}

// ── Painter ────────────────────────────────────────────────────────────────

const CANVAS_W = 1600;

/**
 * One sloped face: family-orange field edge to edge, navy nameplate + white
 * keyline + genre caps. `mirror` paints the physically-correct second side
 * (layout mirrored so it lands on the same body, glyphs kept readable).
 */
function paintFace(canvas: HTMLCanvasElement, label: string, mirror: boolean): void {
  const S = SPEC;
  const family = wedgeGenreColor(label);
  const ctx = canvas.getContext('2d')!;
  const W = canvas.width, H = canvas.height;

  ctx.save();
  ctx.fillStyle = family;
  ctx.fillRect(0, 0, W, H);

  // The face is the SLANT side of the equilateral wedge: its height is
  // s = h·2/√3, so plate fractions of h scale by √3/2 on the face.
  const hPx = H * (SQRT3 / 2);

  if (mirror) {
    ctx.translate(W, 0);
    ctx.scale(-1, 1);
  }
  const ph = S.plateHFrac * hPx;
  const pw = ph * S.plateAspect;
  const pr = S.plateCornerR * ph;
  ctx.translate(W / 2 + S.plateDXFrac * hPx, H / 2);
  ctx.rotate(rad(S.plateTiltDeg)); // canvas y-down: -2.4° lifts the right end
  ctx.fillStyle = S.navy;
  ctx.beginPath();
  ctx.roundRect(-pw / 2, -ph / 2, pw, ph, pr);
  ctx.fill();
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = S.keyStroke * ph;
  const ki = S.keyInset * ph;
  ctx.beginPath();
  ctx.roundRect(-pw / 2 + ki, -ph / 2 + ki, pw - 2 * ki, ph - 2 * ki, Math.max(4, pr - ki));
  ctx.stroke();

  if (mirror) ctx.scale(-1, 1); // un-mirror the glyphs only
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  // Sign-shop fit: hold the visible cap height, condense to fit the plate.
  let size = Math.round((ph * S.capHeightFrac) / 0.72);
  const setFont = () => { ctx.font = `italic 900 ${size}px ${BB_ARCHIVO_BLACK}, sans-serif`; };
  setFont();
  const maxW = pw * S.textWidthFrac;
  let squeeze = Math.min(1, maxW / ctx.measureText(label).width);
  if (squeeze < 0.6) {
    size = Math.max(40, Math.floor(size * (squeeze / 0.6)));
    setFont();
    squeeze = Math.min(1, maxW / ctx.measureText(label).width);
  }
  ctx.scale(squeeze, 1);
  ctx.fillStyle = '#ffffff';
  ctx.fillText(label, 0, ph * 0.03);
  ctx.restore();

  // Lit-from-within VIGNETTE (owner, 2026-08-09): the face doubles as the
  // emissive map, so darkening the edges makes the glow bloom from the
  // center like a lightbox.
  const g = ctx.createRadialGradient(W / 2, H / 2, H * 0.25, W / 2, H / 2, W * 0.62);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(0.72, 'rgba(0,0,0,0.10)');
  g.addColorStop(1, `rgba(0,0,0,${SPEC.vignette})`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
}

function toTex(canvas: HTMLCanvasElement): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = 16;
  return tex;
}

/**
 * Paint the wedge face art. Returns the FRONT texture with the family color
 * stashed on `userData.bb93Family` (the builder colors the end caps with
 * it); the mirrored BACK twin is registered so the user-art swap and
 * disposal paths in fixtures/signage.ts keep working unchanged.
 *
 * `faceAspect` is the catalog's w:h (h = the sign's VERTICAL height); the
 * canvas is cut to the slant face's true aspect w:s.
 */
export function createCategoryPlate1993Texture(label: string, faceAspect = 2.48): THREE.Texture {
  const slantAspect = faceAspect * (SQRT3 / 2);
  const mk = (mirror: boolean) => {
    const c = document.createElement('canvas');
    c.width = CANVAS_W;
    c.height = Math.round(CANVAS_W / slantAspect / 8) * 8;
    paintFace(c, label.toUpperCase(), mirror);
    return c;
  };
  const front = toTex(mk(false));
  front.userData.bb93Family = wedgeGenreColor(label.toUpperCase());
  registerBackTexture(front, toTex(mk(true)));
  return front;
}

// ── Geometry ───────────────────────────────────────────────────────────────

/**
 * Build the solid equilateral wedge. `w` = width along the aisle, `h` = the
 * sign's vertical height (the triangle's height; top depth s = 2h/√3). The
 * caller positions the group in x/z and sets rotation.y = slot yaw.
 */
export function buildCategoryPlate1993(
  texture: THREE.Texture,
  w: number,
  h: number,
  ceilingY: number,
): THREE.Group {
  const backTex = getBackTexture(texture); // the registered mirrored twin
  const group = new THREE.Group();
  const family: string = texture.userData?.bb93Family ?? '#1f6fc4';

  const s = (2 * h) / SQRT3;      // top depth = slant length (equilateral)
  const zTop = s / 2;
  const DROP = 0.18;              // ft between ceiling and the flat top
  const yTop = ceilingY - DROP;
  const yApex = yTop - h;

  // DoubleSide: the body must read SOLID from every angle — a culled end
  // cap reads as a hole straight through the sign. Printed faces receive
  // the same scene lighting as the solid body.
  const solidMat = new THREE.MeshStandardMaterial({
    color: family, roughness: 0.6, metalness: 0.0, side: THREE.DoubleSide,
  });
  const faceMat = (tex: THREE.Texture) =>
    new THREE.MeshStandardMaterial({
      map: tex, roughness: 0.6, metalness: 0.0,
    });

  // Sloped faces: front (+z at top) and back, meeting at the bottom edge.
  // Simple quads; UV v=0 at the bottom edge, v=1 at the top.
  const mkFace = (side: 1 | -1, tex: THREE.Texture) => {
    const geo = new THREE.BufferGeometry();
    const x0 = -w / 2, x1 = w / 2;
    // Corners: bottom edge (apex line) then top edge, wound to face outward.
    const pos = side === 1
      ? [x0, yApex, 0, x1, yApex, 0, x1, yTop, zTop, x0, yApex, 0, x1, yTop, zTop, x0, yTop, zTop]
      : [x1, yApex, 0, x0, yApex, 0, x0, yTop, -zTop, x1, yApex, 0, x0, yTop, -zTop, x1, yTop, -zTop];
    // U runs left→right as seen by THAT side's viewer; the back texture is
    // the mirrored-layout repaint, so both sides read forward.
    const uv = [0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1];
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, faceMat(tex));
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  };
  group.add(mkFace(1, texture));
  group.add(mkFace(-1, backTex));

  // Flat top (family color — mostly hidden under the mount).
  const top = new THREE.Mesh(new THREE.BoxGeometry(w, 0.012, s), solidMat);
  top.position.set(0, yTop - 0.006, 0);
  top.receiveShadow = true;
  group.add(top);

  // Triangular end caps in the SAME family color (owner: never black).
  for (const sx of [-1, 1] as const) {
    const geo = new THREE.BufferGeometry();
    const x = sx * (w / 2);
    // Wound so the normal points outward (+x on the right end); the
    // material is DoubleSide regardless so neither end can ever cull into
    // a see-through hole.
    const pos = sx === 1
      ? [x, yTop, -zTop, x, yTop, zTop, x, yApex, 0]
      : [x, yTop, zTop, x, yTop, -zTop, x, yApex, 0];
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.computeVertexNormals();
    const cap = new THREE.Mesh(geo, solidMat);
    cap.castShadow = true;
    cap.receiveShadow = true;
    group.add(cap);
  }

  // Near-black TRIM along EVERY corner edge, including the top (owner,
  // 2026-08-09): bottom keel, the top face's four edges, and the four
  // sloped side edges — 9 thin square-section rails half-embedded on the
  // edge lines, so the border reads from any angle.
  const T = SPEC.trimT;
  const trimMat = new THREE.MeshStandardMaterial({ color: SPEC.trimColor, roughness: 0.55, metalness: 0.1 });
  const rail = (bw: number, bh: number, bd: number, x: number, y: number, z: number, rx = 0) => {
    const r = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, bd), trimMat);
    r.position.set(x, y, z);
    if (rx) r.rotation.x = rx;
    r.receiveShadow = true;
    group.add(r);
  };
  rail(w + T, T, T, 0, yApex, 0);                    // bottom keel
  rail(w + T, T, T, 0, yTop, zTop);                  // top front
  rail(w + T, T, T, 0, yTop, -zTop);                 // top back
  rail(T, T, s + T, w / 2, yTop, 0);                 // top right
  rail(T, T, s + T, -w / 2, yTop, 0);                // top left
  const slopeTilt = Math.atan2(zTop, h);             // 30° for the equilateral ∇
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    rail(T, s + T, T, sx * (w / 2), (yTop + yApex) / 2, sz * (zTop / 2), sz * slopeTilt);
  }

  // Mount per feedback/049: a short bar on the ceiling, two rigid drops.
  const mountMat = new THREE.MeshStandardMaterial({ color: 0x2a2a2e, roughness: 0.5, metalness: 0.35 });
  const bar = new THREE.Mesh(new THREE.BoxGeometry(w * 0.55, 0.045, Math.min(0.18, s * 0.25)), mountMat);
  bar.position.y = ceilingY - 0.0225;
  bar.receiveShadow = true;
  group.add(bar);
  for (const sx of [-1, 1]) {
    const strap = new THREE.Mesh(new THREE.BoxGeometry(0.035, DROP + 0.02, 0.035), mountMat);
    strap.position.set(sx * w * 0.24, ceilingY - 0.045 - (DROP + 0.02) / 2 + 0.02, 0);
    strap.receiveShadow = true;
    group.add(strap);
  }
  return group;
}
