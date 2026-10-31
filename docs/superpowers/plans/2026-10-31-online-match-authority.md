# Online Match Authority Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make online rooms share one canonical economy, inventory, build/combat state, and match result.

**Architecture:** `server.py` owns room economy and validates state-changing actions. `game.js` sends intent messages, applies room snapshots, and keeps its existing local simulation only for bot matches. The JSON WebSocket protocol stays in place.

**Tech Stack:** Python 3.11+, `websockets`, browser JavaScript, Three.js.

**Spec:** `docs/superpowers/specs/2026-10-31-online-match-authority-design.md`

## Global Constraints

- Do not add runtime dependencies.
- Keep local bot matches browser-simulated.
- Do not add or run automated tests in this implementation; use static/syntax checks and code review only.
- Preserve existing shop prices and initial loadout where the server can represent them.

## Review Focus

- Invalid or unaffordable buy messages must not mutate a player's wallet or inventory.
- A player cannot collect the same pickup twice or collect another room's pickup.
- A player cannot place blocks without server-owned wool or place duplicate/out-of-range blocks.
- Teammates and disconnected players cannot be damaged; server-owned armor and weapon values determine damage.
- Online clients must not create local resources, pickups, or bots that alter the canonical match.

---

### Task 1: Server-owned room economy and snapshots

**Files:**
- Modify: `server.py`

**Interfaces:**
- `room_state(room)` includes canonical `players[].inventory`, `pickups[]`, `blocks[]`, `pigs[]`, and `winner`.
- Player inventory fields: `iron`, `gold`, `emerald`, `blocks`, `apples`, `fireballs`, `hasBow`, `arrows`, `pearls`, `potions`, `weapon`, `armor`, `speedBoostUntil`.

- [x] Add room pickup IDs, generator timestamps, and player starter inventory using the existing client defaults.
- [x] Add server tick logic to generate team iron/gold and central emerald pickups at the current cadence, expire stale pickups, and collect them for players within collection radius.
- [x] Include pickup and inventory state in match start and room snapshots; ensure collection cannot be applied twice.
- [x] Add bounded room cleanup for completed matches after a short result-display period and for rooms with no connected players.

### Task 2: Validated online transactions and block placement

**Files:**
- Modify: `server.py`

**Interfaces:**
- New `buy` message: `{type: "buy", itemId: string}`.
- `block` remains `{type: "block", position: {x, y, z}}`.
- Rejections return a bounded `action_rejected` message with a stable reason code.

- [x] Define a server catalog for current shop item IDs, costs, prerequisites, inventory effects, and existing prices.
- [x] Validate purchases against the player's team shop radius, wallet, ownership, and prerequisites; mutate wallet and inventory atomically.
- [x] Validate block inventory and placement grid/range/occupancy, including axis-aligned overlap of half-unit blocks; decrement wool only after a block is accepted.
- [x] Broadcast updated canonical state after a successful purchase or block placement.

### Task 3: Server-owned online combat and item effects

**Files:**
- Modify: `server.py`

**Interfaces:**
- New `use` message identifies an inventory-backed action and optional validated target/aim data.
- Existing `attack` continues to identify a player or pig target by ID.

- [x] Calculate player damage from server inventory weapon and armor values while preserving current cooldown, team, range, and facing checks.
- [x] Apply and broadcast player/pig health, elimination, respawn, and winner changes from the server.
- [x] Implement apple healing with server-owned inventory and explicitly reject unsupported online consumables.
- [x] Ensure winner is terminal and subsequent state-changing requests cannot mutate a completed room.
- [x] End the room as a draw if no team remains and show the draw state in the client.

### Task 4: Client consumes canonical online state

**Files:**
- Modify: `game.js`

**Interfaces:**
- `applyNetworkState(networkState)` updates remote players, local inventory/HUD, shared pickups, blocks, pigs, and winner state.
- Online actions use `buy`, `block`, `attack`, and `use` protocol messages; local paths remain unchanged.

- [x] Render and reconcile network pickups by stable server ID; remove collected/expired pickups without duplicating them.
- [x] Apply local player's canonical inventory and server pig/player state from snapshots.
- [x] Route shop purchases and block placement through server messages; do not grant items or deduct canonical inventory optimistically.
- [x] Stop local online resource generation/collection and local bot AI/combat; keep visual interpolation and cosmetic effects client-side.
- [x] Display action rejection reasons and server winner/elimination state; close the online socket on match end and preserve the existing refresh screen on disconnect.
- [x] Clear stale pickups at match start so prior local matches cannot leak economy visuals into an online room.

### Task 5: Document online scope and operational limitations

**Files:**
- Modify: `README.md`

- [x] Document what is server-authoritative and what movement validation still does not guarantee.
- [x] Document room cleanup, disconnect behavior, and the current matchmaking capacity for each mode.
- [x] Keep local run and Render deployment instructions aligned with the protocol and environment settings.

### Task 6: Static review

**Files:**
- Review: `server.py`, `game.js`, `README.md`

- [x] Review every new message field for type/range validation and every mutation for atomicity.
- [x] Run JavaScript syntax and Git whitespace checks. Python syntax could not be checked because no Python interpreter is available in the workspace; the automated test suite was not run.
- [x] Review the final diff for accidental changes to local matches, static hosting, or launcher behavior.
