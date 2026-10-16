# Void Pig Wars

A first-person voxel arena game set on floating islands beneath a bright, light-blue sky. Choose a match in the lobby before playing: **1v1** puts you against one rival, **Doubles (2v2)** gives you a bot teammate against a two-bot team, and **1v1v1v1** enables all four rival islands. Protect your team's pig, gather generator resources, and destroy enemy pigs. Pixel-textured grass, dirt, and stone, square islands, blocky clouds, and team-colored details give the arena a brighter Minecraft-inspired look. There are no prebuilt bridges to the central emerald island: build your own route with snap-aligned half-block wool tiles. A cyan placement ghost marks valid placement; red means blocked.

## Website and online multiplayer

The game website is published on GitHub Pages at <https://vflzx.github.io/void-pig-wars/>. GitHub Pages only serves the static game files; it cannot host multiplayer rooms. Real online matches use the separate WebSocket server in `server.py`. The site does not have a public multiplayer server configured yet.

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

Open <http://localhost:8000> in two browser windows, select the same mode, and click **Find Online Match**. The local server address is prefilled for local pages. For doubles and free-for-all, four browser clients are needed to fill a match.

## Host the multiplayer server

The repository includes a Render Blueprint in `render.yaml`. After these multiplayer source files are pushed to the repository, create a Render Blueprint from it and deploy the `void-pig-wars-multiplayer` web service. The Blueprint sets `ALLOWED_ORIGINS=https://vflzx.github.io` and uses `/healthz` as its health check. When Render provides the service hostname, enter `wss://<service-hostname>` in the game's **Multiplayer Server** field. GitHub Pages continues to serve the frontend; the multiplayer service runs separately. The public website still has no multiplayer server configured until this backend is deployed and the multiplayer frontend changes are published.

## Controls

- **W A S D** move · **Mouse** look (click and drag if pointer lock is blocked; arrow keys also look) · **Space** jump
- **Hold Shift** sneak slowly and stop safely at island/block edges · **Left click or F** attack/fire a bow
- **Right click or G** place wool · **1–7** select hotbar slot · **H** use the selected utility
- **E** open/close the base shop · **Settings** adjusts FOV and keyboard binds (saved in this browser)
- **Escape** releases the mouse; click the game to resume

Resources spawn at each team's generator and on the central island. Walk over them to collect them. Rival bots collect their own generator drops, buy upgrades and wool, build supported routes toward the nearest living enemy pig, and attack pigs when they arrive. They also fight nearby enemy bots and the player, defend their own pig when threatened, and never target teammates. The emerald island has a square footprint and remains unconnected by default. The shop is beside the green team's pig and sells building blocks, weapon upgrades, armor, a bow and arrows, healing, fireballs, speed potions, and ender pearls. Use your starting wool to bridge the gap; crouch with Shift while placing blocks at the edge.

Movement uses acceleration, gravity, jumping, and collisions with placed blocks. Hits apply knockback; falling into the void costs a life and returns you to your island while your pig is alive.
