import * as THREE from 'three';
import { BB_ARCHIVO_BLACK, ensureBundledFont } from '../bundled-fonts';

/** Original, brand-free printed packaging. Shared by all facings of a product;
 * fixture ownership keeps generated maps alive through the model load only. */
export function retailPackaging(own: <T extends {dispose():void}>(value:T)=>T, render:()=>void) {
  const roles: Record<string,THREE.Material> = {};
  const products: [string,string,string][] = [
    ['DrinkCanRed','COLA','#9b2530'],['DrinkCanBlue','SODA','#205880'],
    ['DrinkCanGreen','CITRUS','#337442'],['CandyCartonRed','CHOCO BARS','#9b2530'],
    ['CandyCartonBlue','MOVIE MINTS','#205880'],['CandyCartonYellow','GUMMY BEARS','#a57419'],
    ['SnackPouchGreen','SOUR RIBBONS','#337442'],['SnackPouchPurple','FRUIT BITES','#69376e'],
    ['PopcornCartonYellow','POPCORN','#a57419'],['PopcornTubWhite','POPCORN','#9b2530'],
  ];
  const painters: (()=>void)[]=[];
  for (const [role,label,color] of products) {
    const canvas=document.createElement('canvas');canvas.width=256;canvas.height=256;
    const tex=own(new THREE.CanvasTexture(canvas));tex.colorSpace=THREE.SRGBColorSpace;tex.flipY=false;
    tex.anisotropy=4;tex.name=`${label} printed wrap`;
    const paint=()=>{
      const c=canvas.getContext('2d')!;
      c.fillStyle=color;c.fillRect(0,0,256,256);
      c.fillStyle='#eee9da';c.fillRect(0,24,256,5);c.fillRect(0,210,256,5);
      c.fillStyle='#f5f0e1';c.beginPath();c.ellipse(128,115,91,60,0,0,2*Math.PI);c.fill();
      c.fillStyle=color;c.textAlign='center';c.textBaseline='middle';
      c.font=`24px ${BB_ARCHIVO_BLACK}, sans-serif`;
      const words=label.split(' ');words.forEach((word,i)=>c.fillText(word,128,115+(i-(words.length-1)/2)*29,174));
      c.fillStyle='#eee9da';c.font='11px sans-serif';c.fillText(role.startsWith('Drink')?'355 mL':'NET WT 85 g',128,190);
      // Fine ingredient rules and a barcode belong to the printed wrap.
      c.fillStyle='#ded7c7';for(let line=0;line<3;line++)c.fillRect(12,230+line*4,112-line*11,1);
      c.fillStyle='#f5f0e1';c.fillRect(185,224,56,24);c.fillStyle='#272522';
      for(let n=0;n<20;n++)c.fillRect(189+n*2.4,227,n%3===0?1.8:.8,18);
      tex.needsUpdate=true;
    };
    paint();painters.push(paint);
    const mat=own(new THREE.MeshStandardMaterial({map:tex,roughness:role.startsWith('Drink')?.38:.58,
      metalness:role.startsWith('Drink')?.22:0}));mat.name=role;roles[role]=mat;
  }
  ensureBundledFont(BB_ARCHIVO_BLACK,()=>{painters.forEach(p=>p());render();});
  // Clear sheet goods transmit the shelf stock without the opaque warm veil.
  for(const role of ['CoolerGlass','PopcornClearAcrylic','GondolaRetainingLip']) {
    const mat=own(new THREE.MeshPhysicalMaterial({color:0xf5f9fa,transparent:true,opacity:.075,
      roughness:.13,metalness:0,clearcoat:.45,depthWrite:false}));mat.name=role;roles[role]=mat;
  }
  return roles;
}
