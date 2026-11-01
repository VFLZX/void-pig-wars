import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveMultiplayerServerUrl } from '../multiplayer-config.mjs';

test('local host always targets its own Python server', () => {
  assert.equal(resolveMultiplayerServerUrl({ hostname: 'localhost', configuredUrl: 'wss://game.example' }), 'ws://localhost:8765');
  assert.equal(resolveMultiplayerServerUrl({ hostname: '127.0.0.1', configuredUrl: '' }), 'ws://127.0.0.1:8765');
});

test('public host requires a valid secure WebSocket endpoint', () => {
  assert.equal(resolveMultiplayerServerUrl({ hostname: 'vflzx.github.io', configuredUrl: 'wss://game.example' }), 'wss://game.example');
  assert.equal(resolveMultiplayerServerUrl({ hostname: 'vflzx.github.io', configuredUrl: '' }), null);
  assert.equal(resolveMultiplayerServerUrl({ hostname: 'vflzx.github.io', configuredUrl: 'ws://game.example' }), null);
  assert.equal(resolveMultiplayerServerUrl({ hostname: 'vflzx.github.io', configuredUrl: 'https://game.example' }), null);
});
