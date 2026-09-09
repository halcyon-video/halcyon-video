import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { GAME_BOX_IN, gameConstruction, isWhiteClamshell, WHITE_CLAMSHELL_DIMS, JEWEL_FAT_DEPTH_IN } from '../src/packaging-formats.ts';

test('explicit packaging overrides legacy library styling without genre/aspect inference', () => {
  const unknown = { libraryName: 'Movies', genres: ['Animation'], studios: ['Animation studio'], primaryImageAspectRatio: .63 };
  assert.equal(isWhiteClamshell(unknown, 'vhs'), false);
  const legacy = { libraryName: 'Animated Movies' };
  assert.equal(isWhiteClamshell(legacy,'vhs'),true);
  assert.equal(isWhiteClamshell({...legacy,packaging:'vhs-slipcase'},'vhs'),false);
  for (const selection of [legacy,{packaging:'vhs-white-clamshell' as const}]) {
    assert.equal(isWhiteClamshell(selection,'dvd'),false);
    assert.equal(isWhiteClamshell({...selection,game:true},'vhs'),false);
    assert.equal(isWhiteClamshell({...selection,isSeries:true},'vhs'),false);
  }
  assert.equal(isWhiteClamshell({ packaging: 'vhs-white-clamshell' }, 'vhs'), true);
  assert.equal(isWhiteClamshell({ packaging: 'vhs-white-clamshell' }, 'dvd'), false);
  assert.equal(isWhiteClamshell({ packaging: 'vhs-white-clamshell', game: true }, 'vhs'), false);
  assert.equal(isWhiteClamshell({ packaging: 'vhs-white-clamshell', isSeries: true }, 'vhs'), false);
  assert.ok(WHITE_CLAMSHELL_DIMS.w > .403 && WHITE_CLAMSHELL_DIMS.h > .667);
  assert.ok(WHITE_CLAMSHELL_DIMS.w < .58); // existing column pitch
  assert.ok(WHITE_CLAMSHELL_DIMS.h + WHITE_CLAMSHELL_DIMS.d < 1.1); // conservative tilted shelf envelope
});

test('retains the supported platform inventory and variable-carton fallbacks', () => {
  assert.deepEqual(Object.keys(GAME_BOX_IN).sort(), ['NES','SNES','SUPER FAMICOM','NINTENDO 64','GAME BOY','GAME BOY COLOR','GAME BOY ADVANCE','GENESIS','SEGA MASTER SYSTEM','ATARI','TURBOGRAFX-16','ARCADE','PLAYSTATION','SEGA SATURN','SEGA CD','DREAMCAST','PLAYSTATION 2','GAMECUBE','XBOX','NINTENDO 3DS','NINTENDO DSI','NINTENDO SWITCH','PSP','WII U'].sort());
  assert.equal(gameConstruction('SNES'), undefined);
  assert.equal(gameConstruction('UNRECOGNIZED'), undefined);
  assert.equal(gameConstruction('PLAYSTATION', 4), 'jewel-fat');
  assert.equal(gameConstruction('PLAYSTATION', 1), 'jewel-single');
  assert.equal(gameConstruction('PLAYSTATION 2', 4), 'dvd-keepcase');
  assert.equal(gameConstruction('NINTENDO 3DS'), 'dvd-keepcase');
  assert.equal(gameConstruction('GENESIS'), 'vhs-rental');
  assert.ok(JEWEL_FAT_DEPTH_IN > GAME_BOX_IN.PLAYSTATION[2]);
});

const costs = JSON.parse(readFileSync(new URL('../tools/models/packaging-costs.json', import.meta.url), 'utf8'));
function glb(name: string) {
  const data = readFileSync(new URL(`../public/models/${name}.glb`, import.meta.url));
  assert.equal(data.readUInt32LE(0), 0x46546c67); assert.equal(data.readUInt32LE(4), 2);
  assert.equal(data.readUInt32LE(8), data.length);
  const length = data.readUInt32LE(12);
  const doc = JSON.parse(data.toString('utf8', 20, 20 + length));
  const bin = data.subarray(28 + length);
  function values(index: number): number[][] {
    const a = doc.accessors[index], v = doc.bufferViews[a.bufferView];
    const lanes = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }[a.type as string]!;
    const bytes = { 5126: 4, 5125: 4, 5123: 2 }[a.componentType as number]!;
    assert.ok(bytes && lanes);
    return Array.from({ length: a.count }, (_, i) => Array.from({ length: lanes }, (_, k) => {
      const at = (v.byteOffset ?? 0) + (a.byteOffset ?? 0) + i * (v.byteStride ?? bytes * lanes) + k * bytes;
      return a.componentType === 5126 ? bin.readFloatLE(at) : a.componentType === 5125 ? bin.readUInt32LE(at) : bin.readUInt16LE(at);
    }));
  }
  return { data, doc, values };
}
for (const [name, cost] of Object.entries(costs) as [string, any][]) {
  test(`${name}: exported bounds, art normals, UVs, cost and texture-free material contract`, () => {
    const { data, doc, values } = glb(name);
    assert.equal(data.length, cost.bytes);
    assert.equal(doc.images?.length ?? 0, 0); assert.equal(doc.textures?.length ?? 0, 0);
    assert.ok(doc.materials.every((m: any) => !m.emissiveFactor?.some((v: number) => v > 0) && (!m.alphaMode || m.alphaMode === 'OPAQUE')));
    const min = [Infinity,Infinity,Infinity], max = [-Infinity,-Infinity,-Infinity];
    let triangles = 0, plasticMinX = Infinity, spineMaxX = -Infinity;
    const axes: Record<string, number[]> = { PaperFront: [0,0,1], PaperBack: [0,0,-1], PaperSpine: [-1,0,0], Opening: [1,0,0] };
    for (const mesh of doc.meshes) for (const p of mesh.primitives) {
      const pos = values(p.attributes.POSITION), normals = values(p.attributes.NORMAL), uv = values(p.attributes.TEXCOORD_0), idx = values(p.indices).flat();
      const role = doc.materials[p.material].name;
      triangles += idx.length / 3;
      if (['Shell','WhiteShell','ClearRim','Tray'].includes(role)) plasticMinX=Math.min(plasticMinX,...pos.map(v=>v[0]));
      if (role==='PaperSpine') spineMaxX=Math.max(spineMaxX,...pos.map(v=>v[0]));
      pos.forEach(v => v.forEach((n, axis) => { assert.ok(Number.isFinite(n)); min[axis] = Math.min(min[axis],n); max[axis] = Math.max(max[axis],n); }));
      uv.forEach(v => v.forEach(n => assert.ok(n >= -1e-5 && n <= 1.00001, `${role} UV ${n}`)));
      normals.forEach(v => {
        assert.ok(Math.abs(Math.hypot(...v) - 1) < 1e-4);
        if (axes[role]) assert.ok(v.reduce((sum, n, i) => sum + n * axes[role][i],0) > .99, `${role} faces inward`);
      });
      // Face culling must agree with exported normals. Catch flipped open art
      // panels even if an opaque internal seat happens to hide the defect.
      for (let i=0;i<idx.length;i+=3) {
        const [a,b,c] = idx.slice(i,i+3).map(j=>pos[j]);
        const u=b.map((v,j)=>v-a[j]), v=c.map((n,j)=>n-a[j]);
        const cross=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]];
        assert.ok(Math.hypot(...cross)>1e-12, `${mesh.name} degenerate triangle`);
        assert.ok(cross.reduce((s,n,j)=>s+n*normals[idx[i]][j],0)>0,`${mesh.name} winding`);
      }
    }
    assert.equal(triangles, cost.triangles);
    assert.ok(spineMaxX < plasticMinX - .00001, 'plastic occludes the spine insert');
    for (let i=0;i<3;i++) {
      assert.ok(Math.abs(max[i]-min[i]-cost.dimensionsFeet[i])<1e-6);
      assert.ok(Math.abs(max[i]+min[i])<1e-6, 'centered origin');
    }
    assert.ok(triangles < (name.endsWith('stock') ? 400 : 2200));
  });
}

for (const family of ['vhs-rental', 'vhs-white', 'dvd-keepcase']) for (const detail of ['stock', 'hero']) {
  test(`${family} ${detail}: paper front/spine/back share both fold edges without a plastic separator`, () => {
    const { doc, values } = glb(`packaging-${family}-${detail}`);
    const paper: Record<string, number[][]> = { PaperFront: [], PaperSpine: [], PaperBack: [] };
    const plastic: number[][] = [];
    for (const mesh of doc.meshes) for (const primitive of mesh.primitives) {
      const role = doc.materials[primitive.material].name;
      const points = values(primitive.attributes.POSITION);
      if (paper[role]) paper[role].push(...points);
      else if (['Shell', 'WhiteShell'].includes(role)) plastic.push(...points);
    }
    const left = Math.min(...paper.PaperSpine.map(p => p[0]));
    const front = Math.max(...paper.PaperSpine.map(p => p[2]));
    const back = Math.min(...paper.PaperSpine.map(p => p[2]));
    const edge = (points: number[][], z: number) => [...new Set(points
      .filter(p => Math.abs(p[0] - left) < 1e-6 && Math.abs(p[2] - z) < 1e-6)
      .map(p => p.map(n => n.toFixed(6)).join(',')))].sort();
    for (const [role, z] of [['PaperFront', front], ['PaperBack', back]] as [string, number][]) {
      const folded = edge(paper[role], z);
      assert.equal(folded.length, 2, `${role} stops before the spine fold`);
      assert.deepEqual(folded, edge(paper.PaperSpine, z));
    }
    const border = family === 'vhs-white' ? .009 : .003;
    const underFold = plastic.filter(p => p[0] < left + border + 1e-6);
    assert.ok(underFold.length > 0);
    assert.ok(underFold.every(p => p[2] < front - .0001 && p[2] > back + .0001), 'plastic protrudes through the paper fold');
  });
}
