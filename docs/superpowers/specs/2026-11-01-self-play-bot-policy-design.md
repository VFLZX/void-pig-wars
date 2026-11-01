# Self-Play Machine-Learning Bot Policy Design

## Intent

Replace the hand-tuned high-level objective scores with a compact machine-learning policy trained through offline self-play, while keeping the existing terrain navigation, movement, combat, and voxel presentation.

## Current State

- Offline bots already use terrain-aware route planning, bridge building, purchases, and a utility scorer to choose defense, engagement, raids, resupply, and retreat.
- Objective decisions are still driven by manually selected score weights and short-term local observations.
- Bot code lives in `game.js`; pure bot decision helpers and Node-based tests live in `bot-decision-utils.mjs` and `tests/bot-decision-utils.test.mjs`.
- Online matches are server-authoritative and do not run local bots.

## Goals

- Train a learned policy from self-play rather than hand-entering objective priorities.
- Make the learned policy choose among legal high-level objectives and purchases from the current game state.
- Learn team coordination signals, such as ally focus, home pressure, available resources, equipment, and risk.
- Keep browser inference small and deterministic enough for large 3v3v3v3 and 4v4v4v4 bot matches.
- Produce a repeatable offline training command and a versioned model artifact usable by the browser.
- Retain a safe legacy decision fallback if the model artifact is missing, malformed, or unsupported.

## Non-Goals

- External LLM/API calls, model downloads, cloud training, or player telemetry collection.
- Changing online server-authoritative matches or adding bots to online queues.
- Replacing movement physics, combat, or terrain routefinding with a neural network.
- Claiming human-level play or guaranteed improvement across every map and strategy.

## Constraints

- Keep runtime inference in browser JavaScript with no new runtime dependency.
- Train offline from a deterministic, headless simulator so the expensive training loop does not affect game FPS.
- The learned model selects only from actions/objectives that the existing game code considers legal.
- Model features must be normalized and bounded; inference must not add per-frame allocations or run on every animation frame.
- Use fixed seeds for evaluation and keep training episodes separate from held-out evaluation episodes.

## Approaches

1. **Continue with hand-tuned utility scores:** smallest and reliable, but does not meet the selected machine-learning goal.
2. **Small policy network trained by offline self-play (selected):** a compact feed-forward model scores legal high-level decisions. A headless simulation trains it against copies of itself and a legacy baseline. Browser code evaluates the saved weights only when bot objectives are reconsidered. This gives a real learned policy without adding a live service or runtime library.
3. **Learn from recorded player games:** potentially closer to human tactics, but no trustworthy dataset exists yet and recording players would create a privacy/consent requirement.

## Model and Training Behavior

- A lightweight policy receives normalized per-bot and team features: health, inventory and equipment, distance to candidate goal, pig health and threat, visible enemy pressure, ally focus, available pickups, and mode/team state.
- The policy ranks legal candidates including defend, engage, raid, resupply, retreat, and gear purchase. Existing routefinding and movement execute the selected goal.
- Offline self-play uses an isolated headless arena simulator that models team objectives, resources, combat exchanges, deaths/respawns, and match outcomes sufficiently to train high-level decisions. It does not simulate Three.js rendering.
- The trainer evolves model parameters from seeded episodes, with rewards dominated by match wins and pig survival, plus smaller rewards for useful resource spending, effective combat, and defending teammates. It penalizes avoidable deaths, idle/stuck time, and wasted resources.
- Evaluation compares the trained model with the current utility-policy baseline across held-out seeds and the supported team sizes. The training artifact records the feature version and policy version.
- Runtime objective selection uses the model output plus the existing action-validity gates. Bots retain distinct personality inputs to avoid identical behavior. The existing heuristic remains a fallback and a comparison baseline.
- The model is trained offline and shipped with the game; it does not learn from players during play.

## Expected Files

- New offline simulator and trainer under `tools/bot-training/`.
- New small model inference/feature module under the existing bot utilities or a dedicated `bot-policy.mjs`.
- Versioned learned weights in a browser-loadable JSON artifact.
- `game.js` integration at the existing objective-selection boundary.
- Training and model-format documentation in the README.

## Risks and Limitations

- A simplified simulator may reward tactics that transfer imperfectly to the rendered game. Evaluation must include held-out arenas, modes, and baseline opponents before replacing the heuristic by default.
- The model optimizes only high-level choices; it will still rely on existing routefinding, collision, movement, and combat execution.
- Training quality depends on reward balance and simulator fidelity. A trained model should not be described as smarter until it consistently outperforms the legacy baseline in measured evaluations.
