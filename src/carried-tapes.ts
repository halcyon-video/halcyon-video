// T22 — CarriedTapes: the FPS-viewmodel stack of rental cases you carry while
// browsing with the "Carry & checkout" mode on, plus the flight tweens that
// move cases shelf → hand → counter → bag.
//
// Owned by StoreScene (which remains the camera/mode brain); this module owns
// the carried-list model (ordered ids, capacity), the held-stack meshes, the
// persistence (`bb_carried`), and every case-flight animation. update() is
// called only on ACTIVE-tier composited frames and allocates nothing per frame
// (all math goes through module/instance scratch objects); event-time work
// (taking a tape, starting a checkout) may allocate freely.
//
// CLIP-THROUGH CHOICE (ticket constraint): the held stack is parented to the
// camera and rendered with `depthTest: false` + a high renderOrder — the
// cheapest of the ticket's suggested options (no extra render pass, no
// camera/depth-range juggling). Each case is a convex rounded box with
// back-face culling, so its own front-facing triangles never overlap on
// screen and depth-test-free drawing is artifact-free per case; between
// cases the stack is drawn bottom-to-top (renderOrder = CARRY_RENDER_ORDER +
// index), which matches near-to-far from the tilted over-the-shoulder view.
// The moment a case leaves the hand (put-back, counter hop, bag drop) its
// materials flip back to normal depth testing so it occludes naturally in
// the world.
import * as THREE from 'three';
import type { Movie } from './jellyfin';
import {
  CASE_MEDIUM,
  CASE_DEPTH,
  getRentalCaseGeometry,
  createHeroRentalMaterials,
} from './video-case';

export const CARRY_STORAGE_KEY = 'bb_carried';
// Non-rental carry: checking out STARTS PLAYBACK of the carried title, so
// holding more than one case makes no sense — you watch one movie tonight.
// Rental mode overrides this via setCapacity(rentalCapacityAt(...)) (2 on a
// weeknight, 4 on the weekend).
export const DEFAULT_CARRY_CAPACITY = 1;
// Hard visual/GPU bound regardless of what capacity T23 later configures.
export const MAX_CARRY_CAPACITY = 4;

const CARRY_RENDER_ORDER = 960; // above scene, below the overview cursors (998)

// Holder pose in camera space: low-right of the view, tilted so the top
// case's front cover reads from a natural "looking down at your hands" angle.
const HOLDER_X = 0.16;
const HOLDER_Y = -0.42;
const HOLDER_Z = -0.92;
const HOLDER_SCALE = 0.44;

// Per-slot fan: cases this thin (a DVD is 0.045 ft) would read as one case if
// stacked square, so each higher case steps right/up-stack and rolls a touch —
// a hand-fanned pile where every carried cover stays partly visible.
const FAN_X = 0.15;      // sideways step per case (higher cases fan right)
const FAN_Y = -0.02;     // slight droop per case
const FAN_GAP = 0.03;    // extra spacing along the stack axis
const FAN_ROLL = 0.10;   // additional roll (rad) per case
const BASE_ROLL = -0.05;

export interface CarryPose {
  x: number;
  y: number;
  z: number;
  rotY: number;
  /** Optional pitch (rotation.x, 'YXZ' order). Lying flat on a counter = -PI/2. */
  rotX?: number;
}

export type TakeVerdict = 'ok' | 'full' | 'duplicate';
export type CheckoutPhase = 'counter' | 'bag' | null;

interface Flight {
  kind: 'in' | 'out' | 'counter' | 'bag';
  start: number; // ms timestamp; the flight is dormant until now >= start
  dur: number;
  begun: boolean;
  from: THREE.Vector3;
  fromQ: THREE.Quaternion;
  fromScale: number;
  to: THREE.Vector3;
  toQ: THREE.Quaternion;
  toScale: number;
  arc: number; // parabolic lob height (feet)
}

interface Entry {
  movie: Movie;
  slotKey: string | null; // shelf slot the tape came from (put-back target)
  mesh: THREE.Mesh;
  mats: THREE.Material[]; // cloned — owned and disposed by this module
  flight: Flight | null;
  staged: boolean; // harness tableau: parked in world space, layout skips it
  bagged: boolean; // checkout: already dropped in the bag (mesh hidden)
}

interface CheckoutHooks {
  onCounter: (movie: Movie) => void;
  onBagged: (movie: Movie, mesh: THREE.Mesh, isLast: boolean) => void;
  onComplete: (ids: string[]) => void;
}

interface CheckoutRun {
  hooks: CheckoutHooks;
  bagPhaseStart: number;
  completeAt: number;
  completed: boolean;
  ids: string[];
}

export class CarriedTapes {
  private entries: Entry[] = [];
  private outbound: Entry[] = []; // put-back flights (already off the list)
  private holder = new THREE.Group();
  private checkout: CheckoutRun | null = null;
  // Keeps isAnimating() truthy through the short re-stack settle after a
  // removal without measuring per-mesh distances every frame.
  private settleUntil = 0;

  // Scratch (no per-frame allocations)
  private readonly _p = new THREE.Vector3();
  private readonly _q = new THREE.Quaternion();
  private readonly _s = new THREE.Vector3();
  private readonly _e = new THREE.Euler();
  private readonly _m = new THREE.Matrix4();
  private readonly _m2 = new THREE.Matrix4();

  // T23: rental mode retunes this per the weekday/weekend rule (setCapacity).
  private _capacity: number;

  constructor(
    private scene: THREE.Scene,
    private camera: THREE.PerspectiveCamera,
    capacity: number,
    private onChange?: () => void,
  ) {
    this._capacity = Math.max(1, Math.min(MAX_CARRY_CAPACITY, capacity));
    // Viewmodel: the holder rides the camera. The owner guarantees the camera
    // is in the scene graph (StoreScene adds it on first use).
    this.holder.position.set(HOLDER_X, HOLDER_Y, HOLDER_Z);
    this.holder.rotation.set(-1.22, 0.30, 0.08);
    this.holder.scale.setScalar(HOLDER_SCALE);
    camera.add(this.holder);
  }

  get count(): number {
    return this.entries.length;
  }

  get capacity(): number {
    return this._capacity;
  }

  /**
   * T23: retune the carry limit (rental mode's weekday/weekend rule, or back
   * to the default when rental mode turns off). Clamped to the hard visual
   * bound; an over-full stack is never truncated here — takes just refuse
   * until the count drops back under (checkout revalidates separately).
   */
  setCapacity(capacity: number): void {
    this._capacity = Math.max(1, Math.min(MAX_CARRY_CAPACITY, capacity));
  }

  ids(): string[] {
    return this.entries.map((e) => e.movie.id);
  }

  topMovie(): Movie | null {
    return this.entries.length ? this.entries[this.entries.length - 1].movie : null;
  }

  topSlotKey(): string | null {
    return this.entries.length ? this.entries[this.entries.length - 1].slotKey : null;
  }

  canTake(movieId: string): TakeVerdict {
    if (this.entries.length >= this.capacity) return 'full';
    if (this.entries.some((e) => e.movie.id === movieId)) return 'duplicate';
    return 'ok';
  }

  get checkoutPhase(): CheckoutPhase {
    if (!this.checkout) return null;
    return performance.now() >= this.checkout.bagPhaseStart ? 'bag' : 'counter';
  }

  get checkoutActive(): boolean {
    return this.checkout !== null;
  }

  /** True while any flight/settle is in motion — pins the ACTIVE render tier. */
  isAnimating(now: number): boolean {
    if (this.checkout) return true;
    if (this.outbound.length > 0) return true;
    if (now < this.settleUntil) return true;
    for (let i = 0; i < this.entries.length; i++) {
      if (this.entries[i].flight) return true;
    }
    return false;
  }

  /**
   * Add a tape to the stack. With `startPose` the case flies from that world
   * pose (its shelf slot) into the hand; without it (rehydrate/debug) it
   * appears directly in the stack. Returns the verdict — only 'ok' takes.
   */
  take(movie: Movie, slotKey: string | null, startPose: CarryPose | null, now: number): TakeVerdict {
    const verdict = this.canTake(movie.id);
    if (verdict !== 'ok') return verdict;

    const mesh = new THREE.Mesh(this.caseGeometry(movie), []);
    mesh.rotation.order = 'YXZ';
    mesh.castShadow = false; // viewmodel — a camera-glued shadow reads wrong
    mesh.receiveShadow = false;
    mesh.frustumCulled = false; // 4 meshes max; culling a camera child is moot
    mesh.userData.excludeFromSSAO = true;
    const entry: Entry = { movie, slotKey, mesh, mats: [], flight: null, staged: false, bagged: false };
    this.applyMaterials(entry, true);

    this.entries.push(entry);
    if (startPose) {
      // World-space approach flight toward the (moving) hand slot.
      mesh.position.set(startPose.x, startPose.y, startPose.z);
      mesh.rotation.set(startPose.rotX ?? 0, startPose.rotY, 0);
      this.scene.add(mesh);
      entry.flight = this.makeFlight('in', now, 650, 0.9);
      entry.flight.from.copy(mesh.position);
      entry.flight.fromQ.copy(mesh.quaternion);
      entry.flight.fromScale = 1;
      entry.flight.begun = true;
    } else {
      this.holder.add(mesh);
      this.placeInSlot(entry, this.entries.length - 1);
    }
    this.relayout();
    this.persist();
    this.onChange?.();
    return 'ok';
  }

  /**
   * Return the top-of-stack tape to its shelf: it flies to `targetPose` (the
   * slot's rental-copy pose) and is then disposed. Without a pose it is
   * removed instantly. Returns the movie put back, or null.
   */
  putBackTop(targetPose: CarryPose | null, now: number): Movie | null {
    if (this.checkout || this.entries.length === 0) return null;
    const entry = this.entries.pop()!;
    if (entry.flight?.kind === 'in') {
      // Mid-take — just cancel it on the spot.
      this.disposeEntry(entry);
    } else if (targetPose) {
      this.detachToWorld(entry);
      entry.flight = this.makeFlight('out', now, 700, 1.6);
      entry.flight.begun = true;
      entry.flight.from.copy(entry.mesh.position);
      entry.flight.fromQ.copy(entry.mesh.quaternion);
      entry.flight.fromScale = entry.mesh.scale.x;
      entry.flight.to.set(targetPose.x, targetPose.y, targetPose.z);
      this._e.set(targetPose.rotX ?? 0, targetPose.rotY, 0, 'YXZ');
      entry.flight.toQ.setFromEuler(this._e);
      entry.flight.toScale = 1;
      this.outbound.push(entry);
    } else {
      this.disposeEntry(entry);
    }
    this.settleUntil = now + 600;
    this.relayout();
    this.persist();
    this.onChange?.();
    return entry.movie;
  }

  /**
   * Run the checkout flourish: each case hops from the hand onto a counter
   * spot (staggered), then one by one into the bag. Hooks fire as cases land;
   * onComplete fires once with the item ids — the owner then calls
   * clearAll(true).
   */
  beginCheckout(now: number, spots: CarryPose[], bagMouth: { x: number; y: number; z: number }, hooks: CheckoutHooks): boolean {
    if (this.checkout || this.entries.length === 0) return false;
    const n = this.entries.length;
    const COUNTER_STAGGER = 480;
    const COUNTER_DUR = 620;
    // The bag beat is THE ritual (user feedback): each case takes a slow,
    // readable lob off the counter into the bag's mouth — with the camera
    // leaned in over it (StoreScene owns that framing) — instead of the old
    // blink-and-miss half-second hop.
    const BAG_GAP = 650; // beat between the last counter landing and the first bag hop
    const BAG_STAGGER = 950;
    const BAG_DUR = 1250;

    for (let i = 0; i < n; i++) {
      // Top of the stack (what's in front of your eyes) goes first.
      const entry = this.entries[n - 1 - i];
      const spot = spots[i % spots.length];
      const f = this.makeFlight('counter', now + 200 + i * COUNTER_STAGGER, COUNTER_DUR, 1.5);
      f.to.set(spot.x, spot.y, spot.z);
      this._e.set(spot.rotX ?? -Math.PI / 2, spot.rotY, 0, 'YXZ');
      f.toQ.setFromEuler(this._e);
      f.toScale = 1;
      entry.flight = f;
    }
    const counterDone = now + 200 + (n - 1) * COUNTER_STAGGER + COUNTER_DUR;
    const bagStart = counterDone + BAG_GAP;
    const lastBagLand = bagStart + (n - 1) * BAG_STAGGER + BAG_DUR;
    this.checkout = {
      hooks,
      bagPhaseStart: bagStart,
      completeAt: lastBagLand + 550,
      completed: false,
      ids: this.ids(),
    };
    // Bag flights are armed as the counter flights complete (see update()) so
    // each case's `from` is its actual counter resting pose. Store the shared
    // bag target on the run via a per-entry schedule below.
    for (let i = 0; i < n; i++) {
      const entry = this.entries[n - 1 - i];
      const bf = this.makeFlight('bag', bagStart + i * BAG_STAGGER, BAG_DUR, 1.3);
      // Land AT the mouth, full size — the soft-body bag takes it from there
      // (onBagged hands a visible copy to dropIntoBag, which animates the fall
      // inside and deforms the plastic around it).
      bf.to.set(bagMouth.x, bagMouth.y + 0.12, bagMouth.z);
      this._e.set(-0.3, 0, 0, 'YXZ');
      bf.toQ.setFromEuler(this._e);
      bf.toScale = 1;
      (entry as Entry & { pendingBag?: Flight }).pendingBag = bf;
    }
    return true;
  }

  /**
   * Harness tableau (`--state checkout`): park every carried case statically
   * on the counter spots — the deterministic "mid-checkout" frame.
   */
  stageOnCounter(spots: CarryPose[]): void {
    for (let i = 0; i < this.entries.length; i++) {
      const entry = this.entries[i];
      const spot = spots[i % spots.length];
      entry.flight = null;
      entry.staged = true;
      this.detachToWorld(entry);
      entry.mesh.position.set(spot.x, spot.y, spot.z);
      entry.mesh.rotation.set(spot.rotX ?? -Math.PI / 2, spot.rotY, 0);
      entry.mesh.scale.setScalar(1);
    }
  }

  /**
   * Per-ACTIVE-frame update: viewmodel bob + every in-flight case. Zero
   * allocations — scratch objects only.
   * `bobPhase`/`bobAmount` come straight from StoreScene's walk integrator;
   * `glide01` is 1 while the browse camera is lerping (a gentle float so the
   * stack feels held, not bolted on).
   */
  update(now: number, bobPhase: number, bobAmount: number, glide01: number): void {
    // Walk-bob: counter-phased against the camera's own head-bob so the stack
    // visibly rides in the hands. Eases with the same smoothstep the camera
    // uses; exactly the base pose again when parked (bobAmount 0).
    const a = bobAmount * bobAmount * (3 - 2 * bobAmount);
    const bobY = Math.sin(bobPhase * 2 + 0.9) * 0.035 * a;
    const bobX = Math.cos(bobPhase) * 0.020 * a;
    const sway = glide01 > 0 ? Math.sin(now * 0.004) * 0.010 * glide01 : 0;
    this.holder.position.set(HOLDER_X + bobX, HOLDER_Y + bobY + sway, HOLDER_Z);

    // Hand-slot settle: lerp resident cases toward their (index-derived) slot
    // pose so the pile re-stacks smoothly after a put-back.
    let holderWorldFresh = false;
    for (let i = 0; i < this.entries.length; i++) {
      const entry = this.entries[i];
      if (entry.staged || entry.bagged) continue;
      const f = entry.flight;
      if (!f) {
        if (entry.mesh.parent === this.holder) {
          const roll = this.slotLocalInto(i, this._p);
          entry.mesh.position.lerp(this._p, 0.25);
          entry.mesh.rotation.z += (roll - entry.mesh.rotation.z) * 0.25;
        }
        continue;
      }
      if (now < f.start) continue;
      if (!f.begun) {
        // Counter/bag hops leave the hand lazily so `from` is live.
        this.detachToWorld(entry);
        f.from.copy(entry.mesh.position);
        f.fromQ.copy(entry.mesh.quaternion);
        f.fromScale = entry.mesh.scale.x;
        f.begun = true;
      }
      if (f.kind === 'in') {
        // Target tracks the (camera-riding) hand slot every frame.
        if (!holderWorldFresh) {
          this.holder.updateWorldMatrix(true, false);
          holderWorldFresh = true;
        }
        const roll = this.slotLocalInto(i, this._p);
        this._e.set(0, 0, roll, 'YXZ');
        this._q.setFromEuler(this._e);
        this._s.setScalar(1);
        this._m.compose(this._p, this._q, this._s);
        this._m2.multiplyMatrices(this.holder.matrixWorld, this._m);
        this._m2.decompose(f.to, f.toQ, this._s);
        f.toScale = this._s.x;
      }
      const k = Math.min(1, (now - f.start) / f.dur);
      const e = k * k * (3 - 2 * k); // smoothstep
      entry.mesh.position.lerpVectors(f.from, f.to, e);
      entry.mesh.position.y += Math.sin(k * Math.PI) * f.arc;
      entry.mesh.quaternion.slerpQuaternions(f.fromQ, f.toQ, e);
      entry.mesh.scale.setScalar(f.fromScale + (f.toScale - f.fromScale) * e);
      if (k >= 1) this.finishFlight(entry, now);
    }

    // Outbound put-back flights (already off the carried list).
    for (let i = this.outbound.length - 1; i >= 0; i--) {
      const entry = this.outbound[i];
      const f = entry.flight!;
      const k = Math.min(1, (now - f.start) / f.dur);
      const e = k * k * (3 - 2 * k);
      entry.mesh.position.lerpVectors(f.from, f.to, e);
      entry.mesh.position.y += Math.sin(k * Math.PI) * f.arc;
      entry.mesh.quaternion.slerpQuaternions(f.fromQ, f.toQ, e);
      entry.mesh.scale.setScalar(f.fromScale + (f.toScale - f.fromScale) * e);
      if (k >= 1) {
        this.outbound.splice(i, 1);
        this.disposeEntry(entry); // it "merges back" into the instanced copy
      }
    }

    // Checkout completion (after the last bag landing beat).
    if (this.checkout && !this.checkout.completed && now >= this.checkout.completeAt) {
      this.checkout.completed = true;
      const run = this.checkout;
      run.hooks.onComplete(run.ids);
    }
  }

  private finishFlight(entry: Entry, now: number): void {
    const f = entry.flight!;
    entry.flight = null;
    if (f.kind === 'in') {
      // Land in the hand: reparent and snap to the exact local slot pose.
      this.scene.remove(entry.mesh);
      this.holder.add(entry.mesh);
      this.placeInSlot(entry, this.entries.indexOf(entry));
      this.setDepthTest(entry, true /* viewmodel = depthTest OFF */);
    } else if (f.kind === 'counter') {
      this.checkout?.hooks.onCounter(entry.movie);
      // Arm the queued bag hop from this exact counter pose.
      const pending = (entry as Entry & { pendingBag?: Flight }).pendingBag;
      if (pending) {
        entry.flight = pending;
        (entry as Entry & { pendingBag?: Flight }).pendingBag = undefined;
        pending.from.copy(entry.mesh.position);
        pending.fromQ.copy(entry.mesh.quaternion);
        pending.fromScale = entry.mesh.scale.x;
        pending.begun = true;
      }
    } else if (f.kind === 'bag') {
      entry.bagged = true;
      entry.mesh.visible = false;
      const isLast = this.entries.every((e2) => e2.bagged);
      this.checkout?.hooks.onBagged(entry.movie, entry.mesh, isLast);
      if (isLast && this.checkout) {
        this.checkout.completeAt = Math.min(this.checkout.completeAt, now + 550);
      }
    }
  }

  /** After onComplete (or on carry-mode off): drop everything, clear storage. */
  clearAll(clearStorage: boolean): void {
    for (const entry of this.entries) this.disposeEntry(entry);
    this.entries.length = 0;
    for (const entry of this.outbound) this.disposeEntry(entry);
    this.outbound.length = 0;
    this.checkout = null;
    if (clearStorage && typeof localStorage !== 'undefined') {
      localStorage.removeItem(CARRY_STORAGE_KEY);
    }
    this.onChange?.();
  }

  /** Scene teardown: release GPU resources but keep `bb_carried` for reboot. */
  dispose(): void {
    this.clearAll(false);
    this.camera.remove(this.holder);
  }

  // ── Internals ──────────────────────────────────────────────────────────────

  private caseGeometry(movie: Movie): THREE.BufferGeometry {
    const isAnimated = CASE_MEDIUM === 'vhs' && movie.libraryName === 'Animated Movies';
    // What you carry to the counter is the STORE'S copy — the rental
    // rental clamshell that sits behind the retail display box on the shelf —
    // so use the rental geometry (identical on DVD; the molded rim on VHS).
    return getRentalCaseGeometry(isAnimated); // shared module singleton — never disposed here
  }

  // Clone the rental-clamshell materials (house-colored panels with
  // this title's printed label — the same per-title panel set the shelf's
  // rental copies use) so this case can disable depth testing without
  // mutating the shared/cached originals. Clones share the underlying canvas
  // textures; only the clone objects themselves are disposed on removal. The
  // panels are drawn from the box scan + movie metadata — no poster streaming.
  private applyMaterials(entry: Entry, viewmodel: boolean): void {
    for (const m of entry.mats) m.dispose();
    entry.mats = createHeroRentalMaterials(entry.movie).map((m) => m.clone());
    entry.mesh.material = entry.mats;
    this.setDepthTest(entry, viewmodel);
  }

  /** viewmodel=true → depthTest off (held stack); false → normal world case. */
  private setDepthTest(entry: Entry, viewmodel: boolean): void {
    for (const m of entry.mats) {
      m.depthTest = !viewmodel;
      m.depthWrite = !viewmodel;
    }
    entry.mesh.renderOrder = viewmodel
      ? CARRY_RENDER_ORDER + Math.max(0, this.entries.indexOf(entry))
      : 0;
  }

  /** Hand-slot pose for stack index i (bottom = 0). Returns the roll (rad). */
  private slotLocalInto(idx: number, p: THREE.Vector3): number {
    const i = Math.max(0, idx);
    p.set(i * FAN_X, i * FAN_Y, i * (CASE_DEPTH + FAN_GAP));
    return BASE_ROLL + i * FAN_ROLL;
  }

  private placeInSlot(entry: Entry, idx: number): void {
    const roll = this.slotLocalInto(idx, entry.mesh.position);
    entry.mesh.rotation.set(0, 0, roll);
    entry.mesh.scale.setScalar(1);
  }

  private relayout(): void {
    // renderOrder tracks stack order (bottom drawn first = farthest from the
    // tilted viewmodel eye); positions ease over in update().
    for (let i = 0; i < this.entries.length; i++) {
      const entry = this.entries[i];
      if (entry.mesh.parent === this.holder) {
        entry.mesh.renderOrder = CARRY_RENDER_ORDER + i;
      }
    }
  }

  private detachToWorld(entry: Entry): void {
    if (entry.mesh.parent !== this.holder) return;
    this.holder.updateWorldMatrix(true, false);
    entry.mesh.updateMatrixWorld(true);
    this._m.copy(entry.mesh.matrixWorld);
    this.holder.remove(entry.mesh);
    this.scene.add(entry.mesh);
    this._m.decompose(entry.mesh.position, entry.mesh.quaternion, this._s);
    entry.mesh.scale.copy(this._s);
    this.setDepthTest(entry, false); // back in the world — occlude normally
  }

  private makeFlight(kind: Flight['kind'], start: number, dur: number, arc: number): Flight {
    return {
      kind,
      start,
      dur,
      begun: false,
      from: new THREE.Vector3(),
      fromQ: new THREE.Quaternion(),
      fromScale: 1,
      to: new THREE.Vector3(),
      toQ: new THREE.Quaternion(),
      toScale: 1,
      arc,
    };
  }

  private disposeEntry(entry: Entry): void {
    entry.mesh.parent?.remove(entry.mesh);
    for (const m of entry.mats) m.dispose(); // clones only; textures stay cached
    entry.mats = [];
  }

  private persist(): void {
    if (typeof localStorage === 'undefined') return;
    try {
      localStorage.setItem(CARRY_STORAGE_KEY, JSON.stringify(this.ids()));
    } catch {
      // Storage full/unavailable — carrying still works, it just won't survive a reload.
    }
  }
}

// ── Clerk-flavored toast ─────────────────────────────────────────────────────
// Small period-styled speech card used for carry refusals, the empty-handed
// checkout nudge and the clerk's checkout line. One reused DOM node.

let toastEl: HTMLDivElement | null = null;
let toastTimer: number | null = null;

export function showClerkToast(text: string, ms = 3200): void {
  if (typeof document === 'undefined') return;
  if (!toastEl) {
    toastEl = document.createElement('div');
    // 10-ft type floor (review §4.4): ≥20px in the design mono.
    toastEl.style.cssText =
      'position:fixed;left:50%;bottom:110px;transform:translateX(-50%) translateY(10px);' +
      'z-index:62;pointer-events:none;opacity:0;transition:opacity .2s,transform .2s;' +
      "font-family:var(--font-mono,'Courier New',monospace);font-size:20px;font-weight:400;letter-spacing:.03em;" +
      'color:#eef3ff;background:linear-gradient(180deg,rgba(17,30,64,.96),rgba(9,16,38,.96));' +
      'border:2px solid var(--bb-primary, #1560bd);border-radius:8px;padding:12px 18px;max-width:min(720px,90vw);' +
      'box-shadow:0 8px 30px rgba(0,0,0,.55);text-shadow:0 1px 2px #000;';
    const name = document.createElement('span');
    name.textContent = 'CLERK  ';
    name.style.cssText = 'color:var(--bb-secondary, #f2e8c9);letter-spacing:.18em;font-size:20px;font-weight:700;';
    toastEl.appendChild(name);
    const body = document.createElement('span');
    body.className = 'clerk-toast-body';
    toastEl.appendChild(body);
    document.body.appendChild(toastEl);
  }
  (toastEl.querySelector('.clerk-toast-body') as HTMLSpanElement).textContent = text;
  toastEl.style.opacity = '1';
  toastEl.style.transform = 'translateX(-50%) translateY(0)';
  if (toastTimer !== null) window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    if (toastEl) {
      toastEl.style.opacity = '0';
      toastEl.style.transform = 'translateX(-50%) translateY(10px)';
    }
    toastTimer = null;
  }, ms);
}

/** Hide the toast now — e.g. the clerk dialog it was heralding just opened. */
export function hideClerkToast(): void {
  if (toastTimer !== null) {
    window.clearTimeout(toastTimer);
    toastTimer = null;
  }
  if (toastEl) {
    toastEl.style.opacity = '0';
    toastEl.style.transform = 'translateX(-50%) translateY(10px)';
  }
}

/** Test/teardown helper — drops the toast DOM node. */
export function disposeClerkToast(): void {
  if (toastTimer !== null) {
    window.clearTimeout(toastTimer);
    toastTimer = null;
  }
  toastEl?.remove();
  toastEl = null;
}
