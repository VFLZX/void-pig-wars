# Void Pig Wars

A small, playable first-person voxel arena game. Four teams fight across floating islands above the void; protect your team's pig, gather generator resources, and take out the other teams' pigs. Pixel-textured grass, dirt, and stone plus a blocky held weapon give the arena a voxel look. There are no prebuilt bridges to the central emerald island: build your own route with snap-aligned half-block wool tiles. A cyan placement ghost marks valid placement; red means blocked.

## Play online with GitHub Pages

This repository is a self-contained static site. GitHub Pages serves it directly from the `main` branch root; no build step, backend, external fonts, or network access is needed to run the game.

The live game is hosted at <https://vflzx.github.io/void-pig-wars/>.

## Preview locally

Python 3 is enough for a local preview. From this folder, run:

```powershell
python -m http.server 8000
```

Then open <http://localhost:8000> in a modern browser. This optional local preview uses Python's simple static file server; it is not needed after deployment.

## Controls

- **W A S D** move · **Mouse** look (click and drag if pointer lock is blocked; arrow keys also look) · **Space** jump
- **Hold Shift** sneak slowly and stop safely at island/block edges · **Left click or F** attack/fire a bow
- **Right click or G** place wool · **1–7** select hotbar slot · **H** use the selected utility
- **E** open/close the base shop · **Settings** adjusts FOV and keyboard binds (saved in this browser)
- **Escape** releases the mouse; click the game to resume

Resources spawn at each team's generator and on the central island. Walk over them to collect them. Rival bots collect their own generator drops, buy upgrades and wool, build supported routes toward the nearest living enemy pig, and attack pigs when they arrive. They also fight nearby enemy bots and the player, defend their own pig when threatened, and never target teammates. The emerald island has a square footprint and remains unconnected by default. The shop is beside the green team's pig and sells building blocks, weapon upgrades, armor, a bow and arrows, healing, fireballs, speed potions, and ender pearls. Use your starting wool to bridge the gap; crouch with Shift while placing blocks at the edge.

Movement uses acceleration, gravity, jumping, and collisions with placed blocks. Hits apply knockback; falling into the void costs a life and returns you to your island while your pig is alive.
