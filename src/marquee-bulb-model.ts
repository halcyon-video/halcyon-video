import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { assetUrl } from './asset-url';
import { disposeDetachedModel } from './model-resources';

/** Keep the entire lamp family in the existing single instanced draw. */
export function installMarqueeModel(mesh: THREE.InstancedMesh, refresh: () => void): void {
  const fallback = mesh.geometry;
  let dead = false;
  const stop = () => { dead = true; };
  mesh.addEventListener('removed', stop);
  fallback.addEventListener('dispose', stop);
  new GLTFLoader().load(assetUrl('models/marquee-bulb.glb'), ({ scene: model }) => {
    const pieces: THREE.BufferGeometry[] = [];
    try {
      if (dead || !mesh.parent) return;
      model.updateMatrixWorld(true);
      model.traverse(o => {
        if (!(o instanceof THREE.Mesh)) return;
        const mat = o.material as THREE.MeshStandardMaterial;
        if (!['BulbGlass', 'NickelNeck', 'PorcelainSocket'].includes(mat.name)) return;
        const geometry = o.geometry.clone().applyMatrix4(o.matrixWorld);
        const count = geometry.getAttribute('position').count;
        const mask = new Float32Array(count).fill(mat.name === 'BulbGlass' ? 1 : 0);
        const colors = new Float32Array(count * 3);
        for (let i = 0; i < count; i++) mat.color.toArray(colors, i * 3);
        geometry.setAttribute('lampEmission', new THREE.BufferAttribute(mask, 1));
        geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        pieces.push(geometry);
      });
      if (pieces.length !== 3) return;
      const combined = mergeGeometries(pieces, false);
      if (!combined) return;
      combined.name = 'Marquee assembly';
      combined.computeBoundingBox(); combined.computeBoundingSphere();
      mesh.geometry = combined;
      combined.addEventListener('dispose', stop);
      const material = mesh.material as THREE.MeshStandardMaterial;
      material.color.set(0xffffff);
      material.vertexColors = true;
      material.onBeforeCompile = shader => {
        shader.vertexShader = 'attribute float lampEmission; varying float vLampEmission; varying vec3 vLampChase;\n' + shader.vertexShader;
        shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
          vLampEmission = lampEmission;
          vLampChase = instanceColor;`);
        shader.fragmentShader = 'varying float vLampEmission; varying vec3 vLampChase;\n' + shader.fragmentShader;
        // Hardware keeps its finish as the glass changes phase. The stock
        // color chunk multiplies both vertex and instance colors together.
        shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `
          diffuseColor.rgb *= vColor.rgb / max(vLampChase, vec3(0.001));
          diffuseColor.rgb *= mix(vec3(1.0), vLampChase, vLampEmission);`);
        shader.fragmentShader = shader.fragmentShader.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
          totalEmissiveRadiance *= vLampEmission * vLampChase;`);
      };
      material.customProgramCacheKey = () => 'marquee-assembly-v1';
      material.needsUpdate = true;
      fallback.removeEventListener('dispose', stop);
      fallback.dispose();
      refresh();
    } finally {
      pieces.forEach(g => g.dispose());
      disposeDetachedModel(model);
    }
  }, undefined, () => { /* Retain the original sphere when offline. */ });
}
