# Void Pig Wars

A full browser 3D voxel arena game set on floating islands beneath a bright, light-blue sky. Choose a match in the lobby, gather resources, build bridges, protect your pig, and outlast rival teams in 1v1, doubles, or free-for-all battles.

Void Pig Wars includes bot matches, online multiplayer matchmaking, resource trading, buildable routes, upgrades, touch controls, and a polished lobby experience. It is designed as a fast, replayable browser game with a strong voxel-art identity and competitive arena gameplay.

Play the game here: https://vflzx.github.io/void-pig-wars/

A first-person voxel arena game set on floating islands beneath a bright, light-blue sky. Choose a match in the lobby before playing: **1v1** puts you against one rival, **Doubles (2v2)** gives you a teammate and one more rival team, and **Free-for-all** pits you against up to three rival islands in a chaotic four-way fight.

## Website and online multiplayer

The game website is published on GitHub Pages at <https://vflzx.github.io/void-pig-wars/>. GitHub Pages only serves the static game files; it cannot host multiplayer rooms. Real online matches use the WebSocket server in this repository.

The same site includes a browser launcher at <https://vflzx.github.io/void-pig-wars/launcher.html>. It embeds the game, accepts a game URL (pre-filled with the Pages URL), and reports the game's live status to the launcher.

Online players select the same mode and join the matchmaking queue. A 1v1 room starts with two human players; doubles and free-for-all start when four humans join. The server assigns teams and owns online player health, pig health, resource pickups, per-player resources and inventory, purchases, block placement, melee combat, respawns, and the match result. Resource pickups are shared: any living player can collect one by reaching it. In doubles, a team remains active while at least one teammate is connected; disconnecting forfeits that player's life.

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

Open <http://localhost:8000> in two browser windows, select the same mode, and click **Find a Game**. Local pages automatically use the server on port 8765. For doubles and free-for-all, four browser windows are needed to start the match.

## Host the multiplayer server

The repository includes a Render Blueprint in `render.yaml`. Create a Render Blueprint from the repository and deploy the `void-pig-wars-multiplayer` web service. The Blueprint sets `ALLOWED_ORIGINS` and the WebSocket port so the published Pages site can send game traffic to your hosted server.

## Controls

- **W A S D** move · **Mouse** look (click and drag if pointer lock is blocked; arrow keys also look) · **Space** jump
- **Hold Shift** sneak slowly and stop safely at island/block edges · **Left click/tap** attack or use the selected item
- **Right click** place wool · **Build button** places wool on touch screens · **1–7** select hotbar slot
- **E** open/close the base shop · **Settings** adjusts FOV and keyboard binds (saved in this browser)
- **Escape** releases the mouse; click the game to resume

On iPadOS Safari with an Apple keyboard, tap **Play vs Bots** or **Find a Game** to focus the game, then use **W A S D** to move and the **arrow keys** to look without pointer lock. Space jumps, Shift sneaks, E opens the shop, and items can be used with the on-screen touch controls.

Resources spawn at each team's generator and on the central island. Walk over them to collect them. Rival bots weigh nearby threats, their pig's health, useful resources, and available upgrades to choose whether to defend, fight, resupply, or raid. Their objectives can change during a match, and they build supported bridges toward their current goal. Bots respawn after a short delay while their team still has a pig alive.

Movement uses acceleration, gravity, jumping, and collisions with placed blocks. Hits apply knockback; falling into the void costs a life and returns you to your island while your pig is alive.
