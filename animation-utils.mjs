function clamp(value, min, max) {
  return Math.max(min, Math.min(max, Number.isFinite(value) ? value : 0));
}

export function avatarPose(time, horizontalSpeed, grounded, landingAge = -1, hitAge = -1, reducedMotion = false) {
  if (reducedMotion) {
    return { leftLeg: 0, rightLeg: 0, bodyBob: 0, bodySquash: 0, hitTilt: 0 };
  }
  const walk = clamp(Math.abs(horizontalSpeed) / 3, 0, 1);
  const legSwing = Math.sin((Number.isFinite(time) ? time : 0) * 10.5) * 0.55 * walk * (grounded ? 1 : 0.35);
  const landing = landingAge >= 0 && landingAge < 0.28
    ? Math.sin(Math.PI * landingAge / 0.28)
    : 0;
  const hit = hitAge >= 0 && hitAge < 0.24
    ? Math.sin(Math.PI * hitAge / 0.24)
    : 0;
  return {
    leftLeg: legSwing,
    rightLeg: -legSwing,
    bodyBob: grounded ? Math.abs(Math.sin((Number.isFinite(time) ? time : 0) * 21)) * 0.065 * walk : 0,
    bodySquash: landing * 0.12,
    hitTilt: hit * 0.18,
  };
}

export function firstPersonAttackPose(elapsed, reducedMotion = false) {
  const duration = 0.34;
  if (reducedMotion || !Number.isFinite(elapsed) || elapsed < 0 || elapsed >= duration) {
    return { rotationX: 0, rotationY: 0, offsetZ: 0 };
  }
  const swing = Math.sin(Math.PI * elapsed / duration);
  return {
    rotationX: -0.95 * swing,
    rotationY: 0.16 * swing,
    offsetZ: 0.18 * swing,
  };
}

export function shopkeeperIdlePose(time, phase = 0, reducedMotion = false) {
  if (reducedMotion) return { bob: 0, yaw: 0 };
  const safeTime = Number.isFinite(time) ? time : 0;
  const safePhase = Number.isFinite(phase) ? phase : 0;
  return {
    bob: Math.sin(safeTime * 2 + safePhase) * 0.055,
    yaw: Math.sin(safeTime * 0.8 + safePhase) * 0.04,
  };
}
