import test from 'node:test';
import assert from 'node:assert/strict';
import { nextRenderScale, nextScheduledItem, scoreBotEngagement } from '../bot-decision-utils.mjs';

test('route planning work advances fairly across active bots', () => {
  const bots = [{ active: true }, { active: false }, { active: true }];
  const first = nextScheduledItem(bots, 0, (bot) => bot.active);
  const second = nextScheduledItem(bots, first.nextCursor, (bot) => bot.active);

  assert.equal(first.item, bots[0]);
  assert.equal(second.item, bots[2]);
  assert.equal(second.nextCursor, 0);
});

test('bots prioritize an equally distant weakened enemy', () => {
  const healthyScore = scoreBotEngagement({ distance: 5, aggression: 1, targetHealth: 100 });
  const weakenedScore = scoreBotEngagement({ distance: 5, aggression: 1, targetHealth: 20 });

  assert.ok(weakenedScore > healthyScore);
});

test('engagement scoring weighs danger and squad focus', () => {
  const favorable = scoreBotEngagement({ distance: 4, aggression: 1, targetHealth: 60 });
  const outnumbered = scoreBotEngagement({ distance: 4, aggression: 1, targetHealth: 60, botHealth: 45, outnumbered: true });
  const crowded = scoreBotEngagement({ distance: 4, aggression: 1, targetHealth: 60, allyFocus: 2 });

  assert.ok(favorable > outnumbered);
  assert.ok(favorable > crowded);
});

test('render scale lowers under sustained low FPS and recovers gradually', () => {
  assert.equal(nextRenderScale(0.85, 40), 0.75);
  assert.equal(nextRenderScale(0.75, 50), 0.75);
  assert.equal(nextRenderScale(0.75, 60), 0.775);
  assert.equal(nextRenderScale(0.58, 40), 0.58);
  assert.equal(nextRenderScale(0.84, 60), 0.85);
});
