import * as THREE from 'three';
import { ClerkInteraction, type ClerkInteractionHooks, type ClerkSuggestion } from './clerk-interaction';
import type { Movie } from './jellyfin';
import {
  ANIM_DEF, ANIM_COL, ATLAS_COLS, ATLAS_ROWS, CELL_W, CELL_H,
  buildClerkAtlasCanvas, type AnimKey,
} from './clerk-art';
import { ClerkNavGrid } from './clerk-nav';
import { BOX_SPACING, UNIT_DEPTH, UNIT_SECTIONS } from './store-layout';

/**
 * StoreClerk — a Doom-style directional 2D billboard clerk.
 *
 * She has a real world HEADING (independent of the camera). Each frame we pick
 * one of five drawn views — front / front-side / side / back-side / back —
 * based on the angle between her heading and the direction to the camera, and
 * mirror horizontally for the opposite three octants. The quad still billboards
 * to face the camera (THREE.Sprite); only the *drawn view* changes.
 *
 * The character art (a stylized female retail clerk: brunette bob, house polo +
 * nametag, khakis, black sneakers) is generated procedurally on a canvas — see
 * `src/clerk-art.ts`, which owns the whole sprite sheet: the two-bone limb rig,
 * per-part shading, silhouette outlining and the painted face. This class owns
 * only her behavior (navigation, stocking/idle/chat state) and the runtime
 * view-picking that pages the atlas.
 *
 * Atlas grid (from clerk-art): rows = direction (5), columns = every animation
 * frame concatenated left-to-right (idle 2 · walk 4 · stockHigh 2 · stockMid 2
 * · stockLow 2 · talk 2 · type 2 = 16).
 *
 * Navigation is grid-based (src/clerk-nav.ts): the scene hands the
 * constructor an occupancy grid built from the store's real ground-plan
 * footprints, and every trip is an A* route through it — she physically walks
 * around shelving, fixtures, and the counter (entering it only through its
 * real walk-through gap) instead of following hardcoded waypoints.
 */

// High-level behavior state (T14 Phase B/C). STOCKING covers high/mid reaches,
// SQUATTING is the low-shelf crouch, CHATTING is player interaction.
type ClerkState = 'IDLE' | 'WALKING' | 'STOCKING' | 'SQUATTING' | 'CHATTING';

// Player must be within this radius (feet) to be offered a chat.
const CHAT_RADIUS = 6.0;

// Roam gate: she takes at most one floor trip roughly every this-many seconds
// of AWAKE time; otherwise she stays working the register/counter. Accumulated
// from dt (not wall-clock) so it freezes while she's asleep / in the back room
// (update() isn't called then) and never "owes" a roam on wake.
const ROAM_INTERVAL = 300;

// Hoisted so the per-frame update path allocates nothing (see the file's
// scratch-object convention): the stocking cycle high→mid→low.
const STOCK_CYCLE: readonly AnimKey[] = ['stockHigh', 'stockMid', 'stockLow'];

// World size of the billboard (feet). Aspect matches the cell aspect.
const SPRITE_HEIGHT = 5.7;
const SPRITE_WIDTH = SPRITE_HEIGHT * (CELL_W / CELL_H);

// How far off a shelf face she stands while stocking it (feet). Close enough
// that the stocking reach visually touches the boxes, far enough that the
// billboard doesn't clip the shelf geometry. Her stand point sits this far
// off the face, i.e. UNIT_DEPTH/2 + SHELF_STANDOFF off the unit centreline —
// the old code parked her 5.5 ft out, which read as stocking thin air.
const SHELF_STANDOFF = 1.35;

// A place the clerk can walk to, with the exact heading to face on arrival
// (heading convention: atan2(dirX, dirZ); PI faces -Z, toward the back wall).
export interface ClerkDest {
  x: number;
  z: number;
  yaw: number;
  // counter = register/terminal duty; shelf = one shelving SECTION (the span
  // between two dividers); stand = a display fixture face; wall = a wall-shelf
  // run. Determines the on-arrival activity and dwell time.
  kind: 'counter' | 'shelf' | 'stand' | 'wall';
  key: string;
  // What she does at a counter spot ('type' at a terminal, 'idle' at the
  // register). Floor kinds derive their activity from `kind` instead.
  activity?: 'idle' | 'type';
}

// The counter work spots the entrance module derives from the real counter
// geometry (see entrance/counter.ts): where she runs the register and where
// the two rental terminals are.
export interface ClerkCounterSpots {
  register: { x: number; z: number; yaw: number };
  terminals: { x: number; z: number; yaw: number }[];
}

export class StoreClerk {
  public group: THREE.Group;

  private sprite!: THREE.Sprite;
  private spriteTex!: THREE.Texture;
  private shadowMat!: THREE.MeshBasicMaterial; // blob shadow — fades with the sprite
  private fade = 1; // sleep fade level last applied via setFade()

  // Animation + facing state
  private heading = Math.PI;          // world yaw she faces (atan2(x,z) convention)
  private animKey: AnimKey = 'idle';
  private animTime = 0;

  // Navigation state
  public state: ClerkState = 'IDLE';
  // computeVisible() result from the most recent update(), exposed via
  // isOnScreen() so the scene's render tier can drop out of full-rate
  // rendering while she moves entirely outside the main camera frustum.
  private onScreen = true;
  private currentPos = new THREE.Vector3(7.0, 0.0, 1.0); // start at Reg 1
  private faceYaw = Math.PI;           // yaw to face while idle/stocking
  private idleTimeAccum = 0;
  private idleDuration = 8.0;
  private walkTimeAccum = 0;

  // What she does on arrival: 'idle' | 'talk' | 'stock' | 'type'
  private idleActivity: 'idle' | 'talk' | 'stock' | 'type' = 'idle';

  // Key of the last destination picked by chooseNextDestination(), so we
  // never send her back to the exact same spot twice in a row.
  private lastDestKey: string | null = null;

  // Floor stops since she last worked the counter. Drives the return-to-
  // counter weighting in chooseNextDestination(): the longer she's been out
  // on the floor, the likelier her next trip is back to the register.
  private floorStopsSinceCounter = 0;

  // Accumulated AWAKE dt since her last floor departure (see ROAM_INTERVAL).
  // Floor trips are suppressed in chooseNextDestination() until this reaches
  // ROAM_INTERVAL, then reset when she commits to a floor trip. dt-based (not
  // performance.now()) so it pauses with update() while she sleeps.
  private awakeSinceRoam = 0;

  // Path waypoints
  private waypoints: THREE.Vector3[] = [];
  private currentWaypointIdx = 0;

  // scratch (no per-frame allocation)
  private _toCam = new THREE.Vector3();
  private _navDir = new THREE.Vector3();
  private _frustum = new THREE.Frustum();
  private _projScreen = new THREE.Matrix4();
  private _sphere = new THREE.Sphere(new THREE.Vector3(), SPRITE_HEIGHT * 0.6);
  private _view = { dirIdx: 0, flip: 1 }; // reused return of pickView()

  // Player interaction (Phase C). Null when the clerk is built headless (tests).
  private interaction: ClerkInteraction | null = null;
  private wasChatting = false;

  // Store layout links
  private plan: any;
  private shelvingUnits: any[];

  // Navigation: the walkability grid (null = headless/no-collision fallback,
  // straight-line walking) and the pre-validated destination pools.
  private nav: ClerkNavGrid | null;
  private counterDests: ClerkDest[] = [];
  private floorDests: ClerkDest[] = [];
  private registerSpot: { x: number; z: number; yaw: number };

  /**
   * `floorDests` are ready-made stand points the scene derives from fixture
   * footprints (display stands, wall-shelf runs) — each already positioned off
   * its fixture's face with a facing yaw. Shelf-section stand points are
   * derived here from the plan + shelving units. `counterSpots` come from the
   * real counter geometry (entrance/counter.ts); without them she falls back
   * to the legacy hardcoded register spot.
   */
  constructor(
    plan: any,
    floorDests: ClerkDest[],
    shelvingUnits: any[],
    hooks?: ClerkInteractionHooks,
    nav?: ClerkNavGrid | null,
    counterSpots?: ClerkCounterSpots | null,
  ) {
    this.plan = plan;
    this.shelvingUnits = shelvingUnits;
    this.nav = nav ?? null;

    const spots = counterSpots ?? {
      register: { x: 11.0, z: -1.4, yaw: Math.PI },
      terminals: [],
    };
    this.registerSpot = spots.register;
    this.counterDests = [
      { ...spots.register, kind: 'counter' as const, key: 'counter:register', activity: 'idle' as const },
      ...spots.terminals.map((t, i) => ({ ...t, kind: 'counter' as const, key: `counter:term:${i}`, activity: 'type' as const })),
    ].filter(d => this.destReachable(d));
    this.floorDests = [...this.buildShelfDests(), ...floorDests].filter(d => this.destReachable(d));

    this.group = new THREE.Group();
    this.group.position.copy(this.currentPos);

    if (hooks && typeof document !== 'undefined') {
      this.interaction = new ClerkInteraction(hooks);
    }

    this.buildSprite();
    this.chooseNextDestination();
  }

  /**
   * A destination is usable when open floor exists within a short snap of it.
   * Stand points deliberately hug geometry tighter than the grid clearance
   * (findPath ends with an exact short hop), so this only rejects points
   * buried inside solid footprints or in unreachable slivers.
   */
  private destReachable(d: ClerkDest): boolean {
    if (!this.nav) return true;
    return this.nav.nearestWalkable(d.x, d.z, 1.1) !== null;
  }

  /**
   * One stand point per shelf SECTION — the run of columns between two
   * dividers (SECTION_COLS wide, UNIT_SECTIONS per unit) — on BOTH browse
   * faces of every freestanding unit, placed SHELF_STANDOFF off the face and
   * facing it dead-on. Uses the plan's own unitToWorld so the points track
   * whatever arrangement (straight/diagonal/herringbone) is active.
   */
  private buildShelfDests(): ClerkDest[] {
    const out: ClerkDest[] = [];
    const plan = this.plan;
    if (!plan || typeof plan.unitToWorld !== 'function' || typeof plan.aisleZCenter !== 'function') {
      return out;
    }
    this.shelvingUnits.forEach((u: any, i: number) => {
      const zCenter = plan.aisleZCenter(u);
      const halfLen = ((u.cols - 1) * BOX_SPACING + 1.0) / 2;
      const sectionLen = (halfLen * 2) / UNIT_SECTIONS;
      for (const side of [1, -1]) {
        const standLocalX = u.xCenter + side * (UNIT_DEPTH / 2 + SHELF_STANDOFF);
        const faceLocalX = u.xCenter + side * (UNIT_DEPTH / 2);
        for (let s = 0; s < UNIT_SECTIONS; s++) {
          const localZ = zCenter + halfLen - (s + 0.5) * sectionLen;
          const p = plan.unitToWorld(u, standLocalX, localZ);
          const f = plan.unitToWorld(u, faceLocalX, localZ);
          out.push({
            x: p.x, z: p.z,
            yaw: Math.atan2(f.x - p.x, f.z - p.z),
            kind: 'shelf',
            key: `shelf:${i}:${side > 0 ? 'a' : 'b'}:${s}`,
          });
        }
      }
    });
    return out;
  }

  public isMoving(): boolean {
    return this.state === 'WALKING' || this.state === 'CHATTING';
  }

  /** Main-camera frustum visibility as of the last update() — see computeVisible(). */
  public isOnScreen(): boolean {
    return this.onScreen;
  }

  /** A chat dialog is open (clerk-interaction) — the scene defers her input-idle sleep on it. */
  public isChatting(): boolean {
    return this.interaction?.isChatting() ?? false;
  }

  /**
   * Input-idle sleep fade (see the pre-tier clerk block in
   * StoreScene.animate()): 1 = fully present, 0 = asleep/hidden. Scales the
   * sprite + blob-shadow opacity and hides the whole group at 0 so a parked
   * IDLE frame contains no trace of her. alphaTest tracks opacity (0.5·f) so
   * the silhouette cut stays proportional through the fade instead of the
   * whole sprite popping out when a fixed 0.5 threshold crosses the falling
   * opacity; clamped above 0 so the USE_ALPHATEST define never toggles (no
   * mid-fade shader recompile). Idempotent and allocation-free per call.
   */
  public setFade(f: number) {
    if (f === this.fade) return;
    this.fade = f;
    const mat = this.sprite.material as THREE.SpriteMaterial;
    mat.opacity = f;
    mat.alphaTest = Math.max(0.01, 0.5 * f);
    this.shadowMat.opacity = 0.34 * f;
    this.group.visible = f > 0;
    // Fully asleep: retract the "Press E to talk" prompt — update() (which
    // owns setNear) is paused while she's hidden, so it would linger over an
    // empty floor if the player happened to be standing next to her.
    if (f === 0) this.interaction?.setNear(false);
  }

  public dispose() {
    this.interaction?.dispose();
    this.interaction = null;
  }

  /**
   * Test hook (harness `clerk` checkpoint): freeze her standing at a spot with
   * a fixed world heading so the sprite art can be screenshotted from a known
   * angle. `anim` optionally holds her in a specific pose (e.g. 'stockHigh',
   * 'talk') instead of idle. Not used in normal play.
   */
  public debugPose(x: number, z: number, heading: number, anim: AnimKey = 'idle') {
    this.waypoints = [];
    this.currentWaypointIdx = 0;
    this.currentPos.set(x, 0, z);
    this.faceYaw = heading;
    this.heading = heading;
    this.animKey = anim;
    this.idleActivity = anim === 'talk' ? 'talk'
      : anim === 'type' ? 'type'
      : anim.startsWith('stock') ? 'stock' : 'idle';
    this.state = anim.startsWith('stock') ? 'STOCKING' : 'IDLE';
    this.idleTimeAccum = 0;
    this.idleDuration = Number.MAX_SAFE_INTEGER; // never re-pick a destination
    this.group.position.copy(this.currentPos);
  }

  /**
   * T22 — checkout summon: walk to the register (inside the counter band) and
   * wait there facing the customer side until releaseFromRegister(). Uses the
   * normal nav-grid pathing (so she routes through the counter's real
   * walk-through gap), with an effectively-infinite idle so she can't wander
   * off mid-checkout. Defaults to the register spot derived from the actual
   * counter geometry.
   */
  public goToRegister(x?: number, z?: number, faceYaw?: number) {
    const tx = x ?? this.registerSpot.x;
    const tz = z ?? this.registerSpot.z;
    this.waypoints = this.pathTo(tx, tz) ?? [new THREE.Vector3(tx, 0, tz)];
    this.currentWaypointIdx = 0;
    this.faceYaw = faceYaw ?? this.registerSpot.yaw;
    this.idleActivity = 'idle';
    this.idleDuration = Number.MAX_SAFE_INTEGER; // parked until released
    this.lastDestKey = 'counter:register';
    this.floorStopsSinceCounter = 0;
    this.state = this.waypoints.length > 0 ? 'WALKING' : 'IDLE';
  }

  /**
   * Walk to an arbitrary spot and wait there until released. Same mechanics as
   * goToRegister, minus its counter bookkeeping — lastDestKey/floorStopsSince
   * Counter exist to weight her roaming AWAY from the register she just left,
   * and stamping them for an aisle errand would skew that for the rest of the
   * session. Used to summon her to a recommendation clasp.
   */
  public goTo(x: number, z: number, faceYaw?: number) {
    this.waypoints = this.pathTo(x, z) ?? [new THREE.Vector3(x, 0, z)];
    this.currentWaypointIdx = 0;
    this.faceYaw = faceYaw ?? this.faceYaw;
    this.idleActivity = 'idle';
    this.idleDuration = Number.MAX_SAFE_INTEGER; // parked until released
    this.state = this.waypoints.length > 0 ? 'WALKING' : 'IDLE';
  }

  /** True once she has consumed every waypoint of a goTo/goToRegister walk. */
  public hasArrived(): boolean {
    return this.state !== 'WALKING';
  }

  /**
   * Deliver a clasp's recommendation through the normal dialog rather than a
   * toast, so the player can ask for another without walking off and back.
   */
  public askForRecommendation(movies: Movie[], label: string | null, suggestions: ClerkSuggestion[] = []): boolean {
    if (!this.interaction) return false; // dialog layer not built (headless/tests)
    this.interaction.openForClasp(movies, label, suggestions);
    return true;
  }

  /**
   * Talk to her across the checkout counter (▲ at the register). Same menu
   * the walk-up E key opens; enterCheckout has already summoned her to the
   * register, so there is no proximity test left to pass. False when the
   * dialog layer was never built (headless/tests).
   */
  public talkAtCounter(): boolean {
    if (!this.interaction) return false;
    this.interaction.openAtCounter();
    return true;
  }

  /**
   * Test hook (`clerktalk` checkpoint): open the walk-up "What do you
   * recommend?" answer — the standing-position-scoped path, not a clasp's —
   * without simulating the E-key/menu flow.
   */
  public debugOpenChatRecommend(rolls = 0): boolean {
    if (!this.interaction) return false;
    this.interaction.debugOpenRecommend(rolls);
    return true;
  }

  /** End the register wait — she resumes her normal roaming shortly. */
  public releaseFromRegister() {
    if (this.idleDuration === Number.MAX_SAFE_INTEGER) {
      this.idleDuration = 3.0 + Math.random() * 5.0;
      this.idleTimeAccum = 0;
    }
  }

  private buildSprite() {
    // Grounding shadow blob (a billboard can't cast a real shadow).
    const shadowTex = this.buildShadowTexture();
    this.shadowMat = new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, opacity: 0.34, depthWrite: false });
    const shadow = new THREE.Mesh(new THREE.PlaneGeometry(2.3, 1.3), this.shadowMat);
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.02;
    shadow.renderOrder = 1;
    this.group.add(shadow);

    this.spriteTex = this.buildAtlas();
    this.spriteTex.repeat.set(1 / ATLAS_COLS, 1 / ATLAS_ROWS);
    this.spriteTex.center.set(0, 0);

    this.sprite = new THREE.Sprite(new THREE.SpriteMaterial({
      map: this.spriteTex,
      transparent: true,
      alphaTest: 0.5,
      depthWrite: true,
    }));
    this.sprite.scale.set(SPRITE_WIDTH, SPRITE_HEIGHT, 1);
    this.sprite.position.y = SPRITE_HEIGHT / 2;
    this.sprite.renderOrder = 2;
    this.group.add(this.sprite);

    this.setCell('idle', 0, 0);
  }

  /**
   * Point the atlas at (animation, direction, frame). Rows are directions,
   * columns are the concatenated animation frames (ANIM_COL gives each
   * animation's first column). Row 0 is the top of the canvas, hence the
   * `1 - (row+1)/rows` flip into GL's bottom-up UV space.
   */
  private setCell(anim: AnimKey, dirIdx: number, frame: number, flip = 1) {
    const col = ANIM_COL[anim] + frame;
    const y = 1 - (dirIdx + 1) / ATLAS_ROWS;
    // Horizontal mirror is done in UV space (negative repeat.x + shifted offset),
    // NOT via a negative sprite.scale.x — three.js Sprites ignore negative scale
    // for texturing, so scale-based flipping silently does nothing.
    if (flip < 0) {
      this.spriteTex.repeat.x = -1 / ATLAS_COLS;
      this.spriteTex.offset.set((col + 1) / ATLAS_COLS, y);
    } else {
      this.spriteTex.repeat.x = 1 / ATLAS_COLS;
      this.spriteTex.offset.set(col / ATLAS_COLS, y);
    }
  }

  // ── Placeholder art generation ─────────────────────────────────────────────

  private buildShadowTexture(): THREE.Texture {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const ctx = c.getContext('2d')!;
    const g = ctx.createRadialGradient(32, 32, 2, 32, 32, 30);
    g.addColorStop(0, 'rgba(0,0,0,1)');
    g.addColorStop(0.6, 'rgba(0,0,0,0.65)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  private buildAtlas(): THREE.Texture {
    // All character art is generated in src/clerk-art.ts — this just wraps the
    // finished sprite sheet in a GPU texture.
    const tex = new THREE.CanvasTexture(buildClerkAtlasCanvas());
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.magFilter = THREE.LinearFilter;
    tex.minFilter = THREE.LinearFilter;
    tex.generateMipmaps = false;
    return tex;
  }

  // ── Navigation ─────────────────────────────────────────────────────────────

  /**
   * A* route to (x, z) through the nav grid, as Vector3 waypoints (only
   * allocated on destination changes, never per frame). Null when the grid
   * says there's no route. Headless (no grid): straight line, as before.
   */
  private pathTo(x: number, z: number): THREE.Vector3[] | null {
    if (!this.nav) return [new THREE.Vector3(x, 0, z)];
    const pts = this.nav.findPath(this.currentPos.x, this.currentPos.z, x, z);
    if (!pts) return null;
    return pts.map(p => new THREE.Vector3(p.x, 0, p.z));
  }

  /**
   * Pick where to go next. Counter trips are weighted by how long she's been
   * out on the floor (0% right after a counter stint, ramping to 85%), so her
   * day reads as long register/terminal stretches punctuated by a few
   * stocking trips — not aimless wandering. Destinations whose route fails
   * (pathTo null) are skipped and re-rolled.
   */
  private chooseNextDestination() {
    // Roam gate: until ~ROAM_INTERVAL of awake time has elapsed since her last
    // floor departure, keep her on counter duty (pCounter forced to 1). Once
    // the gate opens, fall back to the normal been-out-too-long weighting so a
    // single floor trip happens, after which the accumulator resets below.
    const canRoam = this.floorDests.length > 0 && this.awakeSinceRoam >= ROAM_INTERVAL;
    const pCounter = canRoam ? Math.min(0.85, 0.3 * this.floorStopsSinceCounter) : 1.0;
    let picked: ClerkDest | null = null;
    let path: THREE.Vector3[] | null = null;

    for (let attempt = 0; attempt < 10 && !picked; attempt++) {
      const useCounter = this.counterDests.length > 0 &&
        (this.floorDests.length === 0 || Math.random() < pCounter);
      const pool = useCounter ? this.counterDests : this.floorDests;
      if (pool.length === 0) break;
      const cand = pool[Math.floor(Math.random() * pool.length)];
      // Never repeat the exact spot she just left (unless it's all there is).
      if (cand.key === this.lastDestKey && pool.length > 1) continue;
      const p = this.pathTo(cand.x, cand.z);
      if (p) { picked = cand; path = p; }
    }

    if (!picked || !path) {
      // Nothing reachable right now — hold position briefly and re-roll.
      this.idleActivity = 'idle';
      this.idleTimeAccum = 0;
      this.idleDuration = 4.0;
      this.state = 'IDLE';
      return;
    }

    this.lastDestKey = picked.key;
    if (picked.kind === 'counter') {
      this.floorStopsSinceCounter = 0;
      if (picked.activity === 'type') {
        // A real terminal stint: she stays at the register typing for a
        // while (rental returns, membership lookups...), not a drive-by.
        this.idleActivity = 'type';
        this.idleDuration = 20.0 + Math.random() * 25.0;
      } else {
        this.idleActivity = Math.random() < 0.25 ? 'talk' : 'idle';
        this.idleDuration = 12.0 + Math.random() * 14.0;
      }
    } else {
      this.floorStopsSinceCounter++;
      this.awakeSinceRoam = 0; // reset the roam gate on floor departure
      if (picked.kind === 'shelf' || picked.kind === 'wall') {
        // Facing the section dead-on (yaw was computed toward the face) —
        // no random flip: stocking with her back to the shelf read as a bug.
        this.idleActivity = 'stock';
        this.idleDuration = 8.0 + Math.random() * 6.0;
      } else {
        // Display stand: half the time she tidies it, half she just browses.
        this.idleActivity = Math.random() < 0.5 ? 'stock' : 'idle';
        this.idleDuration = 5.0 + Math.random() * 5.0;
      }
    }

    this.waypoints = path;
    this.currentWaypointIdx = 0;
    this.faceYaw = picked.yaw;
    this.idleTimeAccum = 0;
    this.state = this.waypoints.length > 0 ? 'WALKING' : 'IDLE';
  }

  public update(dt: number, camera?: THREE.Camera) {
    const visible = this.computeVisible(camera);
    this.onScreen = visible;

    // ── Player proximity → offer / conduct a chat (Phase C) ──
    if (this.interaction) {
      let near = false;
      if (camera && visible) {
        this._toCam.subVectors(camera.position, this.group.position);
        this._toCam.y = 0;
        near = this._toCam.length() <= CHAT_RADIUS;
      }
      this.interaction.setNear(near);
    }

    if (this.interaction?.isChatting()) {
      // Freeze whatever she was doing, turn to the player, and talk.
      this.wasChatting = true;
      this.state = 'CHATTING';
      this.animKey = 'talk';
      this.walkTimeAccum = 0;
      if (camera) {
        this._toCam.subVectors(camera.position, this.group.position);
        this.heading = Math.atan2(this._toCam.x, this._toCam.z);
      }
      if (visible) this.updateSprite(dt, camera);
      this.group.position.copy(this.currentPos);
      return;
    }
    if (this.wasChatting) {
      // Resume normal life once the player walks off.
      this.wasChatting = false;
      this.idleTimeAccum = 0;
    }

    // ── Navigation + activity (Phase B) ──
    // Roam-gate clock: accumulate awake time (walking or idle, not chatting).
    // update() is not called while she sleeps / is in the back room, so this
    // freezes with her — no wrongly-owed roam on wake.
    this.awakeSinceRoam += dt;

    if (this.state === 'WALKING') {
      this.walkTimeAccum += dt;
      const wp = this.waypoints[this.currentWaypointIdx];
      const dir = this._navDir.subVectors(wp, this.currentPos);
      dir.y = 0;
      const dist = dir.length();
      const step = 3.5 * dt; // feet/sec

      if (dist <= step) {
        this.currentPos.copy(wp);
        this.currentWaypointIdx++;
        if (this.currentWaypointIdx >= this.waypoints.length) {
          this.state = 'IDLE';
          this.idleTimeAccum = 0;
        }
      } else {
        dir.normalize();
        this.currentPos.addScaledVector(dir, step);
        this.heading = Math.atan2(dir.x, dir.z); // face travel direction
      }
      this.animKey = 'walk';
    } else {
      this.idleTimeAccum += dt;
      this.walkTimeAccum = 0;
      this.heading = this.faceYaw;

      if (this.idleActivity === 'stock') {
        // cycle high / mid / low so all three stocking heights get exercised
        const k = STOCK_CYCLE[Math.floor(this.idleTimeAccum / 2.2) % 3];
        this.animKey = k;
        this.state = k === 'stockLow' ? 'SQUATTING' : 'STOCKING';
      } else if (this.idleActivity === 'type') {
        // Terminal stints are long (20-45 s): typing bursts broken up by a
        // glance-up beat so the loop doesn't read as a freeze-frame.
        this.animKey = Math.floor(this.idleTimeAccum / 5.5) % 4 === 3 ? 'idle' : 'type';
        this.state = 'IDLE';
      } else {
        this.animKey = this.idleActivity === 'talk' ? 'talk' : 'idle';
        this.state = 'IDLE';
      }

      if (this.idleTimeAccum >= this.idleDuration) this.chooseNextDestination();
    }

    // Frustum short-circuit: no sprite/view work while off-screen.
    if (visible) this.updateSprite(dt, camera);
    this.group.position.copy(this.currentPos);
  }

  /** Cheap bounding-sphere frustum test so off-screen frames skip sprite work. */
  private computeVisible(camera?: THREE.Camera): boolean {
    if (!camera) return true;
    this._projScreen.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    this._frustum.setFromProjectionMatrix(this._projScreen);
    this._sphere.center.copy(this.group.position);
    this._sphere.center.y += SPRITE_HEIGHT * 0.5;
    return this._frustum.intersectsSphere(this._sphere);
  }

  private updateSprite(dt: number, camera?: THREE.Camera) {
    this.animTime += dt;
    const def = ANIM_DEF[this.animKey];
    const frame = Math.floor(this.animTime / def.dur) % def.frames;

    const { dirIdx, flip } = this.pickView(camera);
    this.setCell(this.animKey, dirIdx, frame, flip);
  }

  /**
   * Choose which of the 5 drawn views to show (+ mirror flag) from heading vs
   * camera. Writes into the reused `_view` object — no per-frame allocation.
   */
  private pickView(camera?: THREE.Camera): { dirIdx: number; flip: number } {
    const v = this._view;
    if (!camera) { v.dirIdx = 0; v.flip = 1; return v; } // default front
    this._toCam.subVectors(camera.position, this.group.position);
    const camYaw = Math.atan2(this._toCam.x, this._toCam.z);
    let rel = this.heading - camYaw;               // 0 => she faces the camera => front
    while (rel < -Math.PI) rel += Math.PI * 2;
    while (rel > Math.PI) rel -= Math.PI * 2;
    const deg = Math.abs(rel) * 180 / Math.PI;
    const flip = rel >= 0 ? 1 : -1;                 // mirror the opposite octant
    if (deg < 22.5) { v.dirIdx = 0; v.flip = 1; }   // front
    else if (deg < 67.5) { v.dirIdx = 1; v.flip = flip; }   // front-side
    else if (deg < 112.5) { v.dirIdx = 2; v.flip = flip; }  // side
    else if (deg < 157.5) { v.dirIdx = 3; v.flip = flip; }  // back-side
    else { v.dirIdx = 4; v.flip = 1; }              // back
    return v;
  }
}
