# Adaptive Bot AI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make offline bot goals and purchases react to live match conditions rather than fixed opening and route scripts.

**Architecture:** Keep bots in `game.js`. Add a small utility scorer that chooses a valid live objective at intervals, with a continuity bonus; feed its goal into the existing movement, bridge, and combat code. Select purchases from context-aware option scores.

**Tech Stack:** Browser JavaScript, Three.js.

**Spec:** `docs/superpowers/specs/2026-10-31-adaptive-bot-ai-design.md`

## Global Constraints

- No new dependencies or remote AI services.
- Local bot matches only; online-match state remains server-owned and unchanged.
- Do not add or run automated tests; static syntax and whitespace checks only.

## Review Focus

- A threatened home pig must make defending more valuable than an unpressured raid.
- Invalid/dead targets and collected pickups cannot remain selected as bot goals.
- Bots on the same team should not all prefer the same resource or pig when another choice is viable.
- Opening decisions must not depend on a hard-coded 12-second wait.
- A selected objective must still obey current movement, support, jump, and block-inventory constraints.

---

### Task 1: Add live utility scoring for bot objectives

**Files:**
- Modify: `game.js`

- [x] Add per-bot aggression/caution/resource-need weights and objective state.
- [x] Score defense, nearby combat, enemy-pig raids, and useful team pickups from current distances, pig health, inventory, and teammate focus.
- [x] Keep a valid objective briefly with a small continuity bonus; immediately discard dead or collected targets.
- [x] Replace nearest-pig/eight-second retarget logic with the utility-selected goal.
- [x] Let bots bridge directly toward the selected objective instead of forcing a center waypoint.

### Task 2: Make gear choices state-aware

**Files:**
- Modify: `game.js`

- [x] Replace fixed wool/sword/armor purchase priority with scores based on remaining blocks, upgrades owned, current currency, aggression/caution, and nearby threats.
- [x] Remove the fixed opening raid delay; bots should choose to defend, resupply, fight, or raid based on the live scores.

### Task 3: Static review

**Files:**
- Review: `game.js`

- [x] Confirm local matches call the utility planner and online matches remain unchanged.
- [x] Run `node --check game.js` and `git diff --check`; do not run automated tests.
- [x] Review target invalidation, decision timing, direct bridge movement, and purchase score tie cases.
