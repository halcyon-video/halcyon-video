import { facadeDimensions, type FacadeStyle } from './storefront-architecture.ts';

/** Fit authored feet to live openings without bending the gable's straight rake. */
export function fitFacadeEntryVertex(
  x: number, y: number, ceilingY: number, entryHalfWidth: number,
  openingHalfWidth: number, style: FacadeStyle,
): [number, number] {
  const d = facadeDimensions(ceilingY, entryHalfWidth, style);
  const gabled = style === 'gabled-brick';
  const authoredOpening = gabled ? 7.2 : 5.55;
  const authoredMass = gabled ? 7.6 : 7.9;
  const a = Math.abs(x), m = d.massHalf, o = openingHalfWidth;
  let fitted = a <= authoredOpening ? a * o / authoredOpening
    : a <= authoredMass ? o + (a-authoredOpening)*(m-o)/(authoredMass-authoredOpening)
      : m+a-authoredMass;
  if (gabled) {
    const doorEdge = o-3.1;
    if (a <= authoredOpening) fitted = a <= .9 ? a
      : a <= 4.1 ? .9+(a-.9)*(doorEdge-.9)/3.2 : doorEdge+(a-4.1);
    // Above the header, transition to the architectural span. Keep the
    // one-foot eave shoulder and pier widths, and scale only the raking run.
    const roofX = a <= 6.6 ? a*(m-1)/6.6 : m+a-7.6;
    const upper = Math.max(0, Math.min(1, (y-9.15)/(13.4-9.15)));
    fitted += (roofX-fitted)*upper;
  }
  const lift = d.parapetTop-16.8;
  if (style === 'cone-canopy') {
    // Keep circular supports round and grounded; only the overhead band grows.
    return [Math.sign(x)*fitted, y+lift*Math.max(0, Math.min(1, (y-9.15)/9.05))];
  }
  let height = y+lift*Math.max(0, Math.min(1, (y-9.15)/7.95));
  if (gabled && y > 17.1 && a < 6.8) {
    // Rake/coping height follows the same dimensions used by the sign solver.
    // Preserve the thin metal profile's offset from the underlying roof.
    const roofY = 17.1+6.003*Math.max(0, 1-a/6.6);
    height += (d.gableHeight-6.003)*Math.max(0, Math.min(1, (Math.min(y,roofY)-17.1)/6.003));
  }
  return [Math.sign(x)*fitted, height];
}
