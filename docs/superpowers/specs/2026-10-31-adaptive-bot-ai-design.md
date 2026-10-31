# Adaptive Bot AI Design

## Intent

Make offline bots react to the current match instead of following a single delayed, center-first attack pattern. Bots should make different tactical choices when their pig is threatened, useful resources are nearby, or a rival team is vulnerable.

## Goals

- Select among defending/intercepting, fighting nearby rivals, raiding an enemy pig, and collecting useful team resources based on current match state.
- Account for distance, threat to home, pig health, bot inventory, teammate focus, and modest per-bot personality differences.
- Keep an objective briefly when it remains reasonable, so bots do not switch targets every frame.
- Let bots navigate directly toward their chosen objective and construct bridges when the current surface ends, rather than requiring a fixed center waypoint.
- Replace the fixed opening wait and fixed gear purchase order with state-based decisions.

## Non-goals

- Machine learning, remote AI services, online-match bots, new navigation dependencies, map redesign, or player-facing AI settings.
- Rewriting movement physics, combat, bot models, or the entire game module.

## Constraints

- Use the existing JavaScript/Three.js local bot simulation and current world-surface/building helpers.
- Do not add dependencies.
- Do not add or run automated tests in this implementation; use code review and syntax/whitespace checks only.

## Approaches

1. **More scripted states:** Add a longer sequence such as collect, bridge, attack, defend. This is predictable and easy to author, but still follows predefined behavior.
2. **Utility-based decisions (selected):** Score possible goals from live threats, resources, distance, pig health, inventory, and allied focus. This keeps the current movement/combat code while allowing behavior to change with the match.
3. **Pathfinding and learned behavior:** Build a world graph or train a policy. This could improve navigation further, but it is a much larger change and would not be a good first step for the current small local simulation.

The utility-based approach is selected because it responds to match state without replacing the working movement system or adding infrastructure. Simple personality weights and objective stickiness provide variety without making outcomes random.

## Behavior

- Defensive goals gain value as enemies approach a bot's pig or the pig's health falls.
- Combat goals gain value for nearby enemies and for more aggressive bots.
- Raid goals weigh enemy-pig health, distance, aggression, and whether a teammate is already pursuing that pig.
- Resupply goals consider only resources the bot can collect and current inventory needs; bots can leave a raid to resupply when the tactical value is higher.
- Objective scores are reconsidered on a short timer and the current goal receives a small continuity bonus while still valid.
- Gear purchases choose the most useful affordable option from current blocks, weapon, armor, and inventory instead of following one fixed order.
- Bots choose direct axis-aligned movement toward the selected goal; bridge construction remains constrained by existing block inventory and surface support rules.
