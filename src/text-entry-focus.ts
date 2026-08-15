// Who owns the keyboard: the store, or a form field the user is typing into?
//
// Every keyboard consumer in the app has to answer that before it acts, and
// they all used to answer it the same naive way:
//
//     const tag = document.activeElement?.tagName;
//     if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
//
// which is wrong in a way that silently bricks the remote. A field can hold
// focus long after its overlay is DOWN, and then every one of those guards
// bails on every key, forever, with nothing on screen to explain it.
//
// The attested case: #login-overlay hides by opacity alone — `display` stays
// `flex`, `visibility` stays `visible` (styles.css) — so the username field
// that showLoginOverlay() focuses (boot-flow.ts) is still document.activeElement
// after the store launches. Result: log in, land in the store, and the arrows,
// OK and Back do nothing at all until you happen to click something with a
// mouse. The video player's volume slider is the same shape of bug from the
// other direction: an <input type=range> that keeps focus after a click, which
// is what made F8 dead for the rest of playback (see main.ts).
//
// So reachability is the real question, not tag name. A focused field that
// isn't reachable isn't "being typed into", it's STRANDED — and we blur it on
// the spot, so the keypress that discovers the problem is also the one that
// fixes it.

/** Form controls that take over the keyboard while they're focused. */
function isKeyboardControl(el: Element | null): el is HTMLElement {
  if (!el) return false;
  const h = el as HTMLElement;
  if (h.isContentEditable) return true;
  const tag = h.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
}

/** The narrower "the user is typing prose" test — no sliders, no checkboxes. */
function isTextEntry(el: Element | null): el is HTMLElement {
  if (!isKeyboardControl(el)) return false;
  const h = el as HTMLElement;
  if (h.isContentEditable || h.tagName === 'TEXTAREA') return true;
  if (h.tagName !== 'INPUT') return false;
  return !['range', 'checkbox', 'radio', 'button', 'submit', 'reset', 'color', 'file', 'image']
    .includes((h as HTMLInputElement).type);
}

/**
 * Can the user actually see and reach this control right now?
 *
 * Deliberately NOT a computed-opacity test. Overlays here fade in over ~0.5s,
 * so an opacity check would read a just-opened login form as unreachable and
 * blur the field mid-keystroke. `pointer-events` is the honest signal: the
 * app stamps `pointer-events: none !important` on the children of every
 * overlay that isn't `.visible` (styles.css), and unlike opacity it flips
 * instantly with the class rather than easing.
 */
function isReachable(el: HTMLElement): boolean {
  if (!el.isConnected) return false;
  if (el.getClientRects().length === 0) return false; // display:none, detached, zero-box
  const cs = getComputedStyle(el);
  if (cs.visibility === 'hidden' || cs.visibility === 'collapse') return false;
  if (cs.pointerEvents === 'none') return false;       // its overlay is down
  return true;
}

/**
 * Blur a focused-but-unreachable control and report whether anything was
 * stranded. Exported for the recovery rig; callers below use it via the two
 * predicates.
 */
export function healStrandedFocus(): boolean {
  const el = document.activeElement;
  if (!isKeyboardControl(el)) return false;
  if (isReachable(el)) return false;
  el.blur();
  return true;
}

/**
 * True when a visible form control owns the keyboard, so store shortcuts must
 * stand down. A stranded control is blurred and reported as NOT owning it, so
 * this same keypress reaches the store.
 *
 * This is the guard for the main input paths (InputManager, walk mode, clerk
 * dialog, the player's own shortcuts).
 */
export function keyboardOwnedByControl(): boolean {
  const el = document.activeElement;
  if (!isKeyboardControl(el)) return false;
  if (isReachable(el)) return true;
  el.blur();
  return false;
}

/**
 * True when a visible TEXT field has focus. Narrower than the above: a range
 * slider or checkbox doesn't count, so a shortcut that can't collide with them
 * (F8) still works while one is focused.
 */
export function textEntryHasFocus(): boolean {
  const el = document.activeElement;
  if (!isTextEntry(el)) return false;
  if (isReachable(el)) return true;
  el.blur();
  return false;
}

/**
 * Drop focus from anything inside `root` before it's hidden. Belt to the
 * braces above: an overlay that closes tidily never strands a field in the
 * first place, so the heal path stays a safety net rather than the mechanism.
 */
export function blurFocusWithin(root: Element | null | undefined): void {
  if (!root) return;
  const el = document.activeElement as HTMLElement | null;
  if (el && el !== document.body && root.contains(el)) el.blur();
}
