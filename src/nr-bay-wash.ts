import * as THREE from 'three';
import type { StoreScene } from './three-scene';
import { NR_BAY_WIDTH } from './nr-run-layout';
import { activeStoreFormat } from './store-format';

/** Static, unshadowed bay illumination. Only nearby shelf surfaces evaluate the
 * two neighboring fittings, regardless of camera distance or perimeter length.
 * Shares the room material's albedo, normal and AO; adds no scene render/light.
 */
export function createNrBayWash(scene: StoreScene) {
  const originals = new Map<THREE.Material, { compile: THREE.Material['onBeforeCompile']; key: THREE.Material['customProgramCacheKey']; release: () => void }>();
  const runs = scene.activeTheme.id === 'bb-1990' && activeStoreFormat().newReleasesWall ? scene.nrRuns : [];
  const layout = runs.map(r => new THREE.Vector4(r.x, r.z, r.yaw, r.length));
  const apply = (object: THREE.Mesh) => {
    if (!runs.length) return;
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      if (!(material instanceof THREE.MeshStandardMaterial) || material.userData.lightingRole || originals.has(material)) continue;
      const compile = material.onBeforeCompile, key = material.customProgramCacheKey;
      const release = () => {
        material.removeEventListener('dispose', release);
        material.onBeforeCompile = compile;
        material.customProgramCacheKey = key;
        originals.delete(material);
      };
      originals.set(material, { compile, key, release });
      material.addEventListener('dispose', release);
      const priorKey = key.call(material);
      material.customProgramCacheKey = () => priorKey + ':nr-bay-wash-v3:' + layout.length;
      material.onBeforeCompile = function(shader, renderer) {
        compile.call(this, shader, renderer);
        shader.uniforms.nrWashRuns = { value: layout };
        shader.uniforms.nrWashHeight = { value: scene.ceilingY - 2.78 };
        shader.vertexShader = 'varying vec3 vNrWashWorld;\n' + shader.vertexShader;
        shader.vertexShader = shader.vertexShader.replace('#include <worldpos_vertex>', `
          #include <worldpos_vertex>
          vec4 nrPosition = vec4(transformed, 1.0);
          #ifdef USE_INSTANCING
            nrPosition = instanceMatrix * nrPosition;
          #endif
          vNrWashWorld = (modelMatrix * nrPosition).xyz;
        `);
        shader.fragmentShader = `
          varying vec3 vNrWashWorld;
          uniform vec4 nrWashRuns[${layout.length}];
          uniform float nrWashHeight;
          vec3 nrBayIrradiance(vec3 worldNormal) {
            float energy = 0.0;
            for (int i = 0; i < ${layout.length}; i++) {
              vec4 run = nrWashRuns[i];
              vec2 tangent = vec2(cos(run.z), -sin(run.z));
              vec2 facing = vec2(-tangent.y, tangent.x);
              vec2 delta = vNrWashWorld.xz - run.xy;
              float along = dot(delta, tangent), depth = dot(delta, facing);
              if (abs(along) > run.w * .5 + 1.5 || depth < -.5 || depth > 7.5 || vNrWashWorld.y > nrWashHeight) continue;
              float boundary = (1.0 - smoothstep(run.w * .5, run.w * .5 + 1.5, abs(along)))
                * smoothstep(-.5, 0.0, depth) * (1.0 - smoothstep(4.5, 7.5, depth));
              float cell = floor((along + run.w * .5) / ${NR_BAY_WIDTH.toFixed(8)} - .5);
              vec3 normalLocal = vec3(dot(worldNormal.xz,tangent),worldNormal.y,dot(worldNormal.xz,facing));
              for (int j = 0; j < 2; j++) {
                float bay = cell + float(j);
                if (bay < 0.0 || bay >= floor(run.w / ${NR_BAY_WIDTH.toFixed(8)} + .01)) continue;
                float x = -run.w*.5 + (bay+.5)*${NR_BAY_WIDTH.toFixed(8)};
                vec3 toLamp = vec3(x-along,nrWashHeight-vNrWashWorld.y,2.9-depth);
                float d2 = max(dot(toLamp,toLamp),.25);
                vec3 direction = toLamp * inversesqrt(d2);
                vec3 axis = normalize(vec3(0.0, nrWashHeight-3.5, 1.2));
                float cone = smoothstep(cos(1.10), cos(.20), dot(direction,axis));
                energy += boundary * 62.0 / d2 * cone * max(dot(normalLocal,direction),0.0);
              }
            }
            return vec3(1.0,.93,.83) * energy;
          }
        ` + shader.fragmentShader;
        shader.fragmentShader = shader.fragmentShader.replace('#include <lights_fragment_maps>', `
          #include <lights_fragment_maps>
          irradiance += nrBayIrradiance(inverseTransformDirection(normal, viewMatrix));
        `);
      };
      material.needsUpdate = true;
    }
  };
  return { apply, dispose() {
    for (const [material, original] of originals) {
      original.release();
      material.needsUpdate = true;
    }
    originals.clear();
  } };
}
