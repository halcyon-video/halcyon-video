import * as THREE from 'three';

/**
 * The per-library reflection probes the case materials use as their envMap, and
 * the one thing that has to happen whenever a fresh generation of them arrives:
 * re-pointing every material that was built against the outgoing generation.
 *
 * Why this needs owning at all. The probes are SCENE-scoped cube render targets
 * — StoreScene.generateReflectionProbes() bakes five of them and disposes the
 * previous set. The material caches that sample them (hero faces, the per-title
 * LRU, poster fronts, spine colours, the series boxset back panel) are
 * module-level and deliberately OUTLIVE a scene: clearVideoCaseCache('rebuild')
 * preserves them so a no-reload rebuild pays no redraw. Two ordinary events
 * therefore invalidate a cached envMap without touching the material holding it:
 *
 *   - a re-bake, when the outside mode changes or the one-shot stocked-shelves
 *     pass fires after the aisles fill (StoreScene.stockedRebakeDue);
 *   - a no-reload rebuild — settings, medium, theme, or the manager terminal's
 *     era pin — which throws away the whole GL context those textures lived in.
 *
 * Either way three.js finds nothing behind the reference and binds an empty
 * cube, so the material loses ALL image-based lighting and renders near-black
 * while every neighbouring retail box stays correctly lit (the instanced globals
 * ARE re-pointed, by updateGlobalMaterialsEnvMap). That is the dark clamshell
 * and boxset in feedback/066.
 */
export let reflectionProbes: THREE.Texture[] = [];

/** Re-points one material if it holds a probe from the outgoing generation. */
export type Repoint = (mat: THREE.Material | null | undefined) => void;

/** Hands `repoint` every cached material a registrant is holding. */
export type ProbeConsumer = (repoint: Repoint) => void;

const consumers: ProbeConsumer[] = [];

/**
 * Register a cache-walker, called on every probe generation after the first.
 * Registrants own caches that survive a scene, so they are the only ones that
 * can go stale — scene-owned materials are rebuilt with the scene.
 */
export function onProbesReplaced(consumer: ProbeConsumer) {
  consumers.push(consumer);
}

export function setReflectionProbes(probes: THREE.Texture[]) {
  // Map the OUTGOING probes to their index before overwriting, so each cached
  // material can be moved to the probe sitting at the same position — it keeps
  // the probe index it was built with, and the cache keys that encode that
  // index stay truthful.
  const outgoing = new Map<string, number>();
  reflectionProbes.forEach((tex, i) => { if (tex) outgoing.set(tex.uuid, i); });
  reflectionProbes = probes;
  if (outgoing.size === 0) return; // first bake: nothing is cached against a probe yet

  const repoint: Repoint = (mat) => {
    const m = mat as THREE.MeshStandardMaterial | null | undefined;
    if (!m?.envMap) return;
    const idx = outgoing.get(m.envMap.uuid);
    if (idx === undefined) return; // not one of ours (a jewel lid, scene.environment, …)
    // A missing slot falls back to scene.environment, which is always live.
    m.envMap = probes[idx] ?? null;
    m.needsUpdate = true;
  };
  for (const consume of consumers) consume(repoint);
}
