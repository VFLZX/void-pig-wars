import test from 'node:test';
import assert from 'node:assert/strict';
import { resolvePigHealth } from '../tools/bot-training/simulator.mjs';

test('defending reduces incoming pressure but never repairs past pig damage', () => {
  assert.equal(resolvePigHealth(100, 0, true), 100);
  assert.ok(resolvePigHealth(100, 100, true) <= 100);
  assert.ok(resolvePigHealth(100, 100, true) > resolvePigHealth(100, 100, false));
});
