# Online Matchmaking and Animation Implementation Plan

> **For agentic workers:** Execute inline with superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix matchmaking queue defects, add 2v2v2v2/3v3v3v3/4v4v4v4 modes, and add accessible lightweight animations to the existing Three.js game.

**Architecture:** Make waiting-queue membership idempotent and expand team-slot rosters on the Python server, preserving its existing JSON protocol and authoritative match state. Add the new team formats to the lobby and local bot configurations. Add pure animation pose helpers in an ES module and drive bot/remote avatar limbs, first-person sword motion, confirmed hit sparks, shopkeeper idle, and landing feedback from the existing frame loop.

**Tech Stack:** Python `websockets`, `unittest`; browser JavaScript ES modules, Three.js; Node built-in test runner.

## Global Constraints

- Matchmaking remains grouped by the selected mode and preserves existing solo, doubles, and FFA team slots.
- New 2v2v2v2, 3v3v3v3, and 4v4v4v4 queues use four island teams with 2, 3, and 4 player slots per team, respectively.
- Duplicate queue joins from one socket cannot occupy multiple player slots; disconnecting a queued socket removes its slot.
- Online match state and combat outcomes remain server-authoritative; visual animation never mutates gameplay state.
- No new runtime dependencies.
- Respect `prefers-reduced-motion` for cosmetic character, camera-held item, and shopkeeper motion.

## Review Focus

- Duplicate join messages from the same waiting socket must not start a partial room or assign multiple player IDs.
- A disconnect during queueing must free capacity; joining again from another socket must still form the expected mode.
- New team formats wait for 8, 12, and 16 players and assign an even roster across the four teams.
- Local, remote, and bot avatars animate without changing their authoritative positions or state.
- Animation helpers remain bounded and return neutral poses under reduced-motion preference.
- Disconnected or completed clients still return to an actionable lobby/search state.

---

### Task 1: Make matchmaking queue membership safe

**Files:**
- Modify: `server.py`
- Test: `tests/test_multiplayer.py`

**Interfaces:**
- Consumes: `MatchServer.join(socket, mode)`, `queues`, `connections`, `leave_waiting`, and the existing `waiting`/`match_start` messages.
- Produces: one queue entry per waiting socket; repeat joins in the same mode only refresh waiting status; repeat joins under another mode are rejected without changing queues.

- [x] Add regression coverage for duplicate same-mode join and cross-mode rejoin; verify a new distinct socket can still fill the correct room.
- [x] Add queue-disconnect coverage for capacity and updated waiting counts, including stale closed-socket pruning on a duplicate join.
- [x] Add capacity and team-roster coverage for 2v2v2v2, 3v3v3v3, and 4v4v4v4.
- [x] Implement idempotent queue membership and reject mode changes while waiting, without changing the WebSocket protocol.
- [x] Run focused matchmaking tests, then the full Python test suite.

### Task 2: Add procedural game animations

**Files:**
- Create: `animation-utils.mjs`
- Modify: `game.js`, `README.md`
- Test: `tests/animation-utils.test.mjs`

**Interfaces:**
- Consumes: avatar movement/hit/landing state, attack start time, shopkeeper groups, and the existing render `frame()`.
- Produces: pure bounded pose functions for walking, attack, and idle motion; frame-loop integration for local first-person swing, bot/remote limb movement and landing/hit reactions, and shopkeeper idle movement.

- [x] Add Node tests for neutral reduced-motion poses, walking swing bounds, attack timing, and idle pose bounds.
- [x] Implement the tested pure pose helpers.
- [x] Add lobby cards and local bot counts for all three new team formats.
- [x] Add pivoted leg groups to bots/remotes and animate their poses without changing player or bot movement simulation.
- [x] Add a local held-item sword swing, server-confirmed online hit sparks, offline hit/landing feedback, and subtle shopkeeper idle animation; honor reduced motion.
- [x] Document the animation and matchmaking changes and known limitations.
- [x] Run Node animation tests, Python multiplayer tests, syntax checks, and `git diff --check`.
