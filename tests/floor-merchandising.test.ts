import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildPromoCampaign } from '../src/promo-campaigns.ts';
import { floorPromotionPlacements } from '../src/floor-merchandising.ts';
import { validateLayout, type Footprint } from '../src/layout-validator.ts';
import type { Title, Library } from '../src/providers/media-source-provider.ts';

const films: Title[] = Array.from({ length: 36 }, (_, n) => ({
  id: `film-${n}`,
  title: `Film ${n}`,
  year: 1995,
  rating: 'PG',
  duration: '90m',
  overview: '',
  director: '',
  actors: [`Actor ${n % 3}`],
  studios: [`Studio ${n % 2}`],
  genres: [],
  localPath: '',
}));
const libraries: Library[] = [{ id: 'films', name: 'Films', movies: films, genres: [] }];
const bounds = { minX: -20, maxX: 42, minZ: -60, maxZ: 15 };

test('featured film fills 36 facings with one real title; later towers choose different films', () => {
  const a = buildPromoCampaign(['feature-title:0'], libraries, 3, 3)!;
  const b = buildPromoCampaign(['feature-title:1'], libraries, 3, 3)!;
  assert.equal(a.faces.flatMap((f) => f.movies).length, 36);
  assert.equal(new Set(a.faces.flatMap((f) => f.movies.map((m) => m.id))).size, 1);
  assert.notEqual(a.faces[0].movies[0].id, b.faces[0].movies[0].id);
  assert.equal(a.faces[0].source, 'FEATURE PRESENTATION');
  assert.equal(buildPromoCampaign(['feature-title:-1'], libraries, 3, 3), null);
});

test('spotlights have one subject on all sides and nine distinct, matching films per face', () => {
  for (const kind of ['actor-spotlight', 'studio-feature']) {
    const campaign = buildPromoCampaign([`${kind}:0`], libraries, 3, 3)!;
    assert.equal(new Set(campaign.faces.map((f) => f.label)).size, 1);
    for (const face of campaign.faces) {
      assert.equal(new Set(face.movies.map((m) => m.id)).size, 9);
      assert.ok(
        face.movies.every((m) =>
          (kind === 'actor-spotlight' ? m.actors : m.studios)!.some(
            (name) => name.toUpperCase() === face.label,
          ),
        ),
      );
    }
  }
});

test('unavailable titles and duplicated service listings cannot manufacture a spotlight', () => {
  const sparse: Library[] = [
    {
      ...libraries[0],
      movies: [
        films[0],
        { ...films[0], id: 'other-service' },
        ...films.slice(1).map((m) => ({ ...m, comingSoon: true })),
      ],
    },
  ];
  assert.equal(buildPromoCampaign(['actor-spotlight:0'], sparse, 3, 3), null);
  assert.equal(buildPromoCampaign(['feature-title:1'], sparse, 3, 3), null);
  assert.equal(buildPromoCampaign(['feature-title:0'], [{ ...libraries[0], movies: [] }], 3, 3), null);
});

test('ten varied promotions fit without colliding with diagonal shelves or checkout', () => {
  const obstacles: Footprint[] = [
    { label: 'diagonal shelf', kind: 'shelving', cx: 11, cz: -25, w: 3, d: 18, yaw: Math.PI / 4 },
    { label: 'checkout', kind: 'structure', cx: 11, cz: 4.5, w: 23, d: 21, yaw: 0 },
  ];
  const plan = floorPromotionPlacements(libraries, obstacles, bounds);
  assert.equal(plan.length, 9);

  // Check the 10-object retail mix:
  // 6 four-sided displays: 2 feature titles, 2 studio features, 2 actor spotlights
  const towers = plan.filter((p) => p.kind === 'four-sided-display');
  assert.equal(towers.length, 6);
  assert.ok(towers.every((p) => buildPromoCampaign(p.options!.campaigns as string[], libraries, 3, 3)));
  assert.equal(towers.filter((p) => (p.options!.campaigns as string[])[0].startsWith('feature-title:')).length, 2);
  assert.equal(towers.filter((p) => (p.options!.campaigns as string[])[0].startsWith('studio-feature:')).length, 2);
  assert.equal(towers.filter((p) => (p.options!.campaigns as string[])[0].startsWith('actor-spotlight:')).length, 2);

  // 2 sale fixtures: bargain bin + pv drape table
  assert.equal(plan.filter((p) => p.kind === 'bargain-bin').length, 1);
  assert.equal(plan.filter((p) => p.kind === 'pv-drape-table').length, 1);

  // 1 approx 4-foot acrylic popcorn bin
  assert.equal(plan.filter((p) => p.kind === 'acrylic-popcorn-bin').length, 0);

  // 1 rotating impulse rack
  assert.equal(plan.filter((p) => p.kind === 'rotating-merchandiser').length, 1);

  const footprints: Footprint[] = plan.map((p) => ({
    label: p.id,
    kind: 'fixture',
    cx: p.position.x,
    cz: p.position.z,
    w: p.kind === 'pv-drape-table' ? 6.2 : p.kind === 'acrylic-popcorn-bin' || p.kind === 'rotating-merchandiser' ? 2.2 : 3,
    d: p.kind === 'pv-drape-table' ? 2.7 : p.kind === 'acrylic-popcorn-bin' || p.kind === 'rotating-merchandiser' ? 2.2 : 3,
    yaw: p.yaw,
    clearance: 3,
  }));
  assert.deepEqual(validateLayout([...obstacles, ...footprints], bounds), []);
  assert.deepEqual(plan, floorPromotionPlacements(libraries, obstacles, bounds));
  assert.equal(floorPromotionPlacements(libraries, obstacles, bounds, 8).length, 1);
});

test('small or fully obstructed stores decline extra displays instead of forcing ten', () => {
  assert.deepEqual(floorPromotionPlacements([], [], bounds), []);
  assert.deepEqual(floorPromotionPlacements(libraries, [], { minX: 0, maxX: 8, minZ: -10, maxZ: 15 }), []);
  assert.deepEqual(
    floorPromotionPlacements(
      libraries,
      [{ label: 'occupied', kind: 'structure', cx: 11, cz: -22.5, w: 62, d: 75, yaw: 0 }],
      bounds,
    ),
    [],
  );
});


test('three existing towers leave room for actual fixture variety within ten', () => {
  const plan = floorPromotionPlacements(libraries, [], bounds, 3);
  assert.equal(plan.length, 6);
  for (const kind of ['bargain-bin', 'pv-drape-table', 'rotating-merchandiser'])
    assert.ok(plan.some(p => p.kind === kind), kind);
  assert.equal(plan.filter(p => p.kind === 'four-sided-display').length, 3);
});


test('series-only stock never reserves empty movie sale fixtures', () => {
  const plan = floorPromotionPlacements([{...libraries[0], movies: films.map(m => ({...m, isSeries: true}))}], [], bounds);
  assert.ok(plan.every(p => p.kind !== 'bargain-bin' && p.kind !== 'pv-drape-table'));
});
