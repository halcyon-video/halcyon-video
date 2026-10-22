import * as THREE from 'three';
import { frontTilePolygon, offsetChain, bulkheadChain, soffitInterior, TILE_BEYOND_SOFFIT, type PlanPoint } from './front-of-store-plan.ts';

// The bounded gray square-tile zone at the front of the 2000 and 2010 stores
// (GH #388). It follows the bulkhead overhead a step further out — long
// straight runs and 45-degree transitions to the carpet — and covers the
// entrance and the cash wrap, never the sales floor. A thin dark reducer strip
// finishes the carpet edge.
//
// UVs are the carpet plane's own (0..1 across the store's floor bounds), so the
// baked floor contact AO drops straight onto the tile as well; the square tile
// pattern rides on the map's repeat.

export interface FloorBounds { minX: number; maxX: number; minZ: number; maxZ: number }

const TILE_FT = 1.0;
const TILES_PER_TEXTURE = 4;
const TILE_Y = 0.004;
export const FRONT_TILE_NAME = 'front-tile-zone';

function tileTexture(): THREE.CanvasTexture {
  const px = 128, n = TILES_PER_TEXTURE, size = px * n;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  // Grout first, then each tile inset by the joint. Small value shifts tile to
  // tile, as laid commercial tile never quite matches its neighbour.
  ctx.fillStyle = '#6f747a';
  ctx.fillRect(0, 0, size, size);
  const joint = 3;
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    const v = Math.round(142 + (rnd() - 0.5) * 10);
    ctx.fillStyle = `rgb(${v - 6},${v},${v + 8})`;
    ctx.fillRect(i * px + joint / 2, j * px + joint / 2, px - joint, px - joint);
    // A faint fleck so the face is not a flat swatch up close.
    for (let k = 0; k < 40; k++) {
      ctx.fillStyle = `rgba(${rnd() < 0.5 ? '255,255,255' : '40,44,50'},0.06)`;
      ctx.fillRect(i * px + rnd() * px, j * px + rnd() * px, 2, 2);
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  return tex;
}

function floorUv(p: PlanPoint, b: FloorBounds): [number, number] {
  return [(p.x - b.minX) / (b.maxX - b.minX), 1 - (p.z - b.minZ) / (b.maxZ - b.minZ)];
}

function shapeGeometry(outline: PlanPoint[], b: FloorBounds, y: number): THREE.BufferGeometry {
  const shape = new THREE.Shape(outline.map(p => new THREE.Vector2(p.x, p.z)));
  const flat = new THREE.ShapeGeometry(shape);
  const pos = flat.getAttribute('position');
  const positions: number[] = [], uvs: number[] = [];
  for (let i = 0; i < pos.count; i++) {
    const p = { x: pos.getX(i), z: pos.getY(i) };
    positions.push(p.x, y, p.z);
    uvs.push(...floorUv(p, b));
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(flat.getIndex());
  // Shape winding varies; force every triangle to face up.
  const idx = geometry.getIndex()!;
  for (let t = 0; t < idx.count; t += 3) {
    const a = idx.getX(t), c = idx.getX(t + 2), bb = idx.getX(t + 1);
    const ax = positions[a * 3], az = positions[a * 3 + 2];
    const cross = (positions[bb * 3] - ax) * (positions[c * 3 + 2] - az) - (positions[bb * 3 + 2] - az) * (positions[c * 3] - ax);
    if (cross > 0) { idx.setX(t + 1, c); idx.setX(t + 2, bb); }
  }
  geometry.computeVertexNormals();
  flat.dispose();
  return geometry;
}

/** Build the tiled front zone for a bulkhead soffit outline; null when there is no soffit. */
export function buildFrontTileFloor(soffit: PlanPoint[], glassZ: number, bounds: FloorBounds, lowQuality: boolean): THREE.Group | null {
  if (soffit.length < 3) return null;
  const group = new THREE.Group();
  group.name = FRONT_TILE_NAME;
  const outline = frontTilePolygon(soffit, glassZ, bounds.minX, bounds.maxX);

  const map = tileTexture();
  const spanX = bounds.maxX - bounds.minX, spanZ = bounds.maxZ - bounds.minZ;
  const repeatFt = TILE_FT * TILES_PER_TEXTURE;
  map.repeat.set(spanX / repeatFt, spanZ / repeatFt);
  // Pin a grout line to the store's centreline so the field is symmetric about the entrance.
  const centreX = (soffit[0].x + soffit[soffit.length - 1].x) / 2;
  map.offset.set(-((centreX - bounds.minX) / repeatFt) % 1, 0);
  const material = new THREE.MeshStandardMaterial({
    name: 'FrontTileZone', map, roughness: 0.42, metalness: 0,
    bumpMap: lowQuality ? null : map, bumpScale: 0.6,
    polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2,
  });
  material.addEventListener('dispose', () => map.dispose());
  if (lowQuality) {
    // Same contact-shadow treatment the carpet gets on the shadowless tier.
    material.customProgramCacheKey = () => 'front-tile-baked-contact-v1';
    material.onBeforeCompile = shader => {
      shader.fragmentShader = shader.fragmentShader.replace('#include <aomap_fragment>', `
        #include <aomap_fragment>
        #ifdef USE_AOMAP
          reflectedLight.directDiffuse *= ambientOcclusion;
        #endif
      `);
    };
  }
  const tile = new THREE.Mesh(shapeGeometry(outline, bounds, TILE_Y), material);
  tile.name = 'Front tile field';
  tile.receiveShadow = true;
  group.add(tile);

  // Reducer strip along the carpet edge (every edge but the storefront).
  const chain = offsetChain(bulkheadChain(soffit, glassZ), -TILE_BEYOND_SOFFIT, soffitInterior(soffit));
  const inside = soffitInterior(soffit);
  const edgeIn = offsetChain(chain, 0.06, inside), edgeOut = offsetChain(chain, -0.06, inside);
  const positions: number[] = [];
  const y = TILE_Y + 0.012;
  for (let i = 0; i < chain.length - 1; i++) {
    const a = edgeIn[i], b = edgeIn[i + 1], c = edgeOut[i + 1], d = edgeOut[i];
    positions.push(a.x, y, a.z, c.x, y, c.z, b.x, y, b.z, a.x, y, a.z, d.x, y, d.z, c.x, y, c.z);
  }
  const stripGeo = new THREE.BufferGeometry();
  stripGeo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  stripGeo.computeVertexNormals();
  const strip = new THREE.Mesh(stripGeo, new THREE.MeshStandardMaterial({
    name: 'FrontTileReducer', color: 0x3a3c40, roughness: 0.55, metalness: 0.2, side: THREE.DoubleSide,
  }));
  strip.name = 'Carpet reducer strip';
  strip.receiveShadow = true;
  group.add(strip);
  return group;
}

/** Share the carpet's baked contact AO with the tile, whose UVs are the carpet's. */
export function applyFrontTileAO(root: THREE.Object3D, ao: THREE.Texture, intensity: number): void {
  const zone = root.getObjectByName(FRONT_TILE_NAME);
  const tile = zone?.getObjectByName('Front tile field') as THREE.Mesh | undefined;
  if (!tile) return;
  const material = tile.material as THREE.MeshStandardMaterial;
  material.aoMap = ao;
  material.aoMapIntensity = intensity;
  material.needsUpdate = true;
}
