// Eight-foot Blender sections fitted to wall-run anchors. Catalog dividers
// remain at their existing positions; construction joints are independent.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { assetUrl } from './asset-url.ts';
import { disposeDetachedModel } from './model-resources.ts';

interface Run {
  parent: THREE.Group;
  length: number;
  fallback: THREE.Mesh[];
  panels: number[];
}

/** One request per build; keep collision proxies and the full fallback until
 * the complete model is ready. Geometry disposal cancels a retired build. */
export class NrWallModelBatch {
  private runs: Run[] = [];
  add(parent: THREE.Group, length: number, fallback: THREE.Mesh[], panels: number[]): void {
    this.runs.push({ parent, length, fallback, panels });
  }
  finish(wake: () => void): void {
    const runs = this.runs.splice(0);
    if (!runs.length) return;
    let retired = false;
    const cancel = () => { retired = true; };
    const proxies = new Set(runs.flatMap(r => r.fallback.map(m => m.geometry)));
    proxies.forEach(g => g.addEventListener('dispose', cancel));
    const unlisten = () => proxies.forEach(g => g.removeEventListener('dispose', cancel));
    new GLTFLoader().load(assetUrl('models/new-release-wall.glb'), ({ scene }) => {
      const templates = new Map<string, THREE.Mesh>();
      scene.updateMatrixWorld(true);
      scene.traverse(o => { if (o instanceof THREE.Mesh) templates.set(o.name, o); });
      const required = ['Backing', 'Toe', 'LeftEnd', 'RightEnd',
        ...Array.from({ length: 8 }, (_, i) => [`Deck_${i}`, `HighBack_${i}`]).flat()];
      const pending: { run: Run; model: THREE.Group }[] = [];
      const loosePieces = new Set<THREE.BufferGeometry>();
      try {
        if (retired || required.some(n => !templates.has(n))) return;
        for (const run of runs) {
          if (!run.parent.parent) continue;
          const byMaterial = new Map<THREE.Material, THREE.BufferGeometry[]>();
          const stamp = (name: string, width: number, x: number) => {
            const source = templates.get(name)!;
            const g = source.geometry.clone().applyMatrix4(source.matrixWorld);
            loosePieces.add(g);
            const pos = g.getAttribute('position');
            for (let i = 0; i < pos.count; i++) {
              // End panels keep physical thickness; deck/back sections have
              // a 1/16 inch joint. Only the last section is cut to fit the run.
              pos.setX(i, name === 'LeftEnd'
                ? pos.getX(i) + 3.96875 + x
                : pos.getX(i) * (width - .005) / 7.875 + x);
            }
            g.computeBoundingBox(); g.computeBoundingSphere();
            const mat = source.material as THREE.Material;
            if (!byMaterial.has(mat)) byMaterial.set(mat, []);
            byMaterial.get(mat)!.push(g);
          };
          for (let start = 0; start < run.length; start += 8) {
            const width = Math.min(8, run.length - start);
            const x = -run.length / 2 + start + width / 2;
            for (const name of required) if (!name.endsWith('End')) stamp(name, width, x);
          }
          run.panels.forEach(x => stamp('LeftEnd', .0625, x));
          const model = new THREE.Group(); model.name = 'modeled-new-release-wall';
          pending.push({ run, model });
          for (const [material, pieces] of byMaterial) {
            const geometry = mergeGeometries(pieces);
            pieces.forEach(g => { g.dispose(); loosePieces.delete(g); });
            if (!geometry) throw new Error('Could not merge New Release section');
            // Each run owns its finishes through normal scene teardown.
            const mesh = new THREE.Mesh(geometry, material.clone());
            mesh.name = material.name; mesh.castShadow = mesh.receiveShadow = true;
            model.add(mesh);
          }
        }
        for (const { run, model } of pending) {
          run.parent.add(model);
          run.fallback.forEach(m => { m.visible = false; m.name = 'new-release-collision-proxy'; });
        }
        wake();
      } catch (error) {
        pending.forEach(({ model }) => { model.removeFromParent(); disposeDetachedModel(model); });
        runs.forEach(r => r.fallback.forEach(m => { m.visible = true; }));
        console.warn('New Release model unavailable; keeping built-in shelving.', error);
      } finally {
        loosePieces.forEach(g => g.dispose());
        unlisten(); disposeDetachedModel(scene);
      }
    }, undefined, unlisten);
  }
}
