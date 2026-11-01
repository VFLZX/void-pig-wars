import test from 'node:test';
import assert from 'node:assert/strict';
import { runEpisode, SUPPORTED_MODES } from '../tools/bot-training/simulator.mjs';

test('fixed-seed episodes are deterministic and return complete team metrics', () => {
  const options = { policies: ['legacy', 'legacy'], seed: 77, mode: 'solo', maxTurns: 40 };
  assert.deepEqual(runEpisode(options), runEpisode(options));
  const result = runEpisode(options);
  assert.equal(result.rewards.length, 2);
  assert.equal(result.stats.length, 2);
  assert.ok(result.turns <= 40);
});

test('simulator supports the same solo, FFA and four-team rosters as the game', () => {
  for (const [mode, roster] of Object.entries(SUPPORTED_MODES)) {
    const result = runEpisode({ mode, policies: Array(roster.teams).fill('legacy'), seed: 12, maxTurns: 5 });
    assert.equal(result.rewards.length, roster.teams);
  }
});
