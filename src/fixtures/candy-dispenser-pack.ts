// Original generic blister packs attached to the existing queue rack (#278).
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { assetUrl } from '../asset-url';
import type { FixtureContext } from '../fixtures';
import { getActiveTheme } from '../themes';
import { getActiveLogoSpec } from '../logo-spec';
import { drawLogo } from '../logo-renderer';
import { BB_ARCHIVO_BLACK, ensureBundledFont } from '../bundled-fonts';
import { ensureWrapFontsLoaded } from '../logo-wrap';

/** Fits inside the host's footprint; local pack front +Z turns toward rack +X. */
export function installCandyDispenserPacks(
  ctx: FixtureContext, parent: THREE.Group, width: number, depth: number,
): () => void {
  let disposed = false;
  const root = new THREE.Group(); root.name = 'candy-dispenser-supplier-panel'; parent.add(root);
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const instances = new Set<THREE.InstancedMesh>();
  const theme = getActiveTheme(), spec = getActiveLogoSpec(theme);
  const canvas = document.createElement('canvas'); canvas.width = 256; canvas.height = 704;
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; texture.flipY = false;
  const paint = () => {
    const c = canvas.getContext('2d')!;
    c.fillStyle = theme.palette.primary; c.fillRect(0, 0, 256, 704);
    drawLogo(c, spec, { x: 12, y: 66, w: 232, h: 58 });
    c.fillStyle = theme.palette.secondary;
    c.font = `24px ${BB_ARCHIVO_BLACK}, sans-serif`; c.textAlign = 'center';
    c.fillText('CANDY', 128, 670);
    for (let i = 0; i < 5; i++) c.fillRect(16 + i * 49, 150, 12, 470);
    texture.needsUpdate = true;
  };
  paint();
  void Promise.all([new Promise<void>(resolve => ensureBundledFont(BB_ARCHIVO_BLACK, resolve)),
    new Promise<void>(resolve => ensureWrapFontsLoaded(spec, resolve))]).then(() => {
    if (!disposed) { paint(); ctx.requestRender(); }
  }).catch(() => { /* Initial house-color print remains usable offline. */ });
  const roles: Record<string, THREE.Material> = {
    PackCard: new THREE.MeshStandardMaterial({ map: texture, roughness: .82 }),
    DispenserStem: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: .28 }),
    DispenserCap: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: .25 }),
    HingeDetail: new THREE.MeshStandardMaterial({ color: 0x30343a, roughness: .5 }),
    // Alpha avoids a full-scene transmission pass for these tiny store props.
    ClearBlister: new THREE.MeshPhysicalMaterial({ color: 0xddeeff, transparent: true, opacity: .23,
      roughness: .14, metalness: .05, clearcoat: 1, depthWrite: false, side: THREE.FrontSide }),
  };
  Object.entries(roles).forEach(([name, mat]) => { mat.name = name; materials.add(mat); });
  const board = new THREE.MeshStandardMaterial({ color: theme.palette.primary, roughness: .85 });
  const steel = new THREE.MeshStandardMaterial({ color: 0x555961, metalness: .75, roughness: .35 });
  materials.add(board); materials.add(steel);
  const boxes = new Map<string, { geo: THREE.BoxGeometry; mat: THREE.Material; positions: number[][] }>();
  function box(name: string, size: number[], position: number[], material: THREE.Material) {
    if (!boxes.has(name)) {
      const geo = new THREE.BoxGeometry(...size as [number, number, number]); geometries.add(geo);
      boxes.set(name, { geo, mat: material, positions: [] });
    }
    boxes.get(name)!.positions.push(position);
  }
  const cardX = width / 2 - .065;
  box('Supplier backing board', [.012, 3.05, depth * .84], [cardX - .007, 2.34, 0], board);
  // Four metal clamp straps connect the backing to the rack side hoop.
  for (const y of [1, 3.65]) for (const z of [-depth * .4, depth * .4]) {
    box('Hoop clamp strap', [.036, .045, .10], [cardX - .014, y, z], steel);
    box('Clamp return', [.06, .045, .014], [cardX - .027, y, z], steel);
  }
  const anchors: THREE.Matrix4[] = [];
  for (let row = 0; row < 4; row++) for (let col = 0; col < 3; col++) {
    const y = .92 + row * .73, z = (col - 1) * depth * .28;
    anchors.push(new THREE.Matrix4().makeRotationY(Math.PI / 2).setPosition(cardX, y, z));
    box('Peg through card hole', [.061, .008, .008], [cardX + .008, y + .550, z], steel);
    box('Peg upturned tip', [.008, .025, .008], [cardX + .035, y + .558, z], steel);
  }
  for (const [name, { geo, mat, positions }] of boxes) {
    const mesh = new THREE.InstancedMesh(geo, mat, positions.length); instances.add(mesh); mesh.name = name;
    positions.forEach((p, i) => mesh.setMatrixAt(i, new THREE.Matrix4().makeTranslation(...p as [number, number, number])));
    mesh.instanceMatrix.needsUpdate = true; mesh.castShadow = mesh.receiveShadow = true; root.add(mesh);
  }
  function repeat(group: THREE.Group, geo: THREE.BufferGeometry, role: string, local = new THREE.Matrix4()) {
    geometries.add(geo);
    const mesh = new THREE.InstancedMesh(geo, roles[role], anchors.length);
    instances.add(mesh); mesh.name = role; mesh.castShadow = role !== 'ClearBlister'; mesh.receiveShadow = true;
    anchors.forEach((anchor, i) => {
      mesh.setMatrixAt(i, anchor.clone().multiply(local));
      if (role === 'DispenserStem' || role === 'DispenserCap') {
        mesh.setColorAt(i, new THREE.Color([theme.palette.primary, theme.palette.secondary, '#e9e3d1'][(i + (role === 'DispenserCap' ? 1 : 0)) % 3]));
      }
    });
    mesh.instanceMatrix.needsUpdate = true; group.add(mesh);
  }
  const fallback = new THREE.Group(); fallback.name = 'candy-dispenser-fallback'; root.add(fallback);
  // Volumetric fallback retains the dispenser silhouette when the GLB is unavailable.
  for (const [role, size, pos] of [
    ['PackCard', [.2083, .5833, .002], [0, .29165, 0]],
    ['DispenserStem', [.056, .335, .038], [0, .231, .030]],
    ['DispenserCap', [.086, .055, .049], [0, .438, .031]],
    ['ClearBlister', [.16, .438, .064], [0, .256, .033]],
  ] as [string, number[], number[]][]) {
    const geo = new THREE.BoxGeometry(...size as [number, number, number]);
    geo.translate(...pos as [number, number, number]);
    if (role === 'PackCard') {
      const uv = geo.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setY(i, 1 - uv.getY(i));
    }
    repeat(fallback, geo, role);
  }
  void new GLTFLoader().loadAsync(assetUrl('models/candy-dispenser-pack.glb')).then(gltf => {
    const importedGeometries = new Set<THREE.BufferGeometry>(), importedMaterials = new Set<THREE.Material>();
    gltf.scene.updateMatrixWorld(true);
    gltf.scene.traverse(o => {
      if (!(o instanceof THREE.Mesh)) return;
      importedGeometries.add(o.geometry);
      (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => importedMaterials.add(m));
    });
    importedMaterials.forEach(m => m.dispose()); // Runtime owns the replaceable house finishes.
    if (disposed || parent.parent !== ctx.scene) { importedGeometries.forEach(g => g.dispose()); return; }
    const model = new THREE.Group(); model.name = 'candy-dispenser-model';
    gltf.scene.traverse(o => {
      if (!(o instanceof THREE.Mesh)) return;
      const role = (Array.isArray(o.material) ? o.material[0] : o.material).name;
      repeat(model, o.geometry, role, o.matrixWorld);
    });
    root.add(model); fallback.visible = false;
    ctx.requestShadowRefresh(); ctx.requestRender();
  }).catch(() => { if (!disposed) ctx.log('Candy dispenser model unavailable; using built-in packs.', 'system'); });
  return () => {
    disposed = true; root.removeFromParent();
    instances.forEach(m => m.dispose()); geometries.forEach(g => g.dispose());
    materials.forEach(m => m.dispose()); texture.dispose();
  };
}
