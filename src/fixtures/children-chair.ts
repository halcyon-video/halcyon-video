import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type { FixtureContext, StoreFixture } from '../fixtures';
import type { FixturePlacement } from '../store-layout';
import type { Footprint } from '../layout-validator';
import { installDisplayModel } from './display-model';
import { finishEquipmentSurfaces } from './equipment-surfaces';

/** Original child-size molding. Caller must reserve a real family nook first.
 * One fixture batches the pair, sharing one loaded geometry and plastic finish. */
export class ChildrenChair implements StoreFixture {
  private root: THREE.Group | null = null;
  private owned: Array<{ dispose(): void }> = [];
  private removeModel: (() => void) | null = null;
  private proxies: THREE.Mesh[] = [];
  constructor(public placement: FixturePlacement, private ctx: FixtureContext) {}
  private get pair() { return this.placement.options?.pair === true; }
  private get offsets() { return this.pair ? [-1.15, 1.15] : [0]; }
  build(): void {
    this.dispose();
    if (!this.placement.options?.assetViewer && this.ctx.activeTheme.id !== 'bb-1990') return;
    if (!this.placement.options?.admitted && !this.placement.options?.assetViewer) return;
    const root = this.root = new THREE.Group();root.name = this.placement.id;
    root.position.set(this.placement.position.x, .015, this.placement.position.z);root.rotation.y = this.placement.yaw;
    const own = <T extends { dispose(): void }>(v: T): T => { this.owned.push(v);return v; };
    const plastic = own(new THREE.MeshStandardMaterial({ name: 'ChairPlastic', color: this.ctx.activeTheme.palette.secondary,
      roughness: .4, metalness: 0 }));
    const fallback = new THREE.Group();root.add(fallback);
    const seatGeo = own(new RoundedBoxGeometry(1.1, .095, 1.03, 3, .045));
    const backGeo = own(new RoundedBoxGeometry(1.08, .9, .075, 3, .035));
    const legGeo = own(new THREE.CylinderGeometry(.10, .075, .84, 10));
    for (const x of this.offsets) {
      const chair = new THREE.Group();chair.position.x=x;fallback.add(chair);
      const seat = new THREE.Mesh(seatGeo,plastic);seat.position.y=.89;chair.add(seat);
      const back = new THREE.Mesh(backGeo,plastic);back.position.set(0,1.33,-.46);back.rotation.x=-.055;chair.add(back);
      for (const sx of [-1,1]) for (const sz of [-1,1]) {
        const leg=new THREE.Mesh(legGeo,plastic);leg.position.set(sx*.45,.42,sz*.39);chair.add(leg);
      }
      const proxy=new THREE.Mesh(own(new THREE.BoxGeometry(1.16,1.82,1.13)),own(new THREE.MeshBasicMaterial({visible:false})));
      proxy.position.set(x,.91,0);root.add(proxy);this.proxies.push(proxy);this.ctx.addCollider(proxy);
      const anchor=new THREE.Object3D();anchor.name=`chair-seat-${x}`;anchor.position.set(x,.893,.08);root.add(anchor);
    }
    fallback.traverse(o=>{ if(o instanceof THREE.Mesh)o.castShadow=o.receiveShadow=true; });
    this.owned.push(...finishEquipmentSurfaces(fallback));
    this.ctx.scene.add(root);
    this.removeModel=installDisplayModel(this.ctx,root,fallback,'models/children-chair.glb',{ChairPlastic:plastic},
      new THREE.Vector3(1,1,1),model=>{
        const meshes: THREE.Mesh[]=[];model.traverse(o=>{if(o instanceof THREE.Mesh)meshes.push(o);});
        model.updateMatrixWorld(true);
        for(const part of meshes){
          // Use local feet for the existing fine plastic grain, matching fallback.
          const pos=part.geometry.attributes.position,uv=new Float32Array(pos.count*2);
          for(let i=0;i<pos.count;i++){uv[i*2]=pos.getX(i)*10;uv[i*2+1]=(pos.getY(i)+pos.getZ(i))*10;}
          part.geometry.setAttribute('uv1',new THREE.BufferAttribute(uv,2));
          if(this.pair){
            const batch=new THREE.InstancedMesh(part.geometry,part.material,2);batch.name='Children chair pair';
            this.offsets.forEach((x,i)=>batch.setMatrixAt(i,new THREE.Matrix4().makeTranslation(x,0,0).multiply(part.matrixWorld)));
            batch.instanceMatrix.needsUpdate=true;batch.computeBoundingSphere();batch.castShadow=batch.receiveShadow=true;
            part.removeFromParent();model.add(batch);
          }
        }
      });
    root.addEventListener('removed',this.onRemoved);this.ctx.requestShadowRefresh();this.ctx.requestRender();
  }
  getFootprints(): Footprint[] {
    if(!this.root)return [];
    const {x,z}=this.placement.position,yaw=this.placement.yaw;
    return this.offsets.map((offset,i)=>({label:`fixture:${this.placement.id}-${i}`,kind:'fixture',
      cx:x+offset*Math.cos(yaw),cz:z-offset*Math.sin(yaw),w:1.16,d:1.13,yaw,clearance:0}));
  }
  private onRemoved=()=>this.dispose();
  update(): void {}
  dispose(): void {
    const root=this.root;this.root=null;root?.removeEventListener('removed',this.onRemoved);
    this.removeModel?.();this.removeModel=null;
    this.proxies.forEach(p=>{p.raycast=()=>{};});this.proxies=[];
    root?.removeFromParent();this.owned.forEach(o=>o.dispose());this.owned=[];
    if(root){this.ctx.requestShadowRefresh();this.ctx.requestRender();}
  }
}
