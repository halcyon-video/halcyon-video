export interface HalloweenPane { lo: number; hi: number }

export interface HalloweenClingPlacement {
  paneIndex: number;
  designIndex: number;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
}

export const HALLOWEEN_CLING_MARGIN = 0.34;
export const HALLOWEEN_PUMPKIN_COUNTER_U = -4.55;
export const HALLOWEEN_PUMPKIN_DESK_U = -1.85;
export const HALLOWEEN_COUNTER_BAND_TOP_Y = 3.54;

interface CounterAnchor { x: number; y: number; z: number; rotY: number; depth: number }

export function halloweenPumpkinCounterPosition(anchor: CounterAnchor, hasOuterBand: boolean) {
  if (!hasOuterBand) return { x: anchor.x, y: anchor.y, z: anchor.z };
  const bandShift = 0.75 + anchor.depth / 2;
  return {
    x: anchor.x - Math.sin(anchor.rotY) * bandShift,
    y: HALLOWEEN_COUNTER_BAND_TOP_Y,
    z: anchor.z - Math.cos(anchor.rotY) * bandShift,
  };
}

// A fixed seed-like layout gives the storefront a casually plastered look
// without changing every reload or making screenshots nondeterministic.
const CLUSTERS = [
  { u: 0.22, v: 0.30, width: 1.22, tilt: -0.16 },
  { u: 0.73, v: 0.57, width: 1.08, tilt: 0.13 },
  { u: 0.46, v: 0.79, width: 0.96, tilt: -0.07 },
] as const;
const DESIGN_ASPECTS = [0.59, 0.92, 1.79] as const;

function jitter(paneIndex: number, clusterIndex: number, salt: number): number {
  const n = Math.sin((paneIndex + 1) * 91.17 + (clusterIndex + 1) * 37.41 + salt * 13.7) * 43758.5453;
  return (n - Math.floor(n)) * 2 - 1;
}

export function halloweenClingPlacements(
  panes: HalloweenPane[],
  paneBottom = 2,
  paneTop = 7.7,
): HalloweenClingPlacement[] {
  const placements: HalloweenClingPlacement[] = [];
  panes.forEach((pane, paneIndex) => {
    if (paneIndex % 2 === 0) return;
    const paneWidth = pane.hi - pane.lo;
    const usableHeight = paneTop - paneBottom - HALLOWEEN_CLING_MARGIN * 2;
    CLUSTERS.forEach((cluster, clusterIndex) => {
      const designIndex = (paneIndex + clusterIndex) % DESIGN_ASPECTS.length;
      const width = Math.min(cluster.width + jitter(paneIndex, clusterIndex, 1) * 0.08, paneWidth - HALLOWEEN_CLING_MARGIN * 2);
      const height = width * DESIGN_ASPECTS[designIndex];
      const half = width / 2;
      const rawX = pane.lo + paneWidth * (cluster.u + jitter(paneIndex, clusterIndex, 2) * 0.045);
      const x = Math.min(pane.hi - HALLOWEEN_CLING_MARGIN - half, Math.max(pane.lo + HALLOWEEN_CLING_MARGIN + half, rawX));
      const rawY = paneBottom + HALLOWEEN_CLING_MARGIN + usableHeight * (cluster.v + jitter(paneIndex, clusterIndex, 3) * 0.045);
      const y = Math.min(paneTop - HALLOWEEN_CLING_MARGIN - height / 2, Math.max(paneBottom + HALLOWEEN_CLING_MARGIN + height / 2, rawY));
      placements.push({
        paneIndex,
        designIndex,
        x,
        y,
        width,
        height,
        rotation: cluster.tilt + jitter(paneIndex, clusterIndex, 4) * 0.055,
      });
    });
  });
  return placements;
}
