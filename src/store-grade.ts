// Display-space photo grade — extracted from StoreScene.initThree (three-scene
// keeps one-line delegating stubs, per the scene-module pattern). One
// full-screen ShaderPass, run AFTER OutputPass so everything here works on
// tone-mapped display-referred sRGB: S-curve, saturation, black lift, color
// WARMTH (white balance), an optional procedural "nostalgia" 3D LUT, vignette
// and animated sensor grain. It is ONE program that is always in the composer
// chain, so it compiles once at boot — toggling warmth/LUT only writes
// uniforms and can never cause a mid-session shader compile (newPrograms
// stays empty in the perf harness).
import * as THREE from 'three';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import type { StoreScene } from './three-scene';

// Display-grade sweep knobs. Every value in the final photo grade (exposure,
// S-curve, saturation, vignette, black lift, warmth, LUT mix) reads its
// default through this so a variant can be rendered straight from the harness
// with `--set bb_grade_<k>=<v>` and compared, numerically, against reference
// photos of a real rental floor. Absent/garbage key => the tuned default, so
// shipping behaviour is exactly the default column.
export function gradeNum(key: string, fallback: number): number {
  const v = parseFloat(localStorage.getItem(key) || '');
  return Number.isFinite(v) ? v : fallback;
}

// Default warmth (bb_grade_warmth, also a Store Look setting): a modest
// tungsten lean. Real rental floors ran warm-white fluorescents (~3500K) and
// consumer film/CCD cameras of the era rendered them warmer still, so a
// neutral-white render reads "office", not "video store". 0 = today's
// neutral; the shader's per-unit gains put 1.0 at an unmistakable amber cast.
export const WARMTH_DEFAULT = 0.35;

// ─── Procedural "nostalgia" film LUT ────────────────────────────────────────
//
// A 33³ RGBA8 3D texture (~143 KB) built once and cached for the app's
// lifetime (deterministic content — same rationale as the global case
// materials; it survives no-reload scene rebuilds and re-uploads itself to a
// fresh GL context automatically). Authoring is deliberately subtle — the mix
// uniform defaults to 1.0 because the LUT itself is gentle:
//   - toe lift: deep blacks float up like print film / a consumer CRT
//   - shoulder: whites never quite clip (film's "no clean white")
//   - warm mid shift: a touch of amber where the eye lives
//   - saturation shaping: mids get a small chroma push, shadows go muted
//     (faded-stock mud) — the classic "memory of the 90s" color move.
const LUT_SIZE = 33;
let nostalgiaLut: THREE.Data3DTexture | null = null;

export function getNostalgiaLut(): THREE.Data3DTexture {
  if (nostalgiaLut) return nostalgiaLut;
  const n = LUT_SIZE;
  const data = new Uint8Array(n * n * n * 4);
  let i = 0;
  for (let bi = 0; bi < n; bi++) {
    for (let gi = 0; gi < n; gi++) {
      for (let ri = 0; ri < n; ri++) {
        let r = ri / (n - 1), g = gi / (n - 1), b = bi / (n - 1);
        // Toe lift (fades out by the midtones) + soft shoulder.
        const toe = 0.035, shoulder = 0.025;
        const tone = (c: number) => c + toe * Math.pow(1 - c, 6) - shoulder * Math.pow(c, 5);
        r = tone(r); g = tone(g); b = tone(b);
        // Mid-weighted warm shift: blacks and whites stay neutral.
        const y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
        const mid = 4 * y * (1 - y);
        r += 0.014 * mid;
        b -= 0.018 * mid;
        // Saturation shaping: +10% chroma in the mids, shadows pulled toward
        // neutral (deep-shadow desat is what reads as "aged film stock").
        const satF = 1 + 0.10 * mid - 0.15 * Math.pow(1 - y, 5);
        r = y + (r - y) * satF;
        g = y + (g - y) * satF;
        b = y + (b - y) * satF;
        data[i++] = Math.round(Math.min(1, Math.max(0, r)) * 255);
        data[i++] = Math.round(Math.min(1, Math.max(0, g)) * 255);
        data[i++] = Math.round(Math.min(1, Math.max(0, b)) * 255);
        data[i++] = 255;
      }
    }
  }
  const tex = new THREE.Data3DTexture(data, n, n, n);
  tex.format = THREE.RGBAFormat;
  tex.type = THREE.UnsignedByteType;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.wrapS = tex.wrapT = tex.wrapR = THREE.ClampToEdgeWrapping;
  tex.unpackAlignment = 1;
  tex.needsUpdate = true;
  nostalgiaLut = tex;
  return tex;
}

/** Current LUT blend amount from settings (0 when the toggle is off). */
function lutAmountFromSettings(): number {
  return localStorage.getItem('bb_grade_lut') === '1' ? gradeNum('bb_grade_lut_mix', 1.0) : 0;
}

// ─── The grade pass ─────────────────────────────────────────────────────────

/**
 * Lens vignette + fine animated sensor grain + the photo grade, applied AFTER
 * OutputPass so it works in display-referred space (predictable strength, like
 * real film/sensor noise). Both deliberately subtle: real lenses darken toward
 * the corners and real photos are never mathematically clean — the eye reads
 * their absence as "render". Cost: one trivial full-screen pass (~0.1 ms; the
 * optional LUT adds a single trilinear 3D-texture fetch, branch-skipped when
 * off). The renderer is WebGL2-only (three r163+), so `sampler3D` is available
 * even in this GLSL1-style shader (three compiles it as ESSL 300 with compat
 * defines).
 */
export function createGradePass(_scene: StoreScene, filmicTonemap: boolean): ShaderPass {
  const lutScale = ((LUT_SIZE - 1) / LUT_SIZE).toFixed(8);
  const lutOffset = (0.5 / LUT_SIZE).toFixed(8);
  return new ShaderPass({
    uniforms: {
      tDiffuse: { value: null },
      time: { value: 0 },
      // Grade strength is PER TONE MAPPER. The S-curve + saturation lift
      // below were tuned to counter AgX's flat, desaturated hand-off; PBR
      // Neutral (the current default) is identity below its highlight knee
      // — authored colors arrive at full chroma already, and re-applying
      // the AgX numbers on top read as "everything is oversaturated".
      curveMix: { value: gradeNum('bb_grade_curve', filmicTonemap ? 0.12 : 0.06) },
      // Back to unity-ish. This briefly ran at 1.18 to buy back the chroma the
      // raised exposure washes out, but on a display that is ALREADY stretching
      // sRGB outward, compensating for wash by adding saturation is pouring
      // fuel on the actual complaint. Keep the source conservative and fix the
      // display path instead; the render measures well below a real store photo
      // (0.28 vs 0.51) so there is no case for adding chroma here.
      satMix: { value: gradeNum('bb_grade_sat', filmicTonemap ? 1.07 : 0.98) },
      // Corner falloff. A real photo of a fluorescent-lit store has
      // essentially none — the ceiling grid lights the room evenly edge to
      // edge — so this reads as "cinematic" rather than "realistic" the
      // higher it goes.
      vignette: { value: gradeNum('bb_grade_vignette', 0.02) },
      // Black lift. Ambient bounce in a real retail box means NOTHING sits at
      // true black; reference photos of rental floors show the space under
      // the bottom shelf landing at a soft dark grey. 0 = untouched blacks.
      lift: { value: gradeNum('bb_grade_lift', 0.035) },
      // Color warmth (bb_grade_warmth setting/sweep knob): display-space
      // white-balance lean toward tungsten, applied before the S-curve.
      warmth: { value: gradeNum('bb_grade_warmth', WARMTH_DEFAULT) },
      // Optional nostalgia LUT (bb_grade_lut toggle; bb_grade_lut_mix sweep).
      // The texture is ALWAYS bound so on/off is purely a uniform write.
      lutMap: { value: getNostalgiaLut() },
      lutAmount: { value: lutAmountFromSettings() },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D tDiffuse;
      uniform mediump sampler3D lutMap;
      uniform float time;
      uniform float curveMix;
      uniform float satMix;
      uniform float vignette;
      uniform float lift;
      uniform float warmth;
      uniform float lutAmount;
      varying vec2 vUv;
      void main() {
        vec4 c = texture2D(tDiffuse, vUv);
        // Warmth first — a white-balance move, so it feeds the curve/sat
        // stages the way a warmer light source would. Slight net luma gain
        // (+~2%/unit) is deliberate: warm light reads bright, not dirty.
        c.rgb *= vec3(1.0 + warmth * 0.08, 1.0 + warmth * 0.025, 1.0 - warmth * 0.10);
        // Display-space photo grade, strength per tone mapper (see the
        // uniform defaults above). AgX hands us a clean but slightly flat,
        // desaturated image — real photos of a fluorescent-lit store carry a
        // touch more contrast and color, so it gets a gentle S-curve
        // (smoothstep blend) that deepens blacks and gives highlights a
        // little bite, plus a ~7% saturation lift to counter AgX's roll-off
        // mud. PBR Neutral needs neither: it keeps a softer curve for the
        // photo bite and a hair BELOW unit saturation so the brand
        // orange/blue fields don't scream. (Curve history: 0.28 -> 0.18,
        // the deeper crush read dark after the window resize.)
        vec3 sCurve = c.rgb * c.rgb * (3.0 - 2.0 * c.rgb);
        c.rgb = mix(c.rgb, sCurve, curveMix);
        float luma = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722));
        c.rgb = mix(vec3(luma), c.rgb, satMix);
        // Black lift, applied AFTER the S-curve so it re-opens exactly the
        // shadows the curve just crushed (ambient bounce; see uniform note).
        c.rgb = lift + c.rgb * (1.0 - lift);
        // Optional nostalgia film LUT (uniform-branch: coherent, and skips
        // the 3D fetch entirely while the setting is off).
        if (lutAmount > 0.0) {
          vec3 lc = clamp(c.rgb, 0.0, 1.0) * ${lutScale} + ${lutOffset};
          c.rgb = mix(c.rgb, texture(lutMap, lc).rgb, lutAmount);
        }
        // Radial vignette: full brightness in the center, gently falling off
        // toward the corners.
        float dist = distance(vUv, vec2(0.5));
        c.rgb *= 1.0 - vignette * smoothstep(0.35, 0.72, dist);
        // Pixel-locked hash grain, re-seeded every frame (subtle noise to prevent edge sparkling).
        float grainAmount = ${gradeNum('bb_grade_grain', 0.006)};
        float n = fract(sin(dot(gl_FragCoord.xy + mod(time, 71.0) * 113.0, vec2(12.9898, 78.233))) * 43758.5453);
        c.rgb += (n - 0.5) * grainAmount;
        gl_FragColor = c;
      }`,
  });
}

// ─── Live setting hooks (settings.ts applyMode 'live') ──────────────────────

export function setGradeWarmth(scene: StoreScene, v: number): void {
  if (!scene.filmPass) return;
  scene.filmPass.uniforms['warmth'].value = Number.isFinite(v) ? v : WARMTH_DEFAULT;
  scene.requestRender();
}

export function setGradeLut(scene: StoreScene, on: boolean): void {
  if (!scene.filmPass) return;
  scene.filmPass.uniforms['lutAmount'].value = on ? gradeNum('bb_grade_lut_mix', 1.0) : 0;
  scene.requestRender();
}
