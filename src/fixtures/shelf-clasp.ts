// Shelf claspers — the small blue plaques clipped to the shelf lip that read
// "ASK FOR RECOMMENDATIONS!".
//
// They are a call button, not a display. Selecting one summons the clerk, who
// walks over and recommends something from the genre you're standing in (see
// recommend-why.ts for how a recommendation earns its reason). The clasp
// itself never changes what it says.
//
// Density follows how the library is shelved: a library big enough to be split
// into category sections gets one clasp per genre, so the clerk's advice is
// about the aisle you're actually in; a small single-run library gets one for
// the whole thing.
//
// Clasps only exist when the Jellyseerr integration is available (see
// isJellyseerrAvailable; demo/harness boots count as synthetic) — an ask-me
// button in a store with no recommendation source behind it is a promise the
// clerk can't keep, so the store simply doesn't hang one.
//
// Performance: every clasp in the store shares ONE texture, ONE material and
// ONE geometry — they all say the same thing, so there is nothing per-clasp to
// store, and the whole set costs a single canvas. Nothing here is emissive;
// the plaque is lit by the room and goes dark with it at night.
import * as THREE from 'three';
import { BB_ARCHIVO_BLACK } from '../bundled-fonts';

/** Face: 0.95ft x 0.19ft — a small plaque, not a shelf-talker card. */
const CLASP_W = 0.95;
const CLASP_H = 0.19;
const CLASP_D = 0.018;
const CANVAS_W = 768;
const CANVAS_H = 154;

const CLASP_TEXT = 'ASK FOR RECOMMENDATIONS!';

/** How close (ft) the player must be in walk mode for the E prompt to offer. */
export const CLASP_REACH = 7.0;

const PROMPT_STYLE_ID = 'clasp-prompt-styles';

export interface ClaspPlacement {
  /** World position of the clasp's centre, before the aisle group's yaw. */
  x: number;
  y: number;
  z: number;
  /** Local yaw so the printed face points out of the shelf lip. */
  rotY: number;
  /** Group to parent into, so the clasp inherits the aisle's arrangement yaw. */
  parent: THREE.Object3D;
  /** Category section this clasp speaks for, or null for a whole-library one. */
  category: string | null;
  /** Library the clasp belongs to, for the clerk's recommendation pool. */
  libraryIdx: number;
}

/** What selecting a clasp asks the clerk for. */
export interface ClaspTarget {
  category: string | null;
  libraryIdx: number;
  /** World position of the clasp, so the clerk knows where to walk. */
  position: THREE.Vector3;
  /** Unit vector out of the printed face — where a customer would stand. */
  outward: THREE.Vector3;
}

function makeTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = CANVAS_W;
  canvas.height = CANVAS_H;
  const ctx = canvas.getContext('2d')!;
  // Blue plate, white lettering, no border — it reads as one of the store's
  // own fixtures rather than a printed card someone slid in.
  ctx.fillStyle = '#0d47a1';
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  // The display face is a wide one — fit to the plate rather than trusting a point
  // size, or the leading A and trailing ! walk off the ends.
  let size = 62;
  ctx.font = `bold ${size}px ${BB_ARCHIVO_BLACK}, sans-serif`;
  while (size > 18 && ctx.measureText(CLASP_TEXT).width > CANVAS_W - 40) {
    size -= 2;
    ctx.font = `bold ${size}px ${BB_ARCHIVO_BLACK}, sans-serif`;
  }
  ctx.fillText(CLASP_TEXT, CANVAS_W / 2, CANVAS_H / 2 + 2);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

export class ShelfClasps {
  private clasps: THREE.Mesh[] = [];
  private geometry: THREE.BoxGeometry;
  private faceMaterial: THREE.MeshPhysicalMaterial;
  private edgeMaterial: THREE.MeshPhysicalMaterial;
  private hotFaceMaterial: THREE.MeshPhysicalMaterial;
  private hotEdgeMaterial: THREE.MeshPhysicalMaterial;
  private texture: THREE.CanvasTexture;
  private focused: THREE.Mesh | null = null;
  private prompt: HTMLDivElement | null = null;
  /** Last prompt rendered, so the walk-mode frame hook isn't rebuilding DOM. */
  private promptSig = '';

  constructor() {
    this.geometry = new THREE.BoxGeometry(CLASP_D, CLASP_H, CLASP_W);
    this.texture = makeTexture();
    // Glossy acrylic over the printed plate, lit by the room.
    this.faceMaterial = new THREE.MeshPhysicalMaterial({
      map: this.texture,
      roughness: 0.12,
      metalness: 0,
      clearcoat: 1,
      clearcoatRoughness: 0.04,
    });
    this.edgeMaterial = new THREE.MeshPhysicalMaterial({
      color: 0x0d47a1,
      roughness: 0.15,
      metalness: 0,
      clearcoat: 1,
      clearcoatRoughness: 0.05,
    });
    // Focus state. Deliberately AMBER, not a brighter blue: the plate is
    // already blue, so a blue glow on it is close to invisible — the first
    // version of this was, and read as the highlight being broken. Amber is
    // also the colour of the key prompt, so the plaque and the prompt agree.
    // A warm reflected tint marks focus without turning the card into a lamp.
    this.hotFaceMaterial = this.faceMaterial.clone();
    this.hotFaceMaterial.color.set(0xffd54a);
    this.hotEdgeMaterial = this.edgeMaterial.clone();
    this.hotEdgeMaterial.color = new THREE.Color(0xffd54a);
  }

  /** BoxGeometry material order is +X,-X,+Y,-Y,+Z,-Z; the print is on +X. */
  private materials(hot = false): THREE.Material[] {
    const e = hot ? this.hotEdgeMaterial : this.edgeMaterial;
    return [hot ? this.hotFaceMaterial : this.faceMaterial, e, e, e, e, e];
  }

  /**
   * Light up one clasp (or none). Drives the hover highlight, the walk-mode
   * proximity highlight and the browse cursor alike — whatever is pointing at
   * a clasp just names it here, so the three input paths can't disagree about
   * which one is live.
   *
   * `promptText` non-null also shows the on-screen key prompt.
   */
  setFocused(mesh: THREE.Mesh | null, promptText: string | null = null, key = 'E'): void {
    if (this.focused !== mesh) {
      if (this.focused) {
        this.focused.material = this.materials(false);
      }
      if (mesh) {
        mesh.material = this.materials(true);
      }
      this.focused = mesh;
    }
    this.showPrompt(mesh ? promptText : null, key);
  }

  get focusedMesh(): THREE.Mesh | null {
    return this.focused;
  }

  /** The clasp currently lit, as a target ready to act on. */
  focusedTarget(): ClaspTarget | null {
    return this.focused ? this.targetFor(this.focused) : null;
  }

  private showPrompt(text: string | null, key: string): void {
    // Called every frame from the walk-mode focus hook, so nothing below may
    // allocate unless the prompt actually changed.
    const sig = text ? `${key}|${text}` : '';
    if (sig === this.promptSig) return;
    this.promptSig = sig;
    if (!text) {
      this.prompt?.classList.remove('visible');
      return;
    }
    if (!this.prompt) {
      if (!document.getElementById(PROMPT_STYLE_ID)) {
        const style = document.createElement('style');
        style.id = PROMPT_STYLE_ID;
        // Deliberately the same look as the clerk's own "Press E to talk"
        // prompt (clerk-interaction.ts) — it is the same offer.
        style.textContent = `
        .clasp-prompt {
          position: fixed; left: 50%; bottom: 96px; transform: translateX(-50%) translateY(8px);
          z-index: 60; pointer-events: none; opacity: 0; transition: opacity .18s, transform .18s;
          font-family: 'Courier New', monospace; font-weight: 700; letter-spacing: .04em;
          color: var(--bb-knockout, #eef3ff); background: rgba(10,18,40,.82);
          border: 1px solid var(--bb-secondary, #f2e8c9);
          padding: 8px 16px; border-radius: 6px; text-shadow: 0 1px 2px #000;
          box-shadow: 0 4px 18px rgba(0,0,0,.5);
        }
        .clasp-prompt.visible { opacity: 1; transform: translateX(-50%) translateY(0); }
        .clasp-prompt .clasp-key {
          display: inline-block; min-width: 1.4em; text-align: center; margin-right: 8px;
          padding: 1px 6px; border-radius: 4px; background: #ffd54a; color: #10203f;
          font-weight: 800; box-shadow: inset 0 -2px 0 rgba(0,0,0,.25);
        }`;
        document.head.appendChild(style);
      }
      this.prompt = document.createElement('div');
      this.prompt.className = 'clasp-prompt';
      document.body.appendChild(this.prompt);
    }
    this.prompt.innerHTML = '';
    const keyEl = document.createElement('span');
    keyEl.className = 'clasp-key';
    keyEl.textContent = key;
    // Section names come from library metadata — append as a text node.
    this.prompt.append(keyEl, text);
    this.prompt.classList.add('visible');
  }

  /** Nearest clasp to a world point, for matching one to the browse cursor. */
  nearestTo(pos: THREE.Vector3, maxDist: number): THREE.Mesh | null {
    const p = new THREE.Vector3();
    let best: THREE.Mesh | null = null;
    let bestDist = maxDist;
    for (const clasp of this.clasps) {
      clasp.getWorldPosition(p);
      const d = p.distanceTo(pos);
      if (d < bestDist) { bestDist = d; best = clasp; }
    }
    return best;
  }

  /**
   * Nearest clasp within reach that the camera is actually looking towards and
   * whose face is turned to the player. Drives the walk-mode prompt.
   */
  nearestInReach(camPos: THREE.Vector3, lookDir: THREE.Vector3): THREE.Mesh | null {
    const pos = new THREE.Vector3();
    const outward = new THREE.Vector3();
    const toClasp = new THREE.Vector3();
    const quat = new THREE.Quaternion();
    let best: THREE.Mesh | null = null;
    let bestDist = Infinity;
    for (const clasp of this.clasps) {
      clasp.getWorldPosition(pos);
      toClasp.subVectors(pos, camPos);
      const dist = toClasp.length();
      if (dist > CLASP_REACH || dist >= bestDist) continue;
      toClasp.divideScalar(dist);
      if (lookDir.dot(toClasp) < 0.55) continue; // roughly in front of you
      outward.set(1, 0, 0).applyQuaternion(clasp.getWorldQuaternion(quat));
      if (outward.dot(toClasp) > 0) continue; // its back is to you
      best = clasp;
      bestDist = dist;
    }
    return best;
  }

  add(p: ClaspPlacement): void {
    const mesh = new THREE.Mesh(this.geometry, this.materials());
    mesh.position.set(p.x, p.y, p.z);
    mesh.rotation.y = p.rotY;
    // The "ASK FOR RECOMMENDATIONS!" plaques were removed from the store (user:
    // they didn't look good). Each placement stays only as an INVISIBLE,
    // un-raycastable section marker: the clerk's walk-up recommendations still
    // scope to the aisle you're standing in via nearestTo (localRecommendPool),
    // but nothing renders and no input path can hit or focus one — see the
    // count getter (reports 0 so hover / walk-prompt / browse-cursor all skip).
    mesh.visible = false;
    mesh.raycast = () => {}; // never intersect any raycaster (click / walk-up)
    mesh.castShadow = false;
    mesh.userData.excludeFromSSAO = true;
    mesh.userData.claspCategory = p.category;
    mesh.userData.claspLibraryIdx = p.libraryIdx;
    p.parent.add(mesh);
    this.clasps.push(mesh);
  }

  /** Number of INTERACTIVE clasps — always 0 now the plaques are removed. The
   *  entries in `clasps` are invisible section markers (see add()); code that
   *  gates hover / walk-prompt / cursor-entry on count therefore skips them,
   *  while nearestTo / firstTarget still read the markers for the clerk flow. */
  get count(): number {
    return 0;
  }

  /** Meshes to hand a raycaster for click selection. */
  get pickables(): THREE.Mesh[] {
    return this.clasps;
  }

  /** First clasp in the store, for tests/screenshots that need to find one. */
  firstTarget(): ClaspTarget | null {
    return this.clasps.length > 0 ? this.targetFor(this.clasps[0]) : null;
  }

  /** Read back what a picked clasp is asking on behalf of. */
  targetFor(mesh: THREE.Object3D): ClaspTarget | null {
    if (!this.clasps.includes(mesh as THREE.Mesh)) return null;
    return {
      category: (mesh.userData.claspCategory as string | null) ?? null,
      libraryIdx: (mesh.userData.claspLibraryIdx as number) ?? 0,
      position: mesh.getWorldPosition(new THREE.Vector3()),
      outward: new THREE.Vector3(1, 0, 0)
        .applyQuaternion(mesh.getWorldQuaternion(new THREE.Quaternion()))
        .setY(0)
        .normalize(),
    };
  }

  dispose(): void {
    for (const clasp of this.clasps) clasp.parent?.remove(clasp);
    this.clasps.length = 0;
    this.focused = null;
    this.promptSig = '';
    this.prompt?.remove();
    this.prompt = null;
    document.getElementById(PROMPT_STYLE_ID)?.remove();
    this.geometry.dispose();
    this.faceMaterial.dispose();
    this.edgeMaterial.dispose();
    this.hotFaceMaterial.dispose();
    this.hotEdgeMaterial.dispose();
    this.texture.dispose();
  }
}
