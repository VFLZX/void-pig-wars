# Terrain-Aware Adaptive Bots Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Make offline bots navigate islands and bridges intentionally and change combat objectives based on current match risk.

**Architecture:** Keep the existing JavaScript utility AI. Add a bounded 0.5-unit route grid over supported surfaces, virtual bridge segments over void gaps, and cached path waypoints. Feed route progress and a local combat-risk estimate into objective scoring, including a stable retreat objective.

**Tech Stack:** Browser JavaScript, Three.js.

**Spec:** `docs/superpowers/specs/2026-10-31-adaptive-bots-island-shops-design.md`

## Global Constraints

- No machine-learning model, online AI service, or new runtime dependency.
- No bots in online matchmaking; existing online matches remain human-only.
- Keep each bot's local inventory and existing movement/combat simulation.
- Cache route searches; do not run a full map search every animation frame.
- Do not add or run automated tests in this task; use static syntax and diff checks only.

## Review Focus

- Bots must not treat unsupported void cells as ordinary walkable route nodes; a gap crossing must spend supported bridge blocks or use a valid jump.
- A placed block, newly blocked route, or stalled bot must invalidate/rebuild the route before the bot loops indefinitely.
- Retreat must target reachable home-island terrain away from threats and yield when the home pig becomes endangered.
- Multiple same-team bots should not all abandon defense for the same raid or chase the same pickup.
- Offline bot updates must stay gated out of online rooms.

---

### Task 1: Add bounded surface and bridge route planning

**Files:**
- Modify: `game.js`

**Interfaces:**
- Consumes: `supportAt(x, z, referenceY)`, `isBlocked(x, z, feet)`, `worldSurfaces`, `buildMeshes`, and `botBuildAhead(bot, dx, dz)`.
- Produces: `findBotRoute(bot, target) -> { waypoints: Array<{x:number,z:number,y:number,bridge:boolean}>, targetX:number, targetZ:number, revision:number } | null`; bot route state stores the returned route, current waypoint index, next replan time, and last-progress position.

- [x] Add route search over a bounded local 0.5-unit grid for supported island/bridge surfaces. Permit horizontal neighbors only when support height is within the existing step/jump limits and the move passes collision checks.
- [x] Add virtual bridge candidates between reachable surface edges and target-side surfaces. Score by estimated block count plus route length, reject candidates when the bot lacks enough blocks, and return a bridge direction for the existing builder to execute.
- [x] Cache the route and advance waypoints as the bot reaches them. Invalidate on added blocks, stale support/collision, blocked movement, or lack of progress for the configured stall interval.
- [x] Integrate route waypoints into `moveBots()` while preserving gravity, jumping, collision, and supported block-placement behavior.
- [x] Run `node --check game.js` and `git diff --check`; expected: exit 0 with no whitespace errors.

### Task 2: Make tactical choices account for fight risk and team roles

**Files:**
- Modify: `game.js`

**Interfaces:**
- Consumes: Task 1 route interface, `chooseBotObjective(bot, enemies, now)`, bot health/equipment, team pig health, ally objectives, and local pickup state.
- Produces: `estimateBotCombatRisk(bot, enemies, allies) -> {incomingPressure:number, alliedPressure:number, nearbyEnemies:number, nearbyAllies:number, outnumbered:boolean}`; objective selection adds `retreat` with a reachable home-island waypoint.

- [x] Score combat using nearby enemy count, their weapon/armor, bot health/armor/weapon, and allied support; retain defense, engage, raid, and resupply as live choices.
- [x] Favor retreat below roughly half health when estimated local pressure makes an engagement unfavorable. Select a safe reachable point on the home island away from the nearest enemy, and keep it briefly unless the pig is endangered or the route is invalid.
- [x] Preserve a defending role when the pig is threatened and reduce duplicate raid/pickup focus among allies. Re-evaluate on a bounded interval and on meaningful threat/route changes.
- [x] Ensure route failure falls back to a safe defense/resupply objective rather than repeated forward movement.
- [x] Run `node --check game.js` and `git diff --check`; expected: exit 0 with no whitespace errors.

### Task 3: Document the changed offline bot behavior

**Files:**
- Modify: `README.md`

- [x] Describe terrain-aware pathing, bridge building, threat-based retreat/defense, and objective changes without claiming machine-learning behavior.
- [x] Confirm the README still says bots operate in local matches and online matches remain human-only.
- [x] Review the spec acceptance criteria against `game.js` and run `git diff --check`.
