# Self-Play Bot Policy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Train and ship a compact machine-learning policy that makes local bots choose stronger team tactics through offline self-play.

**Architecture:** A standalone deterministic JavaScript arena simulator trains a small candidate-scoring neural policy with a seeded evolutionary algorithm. The browser loads a versioned JSON weight artifact and evaluates it only when selecting a new bot objective or purchase; current movement, pathfinding, bridge building, and combat execution remain in `game.js`. Missing or incompatible weights fall back to the current heuristic policy.

**Tech Stack:** Browser JavaScript modules, Node.js standard library for offline simulation/training, JSON model artifact.

**Spec:** `docs/superpowers/specs/2026-11-01-self-play-bot-policy-design.md`

## Global Constraints

- Keep runtime inference in browser JavaScript with no new runtime dependency.
- Train offline from a deterministic, headless simulator so the expensive training loop does not affect game FPS.
- The learned model selects only from actions/objectives that the existing game code considers legal.
- Model features must be normalized and bounded; inference must not add per-frame allocations or run on every animation frame.
- Use fixed seeds for evaluation and keep training episodes separate from held-out evaluation episodes.

## Review Focus

- Invalid/missing model file: local matches use the existing heuristic scorer without crashing.
- Unsupported policy version or wrong weight dimensions: reject the artifact and use the fallback.
- Illegal action candidate: the runtime never asks movement/combat code to execute an objective that is no longer valid.
- Team sizes and mode variation: policy training/evaluation covers 1v1, FFA, and 2v2v2v2 through 4v4v4v4 rosters.
- Seed variation and opponents: held-out episodes compare against both the legacy policy and self-play agents to detect overfitting or exploitative idle behavior.

## File Map

- Create `bot-policy.mjs` for feature encoding, versioned model validation, and small forward-pass inference.
- Create `bot-policy-weights.json` as the browser-loadable model artifact.
- Create `tools/bot-training/simulator.mjs` for deterministic headless episodes.
- Create `tools/bot-training/train-policy.mjs` for seeded self-play evolution and held-out evaluation.
- Modify `game.js` at `chooseBotObjective()` and `purchaseBotGear()` to present legal candidates to the policy and retain the old scorer as fallback.
- Modify `README.md` with the model/training command and honest limitations.

---

### Task 1: Define the policy feature and model format

**Files:**
- Create: `bot-policy.mjs`
- Create: `bot-policy-weights.json`

**Interfaces:**
- Export `BOT_POLICY_VERSION = 1` and `BOT_POLICY_FEATURES` in a stable ordered schema.
- Export `encodeBotCandidate(context, candidate) -> Float32Array` with bounded values.
- Export `scoreBotCandidate(features, model) -> number | null`; return `null` for invalid versions, dimensions, or non-finite weights.
- Model JSON stores `version`, `inputSize`, `hiddenSize`, `inputWeights`, `hiddenBias`, `outputWeights`, and `outputBias`.

- [ ] Add the 26 input features specified in the design: 10 candidate-type flags and 16 normalized match-state values.
- [ ] Implement a compact `26 -> 8 -> 1` tanh scoring network with explicit shape/finite-value validation.
- [ ] Add a neutral initial model artifact so the game can load a known-valid version before training is complete.
- [ ] Run `node --check bot-policy.mjs` and a manual Node invocation that checks output is finite and invalid model versions return `null`.

### Task 2: Build the deterministic self-play simulator

**Files:**
- Create: `tools/bot-training/simulator.mjs`

**Interfaces:**
- Export `runEpisode({ policies, seed, mode, maxTurns }) -> { winner, rewards, turns, stats }`.
- Simulator policies consume the same candidate feature schema as `bot-policy.mjs`.
- Fixed seeds must produce identical episode results.

- [ ] Implement the headless team arena state: mode team slots, bot health/gear/resources, generator availability, threats near pigs, legal objective/purchase candidates, combat exchange, respawn, and team elimination.
- [ ] Reuse `encodeBotCandidate()` and `scoreBotCandidate()` so the trainer and browser share model semantics.
- [ ] Keep movement abstracted to objective distance/cost; do not duplicate Three.js rendering, jumping, or voxel collision physics.
- [ ] Record win/loss, pig survival, resource use, combat contribution, idle/stuck time, and avoidable deaths for reward calculation.
- [ ] Run a short set of fixed-seed episodes twice and compare output summaries for determinism.

### Task 3: Train and evaluate candidate policies offline

**Files:**
- Create: `tools/bot-training/train-policy.mjs`
- Modify: `bot-policy-weights.json`

**Interfaces:**
- Command: `node tools/bot-training/train-policy.mjs --generations 120 --population 40 --seed 20261101`.
- Trainer writes the best compatible version 1 policy to `bot-policy-weights.json` and prints training plus held-out metrics.
- Baselines include the existing utility policy and the current population best.

- [ ] Implement seeded genetic evolution with elites, tournament selection, bounded Gaussian mutation, and self-play matches mixed with legacy-policy opponents.
- [ ] Use a reward dominated by match wins and pig survival, with smaller terms for effective defense/combat/resource spending and penalties for idle/stuck play, avoidable deaths, and wasted purchases.
- [ ] Evaluate finalists on separate held-out seeds and on each supported team roster; compare win rate and objective/resource metrics against the legacy baseline.
- [ ] Persist only a model that is finite, version 1, and better than the neutral/legacy baseline on the selected evaluation aggregate; otherwise keep the fallback artifact and report the regression.

### Task 4: Integrate the model into local bot decisions

**Files:**
- Modify: `game.js`
- Modify: `README.md`

**Interfaces:**
- `chooseBotObjective()` and `purchaseBotGear()` keep their existing responsibilities but use the policy to rank legal candidate records.
- Invalid model or no legal candidates falls back to the current heuristic scorer.
- Online match state remains unaffected; model decisions run only for active local bots when the existing objective/purchase timers elapse.

- [ ] Refactor `chooseBotObjective()` to build legal objective candidates, encode their features, choose the highest model score, and retain the legacy-score fallback.
- [ ] Refactor `purchaseBotGear()` to build only currently affordable/legal purchases and rank them using the same policy interface.
- [ ] Preserve current objective stickiness, team focus behavior, route budgets, and bot movement/physics execution.
- [ ] Load the trained JSON artifact without blocking the animation loop and handle missing/unsupported artifacts with the existing heuristic.
- [ ] Run `node --check game.js` and `node --check bot-policy.mjs`; manually play local small and large team modes with valid, missing, and intentionally incompatible policy versions.
- [ ] Document the training command, evaluation metrics, fallback behavior, and that the model does not learn from players during play.
