# Void Pig Wars

A full browser 3D voxel arena game set on floating islands beneath a bright, light-blue sky. Choose a match in the lobby, gather resources, build bridges, protect your pig, and outlast rival teams in solo, doubles, free-for-all, or four-team battles.

Void Pig Wars includes bot matches, online multiplayer matchmaking, resource trading, buildable routes, upgrades, touch controls, and a polished lobby experience. It is designed as a fast, replayable browser game with a strong voxel-art identity and competitive arena gameplay.

Play the game here: https://vflzx.github.io/void-pig-wars/

A first-person voxel arena game set on floating islands beneath a bright, light-blue sky. Choose a match in the lobby before playing: **1v1** puts you against one rival, **Doubles (2v2)** gives you a teammate and one rival team, **Free-for-all** pits you against three rival islands, and **2v2v2v2**, **3v3v3v3**, and **4v4v4v4** support four teams with 2, 3, or 4 players on each island.

## Project status

**Status snapshot: November 1, 2026.** Void Pig Wars is a playable browser game with local bot matches and prototype online matchmaking. The game server is designed to run on the owner's PC; its public address and router setup remain owner-side configuration.

### Accomplished

- Published the static browser game on GitHub Pages, with a separate launcher page. The multiplayer server runs on the host PC.
- Built the first-person 3D arena, lobby, 1v1, doubles, and free-for-all modes, movement and combat, pigs and team elimination, resource pickups, bridge building, shop upgrades, and touch controls.
- Added adaptive offline bots that plan routes across terrain and bridges, build crossings, gather resources, coordinate around threats, and retreat when a fight turns against them.
- Added solo, doubles, FFA, and four-island team modes for 8, 12, and 16 online players, with matching local bot rosters.
- Smoothed larger local bot matches by spreading terrain route searches across frames, reducing repeated AI scans, and making bots favor vulnerable targets while accounting for squad focus and combat risk. Rendering resolution now scales down when frame rate drops and recovers gradually when performance is stable.
- Reduced online multiplayer overhead by limiting room snapshots to 10 updates per second, encoding each snapshot once for all players, and applying block/pickup state incrementally in the browser. Starting a new room also clears the previous room's remote players and placed blocks.
- Added procedural walking, jumping/landing, sword swing and confirmed-hit feedback, shopkeeper idle motion, and floating resource pickups; cosmetic motion respects the system reduced-motion preference.
- Added a shopkeeper to every active team island. Online purchases are checked and applied by the Python server.
- Implemented online matchmaking and server-managed match state for health, pigs, pickups, individual player inventories, purchases, blocks, melee combat, respawns, and match results. Each island generates iron and gold pickups; the center generates emeralds. The player who collects a pickup receives it in their own inventory.
- Added a bounded PC-hosted server setup, TLS reverse-proxy template, and Windows launcher. The Python server includes automated multiplayer tests in `tests/`.
- Added a compact browser bot-policy interface and offline self-play training toolchain. The existing heuristic remains available when the policy is missing or invalid.

### Remaining work, in priority order

1. **Complete authoritative movement and building.** The server now rejects excessive horizontal and vertical movement and only accepts blocks supported by an island or another block. It still does not reproduce the complete browser collision map, so online movement is not cheat-resistant yet.
2. **Finish public server setup.** Choose a dynamic DNS hostname, configure Caddy and router forwarding, set the website's secure WebSocket URL, and test public matchmaking.
3. **Improve online reliability.** Match state currently lives in memory, so a server restart ends active matches. Add reconnect handling and decide whether match persistence is needed; then validate disconnects and room cleanup under real use.
4. **Bring more items online safely.** Bows, arrows, fireballs, ender pearls, and speed potions are disabled online until the server can validate their effects. Implement server-owned behavior and abuse limits before enabling them.
5. **Validate and improve bot learning.** Run offline training and held-out evaluation for the supported team sizes; improve the abstract simulator if learned decisions do not transfer well to actual matches.
6. **Polish and grow the project.** Add camera options and device/browser checks, balance maps and match pacing, and prepare contribution templates, gameplay media, and a release checklist.

**Known limitations:** Public matchmaking is unavailable until the owner configures a real WSS hostname and router/TLS setup. The host PC must stay on and reachable; CGNAT may block inbound connections. Online movement is not yet cheat-proof, match state is in memory, and several shop items remain disabled online. The simplified bot simulator cannot guarantee better decisions in every rendered match.

## Website and online multiplayer

The game website is published on GitHub Pages at <https://vflzx.github.io/void-pig-wars/>. GitHub Pages serves static files; the multiplayer WebSocket server runs on the owner's PC. Players use one configured secure WebSocket URL and never enter an address. Until the owner configures that URL in `multiplayer-config.mjs`, the public page reports that online play is not configured.

The same site includes a browser launcher at <https://vflzx.github.io/void-pig-wars/launcher.html>. It embeds the game, accepts a game URL (pre-filled with the Pages URL), and reports the game's live status to the launcher.

Online players select the same mode and join the matchmaking queue. A 1v1 room starts with two human players; doubles and FFA start with four; 2v2v2v2, 3v3v3v3, and 4v4v4v4 start with 8, 12, and 16. The server assigns teams and owns online player health, pig health, resource pickups, per-player resources and inventory, purchases, block placement, melee combat, respawns, and the match result. Iron and gold pickups spawn on every active team's island, with emerald pickups in the center; any living player may collect a drop, and the collector receives it in their own inventory. Each active island has a shopkeeper, and the server validates purchases at the buyer's team shop. In team modes, a team remains active while at least one teammate is connected and alive; disconnecting forfeits that player's life.

Online movement is still simulated by each browser and reported to the server, which checks movement bounds and a speed limit. It does not yet validate the full collision map, so online movement is not cheat-proof. Bows, arrows, fireballs, ender pearls, and speed potions are disabled in online matches until their effects can be validated by the server. Melee, wool, swords, armor, and golden apples are supported online.

Finished and abandoned rooms are cleaned up after 30 seconds. Match state is held in memory; restarting the server ends active games. The server accepts at most 128 simultaneous WebSocket connections.

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

## Host the multiplayer server on your PC

The game server stays on your computer; the static website remains on GitHub Pages. You need to finish the one-time network setup before players can use public matchmaking.

### Start locally

Install Python 3.11 or newer, then run `python -m pip install -r requirements.txt`. For a local test, start the server with `python server.py`; it listens on `127.0.0.1:8765` by default. Open <http://127.0.0.1:8765/healthz>; it should display `ok`. In another terminal, run `python -m http.server 8000`, open <http://localhost:8000>, and test matchmaking in browser windows.

For regular hosting, run `./start-server.ps1` in PowerShell. It sets the loopback address and allows the GitHub Pages and local-development origins. Keep the terminal open; press Ctrl+C to stop. The script does not install software or modify Windows Firewall or router settings.

### Configure public access

1. Create a dynamic DNS hostname with a provider of your choice and enable its PC-side IP updater.
2. Install Caddy, copy `Caddyfile.example` to `Caddyfile`, and replace `YOUR_DYNAMIC_DNS_HOSTNAME` with the hostname. Caddy handles HTTPS certificates and forwards WebSocket traffic to `127.0.0.1:8765`.
3. Allow Caddy through Windows Firewall when prompted. Forward **TCP ports 80 and 443** from your router to this PC. **Never forward port 8765.** Keep the PC awake, online, and running both Caddy and the Python server.
4. Once the hostname resolves and Caddy is working, set `PUBLIC_MULTIPLAYER_SERVER_URL` in `multiplayer-config.mjs` to `wss://your-hostname`, then publish the updated static site to GitHub Pages. Keep the `wss://` scheme.
5. Check `https://your-hostname/healthz` returns `ok`, then test a full match from the public game page. Players should not need to type the hostname.

If public access fails, check DNS updates, Caddy, and router TCP 80/443 forwarding. Carrier-grade NAT (CGNAT) can prevent inbound forwarding; ask your ISP whether direct public access is available. The server has no accounts or DDoS protection; origin checks and connection caps do not authenticate users. Stopping the PC or either service makes matchmaking unavailable. Remove the router forwarding rules to close public access.

## Controls

- **W A S D** move · **Mouse** look (click and drag if pointer lock is blocked; arrow keys also look) · **Space** jump
- **Hold Shift** sneak slowly and stop safely at island/block edges · **Left click/tap** attack or use the selected item
- **Right click** place wool · **Build button** places wool on touch screens · **1–7** select hotbar slot
- **E** open/close the base shop · **Settings** adjusts FOV and keyboard binds (saved in this browser)
- **Escape** releases the mouse; click the game to resume

On iPadOS Safari with an Apple keyboard, tap **Play vs Bots** or **Find a Game** to focus the game, then use **W A S D** to move and the **arrow keys** to look without pointer lock. Space jumps, Shift sneaks, E opens the shop, and items can be used with the on-screen touch controls.

Resources spawn at each team's generator and on the central island. Walk over them to collect them. Rival bots weigh nearby threats, equipment, health, their pig's safety, and useful resources to decide whether to defend, fight, resupply, retreat, or raid. Their high-level choices can use the bundled learned policy; missing or invalid weights use the existing heuristic. Bots route around terrain and bridges and replan when blocked. Sword swings, hit sparks, walking, shopkeeper idle motion, and floating pickups are animated.

## Offline bot-policy training

The compact browser policy does not call an online AI service or learn from player data. Training runs separately in Node.js with a deterministic headless simulator, so training does not affect game frame rate.

```powershell
node tools/bot-training/train-policy.mjs --generations 120 --population 40 --seed 20261101
```

The trainer reports held-out results against the existing heuristic and self-play opponents. It saves only a valid policy that improves on the selected baseline aggregate; otherwise it retains the fallback artifact and reports the regression. The simulator abstracts movement and combat, so its results do not guarantee stronger play in every rendered match.

Movement uses acceleration, gravity, jumping, and collisions with placed blocks. Hits apply knockback; falling into the void costs a life and returns you to your island while your pig is alive.
