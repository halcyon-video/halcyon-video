import * as THREE from 'three';
import { retailAudio } from '../audio';
import { GUMBALL_SCALE } from './gumball-layout';

/** One bounded, reusable dispense; idle machines hold no animation loop. */
export function gumballDispenser(root: THREE.Group, render: () => void) {
  const geometry = new THREE.SphereGeometry(.05, 12, 8);
  const material = new THREE.MeshStandardMaterial({ color: 0xf3cf22, roughness: .25 });
  const ball = new THREE.Mesh(geometry, material);
  ball.name = 'dispensed-gumball'; ball.visible = false;
  ball.scale.setScalar(GUMBALL_SCALE); ball.receiveShadow = true;
  root.add(ball);
  let crank: THREE.Object3D | undefined, flap: THREE.Object3D | undefined;
  let crankRest = 0, flapRest = 0, frame = 0, started = 0, disposed = false, cycle = 0;
  let turns = 5, chuteLow = .57, chuteHigh = 2.5, chuteRadius = .43;
  const colors = [0xf3cf22, 0xe83445, 0x36b569, 0x36a6de, 0xf48ac1];
  const pose = (ms: number) => {
    const t = Math.min(1, Math.max(0, (ms - 700) / 5000));
    // Follow the authored raceway and its actual number of turns. glTF
    // exports Blender -Y as store +Z; follow the same trough centerline.
    if (ms < 700) ball.visible = false;
    else if (t < 1) {
      ball.visible = true;
      const a = (1 - t) * Math.PI * 2 * turns + Math.PI / 2;
      const radius = .26 * (chuteRadius - .055) / .43;
      const y = chuteHigh - .045 - t * (chuteHigh - chuteLow - .3);
      ball.position.set(radius * Math.cos(a), y, -radius * Math.sin(a)).multiplyScalar(GUMBALL_SCALE);
    } else {
      const u = Math.min(1, (ms - 5700) / 700);
      ball.visible = true;
      const radius = .26 * (chuteRadius - .055) / .43;
      ball.position.set(0, (chuteLow + .255) * (1 - u) + .41 * u + Math.sin(u * Math.PI * 3) * .035 * (1 - u),
        -radius + (.75 + radius) * u).multiplyScalar(GUMBALL_SCALE);
    }
    ball.rotation.x = t * Math.PI * 30;
    ball.rotation.z = t * Math.PI * 20;
    if (crank) { crank.rotation.z = crankRest + Math.min(1, ms / 700) * Math.PI * 2; crank.updateMatrix(); }
    if (flap) { flap.rotation.x = flapRest + (ms > 5600 && ms < 6450 ? Math.sin((ms - 5600) / 850 * Math.PI) * 1.1 : 0); flap.updateMatrix(); }
    render();
  };
  const tick = (now: number) => {
    if (disposed) return;
    const ms = now - started;
    pose(ms);
    if (ms < 6600) frame = requestAnimationFrame(tick);
    else { frame = 0; root.userData.dispensing = false; }
  };
  root.userData.walkActivate = () => {
    if (disposed || frame) return;
    material.color.setHex(colors[cycle++ % colors.length]);
    started = performance.now(); root.userData.dispensing = true;
    retailAudio.gumballDispense(); pose(0); frame = requestAnimationFrame(tick);
  };
  return {
    attach(model: THREE.Group): void {
      model.traverse(o => {
        const meta = o.userData;
        if (Number.isFinite(meta.gumballChuteTurns)) {
          turns = meta.gumballChuteTurns; chuteLow = meta.gumballChuteLow;
          chuteHigh = meta.gumballChuteHigh; chuteRadius = meta.gumballChuteRadius;
        }
        if (/turn[ _]handle/i.test(o.name)) { crank = o; crankRest = o.rotation.z; o.userData.retailAnimated = true; }
        if (/delivery[ _]flap/i.test(o.name)) { flap = o; flapRest = o.rotation.x; o.userData.retailAnimated = true; }
      });
    },
    dispose(): void {
      disposed = true; cancelAnimationFrame(frame); frame = 0;
      delete root.userData.walkActivate; delete root.userData.dispensing;
      ball.removeFromParent(); geometry.dispose(); material.dispose();
    },
  };
}
