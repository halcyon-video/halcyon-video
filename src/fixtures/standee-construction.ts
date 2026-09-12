// Generic rear construction, independently owned by one seasonal header.
// Artwork stays on the existing alpha-tested faces; only its cut edge is traced.
import * as THREE from 'three';
import { canvasAlphaField, traceAlphaContours, simplifyLoop } from '../alpha-trace';
import type { FixtureContext } from '../fixtures';
import { installDisplayModel } from './display-model';

export function installStandeeConstruction(
  ctx: FixtureContext, kit: THREE.Group, width: number, height: number, base: number,
  image: CanvasImageSource,
): { update: (image: CanvasImageSource) => void; dispose: () => void } {
  const root = new THREE.Group();
  root.name = 'standee-construction';
  root.position.y = base;
  kit.add(root);
  const fallback = new THREE.Group();
  root.add(fallback); // The existing two printed planes remain the load-error fallback.
  const disposeModel = installDisplayModel(ctx, root, fallback,
    'models/standee-support-header.glb', {});
  const edgeMaterial = new THREE.MeshStandardMaterial({
    color: 0xffffff, vertexColors: true, roughness: .96,
  });
  const edge = new THREE.Mesh(new THREE.BufferGeometry(), edgeMaterial);
  edge.name = 'CorrugatedSilhouetteEdge';
  edge.castShadow = false; // Keep the existing cutout's shadow convention.
  root.add(edge);
  let disposed = false;
  const update = (source: CanvasImageSource) => {
    if (disposed) return;
    const canvas = document.createElement('canvas');
    // A transparent apron closes contours even when art touches its image edge.
    const w = 256, h = Math.round(w * height / width);
    canvas.width = w + 4; canvas.height = h + 4;
    const c = canvas.getContext('2d')!;
    try { c.drawImage(source, 2, 2, w, h); } catch { return; }
    const field = canvasAlphaField(canvas);
    const positions: number[] = [], colors: number[] = [], uvs: number[] = [];
    if (field) {
      for (const raw of traceAlphaContours(field.alpha, field.w, field.h, 127.5)) {
        const loop = simplifyLoop(raw, .65);
        const point = (p: { x: number; y: number }) => new THREE.Vector2(
          ((p.x - 2 + .5) / w - .5) * width,
          (1 - (p.y - 2 + .5) / h) * height,
        );
        let distance = 0;
        for (let i = 0; i < loop.length; i++) {
          const a = point(loop[i]), b = point(loop[(i + 1) % loop.length]);
          const length = a.distanceTo(b);
          // Thin liners enclose a darker corrugated core. No backing rectangle.
          const bands = [-.006, -.0045, .0045, .006];
          for (let band = 0; band < 3; band++) {
            const lo = bands[band], hi = bands[band + 1];
            for (const [p, z, u] of [[a, lo, distance], [b, lo, distance + length], [b, hi, distance + length],
              [a, lo, distance], [b, hi, distance + length], [a, hi, distance]] as const) {
              positions.push(p.x, p.y, z); uvs.push(u, (z + .006) / .012);
              const color = new THREE.Color(band === 1 ? 0x79532d : 0xc3a372);
              colors.push(color.r, color.g, color.b);
            }
          }
          distance += length;
        }
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.computeVertexNormals();
    // Marching-squares loops can arrive in either winding; sides must read both ways.
    edgeMaterial.side = THREE.DoubleSide;
    edge.geometry.dispose(); edge.geometry = geometry;
    ctx.requestRender();
  };
  update(image);
  return { update, dispose: () => {
    if (disposed) return;
    disposed = true; disposeModel();
    edge.geometry.dispose(); edgeMaterial.dispose(); root.removeFromParent();
  } };
}
