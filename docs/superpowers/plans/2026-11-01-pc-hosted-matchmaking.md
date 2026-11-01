# PC-Hosted Matchmaking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Run the authoritative WebSocket match server on the owner's PC while players join from the game website without entering a server address.

**Architecture:** The website reads one public WSS hostname from `multiplayer-config.mjs`; local development still resolves to `ws://localhost:8765`. The Python server binds to loopback behind Caddy, which terminates TLS for the owner's dynamic DNS hostname and forwards WebSocket traffic to Python. A Windows launcher and README guide the owner through Python, Caddy, DDNS, router forwarding, and public verification.

**Tech Stack:** Browser JavaScript modules, Python 3.11+, `websockets`, PowerShell, Caddy, dynamic DNS.

**Spec:** `docs/superpowers/specs/2026-11-01-self-hosted-matchmaking-design.md`

## Global Constraints

- Keep the Python `websockets` server and browser WebSocket protocol.
- Do not add a game-hosting provider or a new Python runtime dependency.
- Preserve all existing match modes and server-authoritative state.
- Players use `wss://` from the HTTPS GitHub Pages site.
- Only the HTTPS reverse proxy is internet-facing; the Python service listens on `127.0.0.1:8765`.
- Permit the published GitHub Pages origin and localhost development origin in the WebSocket origin allowlist.

## Review Focus

- Missing or malformed public hostname: local play still resolves to localhost, while the public page reports that the owner has not configured a WSS endpoint.
- Non-HTTPS or non-WSS URL: never silently downgrade the public site to insecure WebSockets.
- Disallowed browser origin: accept the public Pages origin and local development origins; reject unrelated browser origins.
- Full connection cap: reject excess sockets without consuming matchmaking slots or leaking active-connection counts.
- PC service unavailable or DNS stale: show a recoverable matchmaking connection error and keep the lobby usable.

## File Map

- Create `multiplayer-config.mjs` for the one owner-configured public WSS hostname and URL resolution.
- Modify `game.js` to use that resolver, retain localhost development, and show a clear unconfigured/offline state.
- Modify `server.py` to bind locally by default and cap open connections while retaining environment overrides.
- Create `Caddyfile.example` as the TLS reverse-proxy template.
- Create `start-server.ps1` to set local host/origin defaults and start Python with readable errors.
- Modify `README.md` with setup, DDNS, router, TLS, firewall, shutdown, and troubleshooting steps; remove Render deployment instructions.
- Delete `render.yaml` so contributors do not accidentally deploy the server to Render.

---

### Task 1: Configure the website's fixed server endpoint

**Files:**
- Create: `multiplayer-config.mjs`
- Modify: `game.js`

**Interfaces:**
- Produce `resolveMultiplayerServerUrl({ hostname, configuredUrl }) -> string | null` from `multiplayer-config.mjs`.
- Local `localhost` and `127.0.0.1` always resolve to `ws://<hostname>:8765`.
- Public play resolves only to the configured `wss://` URL; an empty config returns `null`.

- [ ] Add `PUBLIC_MULTIPLAYER_SERVER_URL` in `multiplayer-config.mjs`, initially empty, plus the pure resolver above.
- [ ] Update `findOnlineMatch()` to show a setup-specific lobby message and return before opening a socket when the public URL is unset or invalid.
- [ ] Replace the hard-coded Render URL with the resolver; preserve local development behavior.
- [ ] Run `node --check game.js` and `node --check multiplayer-config.mjs`; confirm the resolver's localhost/public/empty branches by a small manual Node invocation.

### Task 2: Keep the Python service local and bounded

**Files:**
- Modify: `server.py`

**Interfaces:**
- `HOST` defaults to `127.0.0.1`; `HOST` and `PORT` environment variables continue to override defaults.
- At most 128 active WebSocket connections are accepted; excess connections close with code 1013 before queue or room state changes.

- [ ] Add `MAX_CONNECTIONS = 128` and an event-loop-safe active-socket guard in `MatchServer.connection_handler()`.
- [ ] Ensure every early return and disconnect removes the socket from the active set; keep `leave_waiting()` and match disconnect cleanup intact.
- [ ] Change only the default host in `main()` to `127.0.0.1`; preserve the existing configurable origin list and health endpoint.
- [ ] Run `python -m py_compile server.py` and inspect the rejection and cleanup paths for counter leaks.

### Task 3: Add the Windows PC host setup

**Files:**
- Create: `Caddyfile.example`
- Create: `start-server.ps1`
- Modify: `README.md`
- Delete: `render.yaml`

**Interfaces:**
- `Caddyfile.example` contains a clearly marked hostname placeholder and proxies HTTPS/WebSocket traffic to `127.0.0.1:8765`.
- `start-server.ps1` launches Python with `HOST=127.0.0.1`, `PORT=8765`, and comma-separated `ALLOWED_ORIGINS` for Pages and local development.

- [ ] Add the Caddy reverse-proxy template with the dynamic DNS hostname placeholder.
- [ ] Add the PowerShell launcher with checks for `python` and `requirements.txt`; do not install external software or change Windows firewall/router settings automatically.
- [ ] Rewrite the README hosting section as a PC-hosting guide, including DDNS updates, Caddy TLS, router TCP 80/443 forwarding, keeping port 8765 private, opening required local firewall access, checking `/healthz`, stopping the server, and the CGNAT limitation.
- [ ] Remove the Render Blueprint and Render-specific instructions.
- [ ] Run `git diff --check`, `python -m py_compile server.py`, and Node syntax checks. Review that the README never tells users to forward port 8765.

### Task 4: Verify the end-to-end owner setup

**Files:**
- Review: `multiplayer-config.mjs`, `game.js`, `server.py`, `Caddyfile.example`, `start-server.ps1`, `README.md`

- [ ] Start the server locally and confirm `http://127.0.0.1:8765/healthz` returns `ok`.
- [ ] Use two local browser sessions to confirm the same-mode queue starts a match and a different mode remains separate.
- [ ] After the owner supplies the real DDNS hostname and configures router forwarding, set `PUBLIC_MULTIPLAYER_SERVER_URL` to `wss://<hostname>` and publish the website.
- [ ] Confirm the HTTPS health endpoint returns `ok`, the WSS endpoint opens, and two website clients enter the same room without typing a server address.
- [ ] Keep the website hostname unset until the owner has a real DNS name; do not publish a placeholder WSS endpoint.
