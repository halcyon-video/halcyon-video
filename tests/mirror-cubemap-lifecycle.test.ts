import test from 'node:test';
import assert from 'node:assert/strict';
import { MirrorCubemapLifecycle, resolveReflectionMode, shouldCaptureMirrorRoomProbe, stockPlacementSettled } from '../src/mirror-cubemap-lifecycle.ts';

test('cubemap room probe waits for settled stock', () => {
  assert.equal(shouldCaptureMirrorRoomProbe('cubemap', true, false), false);
  assert.equal(shouldCaptureMirrorRoomProbe('cubemap', true, true), true);
});

test('an unset reflection preference defaults to cubemap even on high quality', () => {
  assert.equal(resolveReflectionMode(null), 'cubemap');
  assert.equal(resolveReflectionMode('unexpected'), 'cubemap');
  assert.equal(shouldCaptureMirrorRoomProbe(null, true, true), true);
});

test('room probe is not captured for inactive reflection paths', () => {
  assert.equal(shouldCaptureMirrorRoomProbe('auto', true, true), false);
  assert.equal(shouldCaptureMirrorRoomProbe('smooth', true, true), false);
  assert.equal(shouldCaptureMirrorRoomProbe('cubemap', false, true), false);
});

test('a settled selected case may stay dirty without blocking the stocked capture', () => {
  assert.equal(stockPlacementSettled(0, [{ needsInitialMatrixUpdate: false }]), true);
  assert.equal(stockPlacementSettled(1, [{ needsInitialMatrixUpdate: false }]), false);
  assert.equal(stockPlacementSettled(0, [{ needsInitialMatrixUpdate: true }]), false);
});

test('last complete panorama survives stock work until its replacement exists', () => {
  const disposed: string[] = [];
  const target = (id: string) => ({ texture: { id }, dispose: () => disposed.push(id) }) as any;
  const lifecycle = new MirrorCubemapLifecycle();
  const first = target('first');
  lifecycle.replace(first);
  lifecycle.stockChanged();
  assert.equal(lifecycle.probe, first.texture);
  assert.equal(lifecycle.ready, false);
  assert.equal(lifecycle.pending, true);
  lifecycle.replace(target('second'));
  assert.deepEqual(disposed, ['first']);
  lifecycle.dispose();
  assert.deepEqual(disposed, ['first', 'second']);
});
