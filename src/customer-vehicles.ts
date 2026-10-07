import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { assetUrl } from './asset-url';
import { CUSTOMER_VEHICLES, type CustomerParking } from './customer-parking';

/** Occupancy adapter. No unrelated decorative cars and no new commissioned mesh. */
export class CustomerVehicles {
  readonly group = new THREE.Group();
  private readonly cars = new Map<string, THREE.Group>();
  private readonly owned = new Set<{dispose(): void}>();
  private source: THREE.Group | null = null;
  private disposed = false;
  private version = -1;
  readonly fallback: THREE.Group;
  constructor(readonly parking: CustomerParking, private readonly wake: () => void) {
    this.group.name='customer-vehicles';
    this.fallback = new THREE.Group();
    const vehicle = CUSTOMER_VEHICLES[0];
    const bodyMaterial = new THREE.MeshStandardMaterial({color:0x777777,roughness:.75});
    bodyMaterial.name='BodyPaint';
    const glass = new THREE.MeshStandardMaterial({color:0x263342,roughness:.55});
    const tire = new THREE.MeshStandardMaterial({color:0x171717,roughness:1});
    const add = (geometry: THREE.BufferGeometry, material: THREE.MeshStandardMaterial, x:number,y:number,z:number) => {
      this.owned.add(geometry);this.owned.add(material);
      const mesh=new THREE.Mesh(geometry,material);mesh.position.set(x,y,z);mesh.castShadow=mesh.receiveShadow=true;this.fallback.add(mesh);return mesh;
    };
    // Explicit loading/error silhouette, never represented as a modeled asset.
    add(new THREE.BoxGeometry(vehicle.width-.5,vehicle.height*.4,vehicle.length),bodyMaterial,0,vehicle.height*.36,0);
    add(new THREE.BoxGeometry(vehicle.width-1,vehicle.height*.42,vehicle.length*.5),glass,0,vehicle.height*.74,-.4);
    const wheelGeometry = new THREE.CylinderGeometry(1.08,1.08,.55,12);wheelGeometry.rotateZ(Math.PI/2);
    for (const x of [-1,1]) for(const z of [-1,1]) add(wheelGeometry,tire,x*(vehicle.width/2-.4),1.08,z*vehicle.length*.29);
    new GLTFLoader().load(assetUrl('models/'+vehicle.asset),gltf=>{
      gltf.scene.traverse(object=>{
        if (!(object instanceof THREE.Mesh)) return;
        this.owned.add(object.geometry);
        for(const mat of Array.isArray(object.material)?object.material:[object.material]) {
          this.owned.add(mat);
          for(const value of Object.values(mat)) if(value instanceof THREE.Texture)this.owned.add(value);
        }
        object.castShadow=object.receiveShadow=true;
      });
      if(this.disposed){this.owned.forEach(o=>o.dispose());this.owned.clear();return;}
      const bounds=new THREE.Box3().setFromObject(gltf.scene),size=bounds.getSize(new THREE.Vector3()),center=bounds.getCenter(new THREE.Vector3());
      // One uniform transform preserves proportions and authored mesh data.
      const scale=vehicle.length/size.z;
      gltf.scene.scale.setScalar(scale);gltf.scene.position.set(-center.x*scale,-bounds.min.y*scale,-center.z*scale);
      const source=new THREE.Group();source.add(gltf.scene);this.source=source;
      this.version=-1;this.sync();this.wake();
    },undefined,()=>{if(!this.disposed)this.wake();});
  }
  sync(): void {
    if (this.disposed || this.version===this.parking.version) return;
    this.version=this.parking.version;
    for (const [id,car] of this.cars) {
      if(this.parking.assignments.has(id) && car.userData.original===!!this.source) continue;
      car.traverse(o=>{if(o instanceof THREE.Mesh && o.userData.customerPaint){(o.material as THREE.Material).dispose();}});
      car.removeFromParent();this.cars.delete(id);
    }
    for(const [id,a] of this.parking.assignments) {
      if(this.cars.has(id))continue;
      const car=(this.source??this.fallback).clone(true);
      car.name='vehicle:'+id;car.userData={customerId:id,spaceId:a.spaceId,vehicleId:a.vehicle.id,modelYear:a.vehicle.modelYear,original:!!this.source};
      car.position.set(a.space.x,-.09,a.space.z);car.rotation.y=a.space.yaw;
      car.traverse(o=>{
        if(!(o instanceof THREE.Mesh)||Array.isArray(o.material)||o.material.name!=='BodyPaint')return;
        const mat=(o.material as THREE.MeshStandardMaterial).clone();mat.color.setHex(a.color);mat.envMapIntensity=.25;o.material=mat;o.userData.customerPaint=true;
      });
      this.cars.set(id,car);this.group.add(car);
    }
    this.wake();
  }
  dispose():void {
    if(this.disposed)return;this.disposed=true;
    for(const car of this.cars.values())car.traverse(o=>{if(o instanceof THREE.Mesh&&o.userData.customerPaint)(o.material as THREE.Material).dispose();});
    this.cars.clear();this.group.removeFromParent();this.owned.forEach(o=>o.dispose());this.owned.clear();
  }
}
