import type { StoreScene } from './three-scene';
import type { InputCallbacks } from './input';
import { isMobileOverlayBlocking } from './mobile-store';
import { touchStickVector } from './touch-stick';

const inputs = new WeakMap<StoreScene, { x: number; y: number }>();
const still = Object.freeze({ x: 0, y: 0 });
export function mobileWalkInput(scene: StoreScene) {
  const input = inputs.get(scene);
  if (!input) return still;
  if (!scene.isWalkAroundMode || scene.attractTour || isMobileOverlayBlocking() || document.hidden) {
    input.x = input.y = 0;
  }
  return input;
}

/** Phone controls share the existing walk physics, collision and case pickup. */
export function installMobileWalk(root: HTMLElement, stage: HTMLElement, callbacks: InputCallbacks,
  poke: () => void, getScene: () => StoreScene | null): void {
  const walk = document.createElement('button');
  walk.type = 'button'; walk.id = 'store-touch-walk'; walk.className = 'st-btn';
  const walkLabel = document.createElement('span'); walkLabel.className = 'st-label'; walkLabel.textContent = 'WALK'; walk.appendChild(walkLabel);
  walk.setAttribute('aria-label', 'Walk around the store');
  walk.addEventListener('click', () => { if (isMobileOverlayBlocking()) return; stop(); poke(); callbacks.onToggleWalkAround?.(); });
  const stick = document.createElement('div');
  stick.id = 'store-touch-stick'; stick.setAttribute('role', 'group');
  stick.setAttribute('aria-label', 'Movement thumbstick. Drag to walk.');
  const knob = document.createElement('span'); knob.className = 'st-stick-knob'; knob.setAttribute('aria-hidden', 'true');
  const label = document.createElement('span'); label.className = 'st-stick-label'; label.textContent = 'MOVE';
  stick.append(knob, label); root.append(walk, stick);
  let stickId: number | null = null, lookId: number | null = null;
  const cancelled = new Set<number>();
  // A hidden control releases capture, but its eventual finger-up must never
  // fall through to the scene and pick up the movie underneath it.
  for (const type of ['pointerup', 'pointercancel']) document.addEventListener(type, e => {
    const event = e as PointerEvent;
    if (!cancelled.delete(event.pointerId)) return;
    event.preventDefault(); event.stopImmediatePropagation();
  }, true);
  let activeScene: StoreScene | null = null;
  let lookX = 0, lookY = 0, yaw = 0, pitch = 0, moved = false;
  const walking = () => {
    const s = getScene();
    return s?.isWalkAroundMode && !s.attractTour && !isMobileOverlayBlocking() && !document.hidden ? s : null;
  };
  function stop() {
    if (activeScene) inputs.delete(activeScene);
    activeScene = null; knob.style.transform = '';
    const a = stickId, b = lookId; stickId = lookId = null;
    if (a !== null) cancelled.add(a);
    if (b !== null) cancelled.add(b);
    if (a !== null && stick.hasPointerCapture(a)) stick.releasePointerCapture(a);
    if (b !== null && stage.hasPointerCapture(b)) stage.releasePointerCapture(b);
  }
  function stickMove(e: PointerEvent) {
    const s = walking();
    if (!s || s !== activeScene) { stop(); return; }
    const box = stick.getBoundingClientRect();
    const vector = touchStickVector(e.clientX - box.left - box.width / 2, e.clientY - box.top - box.height / 2);
    inputs.set(s, vector); knob.style.transform = `translate(${vector.x * 34}px, ${vector.y * 34}px)`;
    poke(); s.requestRender();
  }
  stick.addEventListener('pointerdown', e => {
    e.preventDefault(); e.stopPropagation();
    const s = walking(); if (!s || stickId !== null) return;
    cancelled.delete(e.pointerId); stickId = e.pointerId; activeScene = s; stick.setPointerCapture(e.pointerId); stickMove(e);
  });
  stick.addEventListener('pointermove', e => { if (e.pointerId === stickId) { e.preventDefault(); stickMove(e); } });
  const releaseStick = (e: PointerEvent) => {
    if (e.pointerId !== stickId) return;
    if (activeScene) inputs.delete(activeScene);
    stickId = null; knob.style.transform = '';
    if (stick.hasPointerCapture(e.pointerId)) stick.releasePointerCapture(e.pointerId);
  };
  for (const event of ['pointerup', 'pointercancel', 'lostpointercapture']) stick.addEventListener(event, e => releaseStick(e as PointerEvent));

  // Capture only walking touch input, before the desktop pointer-lock handlers.
  stage.addEventListener('pointerdown', e => {
    const s = walking(); if (!s || e.pointerType !== 'touch') return;
    e.preventDefault(); e.stopImmediatePropagation();
    if (lookId !== null) { cancelled.add(e.pointerId); return; }
    cancelled.delete(e.pointerId); lookId = e.pointerId; activeScene = s; lookX = e.clientX; lookY = e.clientY;
    yaw = s.yaw; pitch = s.pitch; moved = false; stage.setPointerCapture(e.pointerId); poke();
  }, true);
  stage.addEventListener('pointermove', e => {
    if (e.pointerId !== lookId) {
      if (walking() && e.pointerType === 'touch') { e.preventDefault(); e.stopImmediatePropagation(); }
      return;
    }
    e.preventDefault(); e.stopImmediatePropagation();
    const s = walking(); if (!s || s !== activeScene) { stop(); return; }
    const dx = e.clientX - lookX, dy = e.clientY - lookY;
    if (Math.hypot(dx, dy) > 8) moved = true;
    if (!moved) return;
    s.yaw = yaw - dx * 0.004;
    s.pitch = Math.max(-1.25, Math.min(1.25, pitch - dy * 0.004));
    poke(); s.noteWalkLook();
  }, true);
  const releaseLook = (e: PointerEvent) => {
    if (e.pointerId !== lookId) {
      if (walking() && e.pointerType === 'touch') { e.preventDefault(); e.stopImmediatePropagation(); }
      return;
    }
    e.preventDefault(); e.stopImmediatePropagation();
    const s = walking(), tap = e.type === 'pointerup' && !moved && s === activeScene;
    lookId = null;
    if (stage.hasPointerCapture(e.pointerId)) stage.releasePointerCapture(e.pointerId);
    if (tap && s) {
      s.pointerStartX = e.clientX; s.pointerStartY = e.clientY; s.walkPressStartedLocked = false;
      s.handleWalkClick();
    }
  };
  for (const event of ['pointerup', 'pointercancel', 'lostpointercapture']) stage.addEventListener(event, e => releaseLook(e as PointerEvent), true);
  window.addEventListener('blur', stop);
  window.addEventListener('resize', stop);
  document.addEventListener('visibilitychange', () => { if (document.hidden) stop(); });
  new MutationObserver(() => {
    const s = getScene(), isWalk = s?.isWalkAroundMode === true;
    walkLabel.textContent = isWalk ? 'SHELVES' : 'WALK';
    walk.setAttribute('aria-label', isWalk ? 'Return to shelf browsing' : 'Walk around the store');
    if (!walking() || !root.classList.contains('visible') || root.classList.contains('terminal')) stop();
  }).observe(root, { attributes: true, attributeFilter: ['data-mode', 'class'] });
}
