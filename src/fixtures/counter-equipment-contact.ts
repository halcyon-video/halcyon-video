// Combine geometry-baked equipment occlusion on the actual worktop. This extends
// the telephone's receiver projection to multiple props without replacing its AO.
// One small atlas, no extra mesh/draw or per-frame work; works with mobile AO off.
import * as THREE from 'three';

export function refreshEquipmentContact(parent: THREE.Object3D): void {
  let root = parent;
  while (root.parent) root = root.parent;
  const counter = root.getObjectByName('checkout-counter-model');
  if (!counter) return;
  const sources = ['counter-telephone-model', 'counter-cash-housing-model']
    .map(name => root.getObjectByName(name))
    .filter((model): model is THREE.Object3D => !!model?.userData.contactTexture);
  if (!sources.length) return;
  counter.userData.equipmentContactCleanup?.();
  // Retire the original single-phone receiver if it arrived first.
  sources.forEach(model => model.userData.contactCleanup?.());
  root.updateMatrixWorld(true);
  const receivers: THREE.Mesh[] = [];
  const bounds = new THREE.Box3();
  counter.traverse(object => {
    if (object instanceof THREE.Mesh && object.userData.telephoneContactReceiver) {
      receivers.push(object); bounds.expandByObject(object);
    }
  });
  if (!receivers.length) return;
  const width = bounds.max.x - bounds.min.x, depth = bounds.max.z - bounds.min.z;
  if (!width || !depth) return;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 512;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, 512, 512);
  ctx.globalCompositeOperation = 'multiply';
  for (const model of sources) {
    const texture = model.userData.contactTexture as THREE.Texture;
    const w = Number(model.userData.contactWidth ?? 1.5);
    const d = Number(model.userData.contactDepth ?? 1.5);
    const e = model.matrixWorld.elements;
    const x = 512 / width, z = 512 / depth;
    ctx.setTransform(e[0] * w * x, e[2] * w * z, e[8] * d * x, e[10] * d * z,
      (e[12] - bounds.min.x - e[0] * w / 2 - e[8] * d / 2) * x,
      (e[14] - bounds.min.z - e[2] * w / 2 - e[10] * d / 2) * z);
    ctx.drawImage(texture.image as CanvasImageSource, 0, 0, 1, 1);
  }
  const atlas = new THREE.CanvasTexture(canvas);
  atlas.name = 'Counter equipment contact AO';
  atlas.colorSpace = THREE.NoColorSpace;
  atlas.flipY = false;
  atlas.channel = 2;
  const restore: Array<() => void> = [];
  const p = new THREE.Vector3(), n = new THREE.Vector3();
  const contactHeights = sources.map(s => s.getWorldPosition(new THREE.Vector3()).y);
  for (const object of receivers) {
    const { position, normal } = object.geometry.attributes;
    const uv = new Float32Array(position.count * 2);
    for (let i = 0; i < position.count; i++) {
      p.fromBufferAttribute(position, i).applyMatrix4(object.matrixWorld);
      n.fromBufferAttribute(normal, i).transformDirection(object.matrixWorld);
      const receives = n.y > .9 && contactHeights.some(y => Math.abs(p.y - y) < .01);
      uv[i * 2] = receives ? (p.x - bounds.min.x) / width : 0;
      uv[i * 2 + 1] = receives ? (p.z - bounds.min.z) / depth : 0;
    }
    const originalUV = object.geometry.getAttribute('uv2');
    const originalMaterial = object.material;
    object.geometry.setAttribute('uv2', new THREE.BufferAttribute(uv, 2));
    const finish = (original: THREE.Material) => {
      const material = original.clone() as THREE.MeshStandardMaterial;
      material.aoMap = atlas; material.needsUpdate = true;
      return material;
    };
    object.material = Array.isArray(originalMaterial) ? originalMaterial.map(finish) : finish(originalMaterial);
    const owned = Array.isArray(object.material) ? object.material : [object.material];
    restore.push(() => {
      object.material = originalMaterial;
      if (originalUV) object.geometry.setAttribute('uv2', originalUV);
      else object.geometry.deleteAttribute('uv2');
      owned.forEach(material => material.dispose());
    });
  }
  let disposed = false;
  const cleanup = () => {
    if (disposed) return;
    disposed = true;
    restore.splice(0).forEach(fn => fn());
    atlas.dispose();
    counter.removeEventListener('removed', cleanup);
    delete counter.userData.equipmentContactCleanup;
    sources.forEach(model => { if (model.userData.contactCleanup === cleanup) delete model.userData.contactCleanup; });
  };
  counter.userData.equipmentContactCleanup = cleanup;
  counter.addEventListener('removed', cleanup);
  sources.forEach(model => { model.userData.contactCleanup = cleanup; });
}

export function extractHousingContact(model: THREE.Group): THREE.Texture | null {
  const receiver = model.getObjectByName('HousingContactBake') as THREE.Mesh | undefined;
  if (!receiver) return null;
  const material = receiver.material as THREE.MeshStandardMaterial;
  const contact = material.map;
  model.userData.contactWidth = receiver.userData.contactWidth;
  model.userData.contactDepth = receiver.userData.contactDepth;
  receiver.removeFromParent(); receiver.geometry.dispose(); material.dispose();
  if (contact) { contact.colorSpace = THREE.NoColorSpace; contact.channel = 2; }
  return contact;
}
