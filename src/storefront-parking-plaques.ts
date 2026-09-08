import * as THREE from 'three';
import { BB_OUTFIT, ensureBundledFont } from './bundled-fonts';
import type { FixtureContext } from './fixtures';

/** Standard blue permit-parking plate; its color belongs to traffic signage. */
export function createParkingPermitTexture(onReady?: () => void): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512; canvas.height = 768;
  const c = canvas.getContext('2d')!;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const paint = () => {
    c.clearRect(0, 0, 512, 768);
    c.fillStyle = '#e5e7df'; c.beginPath(); c.roundRect(2, 2, 508, 764, 48); c.fill();
    c.fillStyle = '#173b85'; c.beginPath(); c.roundRect(12, 12, 488, 744, 39); c.fill();
    c.fillStyle = '#e5e7df'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.font = `600 42px "${BB_OUTFIT}"`;
    c.fillText('PERMIT PARKING ONLY', 256, 127, 454);
    c.fillText('TOW-AWAY ZONE', 256, 224, 350);
    c.font = `600 35px "${BB_OUTFIT}"`;
    c.fillText('MAXIMUM FINE $500.00', 256, 621, 470);
    c.beginPath(); c.roundRect(145, 322, 230, 244, 12); c.fill();
    c.strokeStyle = c.fillStyle = '#173b85'; c.lineWidth = 9; c.lineCap = c.lineJoin = 'round';
    c.beginPath(); c.arc(241, 467, 49, .3, Math.PI*1.54); c.stroke();
    c.beginPath(); c.arc(226, 365, 14, 0, Math.PI*2); c.fill();
    c.beginPath(); c.moveTo(226, 390); c.lineTo(236, 441); c.lineTo(291, 441); c.lineTo(314, 488); c.lineTo(332, 482); c.stroke();
    c.beginPath(); c.moveTo(231, 410); c.lineTo(283, 410); c.stroke();
    c.fillStyle = '#697276';
    for (const y of [65, 694]) { c.beginPath(); c.arc(256, y, 5, 0, Math.PI*2); c.fill(); }
    texture.needsUpdate = true;
    onReady?.();
  };
  paint(); ensureBundledFont(BB_OUTFIT, paint);
  return texture;
}

export function addStorefrontParkingPlaques(ctx: FixtureContext, parent: THREE.Group, pierCenter: number, front: number): () => void {
  let disposed = false;
  const texture = createParkingPermitTexture(() => { if (!disposed) ctx.requestRender(); });
  const material = new THREE.MeshStandardMaterial({ map: texture, transparent: true, alphaTest: .1, roughness: .62, metalness: .1, envMapIntensity: .2 });
  const geometry = new THREE.PlaneGeometry(1, 1.5);
  for (const sign of [-1, 1]) {
    const plate = new THREE.Mesh(geometry, material);
    plate.name = 'pillarParkingPermitPlate';
    plate.position.set(sign*pierCenter, 4.95, front+.025);
    plate.receiveShadow = true;
    parent.add(plate);
  }
  return () => { disposed = true; texture.dispose(); material.dispose(); geometry.dispose(); };
}
