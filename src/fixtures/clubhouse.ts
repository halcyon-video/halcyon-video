import { attachAmbientScreen } from '../ambient-screen';
import { mapClubhouseWall, installClubhousePosters } from './clubhouse-surfaces';
import { ChildrenChair } from './children-chair';
import * as THREE from 'three';
import type { FixtureContext, FixtureSlot, SlottedFixture } from '../fixtures';
import type { FixturePlacement } from '../store-layout';
import { BOX_SPACING } from '../store-layout';
import { CASE_HEIGHT, CASE_DEPTH } from '../video-case';
import { CLUBHOUSE, childrenChairPlacements, clubhouseFeet, clubhouseHost, familyStock } from './clubhouse-layout';
import { installDisplayModel } from './display-model';
import { finishEquipmentSurfaces } from './equipment-surfaces';
import { createSignTextTexture, createEntranceTicketLogoTexture } from '../canvas-textures';
import { markSignMesh } from '../sign-builders';
import { tryLoadUserSignArtTexture } from '../user-assets';
import { makeCurvedScreenGeometry } from '../crt-tube';

/** Original built-in corner club. Private artwork uses the existing sign slots.
 * Scene teardown owns the root; async loads and all finishes retire with it. */
export class Clubhouse implements SlottedFixture {
  private root: THREE.Group | null = null;
  private owned = new Set<{ dispose(): void }>();
  private removers: (() => void)[] = [];
  private proxies: THREE.Mesh[] = [];
  private chairs: ChildrenChair | null = null;
  private wallPaints: THREE.MeshStandardMaterial[] = [];
  readonly cols = 10;
  readonly shelfHeights = [0.5, 1.38, 2.26];
  readonly capacity = 120;
  readonly genre = 'Family';
  constructor(public placement: FixturePlacement, private ctx: FixtureContext) {}
  private host() { const h=clubhouseHost(0,0,1);h.center=this.placement.position;return h; }
  private own<T extends {dispose():void}>(v:T):T {this.owned.add(v);return v;}
  build(): void {
    this.dispose();
    if (this.ctx.activeTheme.id !== 'bb-1990' || this.ctx.ceilingY < CLUBHOUSE.ceiling ||
        (!this.placement.options?.admitted && !this.placement.options?.assetViewer)) return;
    const root=this.root=new THREE.Group();root.name=this.placement.id;
    root.position.set(this.placement.position.x,0,this.placement.position.z);this.ctx.scene.add(root);
    const pal=this.ctx.activeTheme.palette;
    const mat=(name:string,color:string,roughness=.76)=>this.own(new THREE.MeshStandardMaterial({name,color,roughness}));
    const wall = this.ctx.wallSurface?.material ?? mat('WallPaint', pal.wall, .92);
    const finishes={FramePaint:mat('FramePaint',pal.primary),HeaderPaint:mat('HeaderPaint',pal.primary),
      PanelLaminate:wall,ShelfLaminate:mat('ShelfLaminate','#f8f2e8',.65),ShelfEdge:mat('ShelfEdge','#d6d0c5',.55),Baseboard:mat('Baseboard','#262626',.8),EdgePaint:mat('EdgePaint',pal.secondary),CabinetLaminate:mat('CabinetLaminate','#282722'),WallPoster:mat('WallPoster','#ffffff')};
    const fallback=new THREE.Group();root.add(fallback);
    const box=(parent:THREE.Group,x:number,y:number,z:number,w:number,h:number,d:number,m:THREE.Material,yaw=0)=>{
      const mesh=new THREE.Mesh(this.own(new THREE.BoxGeometry(w,h,d)),m);mesh.position.set(x,y,z);mesh.rotation.y=yaw;
      mesh.castShadow=mesh.receiveShadow=true;parent.add(mesh);return mesh;
    };
    for(const f of clubhouseFeet(this.host())) {
      const x=f.cx-root.position.x,z=f.cz-root.position.z;
      const shelf=f.label.includes('family'),tv=f.label.includes('tv-cabinet');
      const panel=f.label.endsWith('-panel');
      const h=shelf?3.4:tv?2.3:panel?3.5:7.65;
      if(shelf){
        const g=new THREE.Group();g.position.set(x,0,z);g.rotation.y=f.yaw;fallback.add(g);
        box(g,0,1.7,-.54,f.w,3.4,.12,finishes.ShelfLaminate);
        for(const y of this.shelfHeights){box(g,0,y+.04,0,f.w,.08,1.2,finishes.ShelfLaminate);box(g,0,y+.13,.57,f.w,.1,.06,finishes.ShelfEdge);}
      } else if(tv){
        const cabinet=new THREE.Group();cabinet.position.set(x,0,z);cabinet.rotation.y=f.yaw;fallback.add(cabinet);
        box(cabinet,0,1.15,0,f.w,2.3,f.d,finishes.CabinetLaminate);
      } else box(fallback,x,h/2,z,f.w,h,f.d,(f.label.endsWith('-rear')||f.label.endsWith('-left'))?finishes.PanelLaminate:finishes.FramePaint,f.yaw);
      const proxy=box(root,x,h/2,z,f.w,h,f.d,this.own(new THREE.MeshBasicMaterial({visible:false})),f.yaw);
      this.proxies.push(proxy);this.ctx.addCollider(proxy);
    }
    // The fallback also has real openings above the low shoulder walls.
    for (const side of ['front','right']) {
      for (const u of [-6.7,.6]) box(fallback,side==='front'?u:6.9,5.55,side==='front'?6.9:u,.4,4.1,.4,finishes.FramePaint);
    }
    for (const [lo,hi,m] of [[7.21,9.933333,finishes.HeaderPaint],
      [9.933333,10.266667,finishes.EdgePaint],[10.266667,10.6,finishes.HeaderPaint]] as const) {
      box(fallback,3.9241,(lo+hi)/2,3.9241,8.52,hi-lo,.25,m,Math.PI/4);
      box(fallback,-3,(lo+hi)/2,6.9,8,hi-lo,.25,m);
      box(fallback,6.9,(lo+hi)/2,-3,.25,hi-lo,8,m);
    }
    box(fallback,-.03,.16,-6.765,13.53,.32,.07,finishes.Baseboard);
    box(fallback,-6.765,.16,-.03,.07,.32,13.53,finishes.Baseboard);
    box(fallback,-3.2,.16,6.735,7.4,.32,.07,finishes.Baseboard);
    box(fallback,6.735,.16,-3.2,.07,.32,7.4,finishes.Baseboard);
    box(fallback,6.9,3.475,-3.2,.25,.05,5,finishes.FramePaint);
    fallback.traverse(o=>{if(o instanceof THREE.Mesh && o.material===wall)mapClubhouseWall(o,this.ctx);});
    // Colored paint retains the same plaster relief as the room.
    this.wallPaints=[finishes.FramePaint,finishes.HeaderPaint,finishes.EdgePaint];
    this.update();
    fallback.traverse(o=>{if(o instanceof THREE.Mesh && [finishes.FramePaint,finishes.HeaderPaint,finishes.EdgePaint].includes(o.material as THREE.MeshStandardMaterial))mapClubhouseWall(o,this.ctx);});
    this.ownedAdd(finishEquipmentSurfaces(fallback));
    this.removers.push(installDisplayModel(this.ctx,root,fallback,'models/clubhouse.glb',finishes,new THREE.Vector3(1,1,1),model=>{
      model.traverse(o=>{if(o instanceof THREE.Mesh){if(o.name==='WallPoster')o.visible=false;
        if(o.material===wall || [finishes.FramePaint,finishes.HeaderPaint,finishes.EdgePaint].includes(o.material as THREE.MeshStandardMaterial))mapClubhouseWall(o,this.ctx);
        const uv=o.geometry.getAttribute('uv');if(uv)o.geometry.setAttribute('uv1',uv.clone());}});
    }));
    // The continuous store floor supplies the nook's exact carpet maps, weave,
    // world UVs, normal scale, roughness and baked contact AO. No overlay rug.
    this.sign('clubhouse-header',createEntranceTicketLogoTexture(this.ctx.activeTheme,true),4.6,2.76,4.14,8.98,4.14,Math.PI/4);
    this.sign('clubhouse-plaque',createSignTextTexture('KIDS CLUBHOUSE',undefined,'standard',6.4/.65),6.4,.65,4.15,7.47,4.15,Math.PI/4);
    // Existing modeled television, sitting on the console at its floor datum.
    const tv=new THREE.Group();tv.name='clubhouse-tv';tv.position.set(-4.9,2.3,-4.9);tv.rotation.y=-3*Math.PI/4;root.add(tv);
    const tvFallback=new THREE.Group();tv.add(tvFallback);box(tvFallback,0,.93,0,2.2,1.86,1.85,finishes.CabinetLaminate);
    const screenMat=this.own(new THREE.MeshBasicMaterial({color:0x111916}));
    const screen=new THREE.Mesh(this.own(makeCurvedScreenGeometry(1.78,1.335,.008)),screenMat);
    screen.rotation.y=Math.PI;screen.position.set(0,1.04,-.823);tv.add(screen);screen.name='clubhouse-program-screen';
    this.removers.push(attachAmbientScreen(this.ctx.scene,screen));
    this.removers.push(installClubhousePosters(root,this.ctx));
    this.removers.push(installDisplayModel(this.ctx,tv,tvFallback,'models/screening-television.glb',{},new THREE.Vector3(1,1,1),model=>{
      model.traverse(o=>{if(o.name==='Glass'||o.name==='TubeFace')o.visible=false;});
    }));
    // Reuse the original modeled period deck; feet sit on the middle shelf.
    const vcr=new THREE.Group();vcr.name='clubhouse-vcr';vcr.position.set(-4.9,1.27,-4.9);vcr.rotation.y=-3*Math.PI/4;root.add(vcr);
    const deckFallback=new THREE.Group();vcr.add(deckFallback);
    box(deckFallback,0,.16,0,1.4,.32,.95,finishes.CabinetLaminate);
    this.removers.push(installDisplayModel(this.ctx,vcr,deckFallback,'models/vcr.glb',{}));
    const [chairPlacement]=childrenChairPlacements({...this.host(),theme:this.ctx.activeTheme.id});
    if(chairPlacement){this.chairs=new ChildrenChair(chairPlacement,this.ctx);this.chairs.build();}
    root.addEventListener('removed',this.onRemoved);this.ctx.requestShadowRefresh();this.ctx.requestRender();
  }
  private ownedAdd(v:{dispose():void}[]){v.forEach(o=>this.owned.add(o));}
  private sign(id:string,tex:THREE.Texture,w:number,h:number,x:number,y:number,z:number,yaw:number){
    this.own(tex);const root=this.root!;
    const material=this.own(new THREE.MeshStandardMaterial({map:tex,transparent:true,alphaTest:.1,roughness:.8}));
    const mesh=markSignMesh(new THREE.Mesh(this.own(new THREE.PlaneGeometry(w,h)),material));mesh.name=id;
    mesh.position.set(x,y,z);mesh.rotation.y=yaw;root.add(mesh);
    tryLoadUserSignArtTexture([id],this.ctx.activeTheme.id,t=>{
      if(this.root!==root){t.dispose();return;}this.own(t);const img=t.image as {width:number;height:number};mesh.scale.y=(w*img.height/img.width)/h;material.map=t;material.needsUpdate=true;this.ctx.requestRender();
    });
  }
  getSlots(): FixtureSlot[] {
    if(!this.root)return [];
    const stock=familyStock(this.ctx.libraries.flatMap(l=>l.movies));if(!stock.length)return [];
    const slots:FixtureSlot[]=[];
    for(const side of ['front','right','back','left'] as const) for(let row=0;row<3;row++) for(let col=0;col<this.cols;col++){
      const inner=side==='back'||side==='left', front=side==='front'||side==='back';
      const bay=Math.floor(col/5),within=col%5;
      const reversed=side==='right'||side==='back', b=reversed?1-bay:bay, c=reversed?4-within:within;
      const u=(inner?[-4.95,-1.4]:[-5.1,-1.4])[b]+(c-2)*BOX_SPACING,v=inner?5.93:7.82;
      slots.push({movie:stock[slots.length%stock.length],side,shelfIdx:row,col,depth:CASE_DEPTH,
        restingX:this.placement.position.x+(front?u:v),restingZ:this.placement.position.z+(front?v:u),
        restingY:this.shelfHeights[row]+.08+CASE_HEIGHT/2*Math.cos(.2)+CASE_DEPTH/2*Math.sin(.2)+.03,
        restingRotY:front?(inner?Math.PI:0):(inner?-Math.PI/2:Math.PI/2),restingRotX:-.2,
        key:`fixture_${this.placement.id}_side_${side}_shelf_${row}_col_${col}`});
    }
    return slots;
  }
  getFootprints(){return this.root?[...clubhouseFeet(this.host()),...(this.chairs?.getFootprints()??[])]:[];}
  update():void {
    const wall=this.ctx.wallSurface?.material;
    if(!(wall instanceof THREE.MeshStandardMaterial))return;
    // Optional wall scans arrive asynchronously; colored plaster follows that swap.
    for(const paint of this.wallPaints) if(paint.map!==wall.map || paint.normalMap!==wall.normalMap || paint.roughnessMap!==wall.roughnessMap) {
      paint.map=wall.map;paint.normalMap=wall.normalMap;paint.normalScale.copy(wall.normalScale);
      paint.roughnessMap=wall.roughnessMap;paint.roughness=wall.roughness;paint.needsUpdate=true;
      this.ctx.requestRender();
    }
  }
  private onRemoved=()=>this.dispose();
  dispose():void {
    const root=this.root;this.root=null;root?.removeEventListener('removed',this.onRemoved);
    this.chairs?.dispose();this.chairs=null;this.wallPaints=[];
    this.removers.forEach(f=>f());this.removers=[];this.proxies.forEach(p=>{p.raycast=()=>{};});this.proxies=[];
    root?.removeFromParent();this.owned.forEach(o=>o.dispose());this.owned.clear();
    if(root){this.ctx.requestShadowRefresh();this.ctx.requestRender();}
  }
}
