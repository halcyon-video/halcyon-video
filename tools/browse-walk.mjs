#!/usr/bin/env node
// browse-walk: print the browse-camera walk of a planned store, hop by hop.
//
// Boots StorePlan headless (no THREE, no DOM) for a chosen store FORMAT and
// synthetic libraries, then walks each library exactly the way
// src/store-nav.ts's moveRightInternal does — front face of a line
// screen-left→right, around the deep end onto the back face, then the next
// line — and prints where the camera stands at every unit-face it lands on
// and how far it had to travel to get there. Big hops are the "camera jumps
// all over the place" complaint made measurable.
//
//   node --experimental-strip-types tools/browse-walk.mjs                       # mom-and-pop, 400 + 120 titles
//   node --experimental-strip-types tools/browse-walk.mjs --format corporate
//   node --experimental-strip-types tools/browse-walk.mjs --libs 900,300,80     # three libraries
//   node --experimental-strip-types tools/browse-walk.mjs --arrangement diagonal
//   node --experimental-strip-types tools/browse-walk.mjs --limit 12 --quiet    # only the summary + hops over 12 ft
//   node --experimental-strip-types tools/browse-walk.mjs --by line             # replay the pre-fix chunk-by-chunk walker
//
// Exit code 1 when any hop exceeds --limit (default 15 ft), so it doubles as
// a gate.

const args = process.argv.slice(2);
const opt = (name, dflt) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? dflt : args[i + 1];
};
const FORMAT_ID = opt('format', 'mom-and-pop');
const LIB_COUNTS = String(opt('libs', '400,120')).split(',').map(Number);
const ARRANGEMENT = opt('arrangement', null);
const LIMIT = Number(opt('limit', 15));
const QUIET = args.includes('--quiet');
// --by row (default): the walker reads a physical row (rowGroupId) as one
// loop, the way store-nav.ts does since the mom-and-pop fix. --by line
// replays the OLD walker, which looped each lineId chunk separately.
const BY = opt('by', 'row');
const rowKey = (u) => (BY === 'line' ? u.lineId : u.rowGroupId);

// store-format.ts resolves the format ONCE at module load from localStorage,
// so the stub has to exist before the dynamic import below.
const store = new Map([['bb_store_format', FORMAT_ID]]);
if (ARRANGEMENT) store.set('bb_arrangement', ARRANGEMENT);
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};

const { StorePlan } = await import('../src/store-plan.ts');
const L = await import('../src/store-layout.ts');
const { activeStoreFormat } = await import('../src/store-format.ts');

const GENRES = ['Action', 'Comedy', 'Drama', 'Thriller', 'Horror', 'Sci-Fi', 'Family', 'Romance'];
const mkMovie = (lib, i) => ({
  id: `${lib}-m${i}`,
  title: `Title ${String(i).padStart(5, '0')}`,
  year: 2000 + (i % 20),
  duration: '1h 30m',
  rating: 'PG',
  overview: '',
  director: '',
  actors: [],
  genres: [GENRES[i % GENRES.length]],
  localPath: '',
});
const libs = LIB_COUNTS.map((n, li) => ({
  id: `L${li}`,
  name: `Library ${li}`,
  movies: Array.from({ length: n }, (_, i) => mkMovie(li, i)),
  genres: GENRES,
}));

const plan = new StorePlan(libs);
if (ARRANGEMENT) plan.arrangement = ARRANGEMENT;
plan.plan();

const fmt = activeStoreFormat();
const shelfY = L.AISLE_SHELF_HEIGHTS[Math.floor(L.AISLE_SHELF_HEIGHTS.length / 2)] || 3.0;
const standoff = L.unitDepthAtHeight(shelfY) / 2 + fmt.browseStandoff;
const W = L.BROWSE_WINDOW_SIZE;
const f1 = (n) => n.toFixed(1).padStart(6);

// Camera stand for a unit face at a given column: the same maths as
// store-camera.ts's browse branch (window centring, browseSign, stand-off,
// layout->world by the unit's own yaw).
function cameraAt(unit, side, col) {
  const cols = unit.cols;
  let minCol = 0;
  if (cols > W) minCol = Math.max(0, Math.min(col - (col >= W ? W - 1 : 0), cols - W));
  const centerCol = minCol + (Math.min(cols, W) - 1) / 2;
  const z = plan.aisleColZ(unit, centerCol, side);
  const dir = (side === 'back' ? -1 : 1) * unit.browseSign;
  return plan.unitToWorld(unit, unit.xCenter + dir * standoff, z);
}
const dist = (p, q) => Math.hypot(p.x - q.x, p.z - q.z);

console.log(`walk by ${BY}; format=${fmt.id} arrangement=${plan.arrangement} width=${plan.getStoreWidth().toFixed(1)}ft maxRunUnits=${plan.maxRunUnits}`);

// The rows as poured: one line per rowGroupId, in x order.
const rows = new Map();
for (const u of plan.shelvingUnits) {
  if (u.libraryIdx < 0 || u.libraryIdx >= libs.length) continue;
  const key = `${u.libraryIdx}:${u.rowGroupId}`;
  if (!rows.has(key)) rows.set(key, []);
  rows.get(key).push(u);
}
console.log('\nROWS (world x of the run, front z, units, lineId chunks, library):');
[...rows.entries()]
  .map(([key, us]) => {
    const front = us.reduce((a, b) => (a.lineId < b.lineId || (a.lineId === b.lineId && a.posInLine < b.posInLine) ? a : b));
    const w = plan.unitToWorld(front, front.xCenter, plan.aisleZCenter(front));
    return { key, us, x: w.x, z: w.z, lib: front.libraryIdx, chunks: new Set(us.map((u) => u.lineId)).size };
  })
  .sort((a, b) => a.x - b.x || b.z - a.z)
  .forEach((r) => console.log(`  x=${f1(r.x)} z=${f1(r.z)} units=${String(r.us.length).padStart(2)} chunks=${r.chunks} lib=${r.lib} row=${r.key.split(':')[1]}`));

let worst = 0;
let over = 0;
for (let li = 0; li < libs.length; li++) {
  const libUnits = plan.shelvingUnits
    .filter((u) => u.libraryIdx === li)
    .sort((a, b) => a.unitIdxInLibrary - b.unitIdxInLibrary);
  if (libUnits.length === 0) continue;
  const entries = plan.layoutFor(li).entries;
  const faceHasStock = (unitIdx, side) => {
    const b = plan.blockIndexOf(li, unitIdx, side);
    return entries.slice(b * L.UNIT_SIDE_CAPACITY, (b + 1) * L.UNIT_SIDE_CAPACITY).some(Boolean);
  };
  const lineStart = (key) => libUnits.filter((u) => rowKey(u) === key)[0];

  // Walk with Right presses, mirroring moveRightInternal's shelving branch.
  const stops = [];
  let unit = libUnits[0];
  let side = 'front';
  let guard = 0;
  stops.push({ unit, side, enterCol: 0 });
  while (guard++ < 10000) {
    const idx = unit.unitIdxInLibrary;
    let next = null;
    if (side === 'front') {
      const nu = libUnits[idx + 1];
      if (nu && rowKey(nu) === rowKey(unit)) next = { unit: nu, side: 'front' };
      else if (faceHasStock(idx, 'back')) next = { unit, side: 'back' };
      else {
        const nl = libUnits.find((u) => rowKey(u) !== rowKey(unit) && u.unitIdxInLibrary > idx);
        if (nl) next = { unit: lineStart(rowKey(nl)), side: 'front' };
      }
    } else {
      const pu = libUnits[idx - 1];
      if (pu && rowKey(pu) === rowKey(unit)) next = { unit: pu, side: 'back' };
      else {
        const nl = libUnits.find((u) => rowKey(u) !== rowKey(unit) && u.unitIdxInLibrary > idx);
        if (nl) next = { unit: lineStart(rowKey(nl)), side: 'front' };
      }
    }
    if (!next) break;
    stops.push({ unit: next.unit, side: next.side, enterCol: 0 });
    unit = next.unit;
    side = next.side;
  }

  // Content order check: does the walk visit faces in entryBlockOrder?
  const blocks = plan.entryBlockOrder(li);
  let contentJumps = 0;
  let prevBlock = -1;
  for (const s of stops) {
    const b = plan.blockIndexOf(li, s.unit.unitIdxInLibrary, s.side);
    if (prevBlock >= 0 && b !== prevBlock + 1) contentJumps++;
    prevBlock = b;
  }

  console.log(`\nLIBRARY ${li}: ${libUnits.length} units, ${stops.length} faces walked (${blocks.length} stocked-order faces), content-order breaks=${contentJumps}`);
  let prev = null;
  let libWorst = 0;
  const hops = [];
  stops.forEach((s, i) => {
    const enter = cameraAt(s.unit, s.side, 0);
    const exit = cameraAt(s.unit, s.side, s.unit.cols - 1);
    const hop = prev ? dist(prev, enter) : 0;
    if (hop > libWorst) libWorst = hop;
    if (hop > LIMIT) { over++; hops.push(i); }
    if (!QUIET || hop > LIMIT) {
      console.log(
        `  ${String(i).padStart(3)} unit=${String(s.unit.unitIdxInLibrary).padStart(3)} row=${String(s.unit.rowGroupId).padStart(3)} line=${String(s.unit.lineId).padStart(3)} pos=${s.unit.posInLine} ${s.side.padEnd(5)}` +
        ` cam=(${f1(enter.x)},${f1(enter.z)})  hop=${f1(hop)}${hop > LIMIT ? '  <-- JUMP' : ''}`,
      );
    }
    prev = exit;
  });
  console.log(`  worst hop ${libWorst.toFixed(1)} ft, ${hops.length} hops over ${LIMIT} ft`);
  if (libWorst > worst) worst = libWorst;
}
console.log(`\nWORST HOP ${worst.toFixed(1)} ft; ${over} hops over ${LIMIT} ft`);
process.exit(over > 0 ? 1 : 0);
