import * as THREE from 'three';
import { assetUrl } from './asset-url';
import { selfLit } from './material-lighting';
import { customerRoster, customerAtlasRows, customerSpriteFacing } from './cast-catalog';
import { customerPreference } from './customer-preferences';
import type { CustomerSimulation, CustomerState } from './customer-simulation';
import type { CustomerVehicles } from './customer-vehicles';

interface Browser {
  id:string; group:THREE.Group; mesh:THREE.Mesh<THREE.PlaneGeometry,THREE.MeshStandardMaterial>;
  texture:THREE.Texture|null; state:CustomerState|null; time:number;
}
/** Sprite adapter; destination/parking ownership lives in the node-testable simulation. */
export class StoreCustomers {
  readonly group=new THREE.Group();
  private readonly people:Browser[]=[];
  private readonly geometry=new THREE.PlaneGeometry(6.4*2/3,6.4);
  private readonly shadowGeometry=new THREE.PlaneGeometry(1.9,1.1);
  private readonly shadowTexture:THREE.CanvasTexture;
  private readonly shadowMaterial:THREE.MeshBasicMaterial;
  private readonly frustum=new THREE.Frustum();
  private readonly matrix=new THREE.Matrix4();
  private readonly sphere=new THREE.Sphere(new THREE.Vector3(),3.2);
  private disposed=false;
  private active=false;
  constructor(readonly simulation:CustomerSimulation, readonly vehicles:CustomerVehicles, private readonly wake:()=>void, outsideMode = 'day') {
    const canvas=document.createElement('canvas');canvas.width=canvas.height=64;
    const ctx=canvas.getContext('2d')!;
    const gradient=ctx.createRadialGradient(32,32,2,32,32,30);
    gradient.addColorStop(0,'rgba(0,0,0,1)');gradient.addColorStop(1,'rgba(0,0,0,0)');
    ctx.fillStyle=gradient;ctx.fillRect(0,0,64,64);
    this.shadowTexture=new THREE.CanvasTexture(canvas);
    this.shadowMaterial=selfLit(new THREE.MeshBasicMaterial({map:this.shadowTexture,transparent:true,opacity:.30,depthWrite:false}),'shadow');
    this.group.name='store-customers';this.group.userData.excludeFromSSAO=true;this.group.userData.aoBlendMask=true;
    for(const [i,id] of customerRoster(outsideMode,new Date().getDate()).entries()) {
      const material=new THREE.MeshStandardMaterial({transparent:false,alphaTest:.5,roughness:1,metalness:0,depthWrite:true});
      const mesh=new THREE.Mesh(this.geometry,material);mesh.name=id;mesh.position.y=3.2;mesh.receiveShadow=true;
      mesh.onBeforeRender=(_renderer,_scene,camera)=>{camera.getWorldQuaternion(mesh.quaternion);mesh.updateMatrixWorld(true);};
      const group=new THREE.Group();group.name=id;group.visible=false;group.add(mesh);
      const shadow=new THREE.Mesh(this.shadowGeometry,this.shadowMaterial);shadow.rotation.x=-Math.PI/2;shadow.position.y=.02;shadow.renderOrder=1;group.add(shadow);
      group.userData.excludeFromSSAO=true;group.userData.aoBlendMask=true;this.group.add(group);
      const person:Browser={id,group,mesh,texture:null,state:null,time:i*.23};this.people.push(person);
      new THREE.TextureLoader().load(assetUrl(`textures/cast/${id}/color.webp`),texture=>{
        if(this.disposed){texture.dispose();return;}
        const rows=customerAtlasRows(id);
        if(texture.image.width!==2048||texture.image.height!==rows*384){texture.dispose();return;}
        // A failed/missing sprite never occupies a parking space. Conversely,
        // admission without both a reachable destination and a car is refused.
        person.state=this.simulation.add(id,customerPreference(id));
        if(!person.state){texture.dispose();return;}
        texture.colorSpace=THREE.SRGBColorSpace;texture.generateMipmaps=false;texture.minFilter=texture.magFilter=THREE.LinearFilter;
        texture.repeat.set(1/8,1/rows);texture.offset.set(0,1-1/rows);
        person.texture=texture;material.map=texture;material.needsUpdate=true;
        group.position.set(person.state.x,0,person.state.z);group.visible=true;
        this.vehicles.sync();this.wake();
      },undefined,()=>{/* Optional missing art admits no invisible customer. */});
    }
  }
  update(dt:number,camera:THREE.Camera,awake:boolean,animate=true):void {
    if(this.group.visible!==awake){this.group.visible=awake;this.wake();}
    this.active=false;if(!awake)return;
    dt=animate?Math.min(dt,.1):0;
    this.simulation.update(dt,camera.position);this.vehicles.sync();
    this.matrix.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse);this.frustum.setFromProjectionMatrix(this.matrix);
    for(const p of this.people) {
      const state=p.state;if(!state||!p.texture)continue;
      if(p.group.visible!==state.active){p.group.visible=state.active;this.wake();}
      if(!state.active)continue;
      p.group.position.set(state.x,0,state.z);p.time+=dt;
      this.sphere.center.set(state.x,3.2,state.z);
      if(!this.frustum.intersectsSphere(this.sphere))continue;
      const toCamera=Math.atan2(camera.position.x-state.x,camera.position.z-state.z);
      const angle=((state.heading-toCamera)%(Math.PI*2)+Math.PI*2)%(Math.PI*2);
      const octant=Math.round(angle/(Math.PI/4))%8;
      const {row,flip}=customerSpriteFacing(p.id,octant),rows=customerAtlasRows(p.id);
      const col=state.moving?2+Math.floor(p.time*3.16)%4:6+Math.floor(p.time/1.5)%2;
      const x=(col+(flip?1:0))/8,y=1-(row+1)/rows;
      if(p.texture.offset.x!==x||p.texture.offset.y!==y||p.texture.repeat.x!==(flip?-1:1)/8){p.texture.repeat.x=(flip?-1:1)/8;p.texture.offset.set(x,y);this.wake();}
      this.active ||= state.moving&&animate;
    }
  }
  isMovingOnScreen():boolean{return this.active;}
  dispose():void {
    if(this.disposed)return;this.disposed=true;this.group.removeFromParent();
    this.simulation.dispose();this.vehicles.dispose();
    for(const p of this.people){p.texture?.dispose();p.mesh.material.dispose();}
    this.shadowTexture.dispose();this.shadowMaterial.dispose();this.shadowGeometry.dispose();this.geometry.dispose();this.people.length=0;
  }
}
