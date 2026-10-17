import type { FixturePlacement } from './store-layout';
import type { FixtureContext, StoreFixture } from './fixtures';

// The fixture-kind registry lives in this import-free leaf module so it is
// initialised before anything can register into it. When it sat inside
// fixture-registry.ts, an import cycle (fixture-registry -> fixtures ->
// store-fixtures-config -> fixture-registry) let the bundler evaluate
// store-fixtures-config's registerFixtureKind() calls before the Map existed,
// and the 3D store died at startup with a TDZ ReferenceError.

export interface PlacedFixture extends StoreFixture {
  placement: FixturePlacement;
}

export type FixtureFactory = (placement: FixturePlacement, ctx: FixtureContext) => PlacedFixture;

const registry = new Map<string, FixtureFactory>();

export function registerFixtureKind(kind: string, factory: FixtureFactory) {
  registry.set(kind, factory);
}

export function fixtureFactory(kind: string): FixtureFactory | undefined {
  return registry.get(kind);
}

// Every registered fixture kind, for tooling/enumeration (tools/list-slots.mjs).
export function listFixtureKinds(): string[] {
  return [...registry.keys()].sort();
}
