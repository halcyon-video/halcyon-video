/** Exterior style is independent of doors, counter shape, era, and branding. */
export type FacadeStyle = 'gabled-brick' | 'flat-parapet' | 'arcaded-brick';

export function resolveFacadeStyle(value: string | null): FacadeStyle {
  return value === 'flat-parapet' || value === 'arcaded-brick' ? value : 'gabled-brick';
}

export function facadeStyle(): FacadeStyle {
  return resolveFacadeStyle(typeof localStorage === 'undefined' ? null : localStorage.getItem('bb_facade'));
}

/** Separate entry/exit leaves flank the gabled store's masonry divider. */
export function facadeEntryGlazing(doorWidth: number, style: FacadeStyle) {
  const dividerWidth = style === 'gabled-brick' ? 1.6 : 0;
  const sidelightWidth = style === 'gabled-brick' ? 2.4 : 2;
  return {
    dividerWidth, sidelightWidth,
    doorCenterOffset: (doorWidth + dividerWidth) / 2,
    openingHalfWidth: doorWidth + sidelightWidth + dividerWidth / 2 + .35,
  };
}

// The entrance glass and the roof behind the parapet remain functional anchors.
// Exterior proportions come from the building, rather than extending a tall
// gable by the full difference between the glazing and interior ceiling.
export function facadeDimensions(ceilingY: number, entryHalfWidth: number, style: FacadeStyle) {
  const parapetTop = Math.max(16.8, ceilingY + 1.2);
  const massHalf = entryHalfWidth - (style === 'gabled-brick' ? .75 : 0);
  const gableBase = parapetTop + .3;
  return {
    parapetTop, massHalf, gableBase,
    frontProjection: style === 'gabled-brick' ? 1.4 : 2.4,
    gableHeight: style === 'gabled-brick' ? (entryHalfWidth - 1) * .87 : 0,
    pierWidth: style === 'gabled-brick' ? 2.75 : 2,
    pierTop: style === 'gabled-brick' ? gableBase + .8 : parapetTop + 1.8,
    headerBottom: 9.15,
    headerTop: 10.2,
    towerStripeTop: 13.4,
    stripeHeight: 1.05,
    stripeTop: parapetTop - 1.5,
    logoY: style === 'gabled-brick' ? 15.65 + Math.max(0, parapetTop-16.8) : parapetTop-.9,
  };
}
