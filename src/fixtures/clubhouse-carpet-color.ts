import * as THREE from 'three';
/** The owner's blue/red pairing takes precedence over a mathematical complement. */
export function coordinateClubhouseCarpetHex(storeCarpetHex: string): string {
  const color=new THREE.Color(storeCarpetHex), hsl={h:0,s:0,l:0};color.getHSL(hsl);
  if(hsl.h>=.50&&hsl.h<=.75)return '#a52b2b';
  color.setHSL((hsl.h+.5)%1,hsl.s,Math.max(.08,Math.min(.3,hsl.l)));
  return '#'+color.getHexString();
}
