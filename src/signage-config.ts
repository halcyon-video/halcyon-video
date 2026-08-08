// Configuration mapping placement slot IDs to sign definition IDs from the catalog.
// Set a slot to `null` to omit/remove the sign entirely from the store.
export const DEFAULT_SIGNAGE_CONFIG: Record<string, string | null> = {
  // Checkout registers: 1 tent sign and 2 wire snap frames
  'register-left': 'be-kind-rewind',
  'register-middle': 'membership-free',
  'register-right': 'rental-policy',

  // New Releases wall toppers. The stepped-corner faces intentionally carry NO
  // sign band (the corner keeps its shelving but loses the "New Releases" topper),
  // so 'wall-newrelease-back-right' (forward-jutting step face) and
  // 'wall-newrelease-back-step' (notch connector run) are null. Only the flat
  // back-left wall and the right side wall keep their toppers.
  'wall-newrelease-back-left': 'new-releases-wall',
  'wall-newrelease-back-right': null, // stepped-corner forward face — no sign on the corner
  'wall-newrelease-back-step': null,  // #41 stepped-corner connector run — no sign on the corner
  'wall-newrelease-left-wall': 'new-releases-wall',

  // Ceiling navigation signs for aisles default to 'auto' to display
  // the genre/library name dynamically based on what is shelved underneath.
  // Set any `ceiling-nav-line-<lineId>` to `null` here to remove it, or to
  // a specific sign ID to override the dynamic genre name.

  // 1993 footage pack: the yellow "NEXT REGISTER PLEASE" tent on the closed
  // stretch of the counter band. The bargain-bin INCREDIBLE VALUES card was
  // removed at the owner's request (pin 031) — slot deliberately empty. The
  // red "$3 RENTAL" card that used to hang in front of the New Releases wall
  // was removed entirely (GH #2) — its slot no longer exists at all, so
  // there's no key for it here (see STATIC_SIGNAGE_SLOT_IDS below).
  'promo-previously-viewed': null,
  'register-next': 'next-register-please',
};

// ── Slot-id registry + config validation ────────────────────────────────────
//
// Every STATIC slot id the store builders create. The builders compute slot
// POSITIONS at build time (store-shell.ts signageSlots + entrance
// getSignAnchors), but the IDS are fixed strings — this list is the canonical
// set, and buildSignage() cross-checks the slots it is actually handed against
// it at runtime (console.error on drift), so the list cannot silently rot.
// tools/list-slots.mjs prints it; `npm run build` (list-slots --check) fails
// if DEFAULT_SIGNAGE_CONFIG references a slot or sign that doesn't exist.
export const STATIC_SIGNAGE_SLOT_IDS: readonly string[] = [
  // Checkout counter (entrance/index.ts signAnchors)
  'register-left',
  'register-middle',
  'register-right',
  'register-next',
  // New Releases wall runs (store-shell.ts)
  'wall-newrelease-back-left',
  'wall-newrelease-back-right',
  'wall-newrelease-back-step',
  'wall-newrelease-left-wall',
  // 1993 hanging promo cards (store-shell.ts)
  'promo-previously-viewed',
];

// Ceiling genre/library nav slots are DYNAMIC — one per shelving line, id
// `ceiling-nav-line-<lineId>` (store-shell.ts ceilingSlots). Unset keys mean
// 'auto' (sign shows the genre shelved underneath).
export const CEILING_NAV_SLOT_PREFIX = 'ceiling-nav-line-';

export function isKnownSignageSlotId(id: string): boolean {
  return STATIC_SIGNAGE_SLOT_IDS.includes(id) || id.startsWith(CEILING_NAV_SLOT_PREFIX);
}

// Validate a slot→sign config: every key must be a known slot id and every
// non-null mapped sign id must resolve in the catalog. `resolveSign` is
// injected (getSignDef) so this module stays dependency-free for tooling.
// Returns human-readable problems; empty = valid.
export function validateSignageConfig(
  config: Record<string, string | null>,
  resolveSign: (id: string) => unknown
): string[] {
  const problems: string[] = [];
  for (const [slotId, signId] of Object.entries(config)) {
    if (!isKnownSignageSlotId(slotId)) {
      problems.push(
        `unknown slot id '${slotId}' — not in STATIC_SIGNAGE_SLOT_IDS and not a ` +
        `'${CEILING_NAV_SLOT_PREFIX}*' ceiling slot (run: node tools/list-slots.mjs)`
      );
    }
    if (signId != null && signId !== 'auto' && !resolveSign(signId)) {
      problems.push(`slot '${slotId}' maps to unknown sign id '${signId}' (not in the signage catalog)`);
    }
  }
  return problems;
}
