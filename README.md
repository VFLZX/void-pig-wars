# Void Pig Wars

A full browser 3D voxel arena game set on floating islands beneath a bright, light-blue sky. Choose a match in the lobby, gather resources, build bridges, protect your pig, and outlast rival teams in 1v1, doubles, or free-for-all battles.

Void Pig Wars includes bot matches, online multiplayer matchmaking, resource trading, buildable routes, upgrades, touch controls, and a polished lobby experience. It is designed as a fast, replayable browser game with a strong voxel-art identity and competitive arena gameplay.

Play the game here: https://vflzx.github.io/void-pig-wars/

A first-person voxel arena game set on floating islands beneath a bright, light-blue sky. Choose a match in the lobby before playing: **1v1** puts you against one rival, **Doubles (2v2)** gives you a teammate and one more rival team, and **Free-for-all** pits you against up to three rival islands in a chaotic four-way fight.

## Website and online multiplayer

The game website is published on GitHub Pages at <https://vflzx.github.io/void-pig-wars/>. GitHub Pages only serves the static game files; it cannot host multiplayer rooms. Real online matches use the WebSocket server in this repository.

The same site includes a browser launcher at <https://vflzx.github.io/void-pig-wars/launcher.html>. It embeds the game, accepts a game URL (pre-filled with the Pages URL), and reports the game's live status to the launcher.

Online players select the same mode and join the matchmaking queue. A 1v1 room starts with two human players; doubles and free-for-all start when four humans join. The server assigns teams and shares a single shared state so all players can see each other, placed blocks, resource pickups, and pig health updates.

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

Resources spawn at each team's generator and on the central island. Walk over them to collect them. Rival bots collect their own generator drops, buy upgrades and wool, build supported routes toward the center island and your pig, and can respawn after a short delay while their team still has a pig alive.

Movement uses acceleration, gravity, jumping, and collisions with placed blocks. Hits apply knockback; falling into the void costs a life and returns you to your island while your pig is alive.
