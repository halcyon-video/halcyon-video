// Original folded bulk-tray wing; host retains stock, collider and catalog IDs.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { assetUrl } from '../asset-url';
import type { FixtureContext } from '../fixtures';

export function installCandyPowerWing(ctx: FixtureContext, parent: THREE.Group, fallback: THREE.Group): () => void {
  let disposed = false;
  let model: THREE.Group | undefined;
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();
  const release = () => {
    model?.removeFromParent();
    geometries.forEach(g => g.dispose()); geometries.clear();
    materials.forEach(m => m.dispose()); materials.clear();
    textures.forEach(t => t.dispose()); textures.clear();
  };
  void new GLTFLoader().loadAsync(assetUrl('models/candy-power-wing.glb')).then(gltf => {
    model = gltf.scene;
    model.traverse(o => {
      if (!(o instanceof THREE.Mesh)) return;
      geometries.add(o.geometry);
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
        materials.add(m);
        for (const value of Object.values(m)) if (value instanceof THREE.Texture) textures.add(value);
      }
      o.castShadow = o.receiveShadow = true;
    });
    if (disposed || parent.parent !== ctx.scene) { release(); return; }
    const header = model.getObjectByName('HeaderPrint') as THREE.Mesh;
    const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 128;
    const c = canvas.getContext('2d')!;
    c.fillStyle = '#e8ca83'; c.fillRect(0, 0, 512, 128);
    c.fillStyle = '#59462e'; c.textAlign = 'center'; c.font = 'bold 50px sans-serif';
    c.fillText('MOVIE NIGHT', 256, 59); c.font = '24px sans-serif'; c.fillText('SWEET TREATS', 256, 101);
    const print = new THREE.CanvasTexture(canvas); print.colorSpace = THREE.SRGBColorSpace; print.flipY = false; textures.add(print);
    const finish = (header.material as THREE.MeshStandardMaterial).clone();
    finish.color.set(0xffffff);
    finish.map = print;
    finish.emissiveMap = print;
    finish.emissive.set(0xffffff);
    finish.emissiveIntensity = 0.55;
    finish.roughness = 0.7;
    materials.add(finish); header.material = finish;

    // Display glow downlight illuminating the candy stock trays
    const displayGlow = new THREE.PointLight(0xfff0d0, 10, 5, 2);
    displayGlow.position.set(0, 3.85, 0.45);
    displayGlow.name = 'candy-power-wing-glow';
    model.add(displayGlow);

    model.name = 'candy-power-wing-model'; parent.add(model); fallback.visible = false;
    ctx.requestShadowRefresh(); ctx.requestRender();
  }).catch(() => {
    release();
    if (!disposed) ctx.log('Candy power wing unavailable; using built-in rack.', 'system');
  });
  return () => { disposed = true; release(); };
}
