import { FixturePlacement } from './store-layout';
import { FixtureContext, StoreFixture } from './fixtures';
import { FourSidedDisplay } from './fixtures/four-sided-display';
import {
  CandyDisplay,
  PreviouslyViewedBin,
  TapeRewinder,
  TapeCleanerDisplay
} from './fixtures/period-fixtures';
import { GameSection } from './fixtures/game-section';
import { BargainBin } from './fixtures/bargain-bin';
import { GenreEndcap } from './fixtures/genre-endcap';
import { CollectionEndcap } from './fixtures/collection-endcap';
import { GoldClamshellDisplay } from './fixtures/gold-clamshell';
import { PvDrapeTable } from './fixtures/pv-drape-table';
import { ComingSoonLetterboard } from './fixtures/coming-soon-letterboard';
import { TipJar } from './fixtures/tip-jar';
import { MirrorColumn } from './fixtures/mirror-column';

export interface PlacedFixture extends StoreFixture {
  placement: FixturePlacement;
}

export type FixtureFactory = (placement: FixturePlacement, ctx: FixtureContext) => PlacedFixture;

const registry = new Map<string, FixtureFactory>();

export function registerFixtureKind(kind: string, factory: FixtureFactory) {
  registry.set(kind, factory);
}

// Every registered fixture kind, for tooling/enumeration (tools/list-slots.mjs).
export function listFixtureKinds(): string[] {
  return [...registry.keys()].sort();
}

export function createFixture(placement: FixturePlacement, ctx: FixtureContext): PlacedFixture {
  const factory = registry.get(placement.kind);
  if (!factory) {
    throw new Error(`Unknown fixture kind: ${placement.kind}`);
  }
  const clonedPlacement: FixturePlacement = {
    ...placement,
    position: { ...placement.position },
    options: placement.options ? { ...placement.options } : undefined
  };
  return factory(clonedPlacement, ctx);
}

// Statically register standard/default fixture kinds
registerFixtureKind('four-sided-display', (placement, ctx) => new FourSidedDisplay(placement, ctx));
registerFixtureKind('candy-display', (placement, ctx) => new CandyDisplay(placement, ctx));
registerFixtureKind('previously-viewed-bin', (placement, ctx) => new PreviouslyViewedBin(placement, ctx));
registerFixtureKind('tape-rewinder', (placement, ctx) => new TapeRewinder(placement, ctx));
registerFixtureKind('tape-cleaner-display', (placement, ctx) => new TapeCleanerDisplay(placement, ctx));
registerFixtureKind('game-section', (placement, ctx) => new GameSection(placement, ctx));
registerFixtureKind('bargain-bin', (placement, ctx) => new BargainBin(placement, ctx));
registerFixtureKind('genre-endcap', (placement, ctx) => new GenreEndcap(placement, ctx));
registerFixtureKind('collection-endcap', (placement, ctx) => new CollectionEndcap(placement, ctx));
registerFixtureKind('gold-clamshell', (placement, ctx) => new GoldClamshellDisplay(placement, ctx));
registerFixtureKind('pv-drape-table', (placement, ctx) => new PvDrapeTable(placement, ctx));
registerFixtureKind('coming-soon-letterboard', (placement, ctx) => new ComingSoonLetterboard(placement, ctx));
registerFixtureKind('tip-jar', (placement, ctx) => new TipJar(placement, ctx));
registerFixtureKind('mirror-column', (placement, ctx) => new MirrorColumn(placement, ctx));
