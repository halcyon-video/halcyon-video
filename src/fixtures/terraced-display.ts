import * as THREE from 'three';
import type { FloorDisplayProfile } from './floor-display-profile';
import { CASE_DEPTH } from '../video-case';

/** Closed square millwork shell following a locally installed shelf contract. */
export function terracedDisplayGeometry(profile: FloorDisplayProfile): THREE.BufferGeometry {
  const { shelfHeights: heights, shelfCenters: centers, lean, coreHeight } = profile;
  const outer = centers[0] + .12;
  const support = profile.pedestalWidth == null ? outer : profile.pedestalWidth / 2;
  const rings: [number, number][] = [[0, support]];
  if (profile.pedestalWidth != null) {
    const underside = heights[0] - .07;
    rings.push([underside, support], [underside, outer]);
  }
  heights.forEach((height, row) => {
    const radius = centers[row] + .12;
    rings.push([height - .035, radius], [height, radius]);
    const back = centers[row] - CASE_DEPTH / 2 - .012;
    rings.push([height, back]);
    const nextY = heights[row + 1] != null ? heights[row + 1] - .035 : coreHeight;
    rings.push([nextY, back + (nextY - height) * Math.tan(lean)]);
  });
  const positions: number[] = [], indices: number[] = [];
  for (const [y, radius] of rings) positions.push(-radius,y,-radius, -radius,y,radius, radius,y,radius, radius,y,-radius);
  for (let row = 0; row < rings.length - 1; row++) {
    for (let side = 0; side < 4; side++) {
      const a = row * 4 + side, b = row * 4 + (side + 1) % 4;
      indices.push(a,b,b+4, a,b+4,a+4);
    }
  }
  indices.push(0,2,1, 0,3,2);
  const top = (rings.length - 1) * 4;
  indices.push(top,top+1,top+2, top,top+2,top+3);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  const flat = geometry.toNonIndexed(); geometry.dispose(); flat.computeVertexNormals();
  return flat;
}
