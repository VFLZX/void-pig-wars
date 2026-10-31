# Island Shops and Online Resources Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Make the shop accessible at every active team island while preserving the Python server's authoritative purchases and pickup-based online resources.

**Architecture:** Build a shopkeeper for every island in the Three.js client and toggle it with the island's active state. Point the existing interaction UI at the local player's team shop. Keep online purchases sent through the current `buy` WebSocket message; the server already validates range from that player's team spawn and owns affordability/inventory changes. Preserve the existing island pickup economy.

**Tech Stack:** Browser JavaScript, Three.js, Python `websockets` server.

**Spec:** `docs/superpowers/specs/2026-10-31-adaptive-bots-island-shops-design.md`

## Global Constraints

- Do not add dependencies or change the WebSocket protocol unless a code review finds a specific missing behavior.
- Keep each player's online inventory individual; generator drops are visible pickups, and the player who collects one receives the resources.
- Preserve per-team iron/gold generators, central emeralds, existing generation cadence/caps, and the rule that island generators stop when that team's pig is destroyed.
- Keep the server authoritative for online purchases and inventory; offline shop purchases remain local.
- Do not add or run automated tests in this task; use static syntax and diff checks only.

## Review Focus

- Only active islands should display a shopkeeper in each match mode; inactive islands must not expose interaction.
- The client shop offset and interaction radius must match the server's per-team shop offset and distance check.
- Online purchase clicks must not grant items optimistically; the authoritative state snapshot updates the buyer's inventory and shop affordability.
- In solo, doubles, and FFA, resource generation must cover every participating team island plus the center; only living connected players may collect.
- Offline pickup generation, local purchases, and bot matches must remain unchanged.

---

### Task 1: Render and activate shopkeepers on all team islands

**Files:**
- Modify: `game.js`

**Interfaces:**
- Consumes: `createShopkeeper(team)`, team spawn coordinates, `configureMatchMode(mode, onlineTeams)`, `playerTeam()`, existing shop panel, `buy(item)`, and `sendMultiplayerMessage()`.
- Produces: `team.shop` for each team and visibility synchronized with `team.active`; existing shop controls open that team shop.

- [x] Create and store one shopkeeper for each team in `createWorld()` instead of creating only the green shopkeeper.
- [x] Toggle each shopkeeper's visibility when `configureMatchMode()` changes the active team set, including solo, doubles, FFA, and online room setup.
- [x] Keep each shopkeeper at `(team.x - 5, team.z + 5)`, matching `MatchServer.shop_distance()`, and update interaction prompts and keyboard/touch open logic to use the local team's active shop.
- [x] Keep online clicks on the existing server request path and offline purchases on the current local path; do not optimistically mutate online inventory.
- [x] Run `node --check game.js` and `git diff --check`; expected: exit 0 with no whitespace errors.

### Task 2: Review online generator and purchase authority against every mode

**Files:**
- Review: `server.py`, `game.js`
- Modify only if an implementation mismatch is found: `server.py`, `game.js`

- [x] Trace `MODE_TEAMS`, `start_room()`, `generate_pickups()`, `update_pickups()`, `buy()`, and client snapshot reconciliation for solo, doubles, and FFA.
- [x] Confirm the server creates iron/gold pickups for every team represented in `room["pigs"]`, central emerald pickups, and credits the first living connected collector's individual inventory.
- [x] Confirm server purchases are accepted only within the buyer's own team shop radius and update inventory only after validation. Add no new protocol fields if these checks already hold.
- [x] If a mismatch is found, fix the smallest server/client path and statically inspect all affected match modes; do not change pickup cadence, caps, or pig-death behavior.
- [x] Run `python -m py_compile server.py` only if a Python interpreter is available; do not run the automated test suite. Record if the interpreter is unavailable.

### Task 3: Update player-facing documentation

**Files:**
- Modify: `README.md`

- [x] State that each active island has a shopkeeper, online purchases are server-validated at the buyer's island, and online resources remain pickup-based with collector-owned inventory.
- [x] Keep the existing documented multiplayer-server deployment instructions and known movement-authority limitation.
- [x] Run `git diff --check` and review the spec acceptance criteria against the client/server paths.
