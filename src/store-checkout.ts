// Checkout & carry flow — extracted from StoreScene (three-scene.ts keeps
// one-line delegating stubs): picking tapes up into the carried stack,
// walking them to the counter, the soft-body bag, confirm/finish checkout,
// the non-rental exit ritual (wrap/slide-to-edge/walk/grab/carry-out), the RETURN TAPES
// HERE drop watch, the candy rows, and the debug staging entry points the
// screenshot harness drives. Every function takes the StoreScene as its
// first parameter and reads/writes scene state exactly as the original
// methods did.
import * as THREE from 'three';
import { findTitleByCarryId } from './media-sources';
import { Movie } from './jellyfin';
import { CASE_MEDIUM, getRentalCaseGeometry, createHeroRentalMaterials } from './video-case';
import { BACK_WALL_UNIT_IDX, MovieSlot } from './store-layout';
import { CandyRow } from './fixtures/period-fixtures';
import { retailAudio } from './audio';
import { CarriedTapes, CarryPose, showClerkToast, CARRY_STORAGE_KEY, DEFAULT_CARRY_CAPACITY } from './carried-tapes';
import { saveRentalRecord, makeRentalRecord, rentalCapacityAt } from './rental-clock';
import { tipJarEnabled } from './tip-jar';
import {
  _bagBaseFallback, _checkoutBagFallback, _checkoutCarry, _checkoutStand,
  _checkoutWalkPos, _checkoutWalkAhead,
} from './scene-shared';
import type { StoreScene } from './three-scene';

export function ensureCarried(scene: StoreScene): CarriedTapes {
  if (!scene.carried) {
    // The held stack is parented to the camera (FPS viewmodel), so the
    // camera must be in the scene graph for its children to render. A flat
    // boot never adds the free-floating camera anywhere until now; a VR
    // session (store-vr.ts) parents it under the head-tracking rig instead,
    // which is ALREADY a scene descendant — reparenting it here would rip it
    // out from under the rig and snap the headset to world origin, so only
    // the never-added case (parent === null) gets fixed up.
    if (scene.camera.parent === null) scene.scene.add(scene.camera);
    // T23: with rental mode on, the carry limit is the weekday/weekend rule
    // evaluated at first take (and revalidated at the register).
    const capacity = scene.rentalMode ? rentalCapacityAt(new Date()) : DEFAULT_CARRY_CAPACITY;
    scene.carried = new CarriedTapes(scene.scene, scene.camera, capacity,
      () => scene.onCarriedChange?.(scene.carried?.count ?? 0));
    scene.rebuildSSAOExclusionList(); // carried meshes are AO-excluded viewmodels
  }
  return scene.carried;
}

export function canHoldToCheckout(scene: StoreScene): boolean {
  return scene.carryMode
    && !scene.checkoutRunning
    && scene.mode !== 'checkout'
    && scene.mode !== 'backroom'
    && (scene.carried?.count ?? 0) > 0;
}

export function setCarryMode(scene: StoreScene, enabled: boolean): void {
  if (scene.carryMode === enabled) return;
  // T23: rental mode rides on the carry flow — turning carry off drops
  // rental mode with it (which also releases any active lockout).
  if (!enabled && scene.rentalMode) scene.setRentalMode(false);
  scene.carryMode = enabled;
  if (typeof localStorage !== 'undefined') localStorage.setItem('bb_carry_mode', enabled ? '1' : '0');
  // Rebuild the overview cursor set (the CHECKOUT cursor itself is now
  // unconditional, but the rebuild keeps any carry-dependent state fresh).
  if (scene.overviewCursors) {
    scene.overviewCursors.dispose(scene.scene);
    scene.overviewCursors = null;
    if (scene.mode === 'overview') {
      scene.showOverviewVisuals();
      scene.updateOverviewFocus();
    }
  }
  if (!enabled) {
    // Toggled off mid-flourish: clearAll() below cancels the run and its
    // onComplete will never fire, so release the run state here or the
    // checkoutRunning latch would wedge closed forever.
    if (scene.checkoutRunning) {
      scene.checkoutRunning = false;
      // Mid-exit-ritual: drop the choreography and any whiteout it raised.
      if (scene.checkoutExit?.exitStarted) scene.whiteoutEl()?.classList.remove('active', 'instant');
      const onDone = scene.checkoutExit?.onDone;
      scene.checkoutExit = null;
      scene.entrance?.hideBag();
      scene.clerk?.releaseFromRegister();
      // A handed-off play flourish: complete it now (clears launchAnim and
      // reveals playback) rather than stranding it with no driver.
      onDone?.();
    }
    if (scene.mode === 'checkout') scene.backAction();
    // Tapes never visibly left the shelves (the display copies stay put), so
    // clearing the stack "puts them back" with no re-shelve animation.
    scene.carried?.clearAll(true);
  }
  scene.requestRender();
}

export function rehydrateCarried(scene: StoreScene): void {
  if (typeof localStorage === 'undefined') return;
  let ids: string[] = [];
  try {
    ids = JSON.parse(localStorage.getItem(CARRY_STORAGE_KEY) || '[]');
  } catch { /* corrupt — start empty */ }
  if (!Array.isArray(ids) || ids.length === 0) return;
  const now = performance.now();
  const carried = scene.ensureCarried();
  for (const id of ids) {
    // Source-aware (GH #84): the stored id may be qualified, and a bare one
    // from an older build still resolves. findSlotKeyForMovie takes the BARE
    // id — the shelf slot is the server's own item.
    const movie = findTitleByCarryId(scene.libraries, id);
    if (movie) carried.take(movie, scene.findSlotKeyForMovie(movie.id), null, now);
  }
  if (carried.count > 0) {
    scene.onConsoleLog(`[System] Still carrying ${carried.count} tape(s) from last visit.`, 'system');
  }
}

export function collectHeldTapesForReturn(scene: StoreScene): Movie[] {
  const carried = scene.carried;
  if (!carried || carried.count === 0) return [];
  const movies = scene.resolveRentalMovies(carried.carryIds());
  carried.clearAll(true);
  return movies;
}

export function findSlotKeyForMovie(scene: StoreScene, movieId: string): string | null {
  let key: string | null = null;
  scene.slotsByPosition.forEach((s) => {
    if (key) return;
    if (s.movie.id === movieId && s.source !== 'fixture' && s.unitIdx < BACK_WALL_UNIT_IDX) key = s.key;
  });
  return key;
}

export function slotBackBoxPose(_scene: StoreScene, slot: MovieSlot): CarryPose {
  const theta = slot.currentRotY;
  return {
    x: slot.currentX + slot.backX * Math.cos(theta) + slot.backZ * Math.sin(theta),
    y: slot.currentY + slot.backYLift,
    z: slot.currentZ - slot.backX * Math.sin(theta) + slot.backZ * Math.cos(theta),
    rotY: slot.backRotY + theta,
  };
}

// Shared tail of "add this title to the carried stack", regardless of where
// the movie/slot came from: the 2D inspect-view confirm below, or (VR carry,
// store-vr.ts via store-walk.ts's walkTakeSlot) a headset trigger pull on a
// shelf case raycast hit directly out of walk mode. Does not touch scene.mode
// or the camera — callers decide what happens to the view afterward.
export function takeTapeIntoCarry(scene: StoreScene, movie: Movie, slot: MovieSlot | null): boolean {
  const carried = scene.ensureCarried();
  const verdict = carried.canTake(movie.id);
  if (verdict === 'full') {
    retailAudio.playDenyBuzz();
    const cap = carried.capacity;
    // cap 1 = non-rental carry (checkout starts the movie, so it's one at a
    // time); 2/4 = the rental weeknight/weekend membership rule.
    showClerkToast(cap === 1
      ? `One movie at a time, hon — check that one out or put it back first. (R returns it.)`
      : `${cap === 2 ? 'Two' : cap === 4 ? 'Four' : String(cap)} tapes per membership${cap === 4 ? ' on weekends' : ''}, hon — put one back first. (R returns the top one.)`);
    return false;
  }
  if (verdict === 'duplicate') {
    retailAudio.playDenyBuzz();
    showClerkToast(`You've already got "${movie.title}" right there in your hands.`);
    return false;
  }
  const startPose = slot ? scene.slotBackBoxPose(slot) : null;
  carried.take(movie, slot?.key ?? null, startPose, performance.now());
  retailAudio.playBoxPickup();
  scene.rebuildSSAOExclusionList();
  return true;
}

export function takeSelectedTape(scene: StoreScene): boolean {
  const movie = scene.getSelectedMovie();
  if (!movie) return false;
  const slot = scene.slotsByPosition.get(scene.getActiveSlotKey()) ?? null;
  if (!takeTapeIntoCarry(scene, movie, slot)) return false;
  const carried = scene.carried!;
  scene.onConsoleLog(`[System] Took "${movie.title}" (${carried.count}/${carried.capacity}). C to check out.`, 'system');
  // Step back to the shelf — the case visibly flies from the slot to your hands.
  if (scene.mode === 'inspect') scene.backAction();
  return true;
}

export function returnCarriedTape(scene: StoreScene): void {
  if (!scene.carryMode || scene.checkoutRunning || scene.isWalkAroundMode) return;
  const carried = scene.carried;
  if (!carried || carried.count === 0) return;
  scene.requestRender();
  const movie = carried.topMovie()!;
  const slotKey = carried.topSlotKey() ?? scene.findSlotKeyForMovie(movie.id);
  const slot = slotKey ? scene.slotsByPosition.get(slotKey) : undefined;
  const pose = slot ? scene.slotBackBoxPose(slot) : null;
  carried.putBackTop(pose, performance.now());
  retailAudio.playBoxPickup();
  scene.onConsoleLog(`[System] Put "${movie.title}" back on the shelf.`, 'system');
}

export function enterCheckout(scene: StoreScene): void {
  // No carry-mode gate: the counter hosts the clerk's desk terminal (Left =
  // the system-control menu), so walking up empty-handed must always work.
  // confirmCheckout() still deny-buzzes with nothing in hand.
  if (scene.checkoutRunning) return;
  if (scene.mode === 'backroom') return; // T23: no counter runs from home
  if (scene.isWalkAroundMode) scene.toggleWalkAround();
  if (scene.mode === 'checkout') return;
  scene.requestRender();
  scene.hideOverviewVisuals();
  scene.hideHeroCases();
  if (scene.personEndcap) scene.closePersonEndcap(false);
  scene.mode = 'checkout';
  scene.isFlipped = false; scene.heroSpine = false;
  if (scene.onModeChange) scene.onModeChange(scene.mode);
  if (scene.onGenreMenuUpdate) scene.onGenreMenuUpdate('', [], 0, false);

  // Stand BESIDE the counter's right end (the -X exit side) in the exit
  // walkway, looking north-east across the band's right edge toward the
  // bag stand and the register — the checkout reads as "hand over at the
  // side counter", and the walk-out naturally rounds the counter from here.
  const stand = scene.checkoutStand(_checkoutStand);
  scene.targetCameraPos.copy(stand);
  const bagM = scene.entrance?.bagMouthWorld;
  if (bagM) scene.targetLookAt.set(bagM.x + 3.4, 3.6, bagM.z + 0.9);
  else scene.targetLookAt.set(11.0, 3.6, scene.deskApexZ() + 1.6);
  scene.clerk?.goToRegister();
  scene.updateSelectionArrow();
  scene.triggerLibrarySelectUpdate(false);
  const n = scene.carried?.count ?? 0;
  if (n > 0) {
    scene.onConsoleLog(`[System] At the checkout counter with ${n} tape(s). Enter to check out.`, 'system');
  } else {
    // Right is named here only when there IS a jar (bb_tip_jar off is the
    // owner's "not in my living room" switch, and a hint for a key that does
    // nothing is worse than no hint). Pin 060 asked for the QR to be plainly
    // visible AT CHECKOUT: the overlay it opens is the part a person can
    // actually scan from the couch, so the counter has to say it exists.
    scene.onConsoleLog(
      '[System] At the checkout counter. Left opens the manager terminal, Up talks to the clerk'
      + (tipJarEnabled() ? ', Right shows the tip QR' : '') + '.', 'system');
  }
}

/**
 * ▲ at the checkout counter: speak to the clerk (owner request 2026-08-06).
 * The counter already carries Left (manager terminal), Right (tip jar), OK
 * (confirm) and Back (leave); ▲ was the one free press, and she is standing
 * right there — enterCheckout summons her to the register — so the store's
 * one human being was the only thing at the counter you couldn't address.
 *
 * Opens the SAME menu the walk-up E key gives (find something / what do you
 * recommend / just browsing), not a checkout-only script, so there is one
 * clerk conversation in the app rather than two that drift apart.
 *
 * False when there is no clerk or no dialog layer (headless harness, tests),
 * or mid-flourish, so the caller can fall through to its old no-op.
 */
export function talkToClerkAtCounter(scene: StoreScene): boolean {
  if (scene.mode !== 'checkout' || scene.checkoutRunning) return false;
  if (!scene.clerk?.talkAtCounter()) return false;
  scene.onConsoleLog('[System] Talking to the clerk at the counter.', 'system');
  scene.requestRender();
  return true;
}

export function checkoutStand(scene: StoreScene, out: THREE.Vector3): THREE.Vector3 {
  // Tuned against the shield band's prop layout: the taper's outer face is
  // crowded (candy rack x≈4.9–7.3, tent sign ~(8.2,-2.4), cleaner display
  // on the band top at (4.6,0.5)) — this spot faces the clear band stretch
  // between the tent sign and the apex, beside the exit walkway.
  const base = scene.entrance?.bagBaseWorld;
  if (base) return out.set(base.x + 2.1, 5.4, base.z - 8.2);
  return out.set(7.7, 5.4, scene.deskApexZ() - 1.0);
}

export function checkoutCounterSpots(scene: StoreScene): CarryPose[] {
  // The clear band-top stretch between the tent sign and the apex, fanned
  // up-band away from the stand (bag-anchored so counter shapes track).
  const y = 3.4 + 0.14 + 0.06;
  const b = scene.entrance?.bagBaseWorld;
  const bx = b ? b.x : 5.6;
  const bz = b ? b.z : scene.deskApexZ() + 7.2;
  return [
    { x: bx + 3.67, y, z: bz - 4.86, rotY: 0.85, rotX: -Math.PI / 2 },
    { x: bx + 4.30, y, z: bz - 5.36, rotY: 0.55, rotX: -Math.PI / 2 },
    { x: bx + 4.93, y: y + 0.06, z: bz - 5.86, rotY: 0.75, rotX: -Math.PI / 2 },
    { x: bx + 5.48, y: y + 0.06, z: bz - 6.29, rotY: 0.50, rotX: -Math.PI / 2 },
  ];
}

export function confirmCheckout(scene: StoreScene): boolean {
  if (scene.checkoutRunning) return false;
  const carried = scene.carried;
  if (!carried || carried.count === 0) {
    retailAudio.playDenyBuzz();
    showClerkToast('Nothing to ring up yet — grab a movie or two off the shelves first!');
    return false;
  }
  // T23: revalidate the rental limit AT the register (the rule is evaluated
  // at first take, but a stack picked before 17:00 Friday could straddle
  // the window, or a Sunday-night pile can reach a weeknight counter).
  if (scene.rentalMode) {
    const cap = rentalCapacityAt(new Date());
    carried.setCapacity(cap);
    if (carried.count > cap) {
      retailAudio.playDenyBuzz();
      showClerkToast(`It's a ${cap}-tape night now, hon — put ${carried.count - cap} back first. (R returns the top one.)`);
      return false;
    }
  }
  const now = performance.now();
  const bag = scene.entrance?.bagMouthWorld ??
    _checkoutBagFallback.set(11.0, 3.9, scene.deskApexZ() + 3.0);
  scene.entrance?.showBag();
  const started = carried.beginCheckout(now, scene.checkoutCounterSpots(), bag, {
    onCounter: () => retailAudio.playBoxPickup(),
    onBagged: (movie, mesh, isLast) => {
      // Leave a visible copy in the bag — the STORE'S copy, same as what was
      // carried (rental materials, not the retail box art): a fresh mesh
      // dressed with the module-cached hero-rental materials (owned by
      // video-case's caches, so nothing here needs disposing; same pattern
      // as the launch flourish).
      if (scene.entrance) {
        const copy = new THREE.Mesh(mesh.geometry, createHeroRentalMaterials(movie));
        copy.castShadow = true;
        copy.receiveShadow = true;
        scene.entrance.dropIntoBag(copy);
      }
      if (isLast) {
        retailAudio.playCheckoutChime();
        showClerkToast('All set — great picks! Enjoy your movies tonight.');
        if (scene.rentalMode) {
          // Rental keeps the short tail: pick-up flourish, then the fade
          // into the back room (finishCheckout via onComplete below).
          scene.entrance?.pickUpBag(performance.now());
        } else {
          // Non-rental: hand over to the exit ritual — wrap, slide to the
          // counter's right end where the bag WAITS, walk around, grab it
          // there, carry out the doors (updateCheckoutExit).
          scene.checkoutExit = { start: performance.now(), ids: null };
        }
      }
    },
    onComplete: (ids) => {
      // The exit ritual outlives CarriedTapes' own completion beat — stash
      // the ids and let the walk-out call finishCheckout when it lands.
      if (scene.checkoutExit) scene.checkoutExit.ids = ids;
      else scene.finishCheckout(ids);
    },
  });
  if (started) {
    scene.checkoutRunning = true;
    scene.requestRender();
  }
  return started;
}

// Pure predicate mirroring confirmCheckout's guard clauses, with no side
// effects — store-vr.ts (issue #97) checks this BEFORE deciding to end a VR
// session, so a deny (empty-handed, over the rental cap) never tears down
// the headset view for nothing.
export function canConfirmCheckout(scene: StoreScene): boolean {
  const carried = scene.carried;
  if (!carried || carried.count === 0) return false;
  if (scene.rentalMode && carried.count > rentalCapacityAt(new Date())) return false;
  return true;
}

// VR counter confirm (issue #97): carrying a case to the counter and
// confirming there must never fly the camera through the flat wrap/slide/
// walk-out choreography confirmCheckout()'s flourish drives — that ritual is
// timed off the ACTIVE-tier flat animate() loop, which never runs while a
// WebXR session owns the frame loop (see store-vr.ts's onXRFrame), and a
// scripted camera flight is exactly the "no fly-to-checkout shortcut" the
// issue rules out anyway. This mirrors confirmCheckout's guard clauses but
// then completes the sale immediately: no bag, no exit walk, just the same
// finishCheckout() every other checkout path ends at (which is what starts
// playback). store-vr.ts calls this only after ending the session, so the
// hand-off from "still in the headset" to "watching the movie" has no flat
// warp in between it either.
export function confirmCheckoutVR(scene: StoreScene): boolean {
  const carried = scene.carried;
  if (!carried || carried.count === 0) {
    retailAudio.playDenyBuzz();
    showClerkToast('Nothing to ring up yet — grab a movie or two off the shelves first!');
    return false;
  }
  if (scene.rentalMode) {
    const cap = rentalCapacityAt(new Date());
    carried.setCapacity(cap);
    if (carried.count > cap) {
      retailAudio.playDenyBuzz();
      showClerkToast(`It's a ${cap}-tape night now, hon — put ${carried.count - cap} back first. (R returns the top one.)`);
      return false;
    }
  }
  retailAudio.playCheckoutChime();
  showClerkToast('All set — great picks! Enjoy your movies tonight.');
  scene.finishCheckout(carried.carryIds());
  return true;
}

export function finishCheckout(scene: StoreScene, ids: string[]): void {
  scene.checkoutRunning = false;
  scene.checkoutExit = null;
  scene.carried?.clearAll(true);
  scene.entrance?.hideBag();
  scene.clerk?.releaseFromRegister();
  scene.onConsoleLog(`[System] Checked out ${ids.length} title(s).`, 'system');
  // Non-rental checkout leads straight into playback (main.ts plays the
  // checked-out title): these tapes drop into the RETURN TAPES HERE chute
  // when the player walks back in. Rental's return is handled by the
  // back-room release (exitBackRoomToStore) instead.
  if (!scene.rentalMode) scene.pendingReturnDrop = scene.resolveRentalMovies(ids);
  if (scene.onCheckoutComplete) scene.onCheckoutComplete(ids);
  // T23: rental mode — the checkout is the point of no return. Compute
  // unlockAt ONCE here (local time, weekday/weekend rule or the 5-minute
  // dev timer), persist bb_rental, then fade to black at the counter and
  // wake up in the back room.
  if (scene.rentalMode && ids.length > 0) {
    const record = makeRentalRecord(ids, new Date(), scene.rentalDevTimerOn());
    saveRentalRecord(record);
    scene.enterBackRoom(record, { fade: true });
    return;
  }
  // Non-rental mode: simply back to browsing.
  if (scene.mode === 'checkout') {
    if (scene.overviewStart) {
      scene.enterOverview();
    } else {
      scene.mode = 'library-select';
      if (scene.onModeChange) scene.onModeChange(scene.mode);
      scene.updateCameraTarget();
    }
  }
}

export function updateCheckoutExit(scene: StoreScene, now: number): void {
  const exit = scene.checkoutExit;
  if (!exit) return;
  const t = scene.debugCheckoutExitFreeze ?? (now - exit.start);

  // Phase map (ms) — mirrored in debugStageCheckoutExit, harness.ts's bagexit
  // comment and CLAUDE.md's bagexit line; keep all four in step. The play
  // flourish also lands here (store-inspect.ts hands off at LAUNCH_HANDOFF_MS),
  // so launch pins map onto these phases at x−4300.
  const T_SLIDE0 = 1200;    // wrap done; cloth frozen; the clerk starts the shove
  const T_SLIDE1 = 2000;    // bag parked ON the band top at the counter's right end
  const T_WALK0 = 2400;     // first-person walk-out starts — the bag stays put
  const T_PICK = 4100;      // walker halts beside the waiting bag; handle pinch
  const T_HAND0 = 4300;     // rigid blend: band-top wait spot -> hand carry
  const T_RESUME = 5000;    // droop frozen mid-hold; walk resumes, bag in hand
  const T_DONE = 7600;
  const WHITEOUT_AT = 5600; // CSS fade is 1.2s ease-in — full white before the door

  const bag = scene.entrance?.bagMouthWorld ??
    _checkoutBagFallback.set(11.0, 3.9, scene.deskApexZ() + 3.0);
  const bagBase = scene.entrance?.bagBaseWorld ??
    _bagBaseFallback.set(bag.x, bag.y - 1.1, bag.z);
  const stand = scene.checkoutStand(_checkoutStand);

  // Wait spot: on the shield band's blue top at the counter's RIGHT (-X,
  // exit-walkway) end, just shy of the walk-through gap — offsets from the
  // bag's island rest spot, measured against counter.ts's outline (trimmed
  // gap end ~(2.9, 0.9), band top y 3.54; the tape-cleaner display sits
  // down-band of this stretch, see store-fixtures-config.ts).
  const WAIT_DX = -1.55, WAIT_DZ = -0.75;
  const WAIT_RISE = 3.4 + 0.14 - bagBase.y; // island top → SITTING on the band top
  const HAND_Y = 0.38;                      // carry height above the island top

  if (t >= T_SLIDE0 && !exit.slid) {
    exit.slid = true;
    // Freeze the SETTLED cloth (no lift): the slide is a rigid shove of a
    // standing bag along the countertop, not a carry.
    scene.entrance?.freezeBag();
  }
  if (t >= T_PICK && !exit.pickedUp) {
    exit.pickedUp = true;
    scene.entrance?.pickUpBag(now); // wakes the solver: pinch + rise + droop, in place
  }
  if (t >= T_RESUME && !exit.frozen) {
    exit.frozen = true;
    scene.entrance?.freezeBag(); // mid-hold: droop fully developed, rigid from here
  }

  const carry = _checkoutCarry;

  if (t < T_WALK0) {
    if (t < T_SLIDE0) {
      // WRAP: lean in over the bag from the right-side stand while the
      // cloth does the acting.
      scene.targetCameraPos.set(
        stand.x + (bag.x - stand.x) * 0.30, bag.y + 1.15,
        stand.z + (bag.z - stand.z) * 0.30);
      scene.targetLookAt.set(bag.x, bag.y - 0.25, bag.z);
      return;
    }
    // SLIDE (0.8s): the clerk shoves the standing bag across the island,
    // up over the shared lip onto the shield band's blue top, and parks it
    // at the counter's right end — where the walk-out will pass. It never
    // leaves the counter: the vertical hugs the two surfaces the whole
    // way, and it WAITS there until the walker comes around to grab it.
    const k = Math.min(1, (t - T_SLIDE0) / (T_SLIDE1 - T_SLIDE0));
    const u = k * k * (3 - 2 * k);
    let y: number;
    if (u < 0.30) {
      y = 0.012 * Math.sin(t * 0.02); // dragging chatter on the island top
    } else if (u < 0.62) {
      const s = (u - 0.30) / 0.32;
      y = WAIT_RISE * (s * s * (3 - 2 * s)); // up over the lip onto the band
    } else {
      // skating the band top; chatter dies out so the park is dead still
      y = WAIT_RISE + 0.010 * Math.sin(t * 0.02) * (1 - (u - 0.62) / 0.38);
    }
    carry.set(WAIT_DX * u, y, WAIT_DZ * u);
    scene.entrance?.setBagExitPose(0, carry, Math.sin(t * 0.005) * 0.12 * u * (1 - u));
    // Camera pulls back to the stand, tracking the shove.
    scene.targetCameraPos.copy(stand);
    scene.targetLookAt.set(
      bagBase.x + carry.x, bagBase.y + carry.y + 0.9, bagBase.z + carry.z);
    return;
  }

  // WALK: first-person out — round the counter's right end, STOP beside the
  // waiting bag, grab it off the band edge, then on up the exit corridor,
  // through the vestibule side door, out the front exit leaf.
  if (!exit.exitStarted) {
    exit.exitStarted = true;
    scene.playDoorChime(); // exit doors swing open
    exit.path = scene.buildCheckoutExitPath(stand);
    // Where along the path the walker passes the waiting bag: sampled once
    // at path build (never per frame). The stand point is pulled ~1.4 ft
    // short of the closest approach so the grab is a reach at arm's length,
    // not a point-blank faceful of bag.
    const wx = bagBase.x + WAIT_DX, wz = bagBase.z + WAIT_DZ;
    let best = 0.36, bestD = Infinity;
    for (let i = 0; i <= 96; i++) {
      const u = i / 96;
      exit.path.getPoint(u, _checkoutWalkPos);
      const d = (wx - _checkoutWalkPos.x) ** 2 + (wz - _checkoutWalkPos.z) ** 2;
      if (d < bestD) { bestD = d; best = u; }
    }
    exit.grabP = Math.max(0.05, best - 0.05);
  }
  if (t >= WHITEOUT_AT && scene.debugCheckoutExitFreeze == null) {
    scene.whiteoutEl()?.classList.remove('instant');
    scene.whiteoutEl()?.classList.add('active');
  }
  const path = exit.path!;
  const grabP = exit.grabP ?? 0.36;
  let p: number;
  let bobAmp: number;
  if (t < T_PICK) {
    // Leg 1: stand → beside the bag, easing to a full stop at it.
    const u = (t - T_WALK0) / (T_PICK - T_WALK0);
    p = grabP * u * u * (3 - 2 * u);
    bobAmp = Math.min(1, (t - T_WALK0) / 400) * Math.min(1, (T_PICK - t) / 400);
  } else if (t < T_RESUME) {
    p = grabP; // standing at the counter edge, grabbing the bag
    bobAmp = 0;
  } else {
    // Leg 2: near-constant stride to the door (0.7 linear + 0.3 smooth).
    const v = (t - T_RESUME) / (T_DONE - T_RESUME);
    p = grabP + (1 - grabP) * (0.7 * v + 0.3 * v * v * (3 - 2 * v));
    bobAmp = Math.min(1, (t - T_RESUME) / 400);
  }
  const pos = _checkoutWalkPos;
  const ahead = _checkoutWalkAhead;
  path.getPoint(p, pos);
  path.getPoint(Math.min(1, p + 0.02), ahead);
  let fx = ahead.x - pos.x, fz = ahead.z - pos.z;
  const fl = Math.hypot(fx, fz) || 1;
  fx /= fl; fz /= fl;
  const bob = Math.sin(t * 0.011) * 0.06 * bobAmp;

  // The bag: dead still at the wait spot until the grab beat, then a rigid
  // blend across the body into the right-hand carry (ahead and a little
  // right of the eye, turning with the walk heading). While the blend runs
  // the cloth is still simulating its handle-pinch rise, so the hand-off
  // reads as pinch → lift off the band edge → swing into the carry.
  const rx = -fz, rz = fx;
  const hx = pos.x + fx * 1.35 + rx * 0.55 - bagBase.x;
  const hy = HAND_Y + bob * 0.5 - 0.08;
  const hz = pos.z + fz * 1.35 + rz * 0.55 - bagBase.z;
  let g = t < T_HAND0 ? 0 : Math.min(1, (t - T_HAND0) / (T_RESUME - T_HAND0));
  g = g * g * (3 - 2 * g);
  carry.set(
    WAIT_DX + (hx - WAIT_DX) * g,
    WAIT_RISE + (hy - WAIT_RISE) * g,
    WAIT_DZ + (hz - WAIT_DZ) * g);
  const walkYaw = Math.atan2(fx, fz) + Math.PI / 2; // faces swing to the sides
  const restYaw = scene.entrance?.bagRestYaw ?? walkYaw;
  scene.entrance?.setBagExitPose(0, carry, Math.sin(t * 0.006) * 0.06 * g,
    restYaw + (walkYaw - restYaw) * g);

  // Camera: eyes ahead along the path, turning PART-way to the bag for the
  // grab beat (0.7 max keeps some down-path context in frame).
  let w = 0;
  if (t > T_PICK - 400 && t < T_RESUME + 500) {
    w = Math.max(0, Math.min(1,
      Math.min((t - (T_PICK - 400)) / 400, (T_RESUME + 500 - t) / 500)));
    w = 0.7 * w * w * (3 - 2 * w);
  }
  const aheadX = pos.x + fx * 5.0, aheadY = 4.9 + bob * 0.5, aheadZ = pos.z + fz * 5.0;
  const bagLX = bagBase.x + carry.x, bagLY = bagBase.y + carry.y + 0.6, bagLZ = bagBase.z + carry.z;
  scene.targetCameraPos.set(pos.x, 5.4 + bob, pos.z);
  scene.targetLookAt.set(
    aheadX + (bagLX - aheadX) * w,
    aheadY + (bagLY - aheadY) * w,
    aheadZ + (bagLZ - aheadZ) * w);

  if (t >= T_DONE && scene.debugCheckoutExitFreeze == null) {
    // Play-flourish handoff: the walk-out belongs to a launch, not a carry
    // checkout — route completion to the flourish (which reveals playback;
    // the whiteout stays up under the player exactly like finishCheckout).
    if (exit.onDone) {
      scene.checkoutExit = null;
      scene.checkoutRunning = false;
      exit.onDone();
      return;
    }
    const ids = exit.ids ?? scene.carried?.ids() ?? [];
    scene.finishCheckout(ids); // clears checkoutExit; whiteout stays up for playback
  }
}

export function buildCheckoutExitPath(scene: StoreScene, stand: THREE.Vector3): THREE.CatmullRomCurve3 {
  const doorW = scene.storefrontSpec.doorWidth;
  const backZ = 15.0 - 2 * doorW;            // vestibule store-side wall
  const xL = 11.0 - (9.0 + 2 * doorW) / 2;   // vestibule left (-X, exit-side) wall
  const sideDoorZ = backZ + doorW / 2 + 0.4; // exiters' door in that wall
  const exitX = 11.0 - doorW / 2;            // front exit leaf
  return new THREE.CatmullRomCurve3([
    new THREE.Vector3(stand.x, 0, stand.z),
    new THREE.Vector3(stand.x - 3.7, 0, stand.z + 1.9), // swing wide of the candy rack
    new THREE.Vector3(xL - 0.9, 0, stand.z + 6.0),      // round the counter's right taper
    new THREE.Vector3(xL - 1.1, 0, backZ - 4.1),        // up the exit corridor
    new THREE.Vector3(xL - 0.45, 0, sideDoorZ + 0.1),   // at the side door
    new THREE.Vector3(xL + 1.3, 0, sideDoorZ + 1.2),    // through, into the exit half
    new THREE.Vector3(exitX, 0, 15.9),                  // out the front exit leaf
  ], false, 'centripetal');
}

export function debugStageCheckoutExit(scene: StoreScene, elapsedMs: number): boolean {
  if (!scene.debugTakeCarried(1)) return false; // carry mode on + carried exists
  scene.enterCheckout();
  if (scene.mode !== 'checkout') return false;
  // Clerk in the work strip behind the island, next to the bag she's about
  // to shove to the counter's right end, facing that wait spot.
  scene.debugPoseClerk(6.7, 3.4, 227, 'talk');
  scene.carried!.clearAll(false); // the cases are in the bag for this tableau
  const entrance = scene.entrance;
  const bagM = entrance?.bagMouthWorld;
  if (!entrance || !bagM) return false;
  // Repeat staging (an --also time sweep from one boot): hide→show resets
  // the cloth to its rest pose and re-settles the items already inside, so
  // the movie copies are only dropped on the first run.
  const restage = entrance.isBagShown();
  if (restage) entrance.hideBag();
  entrance.showBag();
  if (!restage) {
    const movies: Movie[] = [];
    scene.slotsByPosition.forEach((slot) => {
      if (movies.length >= 2) return;
      if (slot.source === 'fixture' || slot.unitIdx >= BACK_WALL_UNIT_IDX || slot.hidden) return;
      if (movies.some((m) => m.id === slot.movie.id)) return;
      movies.push(slot.movie);
    });
    for (const movie of movies) {
      const isAnimated = CASE_MEDIUM === 'vhs' && movie.libraryName === 'Animated Movies';
      const copy = new THREE.Mesh(getRentalCaseGeometry(isAnimated), createHeroRentalMaterials(movie));
      copy.castShadow = true;
      copy.receiveShadow = true;
      entrance.dropIntoBag(copy);
      entrance.debugSettleBag(700);
    }
  }
  entrance.debugSettleBag(1600);
  // Phase map — keep in step with updateCheckoutExit's constants.
  const t = Math.min(elapsedMs, 7599);
  if (t >= 1200) entrance.freezeBag(); // settled shape, rigid for the shove
  if (t >= 4100) {
    entrance.pickUpBag(performance.now()); // wakes the solver: pinch + rise
    entrance.debugSettleBag(Math.min(t - 4100, 900)); // droop develops in place
  }
  if (t >= 5000) entrance.freezeBag(); // mid-hold droop, rigid carry from here
  scene.checkoutRunning = true;
  scene.checkoutExit = {
    start: performance.now(), ids: [],
    slid: t >= 1200, pickedUp: t >= 4100, frozen: t >= 5000,
  };
  scene.debugCheckoutExitFreeze = t;
  scene.requestRender();
  return true;
}

export function debugTakeCarried(scene: StoreScene, n: number): boolean {
  scene.setCarryMode(true);
  const carried = scene.ensureCarried();
  const now = performance.now();
  const want = Math.min(n, carried.capacity);
  scene.slotsByPosition.forEach((slot) => {
    if (carried.count >= want) return;
    if (slot.source === 'fixture' || slot.unitIdx >= BACK_WALL_UNIT_IDX || slot.hidden) return;
    carried.take(slot.movie, slot.key, null, now);
  });
  scene.rebuildSSAOExclusionList();
  scene.requestRender();
  return carried.count >= want;
}

export function debugStageCheckout(scene: StoreScene): boolean {
  if (!scene.debugTakeCarried(2)) return false;
  scene.enterCheckout();
  if (scene.mode !== 'checkout') return false;
  // Freeze her at the register instead of waiting out the walk.
  scene.debugPoseClerk(11.0, -1.6, 180, 'talk');
  scene.carried!.stageOnCounter(scene.checkoutCounterSpots());
  scene.requestRender();
  return true;
}

export function debugStageBag(scene: StoreScene, n: number, lift: boolean): boolean {
  if (!scene.debugStageCheckout()) return false;
  const entrance = scene.entrance;
  const bag = entrance?.bagMouthWorld;
  if (!entrance || !bag) return false;
  entrance.showBag();
  // Deterministic titles (map insertion order, same walk debugTakeCarried
  // uses), dressed exactly like the real checkout's bagged copies.
  const movies: Movie[] = [];
  scene.slotsByPosition.forEach((slot) => {
    if (movies.length >= n) return;
    if (slot.source === 'fixture' || slot.unitIdx >= BACK_WALL_UNIT_IDX || slot.hidden) return;
    if (movies.some((m) => m.id === slot.movie.id)) return;
    movies.push(slot.movie);
  });
  for (const movie of movies) {
    const isAnimated = CASE_MEDIUM === 'vhs' && movie.libraryName === 'Animated Movies';
    const copy = new THREE.Mesh(getRentalCaseGeometry(isAnimated), createHeroRentalMaterials(movie));
    copy.castShadow = true;
    copy.receiveShadow = true;
    entrance.dropIntoBag(copy);
    entrance.debugSettleBag(700); // each case lands + the plastic rings down
  }
  entrance.debugSettleBag(1600);
  if (lift) {
    entrance.debugHoldBagLift();
    entrance.debugSettleBag(1000); // into the frozen hold, droop developed
  }
  scene.targetCameraPos.set(bag.x + 1.15, bag.y + 1.5, bag.z - 3.0);
  scene.targetLookAt.set(bag.x, bag.y - 0.55 + (lift ? 0.35 : 0), bag.z);
  scene.camera.position.copy(scene.targetCameraPos);
  scene.camera.lookAt(scene.targetLookAt);
  scene.requestRender();
  return true;
}

export function debugStageReturnDrop(scene: StoreScene, elapsedMs: number, n: number): boolean {
  const entrance = scene.entrance;
  if (!entrance || !entrance.hasReturnSlot()) return false;
  // Deterministic titles: same map-insertion-order walk the other tableaus use.
  const movies: Movie[] = [];
  scene.slotsByPosition.forEach((slot) => {
    if (movies.length >= n) return;
    if (slot.source === 'fixture' || slot.unitIdx >= BACK_WALL_UNIT_IDX || slot.hidden) return;
    if (movies.some((m) => m.id === slot.movie.id)) return;
    movies.push(slot.movie);
  });
  if (movies.length === 0) return false;
  entrance.dropReturnedTapes(movies, performance.now());
  entrance.debugFreezeReturnDrop(elapsedMs);
  entrance.update(performance.now()); // pose the frozen cases before the shot
  const mouth = entrance.getReturnSlotMouth()!;
  const slotYaw = entrance.getReturnSlotYaw()!;
  // Stand a few feet out along the slot face's outward normal, eye dropped
  // toward the slot: chute face fills the frame, lettering readable. Walk
  // yaw 0 faces -Z and n = (sin yaw, cos yaw), so facing -n IS slotYaw.
  const nx = Math.sin(slotYaw), nz = Math.cos(slotYaw);
  scene.teleportWalk(mouth.x + nx * 3.4, mouth.z + nz * 3.4, (slotYaw * 180) / Math.PI, -24, 4.9);
  scene.requestRender();
  return true;
}

export function beginReturnDropWatch(scene: StoreScene): void {
  const entrance = scene.entrance;
  if (!entrance || scene.isWalkAroundMode) return;
  const mouth = entrance.getReturnSlotMouth();
  const yaw = entrance.getReturnSlotYaw();
  if (!mouth || yaw === null) return;
  const nx = Math.sin(yaw), nz = Math.cos(yaw);
  scene.returnDropWatchPos.set(mouth.x + nx * 5.5, 5.4, mouth.z + nz * 5.5);
  scene.returnDropWatchLook.set(mouth.x, mouth.y + 0.4, mouth.z);
  scene.returnDropWatch = true;
  scene.requestRender();
}

export function getCandyRows(scene: StoreScene): CandyRow[] {
  return scene.candyDisplays.flatMap((d) => d.rows);
}

export function dropCandyIntoBag(scene: StoreScene, count: number): void {
  if (!scene.entrance) return;
  if (!scene.candyBoxGeo) scene.candyBoxGeo = new THREE.BoxGeometry(0.24, 0.32, 0.12);
  if (!scene.candyBoxMats) {
    const colors = [0xc81e2c, 0x1a3fae, 0xe08a00, 0x1c8a4a, 0x7a1cae];
    scene.candyBoxMats = colors.map(
      (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.6, metalness: 0.05 })
    );
  }
  const n = Math.max(0, Math.min(count, 5));
  for (let i = 0; i < n; i++) {
    const mat = scene.candyBoxMats[Math.floor(Math.random() * scene.candyBoxMats.length)];
    const box = new THREE.Mesh(scene.candyBoxGeo, mat);
    box.castShadow = true;
    box.receiveShadow = true;
    scene.entrance.dropIntoBag(box);
  }
}
