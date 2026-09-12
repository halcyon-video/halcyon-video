/** Exterior style is independent of doors, counter shape, era, and branding. */
export type FacadeStyle = 'gabled-brick' | 'flat-parapet' | 'arcaded-brick' | 'cone-canopy';

export function resolveFacadeStyle(value: string | null): FacadeStyle {
  return value === 'flat-parapet' || value === 'arcaded-brick' || value === 'cone-canopy' ? value : 'gabled-brick';
}

export function facadeStyle(): FacadeStyle {
  return resolveFacadeStyle(typeof localStorage === 'undefined' ? null : localStorage.getItem('bb_facade'));
}

export type ConeCanopyFinish = 'brand-accent' | 'full-slate';

export function resolveConeCanopyFinish(value: string | null): ConeCanopyFinish {
  return value === 'full-slate' ? 'full-slate' : 'brand-accent';
}

export function coneCanopyFinish(): ConeCanopyFinish {
  return resolveConeCanopyFinish(typeof localStorage === 'undefined' ? null : localStorage.getItem('bb_cone_canopy_finish'));
}

/** Separate entry/exit leaves flank the gabled store's masonry divider. */
export function facadeEntryGlazing(doorWidth: number, style: FacadeStyle) {
  const dividerWidth = style === 'gabled-brick' ? 1.8 : 0;
  const sidelightWidth = style === 'gabled-brick' ? 2.8 : 2;
  return {
    dividerWidth, sidelightWidth,
    doorCenterOffset: (doorWidth + dividerWidth) / 2,
    openingHalfWidth: doorWidth + sidelightWidth + dividerWidth / 2 + (style === 'gabled-brick' ? .3 : .35),
  };
}

// The entrance glass and the roof behind the parapet remain functional anchors.
// Exterior proportions come from the building, rather than extending a tall
// gable by the full difference between the glazing and interior ceiling.
export function facadeDimensions(ceilingY: number, entryHalfWidth: number, style: FacadeStyle) {
  const parapetTop = Math.max(16.8, ceilingY + 1.2);
  const massHalf = entryHalfWidth - (style === 'gabled-brick' ? .3 : 0);
  const gableBase = parapetTop + .3;
  return {
    parapetTop, massHalf, gableBase,
    frontProjection: style === 'cone-canopy' ? 11.5 : 6.2,
    sidewalkDepth: style === 'cone-canopy' ? 12.2 : 6.7,
    // The pillars support the front canopy, with daylight behind them.
    pierBack: style === 'cone-canopy' ? 8.55 : 4.75,
    pierFront: style === 'cone-canopy' ? 11.45 : 6.48,
    gableHeight: style === 'gabled-brick' ? (entryHalfWidth - 1) * .87 : 0,
    pierWidth: style === 'cone-canopy' ? 3.2 : style === 'arcaded-brick' ? 3.25 : 2.75,
    pierTop: style === 'cone-canopy' ? parapetTop + 1.4 : style === 'gabled-brick' ? gableBase + .8 : parapetTop + (style === 'flat-parapet' ? 5.4 : 4),
    headerBottom: 9.15,
    headerTop: 10.2,
    towerStripeTop: 13.4,
    stripeHeight: 1.05,
    stripeTop: parapetTop - 1.5,
    logoY: (style === 'gabled-brick' ? 15.65 : style === 'cone-canopy' ? 13.65 : style === 'flat-parapet' ? 17.6 : 17.1) + Math.max(0, parapetTop-16.8),
  };
}
