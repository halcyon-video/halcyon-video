import * as THREE from 'three';
import { selfLit } from './material-lighting';
import { tryLoadUserAssetTexture } from './user-assets';

// Constant world-scale pavement, color matched to the selected surroundings.
export function createMatchedPavement() {
  const size=128,data=new Uint8Array(size*size*4);
  const texture=new THREE.DataTexture(data,size,size,THREE.RGBAFormat);
  texture.colorSpace=THREE.SRGBColorSpace;texture.wrapS=texture.wrapT=THREE.RepeatWrapping;
  texture.magFilter=THREE.LinearFilter;texture.minFilter=THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps=true;texture.anisotropy=8;
  const material=selfLit(new THREE.MeshBasicMaterial({map:texture,toneMapped:false,fog:false}),'baked-backdrop');
  material.name='photograph-matched-pavement';
  const srgb=new THREE.Color(),target=new THREE.Color('#80766b'),mean=new THREE.Color(.5,.5,.5),repeat=new THREE.Vector2(1,1);
  let tile:THREE.Texture|null=null,disposed=false;
  function setColor(color:THREE.Color){
    target.copy(color);
    if(tile){material.color.setRGB(target.r/Math.max(mean.r,.001),target.g/Math.max(mean.g,.001),target.b/Math.max(mean.b,.001));return;}
    color.getRGB(srgb,THREE.SRGBColorSpace);let seed=731;
    for(let i=0;i<size*size;i++){
      seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;
      const grain=1+((seed>>>0)%17-8)/255,at=i*4;
      data[at]=Math.round(Math.min(1,srgb.r*grain)*255);data[at+1]=Math.round(Math.min(1,srgb.g*grain)*255);data[at+2]=Math.round(Math.min(1,srgb.b*grain)*255);data[at+3]=255;
    }
    texture.needsUpdate=true;
  }
  function setRepeat(x:number,y:number){repeat.set(x,y);texture.repeat.copy(repeat);tile?.repeat.copy(repeat);}
  setColor(target);
  tryLoadUserAssetTexture('environments/outside/ground/pavement.png',loaded=>{
    if(disposed){loaded.dispose();return;}
    const canvas=document.createElement('canvas');canvas.width=canvas.height=16;
    const context=canvas.getContext('2d');
    if(context){context.drawImage(loaded.image as HTMLImageElement,0,0,16,16);const pixels=context.getImageData(0,0,16,16).data;let r=0,g=0,b=0;
      for(let i=0;i<pixels.length;i+=4){r+=pixels[i];g+=pixels[i+1];b+=pixels[i+2];}
      mean.setRGB(r/256/255,g/256/255,b/256/255,THREE.SRGBColorSpace);
    }
    tile=loaded;tile.wrapS=tile.wrapT=THREE.RepeatWrapping;tile.repeat.copy(repeat);tile.anisotropy=16;
    material.map=tile;material.needsUpdate=true;setColor(target);
  });
  return {material,setColor,setRepeat,dispose(){disposed=true;texture.dispose();tile?.dispose();material.dispose();}};
}
