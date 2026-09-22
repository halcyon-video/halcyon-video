// Exact shipped variants only; never rewrite a user asset or provider URL.
const variants = new Set(["textures/surfaces/store-sidewalk/normal.png", "textures/surfaces/store-sidewalk/roughness.png", "textures/surfaces/store-sidewalk/color.png", "textures/surfaces/table-wood/normal.png", "textures/surfaces/table-wood/roughness.png", "textures/surfaces/table-wood/color.png", "textures/surfaces/store-brick/normal.png", "textures/surfaces/store-brick/roughness.png", "textures/surfaces/store-brick/color.png", "textures/surfaces/store-carpet/normal.png", "textures/surfaces/store-carpet/roughness.png", "textures/surfaces/store-carpet/color.png", "textures/surfaces/store-wall/normal.png", "textures/surfaces/store-wall/roughness.png", "textures/surfaces/store-wall/color.png", "textures/surfaces/store-shelf/normal.png", "textures/surfaces/store-shelf/roughness.png", "textures/surfaces/store-shelf/color.png", "textures/clerk/livery.png", "textures/clerk/color.png", "day/mall_parking_lot.jpg", "day/park_parking.jpg", "night/hansaplatz.jpg", "night/vignaioli_night.jpg"]);
export function mobileAssetPath(path: string, mobile: boolean): string {
  return mobile && variants.has(path) ? 'mobile/' + path.replace(/\.(png|jpg)$/, '.webp') : path;
}
export function compactAssets(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches && matchMedia('(hover: none)').matches;
}
