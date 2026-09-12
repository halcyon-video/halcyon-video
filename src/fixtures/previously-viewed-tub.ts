// Original compact display. Hardware is owned; movie geometry/materials are shared.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { assetUrl } from '../asset-url';
import { disposeDetachedModel } from '../model-resources';
import { previouslyViewedTubAnchor } from '../counter-anchors';
import { createMovieInstancedMeshes, CASE_HEIGHT, CASE_MEDIUM } from '../video-case';
import { getActiveTheme } from '../themes';
import type { StoreScene } from '../three-scene';

export function buildPreviouslyViewedTub(scene: StoreScene, parent: THREE.Group): void {
  if (getActiveTheme().id !== 'bb-1993' || CASE_MEDIUM !== 'vhs') return;
  const anchor = previouslyViewedTubAnchor(scene);
  if (!anchor) return;
  const root = new THREE.Group(); root.name = 'previously-viewed-counter-tub';
  root.position.set(anchor.x, anchor.y, anchor.z); root.rotation.y = anchor.rotY;
  parent.add(root);
  // No prior tub existed: keep the empty countertop on load failure.
  const stock = new THREE.Group(); stock.name = 'previously-viewed-tub-stock';
  let retired = false;
  const cleanup = () => {
    retired = true; parent.removeEventListener('removed', cleanup);
    // Detach shared case resources BEFORE the signage tree's disposal traversal.
    stock.removeFromParent();
    stock.traverse(o => { if (o instanceof THREE.InstancedMesh) o.dispose(); });
    stock.clear();
    disposeDetachedModel(root); root.removeFromParent();
  };
  parent.addEventListener('removed', cleanup);
  new GLTFLoader().load(assetUrl('models/previously-viewed-tub.glb'), ({ scene: model }) => {
    if (retired || !parent.parent) { disposeDetachedModel(model); return; }
    model.name = 'previously-viewed-tub-model';
    const card = priceCard();
    model.traverse(o => {
      if (!(o instanceof THREE.Mesh)) return;
      const materials = Array.isArray(o.material) ? o.material : [o.material];
      o.castShadow = materials.every(m => !m.transparent); o.receiveShadow = true;
      for (const m of materials) {
        if (!(m instanceof THREE.MeshStandardMaterial)) continue;
        if (m.name === 'Tub_ClearAcrylic') {
          // Same inexpensive alpha/clearcoat approach as entrance glass;
          // no transmission render target. Closed thickness gives cut-edge glints.
          m.depthWrite = false; m.side = THREE.DoubleSide; m.envMapIntensity = 1.2;
        }
        if (m.name === 'Tub_PriceCard') {
          m.map = card;
          const p = o.geometry.attributes.position;
          const uv = new Float32Array(p.count * 2);
          // Planar card UVs in the exported Y-up coordinates.
          for (let i = 0; i < p.count; i++) {
            uv[2 * i] = .5 - p.getX(i) / .66;
            uv[2 * i + 1] = (p.getY(i) - .112) / .238;
          }
          o.geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
          m.needsUpdate = true;
        }
      }
    });
    root.add(model, stock);
    const unique = new Map(scene.fixtureContext().libraries.flatMap(l => l.movies).map(m => [m.id, m]));
    const movies = [...unique.values()].sort((a, b) => a.id.localeCompare(b.id)).slice(0, 2);
    movies.forEach((movie, column) => {
      // Four copies per title share one instance batch (two titles, eight tapes).
      const { front, back, loadShelfDetails } = createMovieInstancedMeshes(movie, 4);
      for (let row = 0; row < 4; row++) {
        const matrix = new THREE.Matrix4().compose(
          new THREE.Vector3((column ? 1 : -1) * .225, .04 + CASE_HEIGHT / 2, -.23 + row * .145),
          new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI), new THREE.Vector3(1, 1, 1));
        front.setMatrixAt(row, matrix);
      }
      front.instanceMatrix.needsUpdate = true;
      front.name = `tub-stock-${column}`; stock.add(front); back.dispose(); loadShelfDetails(2);
    });
    scene.fixtureContext().requestShadowRefresh(); scene.requestRender();
  }, undefined, () => { /* Empty-counter fallback is intentional. */ });
}

function priceCard(): THREE.CanvasTexture {
  const c = document.createElement('canvas'); c.width = 512; c.height = 192;
  const g = c.getContext('2d')!;
  g.fillStyle = '#eee4ba'; g.fillRect(0, 0, 512, 192);
  // Original fictional price, not copied from the unreadable archive card.
  g.fillStyle = '#555647'; g.textAlign = 'center';
  g.font = 'bold 31px sans-serif'; g.fillText('PREVIOUSLY VIEWED', 256, 46);
  g.font = 'bold 78px sans-serif'; g.fillText('$4.99', 256, 127);
  g.font = '20px sans-serif'; g.fillText('TAKE HOME A FAVORITE', 256, 167);
  const texture = new THREE.CanvasTexture(c); texture.colorSpace = THREE.SRGBColorSpace;
  texture.flipY = true; return texture;
}
