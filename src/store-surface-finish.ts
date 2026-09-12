import * as THREE from 'three';

type Finish = 'paint' | 'metal' | 'wood' | 'paper' | 'fabric' | 'rubber';
const SCALE: Record<Finish, number> = { paint: 10, metal: 10, wood: 2, paper: 12, fabric: 8, rubber: 12 };
const DEPTH: Record<Finish, number> = { paint: .0004, metal: .00008, wood: .001, paper: .00015, fabric: .0008, rubber: .0005 };

/** Only bare, physical surfaces need a finish. Optical surfaces and authored
 * artwork/PBR maps retain their original appearance and UV channels. */
export function needsSurfaceFinish(material: THREE.Material): material is THREE.MeshStandardMaterial {
  const m = material as THREE.MeshPhysicalMaterial;
  return !!m.isMeshStandardMaterial && m.visible && !m.userData.lightingRole &&
    !m.transparent && !(m.transmission > 0) && !(m.emissive?.getHex() && m.emissiveIntensity > 0) &&
    !m.map && !m.normalMap && !m.bumpMap && !m.roughnessMap &&
    !m.clearcoatMap && !m.clearcoatNormalMap && !m.clearcoatRoughnessMap &&
    !m.sheenColorMap && !m.sheenRoughnessMap;
}

function finishKind(material: THREE.MeshStandardMaterial, object: THREE.Object3D): Finish {
  // Material roles are more specific than a containing fixture's name.
  const name = material.name || object.name;
  if (/paper|cardboard|cardstock|page|label|cork/i.test(name)) return 'paper';
  if (/wood|timber|oak|veneer|hardboard/i.test(name)) return 'wood';
  if (/fabric|cloth|curtain|canvas|upholster|rope/i.test(name)) return 'fabric';
  if (/rubber|grip|tire|tyre/i.test(name)) return 'rubber';
  return material.metalness >= .5 ? 'metal' : 'paint';
}

/** Small packed height/roughness tiles: surface relief affects reflected light,
 * never the house colour. No downloads, albedo noise, extra meshes or lights. */
function makeFinish(kind: Finish): THREE.DataTexture {
  const size = 64, data = new Uint8Array(size * size * 4);
  let seed = 912;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const noise = (seed >>> 24) / 255;
    const grain = kind === 'wood' ? .5 + .3 * Math.sin(x * .8 + Math.sin(y * .098) * 2) + noise * .2
      : kind === 'fabric' ? ((x % 4 < 2) !== (y % 4 < 2) ? .3 : .7) + noise * .15
      : kind === 'metal' ? .45 + .25 * Math.sin(y * Math.PI / 2) + noise * .15 : noise;
    const i = (y * size + x) * 4;
    data.set([Math.round(88 + grain * 80), Math.round(230 + grain * 25), 255, 255], i);
  }
  const texture = new THREE.DataTexture(data, size, size);
  texture.name = `Store ${kind} finish`;
  texture.channel = 3;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.setScalar(SCALE[kind]);
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
}

function projectFinishUV(mesh: THREE.Mesh): void {
  const geometry = mesh.geometry;
  if (geometry.hasAttribute('uv3')) return;
  const position = geometry.getAttribute('position'), normal = geometry.getAttribute('normal');
  if (!position || !normal) return;
  mesh.updateWorldMatrix(true, false);
  const scale = new THREE.Vector3().setFromMatrixScale(mesh.matrixWorld);
  const uv = new Float32Array(position.count * 2);
  for (let i = 0; i < position.count; i++) {
    const nx = Math.abs(normal.getX(i)), ny = Math.abs(normal.getY(i)), nz = Math.abs(normal.getZ(i));
    uv[i * 2] = nx > ny && nx > nz ? position.getZ(i) * scale.z : position.getX(i) * scale.x;
    uv[i * 2 + 1] = ny >= nx && ny >= nz ? position.getZ(i) * scale.z : position.getY(i) * scale.y;
  }
  geometry.setAttribute('uv3', new THREE.BufferAttribute(uv, 2));
}

/** Finish the built scene and later model arrivals. Group-add events do the
 * work once; there is no render-loop traversal. Every listener/map is owned by
 * this scene, including groups subsequently removed by a fixture rebuild. */
export function installStoreSurfaceFinishes(root: THREE.Object3D): () => void {
  const tiles = new Map<Finish, { texture: THREE.DataTexture; users: number }>();
  const materials = new Map<THREE.MeshStandardMaterial, () => void>();
  const groups = new Set<THREE.Object3D>();
  const handled = new WeakSet<THREE.Material>();
  const finish = (object: THREE.Object3D) => {
    if (!(object instanceof THREE.Mesh) || !object.geometry.hasAttribute('normal')) return;
    for (const m of Array.isArray(object.material) ? object.material : [object.material]) {
      if (handled.has(m)) { projectFinishUV(object); continue; }
      if (!needsSurfaceFinish(m)) continue;
      projectFinishUV(object);
      const kind = finishKind(m, object);
      let tile = tiles.get(kind);
      if (!tile) { tile = { texture: makeFinish(kind), users: 0 }; tiles.set(kind, tile); }
      tile.users++;
      m.bumpMap = m.roughnessMap = tile.texture;
      m.bumpScale = DEPTH[kind];
      m.needsUpdate = true;
      handled.add(m);
      const release = () => {
        m.removeEventListener('dispose', release);
        materials.delete(m);
        if (--tile.users === 0) { tile.texture.dispose(); tiles.delete(kind); }
      };
      materials.set(m, release);
      m.addEventListener('dispose', release);
    }
  };
  const added = (event: { child: THREE.Object3D }) => watch(event.child);
  const removed = (event: { child: THREE.Object3D }) => unwatch(event.child);
  const watch = (object: THREE.Object3D) => {
    finish(object);
    if (!(object instanceof THREE.Mesh) || object.children.length) {
      if (!groups.has(object)) {
        groups.add(object);
        object.addEventListener('childadded', added);
        object.addEventListener('childremoved', removed);
      }
    }
    object.children.forEach(watch);
  };
  const unwatch = (object: THREE.Object3D) => {
    if (groups.delete(object)) {
      object.removeEventListener('childadded', added);
      object.removeEventListener('childremoved', removed);
    }
    object.children.forEach(unwatch);
  };
  watch(root);
  return () => {
    for (const group of groups) {
      group.removeEventListener('childadded', added);
      group.removeEventListener('childremoved', removed);
    }
    groups.clear();
    for (const release of [...materials.values()]) release();
  };
}
