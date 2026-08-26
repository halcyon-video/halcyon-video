// ?clerk_skeleton=1 — hand the user an OpenPose control map of the clerk's
// sprite sheet, in the SAME 16x5 grid as the art itself (see clerk-template.ts,
// which serves the art half, and public/user-assets/README.md "clerk/").
//
// Why this exists (GH #115). A custom sheet is generated one cell at a time,
// and the generator has to be told what pose the cell depicts. Handing it the
// procedural cell as an image goes wrong two ways: image-to-image copies the
// doll's PROPORTIONS along with its pose, and a pose DETECTOR finds no skeleton
// in flat cel art at all — openpose read a standing idle cell and produced a
// crouching figure. But nothing needs detecting: clerk-art.ts solves every
// joint on the way to painting her, so this exports the truth instead of a
// guess. Feed a cell of this atlas to a ControlNet openpose input and the arms
// land where the store says they land.
//
// A boot param rather than a menu item, for the same reason the art template is
// one: it works identically in demo, kiosk and dev boots with zero UI surface.

import {
  ATLAS_COLS, ATLAS_ROWS, CELL_W, CELL_H,
  buildClerkSkeletons, type CellSkeleton, type JointName,
} from './clerk-art';

/**
 * The limb chains an OpenPose map draws, in the canonical order, with the
 * canonical colour per limb — a ControlNet openpose encoder keys off these
 * hues, so they are a wire format and not a palette choice.
 *
 * The clerk's rig has no eyes or ears, so the four facial limbs of COCO-18 are
 * absent. A partial map is normal (a real detector drops occluded joints too)
 * and the encoder handles it; the head-to-neck chain still carries her head
 * position, which is what the facing rows need.
 */
const LIMBS: Array<[JointName, JointName, string]> = [
  ['neck', 'shoulderR', 'rgb(255,0,0)'],
  ['neck', 'shoulderL', 'rgb(255,85,0)'],
  ['shoulderR', 'elbowR', 'rgb(255,170,0)'],
  ['elbowR', 'wristR', 'rgb(255,255,0)'],
  ['shoulderL', 'elbowL', 'rgb(170,255,0)'],
  ['elbowL', 'wristL', 'rgb(85,255,0)'],
  ['neck', 'hipR', 'rgb(0,255,0)'],
  ['hipR', 'kneeR', 'rgb(0,255,85)'],
  ['kneeR', 'ankleR', 'rgb(0,255,170)'],
  ['neck', 'hipL', 'rgb(0,255,255)'],
  ['hipL', 'kneeL', 'rgb(0,170,255)'],
  ['kneeL', 'ankleL', 'rgb(0,85,255)'],
  ['neck', 'head', 'rgb(0,0,255)'],
];

/** Joint dots sit on top of the limbs, each in its own colour. */
const DOTS: Array<[JointName, string]> = [
  ['head', 'rgb(255,0,0)'],
  ['neck', 'rgb(255,85,0)'],
  ['shoulderR', 'rgb(255,170,0)'],
  ['elbowR', 'rgb(255,255,0)'],
  ['wristR', 'rgb(170,255,0)'],
  ['shoulderL', 'rgb(85,255,0)'],
  ['elbowL', 'rgb(0,255,0)'],
  ['wristL', 'rgb(0,255,85)'],
  ['hipR', 'rgb(0,255,170)'],
  ['kneeR', 'rgb(0,255,255)'],
  ['ankleR', 'rgb(0,170,255)'],
  ['hipL', 'rgb(0,85,255)'],
  ['kneeL', 'rgb(0,0,255)'],
  ['ankleL', 'rgb(85,0,255)'],
];

/** Draw one cell's skeleton at an atlas offset. */
function drawCell(ctx: CanvasRenderingContext2D, cell: CellSkeleton, ox: number, oy: number): void {
  const j = cell.joints;
  ctx.lineCap = 'round';
  ctx.lineWidth = 8;
  for (const [a, b, colour] of LIMBS) {
    const pa = j[a], pb = j[b];
    if (!pa || !pb) continue;
    ctx.strokeStyle = colour;
    ctx.beginPath();
    ctx.moveTo(ox + pa.x, oy + pa.y);
    ctx.lineTo(ox + pb.x, oy + pb.y);
    ctx.stroke();
  }
  for (const [name, colour] of DOTS) {
    const p = j[name];
    if (!p) continue;
    ctx.fillStyle = colour;
    ctx.beginPath();
    ctx.arc(ox + p.x, oy + p.y, 5, 0, Math.PI * 2);
    ctx.fill();
  }
}

/**
 * The whole control-map atlas: black field, one skeleton per sprite cell, laid
 * out on the sprite sheet's own grid so cell (col,row) means the same thing in
 * both files.
 */
export function buildClerkSkeletonCanvas(cells = buildClerkSkeletons()): HTMLCanvasElement {
  const atlas = document.createElement('canvas');
  atlas.width = CELL_W * ATLAS_COLS;
  atlas.height = CELL_H * ATLAS_ROWS;
  const ctx = atlas.getContext('2d')!;
  // Black, not transparent: an openpose map's background is part of the signal.
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, atlas.width, atlas.height);
  for (const cell of cells) drawCell(ctx, cell, cell.col * CELL_W, cell.row * CELL_H);
  return atlas;
}

let served = false;

/**
 * Serve the skeleton atlas plus a JSON of the raw joint coordinates. The JSON
 * is the half that survives a change of tooling — the PNG is one encoder's
 * idea of a pose map, the numbers are the pose.
 */
export function maybeServeClerkSkeleton(): void {
  if (served) return;
  if (new URLSearchParams(location.search).get('clerk_skeleton') !== '1') return;
  served = true;

  const cells = buildClerkSkeletons();
  const download = (href: string, name: string): void => {
    const a = document.createElement('a');
    // The object URL is deliberately never revoked: revoking can race the
    // download, and `served` means a scene rebuild never serves twice.
    a.href = href;
    a.download = name;
    a.click();
  };

  buildClerkSkeletonCanvas(cells).toBlob((blob) => {
    if (blob) download(URL.createObjectURL(blob), 'clerk-skeleton-atlas.png');
  }, 'image/png');

  const meta = {
    cellWidth: CELL_W,
    cellHeight: CELL_H,
    cols: ATLAS_COLS,
    rows: ATLAS_ROWS,
    cells: cells.map((c) => ({
      dir: c.dir, anim: c.anim, frame: c.frame, col: c.col, row: c.row,
      joints: c.joints,
    })),
  };
  download(
    URL.createObjectURL(new Blob([JSON.stringify(meta, null, 2)], { type: 'application/json' })),
    'clerk-skeleton.json',
  );
}
