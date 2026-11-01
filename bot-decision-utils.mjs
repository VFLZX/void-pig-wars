export function nextScheduledItem(items, cursor = 0, isEligible = () => true) {
  if (!items.length) return { item: null, index: -1, nextCursor: 0 };
  const start = ((cursor % items.length) + items.length) % items.length;
  for (let offset = 0; offset < items.length; offset++) {
    const index = (start + offset) % items.length;
    if (isEligible(items[index])) return { item: items[index], index, nextCursor: (index + 1) % items.length };
  }
  return { item: null, index: -1, nextCursor: (start + 1) % items.length };
}

export function scoreBotEngagement({
  distance,
  aggression = 1,
  targetHealth = 100,
  targetMaxHealth = 100,
  targetWeapon = 10,
  botHealth = 100,
  outnumbered = false,
  allyFocus = 0,
}) {
  const healthRatio = Math.max(0, Math.min(1, targetHealth / Math.max(1, targetMaxHealth)));
  const vulnerability = 1 - healthRatio;
  const threat = Math.max(0, Math.min(1, (targetWeapon - 10) / 24));
  const targetValue = vulnerability * 1.05 + threat * 0.3;
  const riskPenalty = outnumbered && botHealth < 70 ? 0.95 : 0;
  return 1.05 + aggression * 0.75 + Math.max(0, 10 - distance) * 0.12 - distance * 0.035 +
    targetValue - riskPenalty - allyFocus * 0.4;
}

export function nextRenderScale(currentScale, fps) {
  if (!Number.isFinite(currentScale) || !Number.isFinite(fps)) return currentScale;
  if (fps < 45) return Math.max(0.58, currentScale - 0.1);
  if (fps > 58) return Math.min(0.85, currentScale + 0.025);
  return currentScale;
}
