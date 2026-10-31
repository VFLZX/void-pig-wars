# Adaptive Bots and Island Shops Design

## Intent

Improve Void Pig Wars matches so offline bots navigate and fight with purpose, every active island visibly has a shopkeeper, and online players can use their own island shop while resources remain pickup-based. The work should make the current Bedwars-inspired loop clearer and more replayable without adding remote AI services or changing the online match model.

## Current behavior

- Offline bots select among defend, engage, raid, and resupply goals with utility scores, but navigate directly toward goals with axis-aligned movement. They do not plan a route over islands/bridges or judge whether a fight is unfavorable.
- The game creates the shopkeeper only for the green island. The Python server already computes shop range from the buyer's team spawn and validates online purchases, affordability, ownership, and inventory changes.
- Online inventory belongs to each player. Team-island generators create iron and gold pickups, the center creates emerald pickups, and the first living player who reaches a pickup receives its value in their own inventory. Generators stop after their pig is destroyed. This pickup economy and pig-death behavior are selected; do not convert it into passive income or a shared wallet.

## Goals

- Make offline bots plan routes around supported terrain and dynamic bridge blocks, build across void gaps when needed, and replan when blocked or when match priorities change.
- Let bots weigh combat risk using health, equipment, nearby opponents, teammate positions, and pig danger; make them defend, engage, raid, resupply, or withdraw as conditions warrant.
- Preserve per-bot behavioral variation while basing choices on current match state rather than a fixed opening/route script.
- Render a shopkeeper on every active island and expose the same interaction affordance near each one.
- Ensure online shop interaction sends a purchase request to the Python server; keep the server authoritative for shop range, costs, inventory, prerequisites, and results.
- Preserve and verify the online pickup economy: generators on each active team island plus the center; a collected pickup credits the collector's individual inventory.

## Non-goals

- No machine-learning model, online AI service, or new runtime dependency.
- No bots in online matchmaking; existing online matches remain human-only.
- No passive online resource grants, team-shared wallet, or resource ownership change.
- No rewrite of online movement authority or addition of unsupported online items.
- No match format or map-size redesign.

## Approaches considered

1. **Tune current scores and keep direct movement.** This is the smallest change, but it leaves bots unable to choose a route around obstacles or assess a losing fight. It does not address the reported behavior well.
2. **Terrain-aware route planning with adaptive tactical utility (selected).** Keep the existing lightweight utility-AI direction, add a route layer over supported islands and player/bot bridge blocks, and use a bridge-building plan across unsupported gaps. Re-evaluate objectives and combat risk as the match changes. This is more work but directly addresses navigation and tactical behavior while remaining deterministic enough to debug.
3. **Scripted role state machine.** Assign fixed defender/attacker/resupplier scripts. This is easier to reason about but makes bots feel predetermined, contrary to the requested goal.

## Design decisions

### Bot planning

- Build on the existing `game.js` bot entities, world-surface data, support/collision helpers, and block-placement simulation.
- Use a local 0.5-unit route grid (matching the block placement grid) over walkable island surfaces and placed bridge blocks. Route search must account for support height, step/jump limits, obstacles, bridge-block cost, and the bot's remaining blocks. Keep searches bounded to relevant connected surfaces and nearby candidate crossings instead of scanning an unbounded plane.
- Because `supportAt` only recognizes existing surfaces, represent void crossings as virtual bridge segments between a reachable surface edge and a candidate destination surface. Score crossings by estimated bridge length and route cost, then place supported blocks along the selected segment using the existing bridge builder. Replan after a block is placed, an obstacle changes, or progress stalls; cache routes between those events and a bounded refresh interval.
- Keep a utility selector for defend, engage, raid, and resupply. Estimate local combat pressure from nearby enemy weapon damage, armor, numbers, and available teammate support; favor retreat when the bot is below roughly half health and projected local pressure makes a close fight unfavorable. Retreat toward a reachable point on its home island away from the nearest enemy, and keep that objective briefly unless the pig becomes endangered or the route is invalid. Avoid oscillating between goals with hysteresis.
- Coordinate same-team bots by reducing duplicate target/pickup focus and making a home defender valuable when the pig is threatened. Recompute tactics on meaningful state changes and at a bounded interval.
- Continue to use each bot's own inventory, shop purchases, and existing local combat/movement simulation. Do not let local bot code affect online rooms.

### Island shops

- Create the shopkeeper for every team island during world setup and set its visibility with the island's active-team state for the selected mode.
- Place each shop at the existing server-validated offset from its team's spawn; keep client interaction distance and server validation radius aligned.
- Open the existing shop UI when the local player approaches their team shop. Online purchases continue through the `buy` message and are granted only by the Python server; local matches keep their current local purchase path.

### Online resources

- Keep one iron and gold pickup stream per active team island and the emerald stream at mid, using the current cadence, pickup lifetime, caps, and rule that team generators stop when their pig is destroyed.
- Any living connected player may collect a visible pickup; only that player's inventory changes. Inventory snapshots continue to drive the resource HUD and shop affordability.
- Confirm that solo, doubles, and FFA modes generate drops for all teams present in the room and that disconnects/dead players cannot collect them. Do not add team locks or passive credits.

## Constraints and implementation notes

- Client changes are in `game.js`; authoritative online shop/resource changes, if any are required, are in `server.py`.
- Preserve the JSON WebSocket protocol unless an observed defect requires a small additive message field.
- Keep route planning bounded so the frame loop does not run a full map search every animation frame; cache/reuse routes and invalidate them on relevant world changes.
- Do not add or run automated tests in this task. Use syntax, diff, and static code checks only; report that limitation explicitly.

## Acceptance criteria

- Bots choose different viable routes around terrain/placed blocks, cross island gaps using supported bridges, and recover by replanning instead of repeatedly pushing into a blocked direction.
- Bots defend a threatened pig, stop chasing an enemy when the tactical score favors safety, and resume offense/resupply when conditions change.
- Each active team island has one visible shopkeeper; the local player can open the existing UI at their shop.
- Online purchases at any team's own shop are server-validated and update only the buyer's authoritative inventory; out-of-range purchases remain rejected.
- Online resources appear at every active team generator and center, and a pickup credits its collector's individual inventory.
- Online matches remain free of local bots and local resource simulation.
