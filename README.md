# Void Pig Wars

A full browser 3D voxel arena game set on floating islands beneath a bright, light-blue sky. Choose a match in the lobby, gather resources, build bridges, protect your pig, and outlast rival teams in solo, doubles, free-for-all, or four-team battles.

Void Pig Wars includes bot matches, online multiplayer matchmaking, resource trading, buildable routes, upgrades, touch controls, and a polished lobby experience. It is designed as a fast, replayable browser game with a strong voxel-art identity and competitive arena gameplay.

Play the game here: https://vflzx.github.io/void-pig-wars/

A first-person voxel arena game set on floating islands beneath a bright, light-blue sky. Choose a match in the lobby before playing: **1v1** puts you against one rival, **Doubles (2v2)** gives you a teammate and one rival team, **Free-for-all** pits you against three rival islands, and **2v2v2v2**, **3v3v3v3**, and **4v4v4v4** support four teams with 2, 3, or 4 players on each island.

## Project status

**Status snapshot: November 1, 2026.** Void Pig Wars is a playable browser game with local bot matches and prototype online matchmaking. The core match loop is in place; online fairness, game depth, and release polish remain active work.

### Accomplished

- Published the browser game on GitHub Pages, with a separate launcher page and a Render Blueprint for the multiplayer server.
- Built the first-person 3D arena, lobby, 1v1, doubles, and free-for-all modes, movement and combat, pigs and team elimination, resource pickups, bridge building, shop upgrades, and touch controls.
- Added adaptive offline bots that plan routes across terrain and bridges, build crossings, gather resources, coordinate around threats, and retreat when a fight turns against them.
- Added solo, doubles, FFA, and four-island team modes for 8, 12, and 16 online players, with matching local bot rosters.
- Smoothed larger local bot matches by spreading terrain route searches across frames, reducing repeated AI scans, and making bots favor vulnerable targets while accounting for squad focus and combat risk. Rendering resolution now scales down when frame rate drops and recovers gradually when performance is stable.
- Reduced online multiplayer overhead by limiting room snapshots to 10 updates per second, encoding each snapshot once for all players, and applying block/pickup state incrementally in the browser. Starting a new room also clears the previous room's remote players and placed blocks.
- Added procedural walking, jumping/landing, sword swing and confirmed-hit feedback, shopkeeper idle motion, and floating resource pickups; cosmetic motion respects the system reduced-motion preference.
- Added a shopkeeper to every active team island. Online purchases are checked and applied by the Python server.
- Implemented online matchmaking and server-managed match state for health, pigs, pickups, individual player inventories, purchases, blocks, melee combat, respawns, and match results. Each island generates iron and gold pickups; the center generates emeralds. The player who collects a pickup receives it in their own inventory.
- Documented local setup and hosted server deployment. The Python server includes automated multiplayer tests in `tests/`.

### Remaining work, in priority order

1. **Harden online movement and building.** The server currently checks reported movement bounds and speed, but not the full collision map. Make position, collision, fall, and block-placement validation authoritative before treating online matches as cheat-resistant.
2. **Improve online reliability.** Match state currently lives in memory, so a server restart ends active matches. Add reconnect handling and decide whether match persistence is needed; then validate deployment health, disconnects, and room cleanup under real use.
3. **Bring more items online safely.** Bows, arrows, fireballs, ender pearls, and speed potions are disabled online until the server can validate their effects. Implement server-owned behavior and abuse limits before enabling them.
4. **Polish presentation and controls.** Build on the current voxel-art look with clearer combat feedback, character and item animations, camera options, readable HUD/shop states, and more device/browser checks. Fix visual regressions as they are found.
5. **Expand and balance gameplay.** Tune bot difficulty and match pacing through repeated play, improve map and bridge variety, and review resource rates and shop prices for each mode.
6. **Prepare for community contributions.** Add a contribution guide, issue and pull-request templates, screenshots or a short gameplay clip, and a lightweight release checklist so new players and contributors can get started quickly.

**Known limitations:** Online movement is not yet cheat-proof; the hosted multiplayer service is an early prototype with in-memory match state; and several shop items remain disabled online. See [Website and online multiplayer](#website-and-online-multiplayer) for details and setup.

## Website and online multiplayer

The game website is published on GitHub Pages at <https://vflzx.github.io/void-pig-wars/>. GitHub Pages only serves the static game files; it cannot host multiplayer rooms. Real online matches use the WebSocket server in this repository.

The same site includes a browser launcher at <https://vflzx.github.io/void-pig-wars/launcher.html>. It embeds the game, accepts a game URL (pre-filled with the Pages URL), and reports the game's live status to the launcher.

Online players select the same mode and join the matchmaking queue. A 1v1 room starts with two human players; doubles and FFA start with four; 2v2v2v2, 3v3v3v3, and 4v4v4v4 start with 8, 12, and 16. The server assigns teams and owns online player health, pig health, resource pickups, per-player resources and inventory, purchases, block placement, melee combat, respawns, and the match result. Iron and gold pickups spawn on every active team's island, with emerald pickups in the center; any living player may collect a drop, and the collector receives it in their own inventory. Each active island has a shopkeeper, and the server validates purchases at the buyer's team shop. In team modes, a team remains active while at least one teammate is connected and alive; disconnecting forfeits that player's life.

Online movement is still simulated by each browser and reported to the server, which checks movement bounds and a speed limit. It does not yet validate the full collision map, so online movement is not cheat-proof. Bows, arrows, fireballs, ender pearls, and speed potions are disabled in online matches until their effects can be validated by the server. Melee, wool, swords, armor, and golden apples are supported online.

Finished and abandoned rooms are cleaned up after 30 seconds. The hosted multiplayer service is an early prototype and currently keeps match state in memory; restarting the service ends active games.

## Run a local online match

Install Python 3.11 or newer and the multiplayer server dependency:

```powershell
python -m pip install -r requirements.txt
```

In one terminal, start the WebSocket server:

```powershell
python server.py
```

In a second terminal, serve the browser game:

```powershell
python -m http.server 8000
```

Open <http://localhost:8000> in browser windows, select the same mode, and click **Find a Game**. Local pages automatically use the server on port 8765. Solo needs two windows, doubles/FFA need four, and the four-team formats need 8, 12, or 16 windows.

## Host the multiplayer server

The repository includes a Render Blueprint in `render.yaml`. Create a Render Blueprint from the repository and deploy the `void-pig-wars-multiplayer` web service. The Blueprint sets `ALLOWED_ORIGINS` and the WebSocket port so the published Pages site can send game traffic to your hosted server.

## Controls

- **W A S D** move · **Mouse** look (click and drag if pointer lock is blocked; arrow keys also look) · **Space** jump
- **Hold Shift** sneak slowly and stop safely at island/block edges · **Left click/tap** attack or use the selected item
- **Right click** place wool · **Build button** places wool on touch screens · **1–7** select hotbar slot
- **E** open/close the base shop · **Settings** adjusts FOV and keyboard binds (saved in this browser)
- **Escape** releases the mouse; click the game to resume

On iPadOS Safari with an Apple keyboard, tap **Play vs Bots** or **Find a Game** to focus the game, then use **W A S D** to move and the **arrow keys** to look without pointer lock. Space jumps, Shift sneaks, E opens the shop, and items can be used with the on-screen touch controls.

Resources spawn at each team's generator and on the central island. Walk over them to collect them. Rival bots weigh nearby threats, equipment, health, their pig's safety, and useful resources to decide whether to defend, fight, resupply, retreat, or raid. They route around supported terrain and placed bridges, build supported crossings over void gaps, and replan when blocked. Bots respawn after a short delay while their team still has a pig alive. Characters now swing their swords on attack, flash voxel sparks on confirmed hits, and animate their legs while moving; shopkeepers idle and pickups float and spin.

Movement uses acceleration, gravity, jumping, and collisions with placed blocks. Hits apply knockback; falling into the void costs a life and returns you to your island while your pig is alive.
