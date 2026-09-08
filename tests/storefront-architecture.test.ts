import { test } from 'node:test';
import assert from 'node:assert/strict';
import { facadeDimensions, resolveFacadeStyle, type FacadeStyle } from '../src/storefront-architecture.ts';

test('old and unknown settings keep the gabled facade', () => {
  for (const value of [null, '', 'standard', 'unknown']) assert.equal(resolveFacadeStyle(value), 'gabled-brick');
  assert.equal(resolveFacadeStyle('flat-parapet'), 'flat-parapet');
  assert.equal(resolveFacadeStyle('arcaded-brick'), 'arcaded-brick');
});

test('the gabled storefront uses a modest peak above its low parapet', () => {
  const d = facadeDimensions(13.5, 7.9, 'gabled-brick');
  assert(d.parapetTop >= 16 && d.parapetTop <= 17);
  assert(d.gableBase+d.gableHeight >= 22 && d.gableBase+d.gableHeight <= 24);
  assert(d.towerStripeTop < d.stripeTop, 'entry stripe sits below the wing stripe');
  assert(d.logoY < d.gableBase, 'cabinet belongs over the entry, below the peak');
});

test('tall rooms retain roof clearance without stretching the entrance opening', () => {
  for (const style of ['gabled-brick', 'flat-parapet', 'arcaded-brick'] as FacadeStyle[]) {
    for (const height of [9, 13.5, 18, 24]) {
      const d = facadeDimensions(height, 7.9, style);
      assert(d.parapetTop > height+.85, 'parapet conceals the structural roof');
      assert.equal(d.headerBottom, 9.15);
      assert(d.headerTop > d.headerBottom);
      assert(d.frontProjection <= 4.2, 'portico remains on the established sidewalk');
    }
  }
});

test('flat and arcaded fronts do not inherit a hidden triangular roof', () => {
  for (const style of ['flat-parapet', 'arcaded-brick'] as FacadeStyle[]) {
    const d = facadeDimensions(13.5, 7.9, style);
    assert.equal(d.gableHeight, 0);
    assert(d.pierTop > d.parapetTop);
    assert(d.frontProjection < 3, 'shallow frontage leaves room for its canopy');
  }
});

test('gabled canopy pillars leave a clear passage behind their rear faces', () => {
  const d = facadeDimensions(13.5, 7.9, 'gabled-brick');
  assert(d.pierBack-.75 >= 2, 'two feet clear of the finished wall');
  assert(d.pierFront > d.pierBack+1.5, 'pillars retain physical depth');
  assert(d.pierFront < 4.7, 'the pillar base remains on the sidewalk');
  assert(d.frontProjection >= d.pierBack && d.frontProjection <= d.pierFront);
});
