// Explicit exceptions for luminous surfaces and nonphysical render layers.
// Ordinary props and printed signs always use the scene's lighting.
import * as THREE from 'three';

export type LightingRole = 'light-source' | 'window-poster' | 'sky' | 'overlay' | 'shadow' | 'light-spill' | 'reflection';
export function selfLit<T extends THREE.Material>(material: T, role: LightingRole): T {
  material.userData.lightingRole = role;
  return material;
}

export interface MaterialLightingAudit {
  meshes: number;
  materials: number;
  textured: number;
  exceptions: Record<string, number>;
  problems: string[];
}
/** Diagnostic only: no per-frame traversal or silent material replacement. */
export function auditStoreMaterials(root: THREE.Object3D): MaterialLightingAudit {
  const report: MaterialLightingAudit = { meshes: 0, materials: 0, textured: 0, exceptions: {}, problems: [] };
  const seen = new Set<THREE.Material>();
  root.traverse(obj => {
    if (!(obj instanceof THREE.Mesh) && !(obj instanceof THREE.Sprite)) return;
    report.meshes++;
    for (const material of Array.isArray(obj.material) ? obj.material : [obj.material]) {
      if (seen.has(material)) continue;
      seen.add(material);
      report.materials++;
      const m = material as THREE.MeshStandardMaterial;
      if (m.map || m.normalMap || m.roughnessMap || m.bumpMap) report.textured++;
      const role: LightingRole | undefined = (obj as THREE.Object3D & { isReflector?: boolean }).isReflector
        ? 'reflection' : material.userData.lightingRole;
      if (role) { report.exceptions[role] = (report.exceptions[role] ?? 0) + 1; continue; }
      let parent: THREE.Object3D | null = obj;
      const names: string[] = [];
      while (parent) { if (parent.name) names.push(parent.name); parent = parent.parent; }
      const label = `${names.reverse().join(' > ') || obj.type} [${material.name || material.type}]`;
      if ((material as THREE.MeshBasicMaterial).isMeshBasicMaterial || (material as THREE.SpriteMaterial).isSpriteMaterial) report.problems.push(`${label}: unlit`);
      if ((material as THREE.ShaderMaterial).isShaderMaterial && !(material as THREE.ShaderMaterial).lights) report.problems.push(`${label}: unlit shader`);
      if (m.emissive?.getHex() && m.emissiveIntensity > 0) report.problems.push(`${label}: emissive`);
      if (!material.toneMapped) report.problems.push(`${label}: bypasses exposure`);
    }
  });
  return report;
}
