import * as THREE from 'three';

/** A download may finish after a settings rebuild disposed its destination.
 * Only replacement maps belong here: existing procedural/cache maps retain
 * their owners, and a map shared by several materials lives until all retire.
 */
export function materialTextureLoad<Args extends unknown[]>(
  destinations: THREE.Material[],
  assign: (texture: THREE.Texture, ...args: Args) => void,
): (texture: THREE.Texture, ...args: Args) => void {
  const live = new Set(destinations);
  const destinationCount = live.size;
  const owned = new Set<THREE.Texture>();
  const maps = () => new Set(destinations.flatMap(material =>
    Object.values(material).filter((value): value is THREE.Texture => value instanceof THREE.Texture)));
  for (const material of live) {
    const release = () => {
      material.removeEventListener('dispose', release);
      live.delete(material);
      if (!live.size) { owned.forEach(texture => texture.dispose()); owned.clear(); }
    };
    material.addEventListener('dispose', release);
  }
  return (texture, ...args) => {
    if (live.size !== destinationCount) { texture.dispose(); return; }
    const before = maps();
    assign(texture, ...args);
    const after = maps();
    for (const previous of owned) if (!after.has(previous)) {
      previous.dispose(); owned.delete(previous);
    }
    for (const map of after) if (!before.has(map)) owned.add(map);
  };
}
