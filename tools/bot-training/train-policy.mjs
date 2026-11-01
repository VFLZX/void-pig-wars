import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { createNeutralBotPolicy, isValidBotPolicy } from '../../bot-policy.mjs';
import { runEpisode, SUPPORTED_MODES } from './simulator.mjs';

function randomFrom(seed) {
  let state = seed >>> 0 || 1;
  return () => { state ^= state << 13; state ^= state >>> 17; state ^= state << 5; return (state >>> 0) / 0x100000000; };
}

function randomModel(random) {
  const model = createNeutralBotPolicy();
  const weight = () => (random() * 2 - 1) * 0.3;
  model.inputWeights = Array.from({ length: 208 }, weight);
  model.hiddenBias = Array.from({ length: 8 }, weight);
  model.outputWeights = Array.from({ length: 8 }, weight);
  model.outputBias = weight();
  model.trained = true;
  return model;
}

function mutate(parent, random, scale = 0.12) {
  const child = structuredClone(parent);
  const mutateArray = (array) => array.map((value) => Math.max(-8, Math.min(8,
    value + (random() + random() + random() - 1.5) * scale)));
  child.inputWeights = mutateArray(child.inputWeights);
  child.hiddenBias = mutateArray(child.hiddenBias);
  child.outputWeights = mutateArray(child.outputWeights);
  child.outputBias = Math.max(-8, Math.min(8, child.outputBias + (random() + random() + random() - 1.5) * scale));
  child.trained = true;
  return child;
}

function evaluate(model, seeds, modes, turns = 72, selfPlay = false) {
  let reward = 0;
  let wins = 0;
  let games = 0;
  let pigHealth = 0;
  let resourceUse = 0;
  let combat = 0;
  let idle = 0;
  let deaths = 0;
  for (const mode of modes) {
    const count = SUPPORTED_MODES[mode].teams;
    for (const seed of seeds) {
      const playerSlot = seed % count;
      const policies = Array(count).fill('legacy');
      policies[playerSlot] = model;
      if (selfPlay && count > 2) policies[(playerSlot + 2) % count] = model;
      const result = runEpisode({ policies, seed, mode, maxTurns: turns });
      reward += result.rewards[playerSlot];
      wins += Number(result.winner === playerSlot);
      pigHealth += result.stats[playerSlot].pigHealth;
      resourceUse += result.stats[playerSlot].resourceUse;
      combat += result.stats[playerSlot].combat;
      idle += result.stats[playerSlot].idle;
      deaths += result.stats[playerSlot].avoidableDeaths;
      games++;
    }
  }
  return {
    games,
    winRate: wins / Math.max(1, games),
    averageReward: reward / Math.max(1, games),
    averagePigHealth: pigHealth / Math.max(1, games),
    averageResourceUse: resourceUse / Math.max(1, games),
    averageCombat: combat / Math.max(1, games),
    averageIdle: idle / Math.max(1, games),
    averageAvoidableDeaths: deaths / Math.max(1, games),
  };
}

export function trainPolicy({ generations = 120, population = 40, seed = 20261101, evaluationSeeds = null } = {}) {
  if (!Number.isInteger(generations) || generations < 1 || generations > 2000) throw new RangeError('generations must be 1..2000');
  if (!Number.isInteger(population) || population < 4 || population > 200) throw new RangeError('population must be 4..200');
  const random = randomFrom(seed);
  let candidates = Array.from({ length: population }, () => randomModel(random));
  let champion = candidates[0];
  let championFitness = -Infinity;

  for (let generation = 0; generation < generations; generation++) {
    const scores = candidates.map((model, index) => {
      const seedA = (seed + generation * 997 + index * 31 + 1) >>> 0;
      const modeA = generation % 2 === 0 ? 'solo' : '2v2v2v2';
      const modeB = generation % 2 === 0 ? '3v3v3v3' : 'ffa';
      const first = evaluate(model, [seedA], [modeA], 52);
      const second = evaluate(model, [seedA + 11], [modeB], 52);
      const mirror = evaluate(model, [seedA + 23], [modeB], 52, true);
      return (first.averageReward + second.averageReward + mirror.averageReward) / 3 +
        (first.winRate + second.winRate + mirror.winRate) * 8;
    });
    const ranked = candidates.map((model, index) => ({ model, score: scores[index] })).sort((a, b) => b.score - a.score);
    if (ranked[0].score > championFitness) { championFitness = ranked[0].score; champion = ranked[0].model; }
    const next = [ranked[0].model, ranked[1].model];
    const tournament = () => {
      const a = ranked[Math.floor(random() * ranked.length)];
      const b = ranked[Math.floor(random() * ranked.length)];
      return a.score >= b.score ? a.model : b.model;
    };
    while (next.length < population) next.push(mutate(tournament(), random, 0.06 + random() * 0.1));
    candidates = next;
  }

  const heldOutSeeds = evaluationSeeds ?? [seed + 10001, seed + 20003, seed + 30011, seed + 40009];
  const modes = Object.keys(SUPPORTED_MODES);
  const heldOut = evaluate(champion, heldOutSeeds, modes, 120);
  const baseline = evaluate('legacy', heldOutSeeds, modes, 120);
  const improved = isValidBotPolicy(champion) && heldOut.averageReward > baseline.averageReward + 0.01;
  return {
    model: improved ? { ...champion, trained: true } : createNeutralBotPolicy(),
    candidateMetrics: heldOut,
    baselineMetrics: baseline,
    improved,
    generations,
    population,
    seed,
  };
}

function optionValue(name, fallback) {
  const index = process.argv.indexOf(name);
  return index < 0 ? fallback : Number(process.argv[index + 1]);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const generations = optionValue('--generations', 120);
  const population = optionValue('--population', 40);
  const seed = optionValue('--seed', 20261101);
  const result = trainPolicy({ generations, population, seed });
  const artifact = resolve(fileURLToPath(new URL('../../bot-policy-weights.json', import.meta.url)));
  if (result.improved) {
    await writeFile(artifact, `${JSON.stringify(result.model, null, 2)}\n`);
    console.log(`Saved improved policy to ${artifact}`);
  } else {
    const current = JSON.parse(await readFile(artifact, 'utf8').catch(() => 'null'));
    if (!isValidBotPolicy(current)) await writeFile(artifact, `${JSON.stringify(result.model, null, 2)}\n`);
    console.log('No aggregate improvement over the legacy baseline; retained fallback weights.');
  }
  console.log(JSON.stringify({ improved: result.improved, candidate: result.candidateMetrics, legacy: result.baselineMetrics }, null, 2));
}
