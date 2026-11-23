import * as THREE from 'three';
import { WHITE_CLAMSHELL_DIMS } from './packaging-formats.ts';

// The white family-film clamshell's molded rim: a band this fraction of the
// face's UV wide along the top, the bottom and ONE vertical edge (the trimmed
// edge, not the hinge). The poster shows in the window inside it.
export const WHITE_RIM = 0.04;

/** Width / height of the art window inside the white clamshell's rim. */
export function whiteClamshellWindowAspect(): number {
  const d = WHITE_CLAMSHELL_DIMS;
  return (d.w * (1 - WHITE_RIM)) / (d.h * (1 - 2 * WHITE_RIM));
}

// Draw the white rim and map the poster into the window inside it.
//
// `cropX`: fraction cropped off EACH horizontal side of the sampled art. This
// shader samples `texture(map, uv)` with a hand-built UV, which bypasses three's
// map offset/repeat transform, so a texture cropped with
// cropFrontTextureForMedium() would NOT be cropped here: pass the crop in.
// `borderSide` picks which vertical edge carries the rim. The retail box wants
// it on the front's RIGHT, but on the FLIPPED back the same physical edge reads
// on the LEFT, so the back passes 'left'.
//
// Both are UNIFORMS, never constants baked into the source, and the program key
// is fixed. Three keys a material's compiled program on its onBeforeCompile
// SOURCE TEXT, which is identical for every call of this function. With baked
// constants, whichever variant compiled first (the uncropped placeholder front,
// the uncropped back) served every white case after it, so a cropped front lost
// its crop and showed the art shrunk inside bars on all four sides. One shared
// program with per-material values cannot drift.
export function applyWhiteBorderShader(
  mat: THREE.MeshStandardMaterial | THREE.MeshPhysicalMaterial,
  cropX: number = 0,
  borderSide: 'right' | 'left' = 'right',
) {
  const uWhiteRimCropX = { value: cropX };
  const uWhiteRimLeft = { value: borderSide === 'left' ? 1 : 0 };
  mat.defines = mat.defines || {};
  mat.defines.USE_UV = '';
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uWhiteRimCropX = uWhiteRimCropX;
    shader.uniforms.uWhiteRimLeft = uWhiteRimLeft;
    shader.vertexShader = shader.vertexShader.replace(
      '#include <uv_vertex>',
      `
      vUv = uv;
      `
    );
    shader.fragmentShader = `
      uniform float uWhiteRimCropX;
      uniform float uWhiteRimLeft;
      ${shader.fragmentShader}
    `.replace(
      '#include <map_fragment>',
      `
      float border = ${WHITE_RIM.toFixed(2)};
      bool rimLeft = uWhiteRimLeft > 0.5;
      bool onRim = (rimLeft ? vUv.x < border : vUv.x > 1.0 - border)
        || vUv.y < border || vUv.y > 1.0 - border;
      if (onRim) {
        diffuseColor.rgb = vec3(1.0);
      } else {
        // The window is the non-rim strip: [border, 1] for a left rim, [0, 1-border]
        // for a right rim. Rescale UVs back to [0,1] before the crop.
        float windowX = rimLeft ? (vUv.x - border) / (1.0 - border) : vUv.x / (1.0 - border);
        vec2 scaledUv = vec2(windowX, (vUv.y - border) / (1.0 - 2.0 * border));
        scaledUv.x = uWhiteRimCropX + scaledUv.x * (1.0 - 2.0 * uWhiteRimCropX);
        vec4 mapTexel = texture(map, scaledUv);
        diffuseColor *= mapTexel;
      }
      `
    );
  };
  mat.customProgramCacheKey = () => 'white-rim-uniforms-v1';
}
