# Void Pig Wars

A first-person voxel arena game set on floating islands beneath a bright, light-blue sky. Choose a match in the lobby before playing: **1v1** puts you against one rival, **Doubles (2v2)** gives you a bot teammate against a two-bot team, and **1v1v1v1** enables all four rival islands. Protect your team's pig, gather generator resources, and destroy enemy pigs. Pixel-textured grass, dirt, and stone, square islands, blocky clouds, and team-colored details give the arena a brighter Minecraft-inspired look. There are no prebuilt bridges to the central emerald island: build your own route with snap-aligned half-block wool tiles. A cyan placement ghost marks valid placement; red means blocked.

## Website and online multiplayer

The game website is published on GitHub Pages at <https://vflzx.github.io/void-pig-wars/>. GitHub Pages only serves the static game files; it cannot host multiplayer rooms. Real online matches use the separate WebSocket server in `server.py`. Players choose a mode and click **Find a Game**; the backend automatically matches them without sharing a room code or server address. The Render backend still needs to be deployed before public online matchmaking can connect.

The same site includes a browser launcher at <https://vflzx.github.io/void-pig-wars/launcher.html>. It embeds the game, accepts a game URL (pre-filled with the Pages URL), and reports the game's live render FPS. No desktop app or separate download is required.

Online players select the same mode and join the matchmaking queue. A 1v1 room starts with two human players; doubles and free-for-all start when four humans join. The server assigns teams and shares validated player movement, melee hits, pig health, and placed blocks. The existing **Play vs Bots** button continues to launch the local game without a server.

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

Open <http://localhost:8000> in two browser windows, select the same mode, and click **Find a Game**. Local pages automatically use the server on port 8765. For doubles and free-for-all, four browser clients are needed to fill a match.

## Host the multiplayer server

The repository includes a Render Blueprint in `render.yaml`. Create a Render Blueprint from the repository and deploy the `void-pig-wars-multiplayer` web service. The Blueprint sets `ALLOWED_ORIGINS=https://vflzx.github.io` and uses `/healthz` as its health check. The client defaults to `wss://void-pig-wars-multiplayer.onrender.com` on the public site and automatically uses localhost during local development. If Render assigns a different hostname, update `multiplayerServerUrl()` in `game.js` and republish the static frontend. GitHub Pages continues to serve the frontend; the multiplayer service runs separately.

## Controls

- **W A S D** move · **Mouse** look (click and drag if pointer lock is blocked; arrow keys also look) · **Space** jump
- **Hold Shift** sneak slowly and stop safely at island/block edges · **Left click/tap** attack or use the selected item
- **Right click** place wool · **Build button** places wool on touch screens · **1–7** select hotbar slot
- **E** open/close the base shop · **Settings** adjusts FOV and keyboard binds (saved in this browser)
- **Escape** releases the mouse; click the game to resume

On iPadOS Safari with an Apple keyboard, tap **Play vs Bots** or **Find a Game** to focus the game, then use **W A S D** to move and the **arrow keys** to look without pointer lock. Space jumps, Shift sneaks, and E opens the shop. For touch play, enable **On-screen touch controls** in the lobby or Settings: use the left joystick to move, drag the right look area to turn, and tap the Attack, Build, Jump, Sneak, Shop, or Use buttons. The game also accepts keyboard events with missing `KeyboardEvent.code`, as can occur in browser/device input fallbacks.

Resources spawn at each team's generator and on the central island. Walk over them to collect them. Rival bots collect their own generator drops, buy upgrades and wool, build supported routes toward the nearest living enemy pig, and attack pigs when they arrive. They also fight nearby enemy bots and the player, defend their own pig when threatened, and never target teammates. The emerald island has a square footprint and remains unconnected by default. The shop is beside the green team's pig and sells building blocks, weapon upgrades, armor, a bow and arrows, healing, fireballs, speed potions, and ender pearls. Use your starting wool to bridge the gap; crouch with Shift while placing blocks at the edge.

Movement uses acceleration, gravity, jumping, and collisions with placed blocks. Hits apply knockback; falling into the void costs a life and returns you to your island while your pig is alive.
