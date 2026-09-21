import * as THREE from 'three';
import { BB_ARCHIVO_BLACK, ensureBundledFont } from '../bundled-fonts';
import { onBrandChange } from '../brand-live';
import { getActiveTheme } from '../themes';
import { markSignMesh } from '../sign-builders';

/** Original printed cards identifying the modeled VHS head-cleaning cassettes.
 * Both faces read forwards; the mast ends below the header's print area. */
export function merchandiserLabels(own: <T extends { dispose(): void }>(value: T) => T, render: () => void) {
  let disposed = false;
  const header = document.createElement('canvas'); header.width = 840; header.height = 280;
  const pack = document.createElement('canvas'); pack.width = 256; pack.height = 96;
  const headerTex = own(new THREE.CanvasTexture(header));
  const packTex = own(new THREE.CanvasTexture(pack));
  for (const texture of [headerTex, packTex]) { texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = 4; }
  const paint = () => {
    if (disposed) return;
    const palette = getActiveTheme().palette;
    const h = header.getContext('2d')!;
    h.fillStyle = palette.primary; h.fillRect(0, 0, 840, 280);
    h.fillStyle = palette.secondary; h.textAlign = 'center'; h.textBaseline = 'middle';
    h.font = `82px "${BB_ARCHIVO_BLACK}"`;
    h.fillText('VHS HEAD', 420, 84, 780); h.fillText('CLEANERS', 420, 193, 780);
    const p = pack.getContext('2d')!;
    p.clearRect(0, 0, 256, 96); p.fillStyle = '#111820';
    p.textAlign = 'center'; p.textBaseline = 'middle'; p.font = `36px "${BB_ARCHIVO_BLACK}"`;
    p.fillText('VHS', 128, 26, 246); p.fillText('CLEANER', 128, 70, 246);
    headerTex.needsUpdate = packTex.needsUpdate = true; render();
  };
  const headerMat = own(new THREE.MeshStandardMaterial({ map: headerTex, roughness: .65 }));
  const packMat = own(new THREE.MeshStandardMaterial({ map: packTex, alphaTest: .4, roughness: .65 }));
  const headerGeo = own(new THREE.PlaneGeometry(1.38, .48));
  const packGeo = own(new THREE.PlaneGeometry(.32, .10));
  const unsubscribe = onBrandChange(paint);
  own({ dispose() { disposed = true; unsubscribe(); } });
  paint(); ensureBundledFont(BB_ARCHIVO_BLACK, paint);
  return (root: THREE.Group, packages: boolean) => {
    const label = (geo: THREE.BufferGeometry, mat: THREE.Material, name: string, x: number, y: number, z: number, side: number) => {
      const mesh = markSignMesh(new THREE.Mesh(geo, mat)); mesh.name = name;
      mesh.position.set(x, y, z); mesh.rotation.y = side > 0 ? 0 : Math.PI;
      root.add(mesh);
    };
    for (const side of [-1, 1]) {
      label(headerGeo, headerMat, 'VHS head cleaners header', 0, 4.96, side * .009, side);
      if (packages) for (const y of [1.60, 2.30, 3.00, 3.70]) for (const x of [-.50, 0, .50]) {
        label(packGeo, packMat, 'VHS cleaner package print', x, y - .068, side * .309, side);
      }
    }
  };
}
