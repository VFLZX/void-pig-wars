export const BOT_POLICY_VERSION = 1;

export const BOT_POLICY_FEATURES = Object.freeze([
  'defend', 'engage', 'raid', 'resupply', 'retreat', 'buyBlocks', 'buyIronSword',
  'buyDiamondSword', 'buyArmor', 'buyApple',
  'health', 'distance', 'targetHealth', 'pigHealth', 'pigThreat', 'enemyCount',
  'incomingPressure', 'alliedPressure', 'allyFocus', 'iron', 'gold', 'blocks',
  'weapon', 'armor', 'pickupCount', 'teamSize',
]);

const CANDIDATE_KINDS = BOT_POLICY_FEATURES.slice(0, 10);
const clamp01 = (value, scale = 1) => Math.max(0, Math.min(1, (Number.isFinite(value) ? value : 0) / scale));

export function encodeBotCandidate(context = {}, candidate = {}) {
  const features = new Float32Array(BOT_POLICY_FEATURES.length);
  const kindIndex = CANDIDATE_KINDS.indexOf(candidate.kind);
  if (kindIndex >= 0) features[kindIndex] = 1;
  const values = [
    clamp01(context.health, context.maxHealth || 100),
    clamp01(context.distance, 48),
    clamp01(context.targetHealth, context.targetMaxHealth || 100),
    clamp01(context.pigHealth, context.pigMaxHealth || 200),
    clamp01(context.pigThreat, 14),
    clamp01(context.enemyCount, 8),
    clamp01(context.incomingPressure, 60),
    clamp01(context.alliedPressure, 60),
    clamp01(context.allyFocus, 4),
    clamp01(context.iron, 40),
    clamp01(context.gold, 20),
    clamp01(context.blocks, 128),
    clamp01(context.weapon, 40),
    clamp01(context.armor, 1),
    clamp01(context.pickupCount, 12),
    clamp01(context.teamSize, 4),
  ];
  features.set(values, 10);
  return features;
}

export function isValidBotPolicy(model) {
  if (!model || model.version !== BOT_POLICY_VERSION || model.inputSize !== 26 ||
      !Number.isInteger(model.hiddenSize) || model.hiddenSize < 1 || model.hiddenSize > 64) return false;
  const arrays = [model.inputWeights, model.hiddenBias, model.outputWeights];
  const sizes = [model.inputSize * model.hiddenSize, model.hiddenSize, model.hiddenSize];
  for (let index = 0; index < arrays.length; index++) {
    const array = arrays[index];
    if (!(Array.isArray(array) || ArrayBuffer.isView(array)) || array.length !== sizes[index]) return false;
    for (const value of array) if (!Number.isFinite(value) || Math.abs(value) > 16) return false;
  }
  return Number.isFinite(model.outputBias) && Math.abs(model.outputBias) <= 16;
}

export function scoreBotCandidate(features, model) {
  if (!isValidBotPolicy(model) || !features || features.length !== 26) return null;
  const hidden = new Float32Array(model.hiddenSize);
  for (let h = 0; h < model.hiddenSize; h++) {
    let value = model.hiddenBias[h];
    for (let i = 0; i < 26; i++) {
      const feature = features[i];
      if (!Number.isFinite(feature) || feature < 0 || feature > 1) return null;
      value += model.inputWeights[h * 26 + i] * feature;
    }
    hidden[h] = Math.tanh(value);
  }
  let score = model.outputBias;
  for (let h = 0; h < hidden.length; h++) score += model.outputWeights[h] * hidden[h];
  return Number.isFinite(score) ? score : null;
}

export function createNeutralBotPolicy() {
  return {
    version: BOT_POLICY_VERSION,
    inputSize: 26,
    hiddenSize: 8,
    inputWeights: Array(26 * 8).fill(0),
    hiddenBias: Array(8).fill(0),
    outputWeights: Array(8).fill(0),
    outputBias: 0,
    trained: false,
  };
}
