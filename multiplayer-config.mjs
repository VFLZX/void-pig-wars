// Set this to the PC host's public WSS URL after dynamic DNS and Caddy are ready.
// Keep it empty during local development; players on the public site then receive
// a clear setup message instead of connecting to a stale or placeholder server.
export const PUBLIC_MULTIPLAYER_SERVER_URL = '';

export function resolveMultiplayerServerUrl({ hostname, configuredUrl = PUBLIC_MULTIPLAYER_SERVER_URL }) {
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    return `ws://${hostname}:8765`;
  }

  if (typeof configuredUrl !== 'string' || !configuredUrl.trim()) return null;
  try {
    const endpoint = new URL(configuredUrl.trim());
    if (endpoint.protocol !== 'wss:' || !endpoint.hostname || endpoint.username || endpoint.password) return null;
    return endpoint.toString().replace(/\/$/, '');
  } catch {
    return null;
  }
}
