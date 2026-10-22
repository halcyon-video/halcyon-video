import * as THREE from 'three';
import { bulkheadChain, offsetChain, soffitInterior, type PlanPoint } from './front-of-store-plan.ts';

// The angular bulkhead's fascia (GH #388). In the reference the pale fascia is
// deep: a tall outer face, a flat bottom, then an inner face that slopes back
// up to a gridded ceiling recessed above it. One mitred profile swept along the
// whole exposed chain, from the storefront round the counter and back to the
// storefront, so no cut end ever shows. Depths are estimates fitted to the
// photograph, which carries no dimensions.
export const BULKHEAD_LIP = 0.75;
export const BULKHEAD_SLOPE_RUN = 0.75;

type V3 = [number, number, number];

export function buildBulkheadFascia(
  soffit: PlanPoint[], glassZ: number, ceilingY: number, gridY: number, band: number,
): THREE.Mesh {
  const chain = bulkheadChain(soffit, glassZ);
  const inside = soffitInterior(soffit);
  const bottomInner = offsetChain(chain, band, inside);
  const slopeTop = offsetChain(chain, band + BULKHEAD_SLOPE_RUN, inside);
  const bottomY = gridY - BULKHEAD_LIP;
  const positions: number[] = [];
  const quad = (a: V3, b: V3, c: V3, d: V3) => positions.push(...a, ...b, ...c, ...a, ...c, ...d);
  const at = (p: PlanPoint, y: number): V3 => [p.x, y, p.z];
  for (let i = 0; i < chain.length - 1; i++) {
    const o0 = chain[i], o1 = chain[i + 1];
    const b0 = bottomInner[i], b1 = bottomInner[i + 1];
    const s0 = slopeTop[i], s1 = slopeTop[i + 1];
    quad(at(o0, ceilingY), at(o1, ceilingY), at(o1, bottomY), at(o0, bottomY));
    quad(at(o0, bottomY), at(o1, bottomY), at(b1, bottomY), at(b0, bottomY));
    quad(at(b0, bottomY), at(b1, bottomY), at(s1, gridY), at(s0, gridY));
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  // Painted drywall, the same warm off-white as the plain soffit body. Double
  // sided so the profile shades correctly whichever way a run is wound.
  const paint = new THREE.MeshStandardMaterial({
    name: 'BulkheadFasciaPaint', color: 0xe6e3da, roughness: 0.95, metalness: 0, side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(geometry, paint);
  mesh.name = 'Angular bulkhead fascia';
  mesh.castShadow = mesh.receiveShadow = true;
  return mesh;
}
