// Molded finish for counter equipment, in local feet. Authored colour, normal
// maps, screen materials and glass remain authoritative. No per-frame work.
import * as THREE from 'three';

export function finishEquipmentSurfaces(root: THREE.Object3D, mapped = false): THREE.Texture[] {
  const textures: THREE.Texture[] = [];
  let grain: THREE.DataTexture | undefined;
  let rough: THREE.DataTexture | undefined;
  const treated = new Set<THREE.Material>();
  root.traverse(object => {
    if (!(object instanceof THREE.Mesh)) return;
    const list = Array.isArray(object.material) ? object.material : [object.material];
    const eligible = list.filter((m): m is THREE.MeshStandardMaterial =>
      m instanceof THREE.MeshStandardMaterial && !m.transparent &&
      !m.userData.lightingRole && !m.emissive.getHex() && m.metalness < .5 &&
      m.roughness >= .35 && (!m.roughnessMap || treated.has(m)) &&
      (mapped || (!m.map && !m.normalMap)));
    if (!eligible.length) return;
    if (!grain) {
      const height = new Uint8Array(128 * 128 * 4);
      const finish = new Uint8Array(height.length);
      let seed = 296;
      for (let i = 0; i < height.length; i += 4) {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        const v = seed >>> 26;
        height.set([96 + v, 96 + v, 96 + v, 255], i);
        finish.set([210 + (v >> 1), 210 + (v >> 1), 210 + (v >> 1), 255], i);
      }
      const make = (data: Uint8Array, name: string) => {
        const tex = new THREE.DataTexture(data, 128, 128);
        tex.name = name; tex.channel = 1;
        tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
        tex.magFilter = THREE.LinearFilter; tex.minFilter = THREE.LinearMipmapLinearFilter;
        tex.generateMipmaps = true; tex.needsUpdate = true;
        textures.push(tex);
        return tex;
      };
      grain = make(height, 'Counter equipment micrograin');
      rough = make(finish, 'Counter equipment finish variation');
    }
    const { position, normal } = object.geometry.attributes;
    const uv = new Float32Array(position.count * 2);
    for (let i = 0; i < position.count; i++) {
      const x = Math.abs(normal.getX(i)), y = Math.abs(normal.getY(i)), z = Math.abs(normal.getZ(i));
      uv[i * 2] = (x > y && x > z ? position.getZ(i) : position.getX(i)) * 10;
      uv[i * 2 + 1] = (y >= x && y >= z ? position.getZ(i) : position.getY(i)) * 10;
    }
    object.geometry.setAttribute('uv1', new THREE.BufferAttribute(uv, 2));
    for (const m of eligible) {
      if (treated.has(m)) continue;
      if (!m.normalMap && !m.bumpMap) {
        m.bumpMap = grain;
        m.bumpScale = m.roughness > .8 ? .0001 : .0003;
      }
      m.roughnessMap = rough!;
      // Map average ~0.88; retain the intended broad highlight width.
      m.roughness = Math.min(1, m.roughness / .88);
      m.metalness = 0;
      m.needsUpdate = true;
      treated.add(m);
    }
  });
  return textures;
}
