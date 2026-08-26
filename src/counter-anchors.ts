// Where the checkout counter IS, for the scene modules that have to point a
// camera, a cursor or a walk waypoint at it.
//
// Until GH #116 every one of those callers spelled the counter as `x = 11`
// paired with `scene.deskApexZ()` — the centreline, and the counter's
// store-facing Z. That held while every counter shape sat across the entrance
// facing −Z. The mom-and-pop desk now runs down a side wall and faces across
// the shop, where that pair names a patch of open floor several feet from the
// till, so the counter publishes its own FRAME (entrance/counter.ts's
// CounterFrame) and the callers express their offsets in it: `u` feet along
// the counter, `n` feet into it. On every front-facing shape +u is world +X
// and +n is world +Z, so those offsets are numerically what they always were.
//
// A free function rather than a StoreScene method on purpose: three-scene.ts
// is at its line budget and this is feature logic, not spine (see the
// store-*.ts extraction pattern in CLAUDE.md).
import type { StoreScene } from './three-scene';
import type { CounterFrame } from './entrance/counter';
import { STORE_CENTER_X } from './store-layout';

/**
 * The active counter's world frame. The fallback reproduces the pre-fixture
 * front-facing counter (centreline, facing −Z), so callers never branch on a
 * store whose entrance has not been built yet.
 */
export function counterFrame(scene: StoreScene): CounterFrame {
  return scene.entrance?.getCounterFrame()
    ?? { fx: STORE_CENTER_X, fz: scene.deskApexZ(), ux: 1, uz: 0, nx: 0, nz: 1, facingYaw: Math.PI };
}
