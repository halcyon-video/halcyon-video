// One original, owner-approved fictional Southern retail strip. Time changes
// illumination; neither a quality tier nor a sun roll rotates the neighborhood.
export type OutsideMode = 'morning' | 'day' | 'sunset' | 'night';
export interface PanoramaProfile { file: string; sunAzimuth: number; sunElevation: number; sunWarmth: number }
const profiles: Record<OutsideMode, PanoramaProfile> = {
  morning: {file:'environments/southern-strip/morning.webp',sunAzimuth:-105,sunElevation:12,sunWarmth:.2},
  day: {file:'environments/southern-strip/afternoon.webp',sunAzimuth:-65,sunElevation:45,sunWarmth:0},
  sunset: {file:'environments/southern-strip/sunset.webp',sunAzimuth:65,sunElevation:5,sunWarmth:.3},
  night: {file:'environments/southern-strip/night.webp',sunAzimuth:65,sunElevation:5,sunWarmth:0},
};
export const PANORAMA_ROTATION_Y = -Math.PI / 2;
export const PANORAMA_EYE_HEIGHT = 5.5;
export const PANORAMA_GROUND_Y = -.15;
export function panoramaProfile(mode: OutsideMode): PanoramaProfile { return profiles[mode]; }
