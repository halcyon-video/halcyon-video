// Closed-case placement in a leaned shelf cross section. No scene dependencies.
export function rentalRestZ(retailD: number, shellD: number, lift: number, tilt: number): number {
  const c = Math.cos(tilt);
  // Centers move horizontally in the existing slot rig. Account for the
  // normal's Y component as well as the two real half-depths.
  return retailD / 2 - ((retailD + shellD) / 2 + .002 - lift * Math.sin(tilt)) / c;
}
export function shelfCasePacking(retailH: number, retailD: number, shellH: number, shellD: number, tilt: number, shelfHalfDepth: number, requested: number) {
  const s = Math.abs(Math.sin(tilt)), c = Math.cos(tilt);
  const backZ = rentalRestZ(retailD, shellD, (shellH - retailH) / 2, tilt);
  const pitch = (shellD + .004) / c;
  // .25 is the existing half-width of the gondola's central backing.
  const minimum = .25 + retailH / 2 * s - backZ + shellH / 2 * s + shellD / 2 * c + .006;
  const maximum = shelfHalfDepth - retailD / 2 * (1 + c) - .006;
  const count = Math.max(0, Math.min(requested, Math.floor((maximum - minimum) / pitch)));
  return { offset: minimum + count * pitch, count, pitch, backZ, fits: minimum <= maximum };
}
