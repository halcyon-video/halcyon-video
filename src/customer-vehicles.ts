import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { assetUrl } from './asset-url';
import { type CustomerVehicle, type CustomerParking } from './customer-parking';

type Resource = { dispose(): void };
/** Shared per-asset sources with customer-owned paint and explicit load silhouettes. */
export class CustomerVehicles {
  readonly group = new THREE.Group();
  private readonly cars = new Map<string, THREE.Group>();
  private readonly owned = new Set<Resource>();
  private readonly sources = new Map<string, THREE.Group>();
  private readonly fallbacks = new Map<string, THREE.Group>();
  private disposed = false;
  private version = -1;
  constructor(readonly parking: CustomerParking, private readonly wake: () => void) {
    this.group.name = 'customer-vehicles';
    // Only admitted period assets need loading. One source per distinct asset,
    // independent of occupancy, with no loader or resource per parked customer.
    for (const vehicle of parking.vehicles) {
      if (!parking.eligible(vehicle) || this.fallbacks.has(vehicle.asset)) continue;
      this.fallbacks.set(vehicle.asset, this.makeFallback(vehicle));
      new GLTFLoader().load(assetUrl('models/' + vehicle.asset), gltf => {
        const resources = new Set<Resource>();
        gltf.scene.traverse(object => {
          if (!(object instanceof THREE.Mesh)) return;
          resources.add(object.geometry);
          for (const mat of Array.isArray(object.material) ? object.material : [object.material]) {
            resources.add(mat);
            for (const value of Object.values(mat)) if (value instanceof THREE.Texture) resources.add(value);
          }
          object.castShadow = object.receiveShadow = true;
        });
        if (this.disposed) { resources.forEach(r => r.dispose()); return; }
        const bounds = new THREE.Box3().setFromObject(gltf.scene);
        const size = bounds.getSize(new THREE.Vector3()), center = bounds.getCenter(new THREE.Vector3());
        if (!Number.isFinite(size.z) || size.z <= 0) { resources.forEach(r => r.dispose()); this.wake(); return; }
        resources.forEach(r => this.owned.add(r));
        // The authored proportions and ground origin survive one uniform transform.
        const scale = vehicle.length / size.z;
        gltf.scene.scale.setScalar(scale);
        gltf.scene.position.set(-center.x * scale, -bounds.min.y * scale, -center.z * scale);
        const source = new THREE.Group(); source.add(gltf.scene);
        this.sources.set(vehicle.asset, source);
        this.version = -1; this.sync();
      }, undefined, () => { if (!this.disposed) this.wake(); });
    }
  }
  private makeFallback(vehicle: CustomerVehicle): THREE.Group {
    const group = new THREE.Group(); group.name = 'loading:' + vehicle.id;
    const body = new THREE.MeshStandardMaterial({ color: 0x777777, roughness: .75 }); body.name = 'BodyPaint';
    const glass = new THREE.MeshStandardMaterial({ color: 0x263342, roughness: .55 });
    const tire = new THREE.MeshStandardMaterial({ color: 0x171717, roughness: 1 });
    const add = (geometry: THREE.BufferGeometry, material: THREE.Material, x: number, y: number, z: number) => {
      this.owned.add(geometry); this.owned.add(material);
      const mesh = new THREE.Mesh(geometry, material); mesh.position.set(x, y, z);
      mesh.castShadow = mesh.receiveShadow = true; group.add(mesh);
    };
    // Exact declared width, height, length and floor, even on a failed request.
    add(new THREE.BoxGeometry(vehicle.width, vehicle.height * .4, vehicle.length), body, 0, vehicle.height * .36, 0);
    add(new THREE.BoxGeometry(vehicle.width * .78, vehicle.height * .42, vehicle.length * .45), glass, 0, vehicle.height * .79, -.4);
    const radius = vehicle.height * .21;
    const wheels = new THREE.CylinderGeometry(radius, radius, .55, 12); wheels.rotateZ(Math.PI / 2);
    for (const x of [-1, 1]) for (const z of [-1, 1])
      add(wheels, tire, x * (vehicle.width / 2 - .4), radius, z * vehicle.length * .29);
    return group;
  }
  private removeCar(car: THREE.Group): void {
    car.traverse(o => {
      if (o instanceof THREE.Mesh && o.userData.customerPaint) (o.material as THREE.Material).dispose();
    });
    car.removeFromParent();
  }
  sync(): void {
    if (this.disposed || this.version === this.parking.version) return;
    this.version = this.parking.version;
    for (const [id, car] of this.cars) {
      const assignment = this.parking.assignments.get(id);
      if (assignment && car.userData.asset === assignment.vehicle.asset &&
          car.userData.original === this.sources.has(assignment.vehicle.asset)) continue;
      this.removeCar(car); this.cars.delete(id);
    }
    for (const [id, a] of this.parking.assignments) {
      if (this.cars.has(id)) continue;
      const original = this.sources.has(a.vehicle.asset);
      const template = this.sources.get(a.vehicle.asset) ?? this.fallbacks.get(a.vehicle.asset);
      if (!template) continue;
      const car = template.clone(true);
      car.name = 'vehicle:' + id;
      car.userData = { customerId: id, spaceId: a.spaceId, vehicleId: a.vehicle.id,
        asset: a.vehicle.asset, modelYear: a.vehicle.modelYear, original };
      car.position.set(a.space.x, -.09, a.space.z); car.rotation.y = a.space.yaw;
      car.traverse(o => {
        if (!(o instanceof THREE.Mesh) || Array.isArray(o.material) || o.material.name !== 'BodyPaint') return;
        const mat = (o.material as THREE.MeshStandardMaterial).clone();
        mat.color.setHex(a.color); mat.envMapIntensity = .25; o.material = mat; o.userData.customerPaint = true;
      });
      this.cars.set(id, car); this.group.add(car);
    }
    this.wake();
  }
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.cars.forEach(car => this.removeCar(car)); this.cars.clear();
    this.group.removeFromParent(); this.group.clear();
    this.owned.forEach(r => r.dispose()); this.owned.clear(); this.sources.clear(); this.fallbacks.clear();
  }
}
