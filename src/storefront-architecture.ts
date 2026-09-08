/** Exterior style is independent of doors, counter shape, era, and branding. */
export type FacadeStyle = 'gabled-brick' | 'flat-parapet' | 'arcaded-brick';

export function resolveFacadeStyle(value: string | null): FacadeStyle {
  return value === 'flat-parapet' || value === 'arcaded-brick' ? value : 'gabled-brick';
}

export function facadeStyle(): FacadeStyle {
  return resolveFacadeStyle(typeof localStorage === 'undefined' ? null : localStorage.getItem('bb_facade'));
}

// The entrance glass and the roof behind the parapet remain functional anchors.
// Exterior proportions come from the building, rather than extending a tall
// gable by the full difference between the glazing and interior ceiling.
export function facadeDimensions(ceilingY: number, entryHalfWidth: number, style: FacadeStyle) {
  const parapetTop = Math.max(16.8, ceilingY + 1.2);
  const massHalf = entryHalfWidth;
  const gableBase = parapetTop + .3;
  return {
    parapetTop, massHalf, gableBase,
    frontProjection: style === 'gabled-brick' ? 4.2 : 2.4,
    gableHeight: style === 'gabled-brick' ? (massHalf - 1) * .87 : 0,
    pierWidth: 2,
    pierTop: style === 'gabled-brick' ? gableBase + .8 : parapetTop + 1.8,
    headerBottom: 9.15,
    headerTop: 10.2,
    towerStripeTop: 13.4,
    stripeHeight: 1.05,
    stripeTop: parapetTop - 1.5,
    logoY: style === 'gabled-brick' ? 15.65 + Math.max(0, parapetTop-16.8) : parapetTop-.9,
  };
}
