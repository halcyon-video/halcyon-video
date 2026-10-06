import * as THREE from 'three';
import type { FixtureContext, FixtureSlot, SlottedFixture } from './fixtures';
import type { FixturePlacement } from './store-layout';
import { FLOOR_FIXTURE_MAX_Z } from './store-layout';
import type { Footprint } from './layout-validator';
import { CASE_HEIGHT, CASE_DEPTH } from './video-case';
import { installDisplayModel } from './fixtures/display-model';

export const TWIN_CRT_ROWS = [1.79,2.68,3.57,4.46] as const;
export const TWIN_CRT_ENVELOPE = { w:2.8,h:8.3,d:1.5,clearance:3 };

/** Six visible wire bays; only the four middle rows carry browseable stock. */
export class TwinCrtTower implements SlottedFixture {
  capacity=20;
  cols=5;
  shelfHeights=[...TWIN_CRT_ROWS];
  genre='Featured Movies';
  private group:THREE.Group|null=null;
  private owned:Array<{dispose():void}>=[];
  private removeModel:(()=>void)|null=null;
  constructor(public placement:FixturePlacement,private ctx:FixtureContext) {
    if(placement.options?.relativeToBackWall){const offset=Number(placement.options.zOffset??placement.position.z);placement.position.z=Math.min(ctx.backWallZ+offset,FLOOR_FIXTURE_MAX_Z);}
  }
  private movies() {
    return [...new Map(this.ctx.libraries.flatMap(lib=>lib.movies).filter(m=>!m.game&&!m.isSeries).map(m=>[m.id,m])).values()]
      .sort((a,b)=>(b.year??0)-(a.year??0)||a.title.localeCompare(b.title)).slice(0,this.capacity);
  }
  build():void {
    this.dispose();if(!this.movies().length||this.ctx.ceilingY<8.5)return;
    const group=this.group=new THREE.Group();group.name=this.placement.id;
    group.position.set(this.placement.position.x,0,this.placement.position.z);group.rotation.y=this.placement.yaw;
    const own=<T extends {dispose():void}>(v:T):T=>{this.owned.push(v);return v;};
    const steel=own(new THREE.MeshStandardMaterial({color:0x514e48,roughness:.55,metalness:.25}));
    const accent=own(new THREE.MeshStandardMaterial({color:0xc08caa,roughness:.6}));
    const dark=own(new THREE.MeshStandardMaterial({color:0x181b1d,roughness:.5}));
    const foot=own(new THREE.MeshStandardMaterial({color:0xb88a24,roughness:.5}));
    const fallback=new THREE.Group();group.add(fallback);
    const box=(x:number,y:number,z:number,w:number,h:number,d:number,m:THREE.Material)=>{
      const mesh=new THREE.Mesh(own(new THREE.BoxGeometry(w,h,d)),m);mesh.position.set(x,y,z);mesh.castShadow=mesh.receiveShadow=true;fallback.add(mesh);
    };
    box(0,.025,0,2.65,.05,1.3,dark);box(1.03,.37,.28,.30,.69,.44,foot);box(-1.12,.37,0,.18,.69,.95,steel);
    for(const x of [-1.15,1.15])box(x,3.44,-.48,.10,5.48,.10,steel);
    for(let row=0;row<6;row++)box(0,.9+row*.89,.03,2.4,.025,.98,steel);
    box(0,6.36,0,2.46,.13,1.1,steel);box(0,7.84,-.55,2.66,.73,.03,accent);
    for(const x of [-.605,.605])box(x,6.93,.10,1.10,1,1.08,dark);
    const proxy=new THREE.Mesh(own(new THREE.BoxGeometry(2.8,8.3,1.5)),own(new THREE.MeshBasicMaterial({visible:false})));
    proxy.position.y=4.15;proxy.name='twin-crt-tower-collision';group.add(proxy);
    this.ctx.scene.add(group);this.ctx.addCollider(proxy);
    this.removeModel=installDisplayModel(this.ctx,group,fallback,'models/twin-crt-tower.glb',{
      TowerSteel:steel,TowerAccent:accent,TowerBase:dark,TowerFoot:foot,PocketBack:dark,
    });
    this.ctx.requestShadowRefresh();this.ctx.requestRender();
  }
  getSlots():FixtureSlot[] {
    if(!this.group)return [];
    const movies=this.movies(),yaw=this.placement.yaw,slots:FixtureSlot[]=[];
    movies.forEach((movie,i)=>{
      const row=3-Math.floor(i/5),col=i%5,x=(col-2)*.456,lean=-.15;
      const z=.40+(CASE_HEIGHT/2+.02)*Math.sin(lean),y=this.shelfHeights[row]+(CASE_HEIGHT/2+.02)*Math.cos(lean);
      slots.push({movie,side:'front',shelfIdx:row,col,restingX:this.placement.position.x+x*Math.cos(yaw)+z*Math.sin(yaw),
        restingY:y,restingZ:this.placement.position.z-x*Math.sin(yaw)+z*Math.cos(yaw),restingRotY:yaw,restingRotX:lean,depth:CASE_DEPTH,
        key:`fixture_${this.placement.id}_side_front_shelf_${row}_col_${col}`});
    });return slots;
  }
  getFootprint():Footprint|null {
    return this.group?{label:`fixture:${this.placement.id}`,kind:'fixture',cx:this.placement.position.x,cz:this.placement.position.z,
      w:2.8,d:1.5,yaw:this.placement.yaw,clearance:3}:null;
  }
  update():void {}
  dispose():void {this.removeModel?.();this.removeModel=null;this.group?.removeFromParent();this.group=null;this.owned.forEach(v=>v.dispose());this.owned=[];}
}
