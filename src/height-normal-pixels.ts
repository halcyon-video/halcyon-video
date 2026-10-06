/** Write a tileable tangent-space normal map from the red channel of RGBA
 * height pixels. Resolve wrapped neighbours once per row/pixel, rather than
 * doing four function calls and eight modulo operations for every pixel. */
export function writeHeightNormalPixels(
  data: Uint8ClampedArray,
  out: Uint8ClampedArray,
  width: number,
  height: number,
  strength: number,
): void {
  const stride = width * 4;
  for (let y = 0; y < height; y++) {
    const row = y * stride;
    const above = (y === 0 ? height - 1 : y - 1) * stride;
    const below = (y === height - 1 ? 0 : y + 1) * stride;
    for (let x = 0; x < width; x++) {
      const col = x * 4;
      const left = x === 0 ? stride - 4 : col - 4;
      const right = x === width - 1 ? 0 : col + 4;
      // Keep division/normalization order identical to the canvas painter so
      // the resulting clamped bytes, including wrap seams, remain unchanged.
      const dx = (data[row + left] / 255 - data[row + right] / 255) * strength;
      const dy = (data[above + col] / 255 - data[below + col] / 255) * strength;
      const len = Math.hypot(dx, dy, 1);
      const i = row + col;
      out[i] = (-dx / len * 0.5 + 0.5) * 255;
      out[i + 1] = (-dy / len * 0.5 + 0.5) * 255;
      out[i + 2] = (1 / len * 0.5 + 0.5) * 255;
      out[i + 3] = 255;
    }
  }
}
