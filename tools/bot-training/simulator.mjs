import { encodeBotCandidate, scoreBotCandidate } from '../../bot-policy.mjs';

export const SUPPORTED_MODES = Object.freeze({
  solo: { teams: 2, players: 1 }, doubles: { teams: 2, players: 2 }, ffa: { teams: 4, players: 1 },
  '2v2v2v2': { teams: 4, players: 2 }, '3v3v3v3': { teams: 4, players: 3 },
  '4v4v4v4': { teams: 4, players: 4 },
});
const ACTIONS = ['defend', 'engage', 'raid', 'resupply', 'retreat', 'buyBlocks', 'buyIronSword', 'buyDiamondSword', 'buyArmor', 'buyApple'];
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));

export function resolvePigHealth(health, incomingPressure, defending = false) {
  const damage = Math.min(5, Math.max(0, incomingPressure) * 0.025);
  const blocked = defending ? 2.5 : 0;
  return Math.max(0, health - Math.max(0, damage - blocked));
}

function rng(seed) {
  let state = seed >>> 0 || 1;
  return () => { state ^= state << 13; state ^= state >>> 17; state ^= state << 5; return (state >>> 0) / 0x100000000; };
}

function legacyScore(kind, c) {
  const healthNeed = 1 - c.health / 100;
  const risk = c.incomingPressure / (c.alliedPressure + 1);
  const scores = {
    defend: 0.6 + (1 - c.pigHealth / 200) * 2.8 + c.pigThreat / 16,
    engage: 0.8 + c.weapon / 30 + (1 - c.targetHealth / 100) - risk * 0.35,
    raid: 0.9 + c.weapon / 40 - c.distance / 38 - c.allyFocus * 0.1,
    resupply: (c.iron < 12 ? 1 : 0) + (c.blocks < 48 ? 0.8 : 0) + (c.gold < 8 ? 0.5 : 0),
    retreat: healthNeed * 2 + (risk > 1.2 ? 1 : 0) - c.pigThreat / 30,
    buyBlocks: c.iron >= 4 && c.blocks < 96 ? 1.1 : -1,
    buyIronSword: c.iron >= 12 && c.weapon < 22 ? 1.8 : -1,
    buyDiamondSword: c.gold >= 8 && c.weapon < 34 ? 2.1 : -1,
    buyArmor: c.gold >= 8 && !c.armor ? 1.2 : -1,
    buyApple: c.gold >= 4 && c.apples < 1 && healthNeed > 0.3 ? 2 : -1,
  };
  return scores[kind];
}

function contextFor(team, teams, mode, random) {
  const enemies = teams.filter((other) => other !== team && other.pig > 0);
  const target = enemies.slice().sort((a, b) => a.pig - b.pig)[0];
  const enemyCount = enemies.reduce((n, other) => n + other.players.filter((p) => p.health > 0).length, 0);
  return {
    health: team.players.reduce((n, p) => n + p.health, 0) / team.players.length,
    maxHealth: 100,
    distance: clamp(7 + random() * 30 + Math.abs(team.id - (target?.id ?? 0)) * 2, 0, 48),
    targetHealth: target?.players.find((p) => p.health > 0)?.health ?? 0,
    targetMaxHealth: 100,
    pigHealth: team.pig, pigMaxHealth: 200, pigThreat: team.pressure,
    enemyCount, incomingPressure: enemyCount * (0.3 + team.pressure / 24),
    alliedPressure: team.players.filter((p) => p.health > 0).length,
    allyFocus: team.lastAction === 'engage' ? Math.max(0, mode.players - 1) : 0,
    iron: team.iron, gold: team.gold, blocks: team.blocks, weapon: team.weapon,
    armor: team.armor, pickupCount: teams.filter((candidate) => candidate !== team && candidate.pig > 0).length,
    teamSize: mode.players,
  };
}

function choose(team, teams, mode, random) {
  const context = contextFor(team, teams, mode, random);
  const target = teams.filter((candidate) => candidate !== team && candidate.pig > 0)
    .sort((a, b) => a.pig - b.pig)[0];
  let choice = null;
  const legalActions = ACTIONS.filter((kind) => {
    if (kind === 'buyBlocks') return team.iron >= 4 && team.blocks < 96;
    if (kind === 'buyIronSword') return team.iron >= 12 && team.weapon < 22;
    if (kind === 'buyDiamondSword') return team.gold >= 8 && team.weapon < 34;
    if (kind === 'buyArmor') return team.gold >= 8 && team.armor === 0;
    if (kind === 'buyApple') return team.gold >= 4 && team.apples < 1 && context.health < 70;
    return true;
  });
  for (const kind of legalActions) {
    const features = encodeBotCandidate(context, { kind });
    const learned = scoreBotCandidate(features, team.policy);
    const score = Number.isFinite(learned) ? learned : legacyScore(kind, context);
    if (!choice || score + random() * 1e-5 > choice.score) choice = { kind, score };
  }
  return { ...choice, target };
}

export function runEpisode({ policies = [], seed = 1, mode = 'solo', maxTurns = 160 } = {}) {
  const config = SUPPORTED_MODES[mode];
  if (!config) throw new RangeError(`Unsupported mode: ${mode}`);
  const random = rng(seed);
  const teams = Array.from({ length: config.teams }, (_, id) => ({
    id, players: Array.from({ length: config.players }, () => ({ health: 100 })),
    pig: 200, iron: 0, gold: 0, blocks: 48, weapon: 10, armor: 0, apples: 1,
    pressure: 0, defending: false, lastAction: '', policy: policies[id] ?? 'legacy',
    stats: { resourceUse: 0, combat: 0, idle: 0, avoidableDeaths: 0, pigDamage: 0 },
  }));
  let winner = null;
  let turns = 0;
  for (; turns < maxTurns; turns++) {
    const active = teams.filter((team) => team.pig > 0 && team.players.some((p) => p.health > 0));
    if (active.length <= 1) { winner = active[0]?.id ?? null; break; }
    for (const team of active) {
      const living = team.players.filter((p) => p.health > 0);
      const { kind, target } = choose(team, teams, config, random);
      team.pressure *= 0.6;
      team.defending = false;
      team.iron += 0.55 * living.length;
      team.gold += 0.12 * living.length;
      team.lastAction = kind;
      if (kind === 'defend') { team.defending = true; team.pressure *= 0.2; }
      else if (kind === 'engage' && target) {
        const enemy = target.players.find((p) => p.health > 0);
        if (enemy) {
          enemy.health -= team.weapon * (0.45 + random() * 0.3) * living.length;
          team.stats.combat += team.weapon * living.length;
          if (enemy.health <= 0) {
            if (target.pig > 0) enemy.health = 50;
            else { enemy.health = 0; team.stats.avoidableDeaths++; }
          }
        }
      } else if (kind === 'raid' && target) {
        const damage = team.weapon * (0.45 + random() * 0.3) * living.length;
        target.pig = Math.max(0, target.pig - damage);
        target.pressure += damage / 15;
        team.stats.pigDamage += damage;
      } else if (kind === 'resupply') {
        team.iron += 2 + random() * 3; team.gold += random() * 1.5; team.stats.resourceUse++;
      } else if (kind === 'retreat') for (const player of living) player.health = Math.min(100, player.health + 3);
      else if (kind === 'buyBlocks' && team.iron >= 4) { team.iron -= 4; team.blocks += 16; team.stats.resourceUse += 4; }
      else if (kind === 'buyIronSword' && team.iron >= 12 && team.weapon < 22) { team.iron -= 12; team.weapon = 22; team.stats.resourceUse += 12; }
      else if (kind === 'buyDiamondSword' && team.gold >= 8 && team.weapon < 34) { team.gold -= 8; team.weapon = 34; team.stats.resourceUse += 8; }
      else if (kind === 'buyArmor' && team.gold >= 8 && !team.armor) { team.gold -= 8; team.armor = 0.3; team.stats.resourceUse += 8; }
      else if (kind === 'buyApple' && team.gold >= 4 && team.apples < 1) { team.gold -= 4; team.apples++; team.stats.resourceUse += 4; }
      else team.stats.idle++;
    }
    for (const team of teams) {
      if (team.pig <= 0) continue;
      const pressure = teams.filter((other) => other !== team && other.pig > 0).reduce((sum, other) => sum + other.pressure, 0);
      if (team.players.some((player) => player.health > 0)) team.pig = resolvePigHealth(team.pig, pressure, team.defending);
    }
  }
  const rewards = teams.map((team) => (winner === team.id ? 100 : 0) + team.pig * 0.15 +
    team.players.filter((p) => p.health > 0).length * 4 + team.stats.pigDamage * 0.04 +
    team.stats.combat * 0.015 + team.stats.resourceUse * 0.02 - team.stats.idle * 0.1 - team.stats.avoidableDeaths * 0.5);
  return { winner, rewards, turns: Math.min(turns, maxTurns), stats: teams.map((team) => ({
    ...team.stats, pigHealth: team.pig, living: team.players.filter((p) => p.health > 0).length,
  })) };
}
