import * as THREE from 'three';
import { onBrandChange } from '../brand-live';
import { brandImage, ensureBrandImage } from '../brand-pack';
import { bundledFontsReady } from '../bundled-fonts';
import { drawLogo } from '../logo-renderer';
import { getActiveLogoSpec } from '../logo-spec';
import { markSignMesh } from '../sign-builders';
import { getActiveTheme } from '../themes';

// The printed emblem occupies this envelope; transparent painter margins do not.
const WIDTH_FRACTION = .39;
const PRINT_ASPECT = 5 / 3;
const UPPER_SHELL_Y = 3.25; // Both source assets use the same 5.5-ft authoring envelope.

/** One reusable brand texture, projected once onto each model's real front shell. */
export function gumballLogo(clear: THREE.Material, render: () => void) {
  let disposed = false;
  let generation = 0;
  const decals: THREE.Mesh[] = [];
  const source = document.createElement('canvas'); source.width = 768; source.height = 720;
  const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 308;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = 4;
  const material = new THREE.MeshStandardMaterial({ map: texture, roughness: .55,
    alphaTest: .08, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
  material.name = 'Gumball store logo';

  const paint = () => {
    if (disposed) return;
    // Reset the backing store too: a previously tainted image must not poison
    // a later local brand. This runs only on brand/font events.
    source.width = 768;
    const src = source.getContext('2d')!;
    drawLogo(src, getActiveLogoSpec(getActiveTheme()), { x: 0, y: 0, w: source.width, h: source.height });
    // Canonical marks have different silhouettes, tilts, taglines and padding.
    // Contain their complete ink bounds without stretching or changing the spec.
    let left = source.width, top = source.height, right = -1, bottom = -1;
    try {
      const pixels = src.getImageData(0, 0, source.width, source.height).data;
      for (let y = 0; y < source.height; y++) for (let x = 0; x < source.width; x++) {
        if (pixels[(y * source.width + x) * 4 + 3] < 8) continue;
        left = Math.min(left, x); right = Math.max(right, x);
        top = Math.min(top, y); bottom = Math.max(bottom, y);
      }
    } catch {
      // Pixel-read restrictions must not abort the fixture. Keep the complete
      // canonical painting when its alpha bounds cannot be inspected.
      left = top = 0; right = source.width - 1; bottom = source.height - 1;
    }
    canvas.width = 512;
    const out = canvas.getContext('2d')!;
    out.clearRect(0, 0, canvas.width, canvas.height);
    if (right >= left && bottom >= top) {
      const w = right - left + 1, h = bottom - top + 1;
      const fit = Math.min((canvas.width - 4) / w, (canvas.height - 4) / h);
      out.drawImage(source, left, top, w, h,
        (canvas.width - w * fit) / 2, (canvas.height - h * fit) / 2, w * fit, h * fit);
    }
    texture.needsUpdate = true; render();
  };
  const refresh = () => {
    const current = ++generation;
    const spec = getActiveLogoSpec(getActiveTheme());
    const imageSrc = spec.shape === 'image' ? spec.imageSrc : undefined;
    if (!imageSrc || brandImage(imageSrc)) paint();
    // Both live image edits and pack fonts use the canonical readiness caches.
    // Late callbacks must not revive a fixture or overwrite a newer brand edit.
    void Promise.all([bundledFontsReady(),
      imageSrc ? ensureBrandImage(imageSrc) : Promise.resolve()]).then(() => {
      if (!disposed && current === generation) paint();
    });
  };
  const unsubscribe = onBrandChange(refresh);
  refresh();

  return {
    attach(model: THREE.Group): void {
      if (disposed) return;
      model.updateWorldMatrix(true, true);
      const inverse = model.matrixWorld.clone().invert();
      const surfaces: THREE.Mesh[] = [];
      const bounds = new THREE.Box3();
      const point = new THREE.Vector3();
      model.traverse(object => {
        if (!(object instanceof THREE.Mesh)) return;
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        if (!materials.includes(clear)) return;
        // Temporary raycast views use authoring-space transforms and borrow geometry.
        // This also excludes the parent placement's rotation and runtime scale.
        const surface = new THREE.Mesh(object.geometry, clear);
        surface.matrixAutoUpdate = false;
        surface.matrix.multiplyMatrices(inverse, object.matrixWorld);
        surface.updateMatrixWorld(true);
        surfaces.push(surface);
        const positions = object.geometry.getAttribute('position');
        for (let i = 0; i < positions.count; i++) {
          point.fromBufferAttribute(positions, i).applyMatrix4(surface.matrix);
          if (point.y > UPPER_SHELL_Y) bounds.expandByPoint(point);
        }
      });
      if (bounds.isEmpty()) return;
      const width = (bounds.max.x - bounds.min.x) * WIDTH_FRACTION;
      const height = width / PRINT_ASPECT;
      const cx = (bounds.min.x + bounds.max.x) / 2;
      const cy = (bounds.min.y + bounds.max.y) / 2;
      const geometry = new THREE.PlaneGeometry(width, height, 24, 16);
      const positions = geometry.getAttribute('position');
      const ray = new THREE.Raycaster(); ray.ray.direction.set(0, 0, -1);
      const normalMatrix = new THREE.Matrix3();
      const normal = new THREE.Vector3();
      for (let i = 0; i < positions.count; i++) {
        ray.ray.origin.set(cx + positions.getX(i), cy + positions.getY(i), bounds.max.z + 1);
        const hit = ray.intersectObjects(surfaces, false)[0];
        // An unsupported custom shell must not leave a floating partial sticker.
        if (!hit?.face) { geometry.dispose(); return; }
        normalMatrix.getNormalMatrix(hit.object.matrixWorld);
        normal.copy(hit.face.normal).applyNormalMatrix(normalMatrix);
        if (normal.z < 0) normal.negate();
        point.copy(hit.point).addScaledVector(normal, .002);
        positions.setXYZ(i, point.x, point.y, point.z);
      }
      positions.needsUpdate = true;
      geometry.computeVertexNormals(); geometry.computeBoundingSphere();
      const decal = markSignMesh(new THREE.Mesh(geometry, material));
      decal.name = 'gumball-store-logo';
      model.add(decal); decals.push(decal);
      const forget = () => {
        decal.removeFromParent();
        const index = decals.indexOf(decal);
        if (index >= 0) decals.splice(index, 1);
        geometry.removeEventListener('dispose', forget);
      };
      // Detail preparation can fail and release its geometry before the fixture.
      geometry.addEventListener('dispose', forget);
    },
    dispose(): void {
      disposed = true; generation++; unsubscribe();
      for (const decal of [...decals]) decal.geometry.dispose();
      decals.length = 0;
      material.dispose(); texture.dispose();
      source.width = source.height = canvas.width = canvas.height = 1;
    },
  };
}
