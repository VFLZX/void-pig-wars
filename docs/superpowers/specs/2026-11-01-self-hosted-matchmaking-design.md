# PC-Hosted Online Matchmaking Design

## Intent

Run the authoritative multiplayer server on the owner's Windows PC instead of a hosted game-service provider. Players should open the existing website and click **Find a Game**; they should not have to enter a server address.

## Current State

- `server.py` is the Python WebSocket server and already reads `HOST`, `PORT`, and `ALLOWED_ORIGINS`.
- `game.js` uses localhost for local development but hard-codes the old Render hostname for the public game.
- `render.yaml` and the README still describe Render deployment. No Render game service was created.
- The website itself is published on GitHub Pages. This design replaces only the hosted multiplayer backend; the static game site remains where it is.

## Goals

- Keep match state and the WebSocket server on the owner's PC.
- Let anyone using the existing public game page enter matchmaking without typing an address or installing a special game client.
- Give the site one stable secure WebSocket hostname that routes to the PC.
- Provide Windows setup instructions and repeatable start/stop commands.
- Keep Python's game server on loopback behind a TLS reverse proxy; do not expose its raw port directly to the internet.
- Apply basic connection and matchmaking resource limits for an internet-reachable service.
- Remove Render service instructions and deployment configuration from the project.

## Non-Goals

- Moving the static website off GitHub Pages.
- Accounts, authentication, ranked matchmaking, persistent matches, or protection from denial-of-service attacks.
- Running the game server when the PC is asleep, disconnected, or powered off.
- Opening router ports or entering DNS/provider account credentials on the owner's behalf.

## Constraints

- Keep the Python `websockets` server and browser WebSocket protocol.
- Do not add a game-hosting provider or a new Python runtime dependency.
- Preserve all existing match modes and server-authoritative state.
- Players use `wss://` from the HTTPS GitHub Pages site.
- Only the HTTPS reverse proxy is internet-facing; the Python service listens on `127.0.0.1:8765`.
- Permit the published GitHub Pages origin and localhost development origin in the WebSocket origin allowlist.

## Approaches

1. **Router forwarding plus dynamic DNS and Caddy (selected):** the PC runs Python and Caddy, a dynamic DNS hostname tracks the home IP, and the router forwards web/TLS traffic to the PC. This avoids hosting the game server elsewhere and gives players a fixed website endpoint. It requires one-time DNS, Caddy, router, and firewall setup and exposes the proxy to internet traffic.
2. **Private overlay network:** Tailscale Serve or a similar private network can protect access without router forwarding, but each friend needs to join or install the overlay. That conflicts with the requirement that anyone can play directly from the website.
3. **Hosted game service:** easiest to operate and scale, but explicitly not wanted.

The selected design uses Caddy's automatic HTTPS in front of the local Python service. The website receives the resulting hostname through a small checked-in client configuration file; players never edit it. The exact dynamic DNS hostname remains an owner-provided setup value.

## Behavior

- `server.py` binds to `127.0.0.1` by default for the public self-hosted setup. A documented local-development option may bind differently when required.
- Caddy accepts HTTPS/WSS for the owner's dynamic DNS hostname and reverse-proxies WebSocket traffic to `127.0.0.1:8765`.
- Router forwarding sends external TCP ports 80 and 443 to the PC. Port 8765 is never forwarded.
- `game.js` reads the configured `wss://<owner-hostname>` endpoint. Local development continues to use `ws://localhost:8765`.
- A PowerShell launcher checks Python prerequisites, sets the host/port/origin values, and starts the server with clear output. Caddy and DNS setup are documented separately because they depend on the owner's hostname and router.
- The server rejects excess connections and queue growth using documented limits. Existing valid mode capacities and queue ordering remain unchanged.
- A health endpoint remains available through Caddy so the owner can confirm the PC server is reachable.
- README setup explains PC sleep, dynamic-IP updates, router forwarding, TLS, and how to stop the server and remove the forwarded rule.

## Security and Limitations

- Public players need no address, but the public website must contain a stable WSS hostname. A dynamic DNS provider supplies that hostname and updates its target when the home's public IP changes.
- The owner's router and ISP must permit inbound forwarding. Carrier-grade NAT may prevent direct forwarding; in that case a tunnel is a separate future alternative and does not mean the game simulation moved off the PC.
- Origin checks protect browser cross-origin connections but are not authentication. Anyone can attempt to connect, so connection and queue limits reduce accidental resource exhaustion but do not provide DDoS protection.
- The PC must remain powered on, awake, and connected. If it is unavailable, matchmaking is unavailable.
- The exact hostname is not yet known and must be inserted into the site configuration before the public website can connect to this PC.
