import * as THREE from 'three';
import { assetUrl } from './asset-url';
import { selfLit } from './material-lighting';
import { customerRoster, customerAtlasRows, customerSpriteFacing } from './cast-catalog';
import type { ClerkDest } from './clerk';
import type { ClerkNavGrid, NavPoint } from './clerk-nav';
import { UNIT_DEPTH } from './store-layout';

interface Stop extends NavPoint { yaw: number }
interface Browser {
  id: string; group: THREE.Group; mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshStandardMaterial>;
  texture: THREE.Texture | null; position: THREE.Vector3; heading: number;
  path: NavPoint[]; waypoint: number; stop: number; wait: number; time: number; visible: boolean; blockedTime: number;
}
/** Ambient customers use the same floor grid and lit cutout treatment as staff.
 * Only sprite sheets load in the store; the editable rigs stay in model sources.
 */
export class StoreCustomers {
  readonly group = new THREE.Group();
  private readonly people: Browser[] = [];
  private readonly stops: Stop[] = [];
  private readonly geometry = new THREE.PlaneGeometry(6.4 * 2 / 3, 6.4);
  private readonly shadowGeometry = new THREE.PlaneGeometry(1.9, 1.1);
  private readonly shadowTexture: THREE.CanvasTexture;
  private readonly shadowMaterial: THREE.MeshBasicMaterial;
  private readonly frustum = new THREE.Frustum();
  private readonly matrix = new THREE.Matrix4();
  private readonly sphere = new THREE.Sphere(new THREE.Vector3(), 3.2);
  private disposed = false;
  private active = false;
  constructor(private readonly nav: ClerkNavGrid, plan: any, floor: ClerkDest[],
    private readonly wake: () => void) {
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 64;
    const ctx = canvas.getContext('2d')!;
    const gradient = ctx.createRadialGradient(32, 32, 2, 32, 32, 30);
    gradient.addColorStop(0, 'rgba(0,0,0,1)'); gradient.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = gradient; ctx.fillRect(0, 0, 64, 64);
    this.shadowTexture = new THREE.CanvasTexture(canvas);
    this.shadowMaterial = selfLit(new THREE.MeshBasicMaterial({ map: this.shadowTexture,
      transparent: true, opacity: .30, depthWrite: false }), 'shadow');
    this.group.name = 'store-customers';
    this.group.userData.excludeFromSSAO = true;
    this.group.userData.aoBlendMask = true;
    const candidates: Stop[] = floor.filter(s => s.kind !== 'counter');
    for (const unit of plan.shelvingUnits) {
      for (const side of [-1, 1]) {
        const z = plan.aisleZCenter(unit);
        const p = plan.unitToWorld(unit, unit.xCenter + side * (UNIT_DEPTH / 2 + 1.5), z);
        const f = plan.unitToWorld(unit, unit.xCenter, z);
        candidates.push({ x: p.x, z: p.z, yaw: Math.atan2(f.x - p.x, f.z - p.z) });
      }
    }
    for (const p of candidates) {
      const safe = nav.nearestWalkable(p.x, p.z, 1.1);
      if (safe && !this.stops.some(s => Math.hypot(s.x - safe.x, s.z - safe.z) < 2.3))
        this.stops.push({ ...safe, yaw: p.yaw });
    }
    const ids = customerRoster(localStorage.getItem('bb_customers'), new Date().getDate());
    for (const [i, id] of ids.slice(0, this.stops.length).entries()) {
      const stop = Math.floor(i * this.stops.length / Math.min(ids.length, this.stops.length));
      const start = this.stops[stop];
      const material = new THREE.MeshStandardMaterial({ transparent: false, alphaTest: .5,
        roughness: 1, metalness: 0, depthWrite: true });
      const mesh = new THREE.Mesh(this.geometry, material);
      mesh.name = id; mesh.position.y = 3.2; mesh.receiveShadow = true; mesh.visible = false;
      mesh.onBeforeRender = (_renderer, _scene, camera) => {
        camera.getWorldQuaternion(mesh.quaternion); mesh.updateMatrixWorld(true);
      };
      const group = new THREE.Group(); group.visible = false; group.position.set(start.x, 0, start.z); group.add(mesh);
      const shadow = new THREE.Mesh(this.shadowGeometry, this.shadowMaterial);
      shadow.rotation.x = -Math.PI / 2; shadow.position.y = .02; shadow.renderOrder = 1;
      group.add(shadow);
      group.userData.excludeFromSSAO = true; group.userData.aoBlendMask = true; this.group.add(group);
      const person: Browser = { id, group, mesh, texture: null, position: group.position,
        heading: start.yaw, path: [], waypoint: 0, stop, wait: 12 + i * 3, time: i * .23, visible: false, blockedTime: 0 };
      this.people.push(person);
      new THREE.TextureLoader().load(assetUrl(`textures/cast/${id}/color.webp`), texture => {
        if (this.disposed) { texture.dispose(); return; }
        const rows = customerAtlasRows(id);
        if (texture.image.width !== 2048 || texture.image.height !== rows * 384) {
          texture.dispose(); return;
        }
        texture.colorSpace = THREE.SRGBColorSpace; texture.generateMipmaps = false;
        texture.minFilter = texture.magFilter = THREE.LinearFilter;
        texture.repeat.set(1 / 8, 1 / rows); texture.offset.set(0, 1 - 1 / rows);
        person.texture = texture; material.map = texture; material.needsUpdate = true;
        mesh.visible = true; group.visible = true; this.wake();
      }, undefined, () => { /* Missing optional art leaves no opaque placeholder. */ });
    }
  }
  private chooseStop(person: Browser, index: number): void {
    for (let step = 1; step < this.stops.length; step++) {
      const target = (person.stop + step + index) % this.stops.length;
      if (this.people.some(p => p !== person && p.stop === target)) continue;
      const goal = this.stops[target];
      const path = this.nav.findPath(person.position.x, person.position.z, goal.x, goal.z);
      if (!path?.length) continue;
      person.stop = target; person.path = path; person.waypoint = 0; return;
    }
    person.wait = 10;
  }
  update(dt: number, camera: THREE.Camera, awake: boolean, animate = true): void {
    const wasVisible = this.group.visible; this.group.visible = awake;
    if (wasVisible !== awake) this.wake();
    this.active = false;
    if (!awake) return;
    dt = animate ? Math.min(dt, .1) : 0;
    this.matrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(this.matrix);
    for (let index = 0; index < this.people.length; index++) {
      const p = this.people[index];
      if (!p.texture) continue;
      p.time += dt;
      let moving = p.waypoint < p.path.length;
      if (moving) {
        const goal = p.path[p.waypoint], dx = goal.x - p.position.x, dz = goal.z - p.position.z;
        const distance = Math.hypot(dx, dz), travel = Math.min(distance, dt * 1.35);
        // Keep the visitor's immediate space clear; grid paths avoid fixtures.
        const playerNear = Math.hypot(p.position.x - camera.position.x, p.position.z - camera.position.z) < 1.7;
        const nextX = p.position.x + dx / Math.max(distance, .0001) * travel;
        const nextZ = p.position.z + dz / Math.max(distance, .0001) * travel;
        let occupied = false;
        for (let oi = 0; oi < this.people.length; oi++) {
          const other = this.people[oi];
          if (other !== p && Math.hypot(other.position.x - nextX, other.position.z - nextZ) < 1.3) { occupied = true; break; }
        }
        // A smoothed grid segment can graze an inflated cell corner between
        // its coarse samples. Never advance into a blocked cell.
        const floorClear = this.nav.isWalkable(nextX, nextZ);
        if (!playerNear && !occupied && floorClear) {
          p.blockedTime = 0; p.position.x = nextX; p.position.z = nextZ; p.heading = Math.atan2(dx, dz);
          if (distance <= travel + .001) p.waypoint++;
        } else {
          moving = false; p.blockedTime += dt;
          if (!floorClear || p.blockedTime > 3) { p.path = []; p.waypoint = 0; p.wait = 1 + index * .2; p.blockedTime = 0; }
        }
        if (moving && p.waypoint >= p.path.length) {
          p.path = []; p.waypoint = 0; p.heading = this.stops[p.stop].yaw; p.wait = 10 + index * 1.7;
        }
      } else if ((p.wait -= dt) <= 0) this.chooseStop(p, index);
      this.sphere.center.copy(p.position); this.sphere.center.y = 3.2;
      p.visible = this.frustum.intersectsSphere(this.sphere);
      if (!p.visible) continue;
      const toCamera = Math.atan2(camera.position.x - p.position.x, camera.position.z - p.position.z);
      const angle = ((p.heading - toCamera) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
      const octant = Math.round(angle / (Math.PI / 4)) % 8;
      const { row, flip } = customerSpriteFacing(p.id, octant);
      const rows = customerAtlasRows(p.id);
      const col = moving ? 2 + Math.floor(p.time * 3.16) % 4 : 6 + Math.floor(p.time / 1.5) % 2;
      const x = (col + (flip ? 1 : 0)) / 8, y = 1 - (row + 1) / rows;
      if (p.texture.offset.x !== x || p.texture.offset.y !== y || p.texture.repeat.x !== (flip ? -1 : 1) / 8) {
        p.texture.repeat.x = (flip ? -1 : 1) / 8; p.texture.offset.set(x, y); this.wake();
      }
      this.active ||= moving && animate;
    }
  }
  isMovingOnScreen(): boolean { return this.active; }
  dispose(): void {
    this.disposed = true; this.group.removeFromParent();
    for (const p of this.people) { p.texture?.dispose(); p.mesh.material.dispose(); }
    this.shadowTexture.dispose(); this.shadowMaterial.dispose(); this.shadowGeometry.dispose();
    this.geometry.dispose(); this.people.length = 0;
  }
}
