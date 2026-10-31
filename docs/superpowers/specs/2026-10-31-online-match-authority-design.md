# Online Match Authority Design

## Intent

Make a Void Pig Wars online match produce the same economy, inventory, building, combat, and result for every connected player. The current Python WebSocket server already owns player health, pig health, attack validation, and block broadcasts; resource generation and purchases still happen independently in each browser.

## Goals

- Make the server the source of truth for online resources, purchases, player inventory, placed blocks, combat outcomes, respawns, and winners.
- Make clients render and request actions against server state instead of independently simulating online match economy.
- Preserve the existing local bot match behavior and protocol compatibility for waiting/matchmaking.
- Reject invalid or unaffordable online actions without changing the room state.

## Non-goals

- Persistent accounts, parties, ranking, moderation, anti-cheat-grade input simulation, matchmaking rating, new maps, new art, or new game modes.
- Replacing client-side movement physics in this milestone. The server will continue validating reported movement with bounds and speed checks; full authoritative movement/collision simulation is a later project.
- Changing gameplay balance unless needed to represent the existing shop and weapon behavior consistently online.

## Constraints

- Keep the existing vanilla JavaScript, Three.js, Python, and `websockets` stack.
- Online protocol remains JSON over WebSockets; local matches remain browser-simulated.
- Do not add dependencies.
- Do not add or run automated tests in this implementation; use static/syntax checks and code review only.

## Approaches

1. **Synchronize client authority:** broadcast each browser's locally computed economy. This is smaller, but competing clients can disagree and forged client state remains trusted.
2. **Server-owned match state (selected):** the server generates/collects resources, validates purchases and blocks, applies combat, and broadcasts canonical state. This is more work but directly addresses the source of online desynchronization.
3. **Rewrite movement and game simulation server-side:** strongest authority, but it requires porting collision and movement rules into Python and expands the risk far beyond the first online consistency milestone.

The server-owned state approach is selected. Full movement simulation remains follow-up work; the current movement bounds are retained and documented as a limitation.

## Behavior

- Each online player has server-owned resources and inventory initialized to the same starter loadout as local play.
- The room owns resource pickups and generator schedules. Collection is based on the reported server-validated player position.
- Purchases identify a catalog item; the server checks shop distance, price, prerequisites, and ownership before changing resources or inventory.
- Online block placement consumes server-owned wool and the server rejects duplicate, out-of-range, or otherwise invalid placement.
- Server combat uses server-owned weapon and armor values. Health, respawn, pig health, and winner state remain canonical.
- Room state broadcasts include each player's resources/inventory and shared pickups, blocks, pigs, and winner. Clients render this state and stop generating local economy or running local bot combat during online matches.
- Invalid messages do not mutate state. Disconnecting a player removes them from matchmaking; match disconnects are recorded as disconnected/eliminated. Finished and abandoned rooms are eligible for cleanup.

## Builder decisions

- Preserve existing shop prices, item IDs, starting inventory, generator cadence, attack ranges, and current damage values where possible.
- Inventories are per-player. Generator pickups are shared world objects available to any living player who reaches them; team generators stop when their pig is destroyed, while the central emerald generator continues until match end.
- Use the existing iron/gold/emerald cadence (2.3 / 8 / 6 seconds), 75-second pickup lifetime, and 1.8-unit collection radius. Cap each generator's visible stock at the equivalent of its 75-second output.
- Keep the existing 0.25-unit placement grid and server-side range/world bounds. Full static-map collision and line-of-sight validation require a shared map collision model and remain follow-up work.
- Online melee damage uses the existing 10/22/34 sword values; armor reduces player damage with the existing ceiling rule. Pig damage equals the attacker's weapon value. Bows/arrows, fireballs, pearls, and speed potions are disabled online for this milestone; the server supports apples as a validated heal action.
- A disconnected player forfeits. A doubles team remains in play if at least one teammate remains connected; when all members disconnect it is eliminated. Finished/abandoned rooms are retained for 30 seconds for the result state, then removed.
- If all teams are eliminated before one remains, the room ends as a draw and clients show a draw result.
- Unsupported online consumables must be hidden or clearly disabled until their effects are applied on the server; they must not silently execute only on the purchasing client.
- Keep message handling backward-compatible for `join`, `move`, `attack`, and `block` while adding explicit `buy` and any required `use` action.
