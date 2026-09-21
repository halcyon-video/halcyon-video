import type { FixtureContext, StoreFixture } from '../fixtures';
import type { FixturePlacement } from '../store-layout';

/** Retired wall-apparel slot retained as a no-op for old fixture configs. */
export class CounterApparel implements StoreFixture {
  constructor(public placement: FixturePlacement, private ctx: FixtureContext) {}
  build(): void { void this.ctx; }
  getFootprint(): null { return null; }
  update(): void {}
  dispose(): void {}
}
