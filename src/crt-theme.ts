// ─── 1993 rental-POS CRT theme — single source of truth ─────────────────────
//
// Primary reference: a 1993 rental POS terminal — the real
// store POS screen. GOLD on black (not generic amber #ffb000), with solid
// gold reverse-video TITLE and FOOTER bars (dark text inside), a sparse black
// body, no chrome, no scrollbars.
//
// Every CANVAS-drawn CRT (the counter terminal / diegetic search screen in
// src/entrance/index.ts) imports these constants. DOM CRT surfaces (settings
// drawer, power menu, the small CRT panels) use the matching --crt-* custom
// properties defined in src/styles.css — keep that :root block in sync with
// the values here (two renderers, one palette).
//
// Kept dependency-free (no three.js, no DOM) so any module — scene code,
// harness, main.ts — can import it without cycles.

/** Saturated phosphor gold: the reverse-video bars + emphasis text. */
export const CRT_GOLD = '#ffcc00';

/** Slightly warm-bright gold for body text on black (pure gold reads heavy). */
export const CRT_TEXT = '#ffd24a';

/** Dim gold for secondary/decoration lines ("READY.", rules, de-emphasis). */
export const CRT_DIM = '#a58414';

/** CRT glass black — true black with a warm cast, never translucent. */
export const CRT_BLACK = '#0a0700';

/** Dark ink used INSIDE the gold bars / reverse-video selections (near-black
 *  terminal navy — same #000a1c the DOM selection rule uses). */
export const CRT_INK = '#000a1c';
