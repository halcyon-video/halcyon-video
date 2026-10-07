import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { modelCaseGeometry } from './packaging-model';
import type { CaseDimensions } from './packaging-formats';

/** Preserve the ordinary case's corner radius on a wider season sleeve. */
export function createSeriesCaseGeometry(size: CaseDimensions, radius: number): THREE.BufferGeometry {
  const fallback = new RoundedBoxGeometry(size.w, size.h, size.d, 2, radius);
  const geometry = modelCaseGeometry(fallback, 'series-boxset', size, true);
  fallback.dispose();
  return geometry;
}
