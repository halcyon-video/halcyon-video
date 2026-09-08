import * as THREE from 'three';
import { StorePlan } from './store-plan';
import { STORE_CENTER_X, FRONT_GLASS_Z, BOX_SPACING, AISLE_SHELF_HEIGHTS, UNIT_FRAME_HEIGHT } from './store-layout';
import { getActiveTheme } from './themes';
import { lightPosterUrl } from './light-store-catalog';
import type { Movie, JellyfinLibrary } from './jellyfin';

export type LightMode = 'overview' | 'shelf' | 'inspect';
export interface LightSlot { movie: Movie; position: THREE.Vector3; normal: THREE.Vector3; section: number; row: number; col: number }

/** A separate, opt-in renderer: the existing floor planner, a single diffuse
 * light, shared geometry and one small cover atlas. No reflection baking,
 * model downloads, shadow maps, postprocessing or full-store constructor. */
export class LightStoreScene {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(55, 1, 0.05, 250);
  readonly renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'low-power' });
  readonly slots: LightSlot[] = [];
  readonly destinations: THREE.Vector3[] = [];
  readonly theme = getActiveTheme();
  readonly plan: StorePlan;
  readonly frameTimes: number[] = [];
  mode: LightMode = 'overview';
  section = 0;
  slotIndex = 0;
  ready = false;
  onFrame: (() => void) | undefined;
  private readonly eye = new THREE.Vector3();
  private readonly look = new THREE.Vector3();
  private readonly lookNow = new THREE.Vector3();
  private readonly scratch = new THREE.Vector3();
  private readonly marker: THREE.Mesh;
  private readonly hero: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshLambertMaterial>;
  private heroTitle = '';
  private readonly screenPoint = { x: 0, y: 0 };
  private readonly atlas = document.createElement('canvas');
  private readonly atlasTexture: THREE.CanvasTexture;
  private readonly queued = new Set<string>();
  private readonly thumbnails: LightSlot[] = [];
  private readonly resources: (THREE.BufferGeometry | THREE.Material | THREE.Texture)[] = [];
  private readonly reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  private readonly controller = new AbortController();
  private pendingImages = 0;
  private alive = true;
  private frame = 0;
  private lastFrame = 0;
  private until = 0;

  constructor(readonly container: HTMLElement, readonly libraries: JellyfinLibrary[]) {
    this.plan = new StorePlan(libraries);
    this.plan.plan();
    const colors = this.theme.palette;
    this.scene.background = new THREE.Color('#c8d2df');
    this.scene.add(new THREE.HemisphereLight('#ffffff', '#b6bfce', 2.1));
    const sun = new THREE.DirectionalLight('#ffffff', 1.35);
    sun.position.set(5, 24, 18);
    this.scene.add(sun);
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.25));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.domElement.setAttribute('aria-label', 'Swipe to move through the 3D store');
    this.renderer.domElement.style.touchAction = 'none';
    container.prepend(this.renderer.domElement);

    // One instanced draw for the architectural shell and shelf boards.
    const boxes: { x: number; y: number; z: number; w: number; h: number; d: number; color: string; yaw: number }[] = [];
    const box = (x: number, y: number, z: number, w: number, h: number, d: number, color: string, yaw = 0) => boxes.push({ x, y, z, w, h, d, color, yaw });
    const width = this.plan.getStoreWidth();
    const back = this.plan.backWallZ;
    const depth = FRONT_GLASS_Z - back;
    const centerZ = (FRONT_GLASS_Z + back) / 2;
    box(STORE_CENTER_X, -0.14, centerZ, width, .25, depth, colors.carpet);
    box(STORE_CENTER_X, 10.25, centerZ, width, .15, depth, '#e1e3e2');
    for (let x = STORE_CENTER_X - width / 2; x < STORE_CENTER_X + width / 2; x += 4) {
      box(x, 10.14, centerZ, .055, .035, depth, '#aeb7c4');
    }
    for (let z = back; z < FRONT_GLASS_Z; z += 4) box(STORE_CENTER_X, 10.14, z, width, .035, .055, '#aeb7c4');
    box(STORE_CENTER_X, 5, back, width, 10, .2, colors.wall);
    for (const side of [-1, 1]) {
      const x = STORE_CENTER_X + side * width / 2;
      box(x, 5, centerZ, .2, 10, depth, colors.wall);
      box(x - side * .12, 8.4, centerZ, .05, .22, depth, colors.primary);
      box(x - side * .12, 8.85, centerZ, .05, .12, depth, colors.primary);
      box(x - side * .14, .22, centerZ, .1, .42, depth, colors.primary);
    }
    box(STORE_CENTER_X, 8.4, back + .14, width, .22, .06, colors.primary);
    box(STORE_CENTER_X, 8.85, back + .14, width, .12, .06, colors.primary);
    // A small counter in the same entrance zone, without the animated clerk.
    box(STORE_CENTER_X - width / 2 + 7, 1.6, 7, 10, 3.2, 3, colors.counterBody);
    box(STORE_CENTER_X - width / 2 + 7, 3.3, 7, 10.3, .22, 3.3, colors.counterTop);

    const material = new THREE.MeshLambertMaterial();
    const bodyMaterial = new THREE.MeshLambertMaterial({ color: '#f3eee1' });
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    this.resources.push(material, bodyMaterial, geometry);
    const movieBodies: THREE.Object3D[] = [];
    const seen = new Set<string>();
    for (const unit of this.plan.shelvingUnits) {
      const center = this.plan.unitToWorld(unit, unit.xCenter, this.plan.aisleZCenter(unit));
      const columns = Math.min(unit.cols, 6);
      const length = (columns - 1) * BOX_SPACING + 1;
      const local = (x: number, y: number, z: number, w: number, h: number, d: number, color: string) => {
        const p = this.plan.unitToWorld(unit, unit.xCenter + x, this.plan.aisleZCenter(unit) + z);
        box(p.x, y, p.z, w, h, d, color, unit.yaw);
      };
      local(0, UNIT_FRAME_HEIGHT / 2, 0, .13, UNIT_FRAME_HEIGHT, length, '#eeede5');
      for (const z of [-length / 2, length / 2]) local(0, UNIT_FRAME_HEIGHT / 2, z, 2.16, UNIT_FRAME_HEIGHT, .11, colors.primary);
      for (const y of AISLE_SHELF_HEIGHTS) local(0, y, 0, 2.16, .07, length, '#f0efe8');
      this.destinations[unit.libraryIdx] ??= new THREE.Vector3(center.x, UNIT_FRAME_HEIGHT + 1.5, center.z);
      const movies = libraries[unit.libraryIdx].movies;
      for (let i = 0; i < movies.length; i++) {
        const movie = movies[i];
        if (seen.has(movie.id)) continue;
        seen.add(movie.id);
        const row = Math.floor(i / columns);
        if (row >= AISLE_SHELF_HEIGHTS.length) break;
        const col = i % columns;
        const sign = unit.browseSign;
        const z = this.plan.aisleZCenter(unit) + (col - (columns - 1) / 2) * BOX_SPACING * sign;
        const point = this.plan.unitToWorld(unit, unit.xCenter + sign * .91, z);
        const position = new THREE.Vector3(point.x, AISLE_SHELF_HEIGHTS[row] + .41, point.z);
        const normal = new THREE.Vector3(sign * Math.cos(unit.yaw), 0, -sign * Math.sin(unit.yaw));
        const slot = { movie, position, normal, section: unit.libraryIdx, row, col };
        this.slots.push(slot);
        const body = new THREE.Object3D();
        body.position.copy(position);
        body.rotation.y = unit.yaw;
        body.scale.set(.15, .8, .54);
        body.updateMatrix();
        movieBodies.push(body);
      }
    }
    const architecture = new THREE.InstancedMesh(geometry, material, boxes.length);
    const transform = new THREE.Object3D();
    const color = new THREE.Color();
    boxes.forEach((b, i) => {
      transform.position.set(b.x, b.y, b.z); transform.scale.set(b.w, b.h, b.d); transform.rotation.y = b.yaw; transform.updateMatrix();
      architecture.setMatrixAt(i, transform.matrix); architecture.setColorAt(i, color.set(b.color));
    });
    this.scene.add(architecture);
    const cases = new THREE.InstancedMesh(geometry, bodyMaterial, movieBodies.length);
    movieBodies.forEach((body, i) => cases.setMatrixAt(i, body.matrix));
    this.scene.add(cases);

    this.atlas.width = this.atlas.height = 1024;
    this.atlasTexture = new THREE.CanvasTexture(this.atlas);
    this.atlasTexture.colorSpace = THREE.SRGBColorSpace;
    this.atlasTexture.generateMipmaps = false;
    this.atlasTexture.minFilter = THREE.LinearFilter;
    const ctx = this.atlas.getContext('2d')!;
    const positions: number[] = [], uvs: number[] = [], normals: number[] = [];
    this.slots.forEach((slot, i) => {
      const x = i % 16 * 64, y = Math.floor(i / 16) * 96;
      ctx.fillStyle = '#1a2c48'; ctx.fillRect(x, y, 64, 96);
      ctx.fillStyle = '#f2e8c9'; ctx.font = 'bold 9px sans-serif';
      const words = slot.movie.title.split(' '); let line = '', lineY = y + 20;
      for (const word of words) {
        if ((line + word).length > 10) { ctx.fillText(line, x + 4, lineY, 56); line = ''; lineY += 12; }
        line += `${word} `;
      }
      ctx.fillText(line, x + 4, lineY, 56);
      // Six vertices per cover, combined into one geometry and material.
      const right = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), slot.normal);
      for (const [u, v] of [[0, 0], [1, 0], [1, 1], [0, 0], [1, 1], [0, 1]]) {
        const p = slot.position.clone().addScaledVector(slot.normal, .081).addScaledVector(right, (u - .5) * .52);
        p.y += (v - .5) * .78;
        positions.push(p.x, p.y, p.z); normals.push(slot.normal.x, 0, slot.normal.z);
        uvs.push((x + 1 + u * 62) / 1024, 1 - (y + 1 + (1 - v) * 94) / 1024);
      }
    });
    const covers = new THREE.BufferGeometry();
    covers.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    covers.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    covers.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    const coversMaterial = new THREE.MeshLambertMaterial({ map: this.atlasTexture, side: THREE.DoubleSide });
    this.scene.add(new THREE.Mesh(covers, coversMaterial));
    const markerGeometry = new THREE.ConeGeometry(.45, .8, 4);
    const markerMaterial = new THREE.MeshLambertMaterial({ color: colors.accent });
    this.marker = new THREE.Mesh(markerGeometry, markerMaterial);
    this.marker.rotation.z = Math.PI;
    this.scene.add(this.marker);
    this.hero = new THREE.Mesh(new THREE.PlaneGeometry(.52, .78), new THREE.MeshLambertMaterial({ side: THREE.DoubleSide }));
    this.hero.visible = false; this.scene.add(this.hero);
    this.resources.push(this.hero.geometry, this.hero.material);
    this.resources.push(covers, coversMaterial, this.atlasTexture, markerGeometry, markerMaterial);
    this.resize(); this.setView(); this.camera.position.copy(this.eye); this.lookNow.copy(this.look);
    window.addEventListener('resize', () => this.resize(), { signal: this.controller.signal });
    this.renderer.domElement.addEventListener('webglcontextlost', event => {
      event.preventDefault(); this.alive = false; cancelAnimationFrame(this.frame);
      container.dispatchEvent(new Event('renderlost'));
    }, { signal: this.controller.signal });
    this.requestRender();
  }

  get selected(): LightSlot | undefined { return this.slots[this.slotIndex]; }
  resize() {
    this.camera.aspect = this.container.clientWidth / this.container.clientHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
    this.requestRender();
  }
  setView(dragX = 0, dragY = 0) {
    const destination = this.destinations[this.section] ?? new THREE.Vector3(STORE_CENTER_X, 2, -10);
    if (this.mode === 'overview') {
      this.eye.set(STORE_CENTER_X, 8, FRONT_GLASS_Z + 2);
      this.look.set(destination.x + dragX * .035, 1.8, destination.z - 2);
      this.marker.position.copy(destination);
    } else if (this.selected) {
      const slot = this.selected;
      this.look.copy(slot.position);
      this.scratch.crossVectors(new THREE.Vector3(0, 1, 0), slot.normal);
      this.look.addScaledVector(this.scratch, dragX * .006); this.look.y += dragY * .006;
      this.eye.copy(this.look).addScaledVector(slot.normal, this.mode === 'inspect' ? 1.8 : 6.4);
      this.eye.y += this.mode === 'inspect' ? .06 : .8;
      this.marker.position.copy(slot.position); this.marker.position.y += .65;
      this.marker.scale.setScalar(.36);
    }
    this.marker.visible = this.mode !== 'inspect' && this.slots.length > 0;
    if (this.mode === 'overview') this.marker.scale.setScalar(1);
    this.hero.visible = this.mode === 'inspect' && this.heroTitle === this.selected?.movie.id && !!this.hero.material.map;
    if (this.mode === 'inspect' && this.selected && this.heroTitle !== this.selected.movie.id) this.upgradeCover(this.selected);
    this.requestRender();
  }
  markerScreen(): { x: number; y: number } {
    this.scratch.copy(this.marker.position).project(this.camera);
    this.screenPoint.x = (this.scratch.x + 1) * this.container.clientWidth / 2;
    this.screenPoint.y = (1 - this.scratch.y) * this.container.clientHeight / 2;
    return this.screenPoint;
  }
  private upgradeCover(slot: LightSlot) {
    this.heroTitle = slot.movie.id;
    this.hero.visible = false;
    this.hero.material.map?.dispose(); this.hero.material.map = null;
    const url = lightPosterUrl(slot.movie, 342);
    if (!url) return;
    new THREE.TextureLoader().load(url, texture => {
      if (!this.alive || this.heroTitle !== slot.movie.id) { texture.dispose(); return; }
      texture.colorSpace = THREE.SRGBColorSpace;
      this.hero.material.map = texture; this.hero.material.needsUpdate = true;
      this.hero.position.copy(slot.position).addScaledVector(slot.normal, .087);
      this.hero.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), slot.normal);
      this.hero.visible = this.mode === 'inspect'; this.requestRender();
    }, undefined, () => { /* The real-title thumbnail remains usable. */ });
  }
  loadSection() {
    // A few covers across the visible overview, then the selected shelf.
    // All downloads stay outside readiness with concurrency fixed at two.
    const selected = this.slots.filter(slot => slot.section === this.section);
    const wanted = [...selected.slice(0, 6), ...this.slots.filter(slot => slot.row === 0 && slot.col < 3), ...selected.slice(6)];
    for (const slot of wanted) if (!this.queued.has(slot.movie.id)) {
      this.queued.add(slot.movie.id); this.thumbnails.push(slot);
    }
    this.pumpImages();
  }
  private pumpImages() {
    while (this.pendingImages < 2 && this.thumbnails.length && this.alive) {
      const slot = this.thumbnails.shift()!;
      const url = lightPosterUrl(slot.movie, 92);
      if (!url) continue;
      this.pendingImages++;
      const image = new Image(); image.crossOrigin = 'anonymous'; image.decoding = 'async';
      const finish = () => { this.pendingImages--; this.pumpImages(); };
      image.onload = () => {
        if (this.alive) {
          const i = this.slots.indexOf(slot);
          this.atlas.getContext('2d')!.drawImage(image, i % 16 * 64, Math.floor(i / 16) * 96, 64, 96);
          this.atlasTexture.needsUpdate = true; this.requestRender();
        }
        finish();
      };
      image.onerror = finish; image.src = url;
    }
  }
  requestRender = () => {
    if (!this.alive) return;
    this.until = performance.now() + 500;
    if (!this.frame) this.frame = requestAnimationFrame(this.draw);
  };
  private draw = (now: number) => {
    this.frame = 0;
    if (!this.alive) return;
    const delta = this.lastFrame ? now - this.lastFrame : 16;
    if (this.lastFrame && this.frameTimes.length < 18000) this.frameTimes.push(delta);
    this.lastFrame = now;
    const alpha = this.reducedMotion ? 1 : 1 - Math.exp(-Math.min(delta, 50) / 80);
    this.camera.position.lerp(this.eye, alpha); this.lookNow.lerp(this.look, alpha); this.camera.lookAt(this.lookNow);
    this.renderer.render(this.scene, this.camera); this.ready = true; this.onFrame?.();
    if (now < this.until) this.frame = requestAnimationFrame(this.draw);
    else this.lastFrame = 0;
  };
  dispose() {
    this.alive = false; cancelAnimationFrame(this.frame); this.controller.abort();
    this.hero.material.map?.dispose();
    this.resources.forEach(resource => resource.dispose()); this.renderer.dispose(); this.renderer.domElement.remove();
  }
}
