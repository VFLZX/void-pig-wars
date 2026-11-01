import test from 'node:test';
import assert from 'node:assert/strict';
import { trainPolicy } from '../tools/bot-training/train-policy.mjs';

test('seeded evolution returns repeatable valid policy and evaluation metrics', () => {
  const options = { generations: 1, population: 4, seed: 20261101, evaluationSeeds: [2, 5] };
  const first = trainPolicy(options);
  const second = trainPolicy(options);
  assert.deepEqual(first, second);
  assert.equal(first.model.version, 1);
  assert.equal(first.model.inputWeights.length, 208);
  assert.ok(Number.isFinite(first.candidateMetrics.averageReward));
});

