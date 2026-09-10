// The embedded bake receiver transfers geometry-derived occlusion to the real
// worktop. No overlay, additional draw, lighting change or per-frame pass.
import * as THREE from 'three';
import { refreshEquipmentContact } from './counter-equipment-contact.ts';

export function finishTelephone(model: THREE.Group): THREE.Texture | null {
  addGrain(model);
  const receiver = model.getObjectByName('TelephoneContactBake') as THREE.Mesh | undefined;
  if (!receiver) return null;
  const material = receiver.material as THREE.MeshStandardMaterial;
  const contact = material.map;
  receiver.removeFromParent();
  receiver.geometry.dispose();
  material.dispose();
  if (contact) {
    contact.colorSpace = THREE.NoColorSpace;
    contact.wrapS = contact.wrapT = THREE.ClampToEdgeWrapping;
    contact.channel = 2;
  }
  return contact;
}

export function applyTelephoneContact(model: THREE.Group, counter: THREE.Object3D, texture: THREE.Texture): () => void {
  model.updateWorldMatrix(true, true);
  counter.updateWorldMatrix(true, true);
  const inverse = model.matrixWorld.clone().invert();
  const p = new THREE.Vector3();
  const restore: Array<() => void> = [];
  counter.traverse(object => {
    if (!(object instanceof THREE.Mesh) || !object.userData.telephoneContactReceiver) return;
    const position = object.geometry.attributes.position;
    const uv = new Float32Array(position.count * 2);
    const toPhone = inverse.clone().multiply(object.matrixWorld);
    for (let i = 0; i < position.count; i++) {
      p.fromBufferAttribute(position, i).applyMatrix4(toPhone);
      // The bake receiver is horizontal at the feet; do not project its
      // silhouette down the cabinet's vertical edges or onto lower shelves.
      const receives = object.geometry.attributes.normal.getY(i) > 0.9 && Math.abs(p.y) < 0.01;
      uv[i * 2] = receives ? p.x / 1.5 + 0.5 : 0;
      uv[i * 2 + 1] = receives ? p.z / 1.5 + 0.5 : 0;
    }
    const originalUV = object.geometry.getAttribute('uv2');
    const originalMaterial = object.material;
    object.geometry.setAttribute('uv2', new THREE.BufferAttribute(uv, 2));
    const finish = (original: THREE.Material) => {
      const material = original.clone() as THREE.MeshStandardMaterial;
      material.aoMap = texture;
      material.needsUpdate = true;
      return material;
    };
    object.material = Array.isArray(object.material) ? object.material.map(finish) : finish(object.material);
    const owned = Array.isArray(object.material) ? object.material : [object.material];
    restore.push(() => {
      object.material = originalMaterial;
      if (originalUV) object.geometry.setAttribute('uv2', originalUV);
      else object.geometry.deleteAttribute('uv2');
      owned.forEach(material => material.dispose());
    });
  });
  return () => { restore.splice(0).forEach(cleanup => cleanup()); };
}

export function refreshTelephoneContact(parent: THREE.Object3D): void {
  let root = parent;
  while (root.parent) root = root.parent;
  // Keep the original single-phone projection and cost in the public store.
  if (root.getObjectByName('counter-cash-housing-model')?.userData.contactTexture) {
    refreshEquipmentContact(parent);
    return;
  }
  const phone = root.getObjectByName('counter-telephone-model') as THREE.Group | undefined;
  const counter = root.getObjectByName('checkout-counter-model');
  if (!phone || !counter || counter.userData.telephoneContactApplied) return;
  const texture = phone.userData.contactTexture as THREE.Texture | undefined;
  if (!texture) return;
  const cleanup = applyTelephoneContact(phone, counter, texture);
  phone.userData.contactCleanup = () => {
    cleanup();
    counter.userData.telephoneContactApplied = false;
  };
  counter.userData.telephoneContactApplied = true;
}

function addGrain(model: THREE.Group): void {
  const finishes: Record<string, number> = {PhoneHousing: .4, PhoneHandset: .3, PhoneKeys: .43, PhoneRubber: .82, PhoneLegend: .48};
  let grain: THREE.DataTexture | undefined;
  const treated = new Set<THREE.Material>();
  model.traverse(object => {
    if (!(object instanceof THREE.Mesh)) return;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    const eligible = materials.filter((m): m is THREE.MeshStandardMaterial =>
      m instanceof THREE.MeshStandardMaterial && m.name in finishes &&
      !m.map && !m.normalMap && !m.roughnessMap && (!m.bumpMap || treated.has(m)));
    if (!eligible.length) return;

    if (!grain) {
      // One tile = 0.1 ft (30.48 mm); one texel = 0.238 mm. Deterministic,
      // neutral height noise changes the reflected light, never the albedo.
      const data = new Uint8Array(128 * 128 * 4);
      let seed = 296;
      for (let i = 0; i < data.length; i += 4) {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        const height = 96 + (seed >>> 26);
        data.set([height, height, height, 255], i);
      }
      grain = new THREE.DataTexture(data, 128, 128);
      grain.name = 'Telephone molded grain';
      grain.channel = 1;
      grain.wrapS = grain.wrapT = THREE.RepeatWrapping;
      grain.magFilter = THREE.LinearFilter;
      grain.minFilter = THREE.LinearMipmapLinearFilter;
      grain.generateMipmaps = true;
      grain.needsUpdate = true;
    }
    // Keep the exported UVs intact. Project the extra grain UV in local feet,
    // avoiding smart-packed islands making a key's grain larger than the shell's.
    const { position, normal } = object.geometry.attributes;
    const uv = new Float32Array(position.count * 2);
    for (let i = 0; i < position.count; i++) {
      const x = Math.abs(normal.getX(i)), y = Math.abs(normal.getY(i)), z = Math.abs(normal.getZ(i));
      uv[i * 2] = (x > y && x > z ? position.getZ(i) : position.getX(i)) * 10;
      uv[i * 2 + 1] = (y >= x && y >= z ? position.getZ(i) : position.getY(i)) * 10;
    }
    object.geometry.setAttribute('uv1', new THREE.BufferAttribute(uv, 2));
    for (const material of eligible) {
      material.roughness = finishes[material.name];
      material.metalness = 0;
      material.bumpMap = grain;
      material.bumpScale = material.name === 'PhoneRubber' ? 0.0003 : 0.00015;
      material.needsUpdate = true;
      treated.add(material);
    }
  });
}
