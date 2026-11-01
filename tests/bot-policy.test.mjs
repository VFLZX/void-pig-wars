import test from 'node:test';
import assert from 'node:assert/strict';
import { BOT_POLICY_FEATURES, BOT_POLICY_VERSION, encodeBotCandidate, scoreBotCandidate } from '../bot-policy.mjs';

test('bot policy encodes ten action flags and sixteen bounded state features', () => {
  const features = encodeBotCandidate({ health: 50, maxHealth: 100, distance: 24, pigHealth: 30, pigMaxHealth: 200 }, { kind: 'engage' });
  assert.equal(BOT_POLICY_FEATURES.length, 26);
  assert.equal(features.length, 26);
  assert.equal(features[1], 1);
  assert.ok([...features].every((value) => value >= 0 && value <= 1));
});

test('model scores candidates and rejects malformed shapes or non-finite weights', () => {
  const model = { version: BOT_POLICY_VERSION, inputSize: 26, hiddenSize: 8, inputWeights: Array(208).fill(0.01), hiddenBias: Array(8).fill(0), outputWeights: Array(8).fill(0.1), outputBias: 0 };
  assert.ok(Number.isFinite(scoreBotCandidate(new Float32Array(26).fill(0.5), model)));
  assert.equal(scoreBotCandidate(new Float32Array(26), { ...model, version: BOT_POLICY_VERSION + 1 }), null);
  assert.equal(scoreBotCandidate(new Float32Array(26), { ...model, inputWeights: [NaN] }), null);
});
