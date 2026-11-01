import test from 'node:test';
import assert from 'node:assert/strict';
import { avatarPose, firstPersonAttackPose, shopkeeperIdlePose } from '../animation-utils.mjs';

test('avatar pose stays neutral when reduced motion is enabled', () => {
  assert.deepEqual(avatarPose(1.2, 3, true, 0.04, 0.03, true), {
    leftLeg: 0, rightLeg: 0, bodyBob: 0, bodySquash: 0, hitTilt: 0,
  });
});

test('avatar walking pose alternates legs within a bounded range', () => {
  const pose = avatarPose(0.16, 3, true);
  assert.ok(pose.leftLeg >= -0.6 && pose.leftLeg <= 0.6);
  assert.ok(pose.rightLeg >= -0.6 && pose.rightLeg <= 0.6);
  assert.equal(pose.leftLeg, -pose.rightLeg);
  assert.ok(pose.bodyBob >= 0 && pose.bodyBob <= 0.07);
});

test('first-person attack pose swings and returns to its resting transform', () => {
  const impact = firstPersonAttackPose(0.12);
  const resting = firstPersonAttackPose(0.4);
  assert.ok(impact.rotationX < 0);
  assert.ok(impact.offsetZ > 0);
  assert.deepEqual(resting, { rotationX: 0, rotationY: 0, offsetZ: 0 });
  assert.deepEqual(firstPersonAttackPose(0.12, true), { rotationX: 0, rotationY: 0, offsetZ: 0 });
});

test('landing and hit poses produce short bounded reactions', () => {
  const landing = avatarPose(0.4, 0, true, 0.14);
  const hit = avatarPose(0.4, 0, true, -1, 0.12);
  assert.ok(landing.bodySquash > 0 && landing.bodySquash <= 0.12);
  assert.ok(hit.hitTilt > 0 && hit.hitTilt <= 0.18);
});

test('shopkeeper idle pose is subtle and disabled for reduced motion', () => {
  const idle = shopkeeperIdlePose(0.8, 0.3);
  assert.ok(Math.abs(idle.bob) <= 0.055);
  assert.ok(Math.abs(idle.yaw) <= 0.04);
  assert.deepEqual(shopkeeperIdlePose(0.8, 0.3, true), { bob: 0, yaw: 0 });
});
