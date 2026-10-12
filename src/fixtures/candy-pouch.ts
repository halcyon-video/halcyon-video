// Original reusable snack pouch/support kit. Feet, bottom-centre pouch origin.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { assetUrl } from '../asset-url.ts';
import type { FixtureContext } from '../fixtures.ts';

const FLEXIBLE_ROWS = new Map([[1, 'GUMMY BEARS'], [2, 'POPCORN'], [4, 'SOUR RIBBONS']]);
export function candyPouchRows(labels: readonly string[], width: number, depth: number, rows: number): number[] {
  if (width !== 3 || depth !== 1.6 || rows !== 5 || !labels.length) return [];
  return [...FLEXIBLE_ROWS].filter(([row, label]) => labels[row % labels.length] === label).map(([row]) => row);
}

export function rackPouchMatrix(row: number, facing: number): THREE.Matrix4 {
  return new THREE.Matrix4().makeRotationY(Math.PI).setPosition((facing - 2.5) * .45, .61 + row * .7, -.18);
}
export function gondolaPouchMatrix(tier: number, facing: number): THREE.Matrix4 {
  return new THREE.Matrix4().makeTranslation((facing - 3) * .53, 3.27 + tier, .10);
}

/** Slatwall wing on a candy gondola's open end (+X local). The board's inner
 * face sits on the gondola end at x=2; hooks engage slots every .25 ft. */
export const SLATWALL_WING = { endX: 2, board: .0625, reach: .7562, halfDepth: .758 } as const;
/** Grow a gondola footprint toward local +X only: the wing hangs off one end. */
export function slatwallWingFootprint<T extends { cx: number; cz: number; w: number; yaw: number }>(footprint: T): T {
  const reach = SLATWALL_WING.board + SLATWALL_WING.reach;
  return { ...footprint, w: footprint.w + reach,
    cx: footprint.cx + reach / 2 * Math.cos(footprint.yaw), cz: footprint.cz - reach / 2 * Math.sin(footprint.yaw) };
}
const WING_TIERS = 4, WING_COLUMNS = [-.37, .37], WING_LOADS = [.40, .62];
export function slatwallHookMatrix(tier: number, column: number): THREE.Matrix4 {
  // Slots at 1.75/2.75/3.75/4.75 ft; the hook wire rides .06 ft below its slot.
  return new THREE.Matrix4().makeRotationY(Math.PI / 2)
    .setPosition(SLATWALL_WING.endX + SLATWALL_WING.board, 1.69 + tier, WING_COLUMNS[column]);
}
export function slatwallPouchMatrix(tier: number, column: number, slot: number): THREE.Matrix4 {
  return slatwallHookMatrix(tier, column).multiply(new THREE.Matrix4().makeTranslation(0, -(.72 - .0285), WING_LOADS[slot]));
}

type TemplateName = 'PouchSmall' | 'PouchFull' | 'PegShort' | 'PegLong' |
  'RackCrossbar' | 'GondolaCrossbar' | 'RackSideRail' | 'RackCrownRail' | 'SlatwallHook';
const TEMPLATES: TemplateName[] = ['PouchSmall', 'PouchFull', 'PegShort', 'PegLong',
  'RackCrossbar', 'GondolaCrossbar', 'RackSideRail', 'RackCrownRail', 'SlatwallHook'];
interface Row { name: string; finish: THREE.Material; matrices: THREE.Matrix4[] }
interface Support { template: TemplateName; matrices: THREE.Matrix4[] }
/** A non-instanced kit group installed once, merged per authored material role. */
interface Structure { group: string; matrix: THREE.Matrix4; roles: Record<string, THREE.Material> }

/** Owned per consumer; imported templates/materials never escape their load.
 * Existing prints/steel belong to the fixture. Only cloned print finishes are
 * retired here; their already-owned maps must remain alive for fallback stock.
 */
function installPouches(
  ctx: FixtureContext, parent: THREE.Group, rows: Row[], variant: TemplateName,
  supports: Support[], steel: THREE.Material, active: () => boolean,
  publish: () => void, restore: () => void, structure?: Structure,
): () => void {
  let disposed = false, published = false;
  let installed: THREE.Group | null = null;
  const lifetime = new AbortController();
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const release = () => {
    installed?.traverse(o => { if (o instanceof THREE.InstancedMesh) o.dispose(); });
    installed?.removeFromParent(); installed = null;
    geometries.forEach(g => g.dispose()); geometries.clear();
    materials.forEach(m => m.dispose()); materials.clear();
    if (published) { restore(); published = false; }
  };
  const attached = () => {
    let root: THREE.Object3D = parent;
    while (root.parent) root = root.parent;
    return !disposed && root === ctx.scene && active();
  };
  const load = async () => {
    if (disposed) return;
    const importedGeometries = new Set<THREE.BufferGeometry>();
    const importedMaterials = new Set<THREE.Material>();
    const importedTextures = new Set<THREE.Texture>();
    try {
      const gltf = await new GLTFLoader().loadAsync(assetUrl('models/candy-pouch.glb'));
      gltf.scene.updateMatrixWorld(true);
      gltf.scene.traverse(o => {
        if (!(o instanceof THREE.Mesh)) return;
        importedGeometries.add(o.geometry);
        for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
          importedMaterials.add(m);
          for (const value of Object.values(m)) if (value instanceof THREE.Texture) importedTextures.add(value);
        }
      });
      if (!attached()) return;
      const kit = new Map<TemplateName, THREE.BufferGeometry>();
      for (const name of TEMPLATES) {
        const group = gltf.scene.getObjectByName(name);
        const parts: THREE.Mesh[] = [];
        group?.traverse(o => { if (o instanceof THREE.Mesh) parts.push(o); });
        if (!group || parts.length !== 1) throw new Error('Invalid pouch template ' + name);
        const source = parts[0];
        const geometry = source.geometry.clone().applyMatrix4(source.matrixWorld);
        geometries.add(geometry); kit.set(name, geometry);
      }
      const flipped = new Map<boolean, THREE.BufferGeometry>();
      const pouchGeometry = (flipY: boolean) => {
        if (flipped.has(flipY)) return flipped.get(flipY)!;
        const g = kit.get(variant)!.clone(); geometries.add(g);
        if (flipY) {
          const uv = g.getAttribute('uv');
          for (let i = 0; i < uv.count; i++) uv.setY(i, 1 - uv.getY(i));
        }
        flipped.set(flipY, g); return g;
      };
      const model = installed = new THREE.Group(); model.name = 'candy-pouch-detail';
      const instance = (name: string, geo: THREE.BufferGeometry, finish: THREE.Material, matrices: THREE.Matrix4[]) => {
        const mesh = new THREE.InstancedMesh(geo, finish, matrices.length);
        mesh.name = name; mesh.castShadow = mesh.receiveShadow = true;
        matrices.forEach((matrix, i) => mesh.setMatrixAt(i, matrix));
        mesh.instanceMatrix.needsUpdate = true;
        mesh.computeBoundingBox(); mesh.computeBoundingSphere();
        model.add(mesh);
      };
      for (const row of rows) {
        const finish = row.finish.clone(); materials.add(finish);
        if (finish instanceof THREE.MeshStandardMaterial) { finish.roughness = .42; finish.metalness = 0; }
        const flipY = !!(finish instanceof THREE.MeshStandardMaterial && finish.map?.flipY);
        instance(row.name, pouchGeometry(flipY), finish, row.matrices);
      }
      for (const support of supports) instance('pouch-support-' + support.template,
        kit.get(support.template)!, steel, support.matrices);
      if (structure) {
        const byRole = new Map<string, THREE.BufferGeometry[]>();
        const source = gltf.scene.getObjectByName(structure.group);
        source?.traverse(o => {
          if (!(o instanceof THREE.Mesh) || Array.isArray(o.material)) return;
          const g = o.geometry.clone().applyMatrix4(o.matrixWorld).applyMatrix4(structure.matrix);
          for (const name of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(name)) g.deleteAttribute(name);
          byRole.set(o.material.name, [...(byRole.get(o.material.name) ?? []), g]);
        });
        if (!byRole.size) throw new Error('Invalid pouch structure ' + structure.group);
        for (const [role, parts] of byRole) {
          const merged = parts.length > 1 ? mergeGeometries(parts, false) : parts[0];
          if (merged !== parts[0]) parts.forEach(g => g.dispose());
          if (!merged) throw new Error('Unmergeable pouch structure ' + role);
          geometries.add(merged);
          const mesh = new THREE.Mesh(merged, structure.roles[role] ?? steel);
          mesh.name = structure.group + '-' + role; mesh.castShadow = mesh.receiveShadow = true;
          model.add(mesh);
        }
      }
      // Unused kit templates never become invisible resident geometry.
      const live = new Set(model.children.map(o => (o as THREE.Mesh).geometry));
      for (const g of geometries) if (!live.has(g)) { g.dispose(); geometries.delete(g); }
      model.visible = !ctx.prepareDetailModel; parent.add(model);
      if (ctx.prepareDetailModel) await ctx.prepareDetailModel(model, lifetime.signal);
      if (!attached()) { release(); return; }
      publish(); published = true;
      model.visible = true;
      ctx.requestShadowRefresh(); ctx.requestRender();
    } catch {
      release();
      if (!disposed) ctx.log('Snack pouch detail unavailable; keeping existing candy stock.', 'system');
    } finally {
      importedGeometries.forEach(g => g.dispose());
      importedMaterials.forEach(m => m.dispose());
      importedTextures.forEach(t => t.dispose());
    }
  };
  const cancelQueued = ctx.scheduleDetailLoad?.(load);
  if (!ctx.scheduleDetailLoad) void load();
  return () => { disposed = true; lifetime.abort(); cancelQueued?.(); release(); };
}

export function installCandyRackPouches(ctx: FixtureContext, parent: THREE.Group,
  selectedRows: number[], steel: THREE.Material): () => void {
  const originals = selectedRows.map(row => ({ row,
    stock: parent.getObjectByName('candy-stock-' + row) as THREE.InstancedMesh }));
  if (!originals.length || originals.some(({ stock }) => !stock?.isInstancedMesh || Array.isArray(stock.material))) return () => {};
  const pegs: THREE.Matrix4[] = [], bars: THREE.Matrix4[] = [], sideRails: THREE.Matrix4[] = [], crownRails: THREE.Matrix4[] = [];
  const rows = originals.map(({ row, stock }) => {
    const y = .615 + row * .7 + .5636862691031603;
    for (let i = 0; i < 6; i++) pegs.push(new THREE.Matrix4().makeRotationY(Math.PI).setPosition((i - 2.5) * .45, y, 0));
    bars.push(new THREE.Matrix4().makeTranslation(0, y, 0));
    for (const x of [-1.43, 1.43]) (row === 4 ? crownRails : sideRails).push(new THREE.Matrix4().makeTranslation(x, y, 0));
    return { name: 'candy-stock-' + row, finish: stock.material as THREE.Material,
      matrices: Array.from({ length: 6 }, (_, facing) => rackPouchMatrix(row, facing)) };
  });
  const supports: Support[] = [{ template: 'PegShort', matrices: pegs }, { template: 'RackCrossbar', matrices: bars }];
  if (sideRails.length) supports.push({ template: 'RackSideRail', matrices: sideRails });
  if (crownRails.length) supports.push({ template: 'RackCrownRail', matrices: crownRails });
  return installPouches(ctx, parent, rows, 'PouchSmall', supports, steel,
    () => originals.every(({ stock }) => stock.parent === parent),
    () => originals.forEach(({ stock, row }) => { stock.visible = false; stock.name = 'candy-carton-fallback-' + row; }),
    () => originals.forEach(({ stock, row }) => { stock.visible = true; stock.name = 'candy-stock-' + row; }));
}

export function installCandyGondolaPouches(ctx: FixtureContext, parent: THREE.Group,
  fallbackStock: THREE.Group, finishes: Record<string, THREE.Material>, steel: THREE.Material,
  active: () => boolean): () => void {
  const rows = ['SnackPouchGreen', 'SnackPouchPurple'].map((role, tier) => ({
    name: 'gondola-pouch-stock-' + tier, finish: finishes[role],
    matrices: Array.from({ length: 7 }, (_, facing) => gondolaPouchMatrix(tier, facing)),
  }));
  if (rows.some(row => !row.finish)) return () => {};
  const pegs = [0, 1].flatMap(tier => Array.from({ length: 7 }, (_, i) =>
    new THREE.Matrix4().makeTranslation((i - 3) * .53, 3.2 + tier + .77535293577, -.65)));
  const bars = [0, 1].map(tier => new THREE.Matrix4().makeTranslation(0, 3.2 + tier + .77535293577, -.65));
  return installPouches(ctx, parent, rows, 'PouchFull', [
    { template: 'PegLong', matrices: pegs }, { template: 'GondolaCrossbar', matrices: bars },
  ], steel, active, () => { fallbackStock.visible = false; }, () => { fallbackStock.visible = true; });
}

/** Hanging bags on a slatwall wing at the gondola's +X end (photo 243950517's
 * queue-side wing). Nothing is replaced: the wing only exists once loaded. */
export function installCandyGondolaSlatwallWing(ctx: FixtureContext, parent: THREE.Group,
  finishes: Record<string, THREE.Material>, steel: THREE.Material,
  roles: Record<string, THREE.Material>, active: () => boolean): () => void {
  const prints = ['SnackPouchGreen', 'SnackPouchPurple'];
  const rows = prints.map((role, i) => ({
    name: 'slatwall-pouch-stock-' + i, finish: finishes[role],
    matrices: Array.from({ length: WING_TIERS }, (_, tier) => tier).filter(tier => tier % 2 === i)
      .flatMap(tier => WING_COLUMNS.flatMap((_, column) => WING_LOADS.map((_, slot) => slatwallPouchMatrix(tier, column, slot)))),
  }));
  if (rows.some(row => !row.finish)) return () => {};
  const hooks = Array.from({ length: WING_TIERS }, (_, tier) => WING_COLUMNS.map((_, column) => slatwallHookMatrix(tier, column))).flat();
  return installPouches(ctx, parent, rows, 'PouchFull', [{ template: 'SlatwallHook', matrices: hooks }],
    steel, active, () => {}, () => {},
    { group: 'SlatwallWing', matrix: new THREE.Matrix4().makeTranslation(SLATWALL_WING.endX, 0, 0), roles });
}
