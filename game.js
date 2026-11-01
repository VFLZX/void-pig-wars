import * as THREE from './vendor/three.module.js';
import { avatarPose, firstPersonAttackPose, shopkeeperIdlePose } from './animation-utils.mjs';
import { nextRenderScale, nextScheduledItem, scoreBotEngagement } from './bot-decision-utils.mjs';

const $ = (selector) => document.querySelector(selector);
const canvas = $('#world');
const hud = $('#hud');
const overlay = $('#overlay');
const overlayTitle = $('#overlay-title');
const overlayCopy = $('#overlay-copy');
const startButton = $('#start-button');
const returnLobbyButton = $('#return-lobby-button');
const onlineMatchButton = $('#online-match-button');
const multiplayerStatus = $('#multiplayer-status');
const queueStatusPanel = $('#queue-status');
const queueStatusCopy = $('#queue-status-copy');
const touchControls = $('#touch-controls');
const touchControlsToggle = $('#touch-controls-toggle');
const touchControlsSettingsToggle = $('#touch-controls-settings');
const touchLookArea = $('#touch-look-area');
const touchJoystick = $('#touch-joystick');
const joystickKnob = $('#joystick-knob');
const shopPanel = $('#shop');
const shopItems = $('#shop-items');
const settingsPanel = $('#settings');
const keys = new Set();
const motionPreference = window.matchMedia?.('(prefers-reduced-motion: reduce)') ?? null;
const reducedMotionEnabled = () => Boolean(motionPreference?.matches);
let touchControlsEnabled = false;
let joystickPointerId = null;
let lookPointerId = null;
let selectedMatchMode = 'ffa';
let localTeamId = 'green';
let multiplayerSocket = null;
let onlineMatch = false;
let onlineRoomId = null;
let onlinePlayerId = null;
let lastNetworkMoveAt = 0;
const remotePlayers = new Map();
const networkBlockKeys = new Set();
const networkBlockMeshes = new Set();
let networkBlockSyncIndex = 0;
const DEFAULT_BINDINGS = {
  forward: 'KeyW', back: 'KeyS', left: 'KeyA', right: 'KeyD',
  jump: 'Space', sneak: 'ShiftLeft', shop: 'KeyE',
  slot1: 'Digit1', slot2: 'Digit2', slot3: 'Digit3', slot4: 'Digit4',
  slot5: 'Digit5', slot6: 'Digit6', slot7: 'Digit7',
};
function keyboardCode(event) {
  if (event.code && event.code !== 'Unidentified') return event.code;
  if (event.key === ' ') return 'Space';
  if (/^[a-z]$/i.test(event.key)) return `Key${event.key.toUpperCase()}`;
  if (/^[0-9]$/.test(event.key)) return `Digit${event.key}`;
  if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Escape', 'Enter', 'Tab'].includes(event.key)) {
    return event.key;
  }
  if (event.key === 'Shift') return event.location === 2 ? 'ShiftRight' : 'ShiftLeft';
  return '';
}
const BINDING_LABELS = {
  forward: 'Move forward', back: 'Move backward', left: 'Move left', right: 'Move right',
  jump: 'Jump', sneak: 'Sneak / edge guard', shop: 'Open shop',
  slot1: 'Hotbar slot 1', slot2: 'Hotbar slot 2', slot3: 'Hotbar slot 3',
  slot4: 'Hotbar slot 4', slot5: 'Hotbar slot 5', slot6: 'Hotbar slot 6',
  slot7: 'Hotbar slot 7',
};
const SETTINGS_KEY = 'void-pig-wars-settings-v1';
const bindings = { ...DEFAULT_BINDINGS };
let fieldOfView = 76;
let pendingRebind = null;

try {
  const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) || 'null');
  if (saved && typeof saved === 'object') {
    for (const action of Object.keys(DEFAULT_BINDINGS)) {
      if (typeof saved.bindings?.[action] === 'string') bindings[action] = saved.bindings[action];
    }
    if (Number.isInteger(saved.fieldOfView) && saved.fieldOfView >= 60 && saved.fieldOfView <= 105) {
      fieldOfView = saved.fieldOfView;
    }
    touchControlsEnabled = saved.touchControlsEnabled === true;
  }
} catch (error) {
  console.warn('Could not load saved game settings.', error);
}

const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
let adaptiveRenderScale = 0.85;
renderer.setPixelRatio(adaptiveRenderScale);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
scene.background = new THREE.Color('#91d9f4');
scene.fog = new THREE.FogExp2('#91d9f4', 0.0022);
const camera = new THREE.PerspectiveCamera(76, window.innerWidth / window.innerHeight, 0.08, 260);
camera.fov = fieldOfView;
camera.updateProjectionMatrix();
camera.rotation.order = 'YXZ';
scene.add(camera);
scene.add(new THREE.HemisphereLight('#e8f8ff', '#657c74', 2.55));
const sun = new THREE.DirectionalLight('#fff5d9', 3.1);
sun.position.set(-25, 50, 22);
scene.add(sun);

function createPixelTexture(palette, seed) {
  const size = 16;
  const pixelCanvas = document.createElement('canvas');
  pixelCanvas.width = size;
  pixelCanvas.height = size;
  const context = pixelCanvas.getContext('2d');
  let value = seed;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      value = (value * 1664525 + 1013904223) >>> 0;
      context.fillStyle = palette[value % palette.length];
      context.fillRect(x, y, 1, 1);
    }
  }
  const texture = new THREE.CanvasTexture(pixelCanvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

const grassTexture = createPixelTexture(['#39874f', '#419451', '#4ba454', '#56a849', '#327d46', '#5aad5b'], 17);
const dirtTexture = createPixelTexture(['#63452e', '#705137', '#7c5b3a', '#876441', '#60422e', '#74543b'], 29);
const stoneTexture = createPixelTexture(['#72727c', '#85848a', '#66666f', '#929098', '#777781', '#5e5f68'], 43);
const grassTerrainTexture = grassTexture.clone();
grassTerrainTexture.repeat.set(24, 24);
const dirtTerrainTexture = dirtTexture.clone();
dirtTerrainTexture.repeat.set(24, 2);
const materials = {
  terrainSoil: new THREE.MeshLambertMaterial({ map: dirtTerrainTexture, flatShading: true }),
  terrainGrass: new THREE.MeshLambertMaterial({ map: grassTerrainTexture, flatShading: true }),
  stone: new THREE.MeshLambertMaterial({ map: stoneTexture, flatShading: true }),
  wool: new THREE.MeshLambertMaterial({ color: '#45bd83', flatShading: true }),
};
const boxGeometry = new THREE.BoxGeometry(1, 1, 1);
const buildBlockGeometry = new THREE.BoxGeometry(0.5, 0.5, 0.5);
const raycaster = new THREE.Raycaster();
const centerScreen = new THREE.Vector2(0, 0);
const worldSurfaces = [];
const buildMeshes = [];
let botNavigationRevision = 0;
let botNavigationSurfaceCache = null;
let botNavigationBlockerCache = new Map();
let botNavigationCacheRevision = -1;
let botRoutePlannerCursor = 0;
const pickups = [];
const entities = [];
const pigs = [];
const arrows = new Set();
const hitEffects = new Set();
const hitSparkGeometry = new THREE.BoxGeometry(0.09, 0.09, 0.09);
const hitSparkMaterial = new THREE.MeshBasicMaterial({ color: '#fff3b5' });
const buildPreview = new THREE.Mesh(
  buildBlockGeometry,
  new THREE.MeshBasicMaterial({ color: '#5dffc0', transparent: true, opacity: 0.42, depthWrite: false }),
);
buildPreview.visible = false;
buildPreview.raycast = () => {};
scene.add(buildPreview);
const placementFacePreview = new THREE.Mesh(
  new THREE.PlaneGeometry(0.46, 0.46),
  new THREE.MeshBasicMaterial({ color: '#5dffc0', transparent: true, opacity: 0.78, depthWrite: false, side: THREE.DoubleSide }),
);
placementFacePreview.visible = false;
placementFacePreview.raycast = () => {};
scene.add(placementFacePreview);
const teams = [
  { id: 'green', name: 'Green', color: '#42d98a', dark: '#208051', x: -42, z: 0, bots: [], lastIronGen: 0, lastGoldGen: 0 },
  { id: 'blue', name: 'Blue', color: '#52a8ff', dark: '#2865b4', x: 42, z: 0, bots: [], lastIronGen: 0, lastGoldGen: 0 },
  { id: 'red', name: 'Red', color: '#ff5c70', dark: '#ae3346', x: 0, z: -42, bots: [], lastIronGen: 0, lastGoldGen: 0 },
  { id: 'yellow', name: 'Yellow', color: '#ffd44f', dark: '#aa8120', x: 0, z: 42, bots: [], lastIronGen: 0, lastGoldGen: 0 },
];

function largeTeamMode(size) {
  return {
    label: `${size}v${size}v${size}v${size}`,
    activeTeams: teams.map((team) => team.id),
    botCounts: Object.fromEntries(teams.map((team) => [team.id, size - (team.id === 'green' ? 1 : 0)])),
  };
}

const matchModes = {
  solo: { label: '1v1', activeTeams: ['green', 'blue'], botCounts: { green: 0, blue: 1 } },
  doubles: { label: 'DOUBLES · 2v2', activeTeams: ['green', 'blue'], botCounts: { green: 1, blue: 2 } },
  ffa: { label: '1v1v1v1', activeTeams: ['green', 'blue', 'red', 'yellow'], botCounts: { green: 0, blue: 1, red: 1, yellow: 1 } },
  '2v2v2v2': largeTeamMode(2),
  '3v3v3v3': largeTeamMode(3),
  '4v4v4v4': largeTeamMode(4),
};

function activeTeams() {
  return teams.filter((team) => team.active);
}

function playerTeam() {
  return teams.find((team) => team.id === localTeamId) ?? teams[0];
}

function multiplayerServerUrl() {
  if (['localhost', '127.0.0.1'].includes(window.location.hostname)) {
    return `ws://${window.location.hostname}:8765`;
  }
  return 'wss://void-pig-wars-multiplayer.onrender.com';
}

const state = {
  mode: 'menu',
  started: false,
  yaw: Math.PI / 2,
  pitch: 0,
  health: 100,
  alive: true,
  respawnAt: 0,
  player: {
    iron: 0, gold: 0, emerald: 0, blocks: 48, apples: 1, fireballs: 0, weapon: 10,
    hasBow: false, arrows: 0, pearls: 0, potions: 0, speedBoostUntil: 0, armor: 0,
  },
  selected: 0,
  lastAttack: 0,
  lastIronGen: 0,
  lastGoldGen: 0,
  lastCentralGen: 0,
  lastTick: performance.now(),
  noticeTimer: 0,
  toastTimer: 0,
  velocityY: 0,
  velocityX: 0,
  velocityZ: 0,
  onGround: false,
  fallbackDragging: false,
  fallbackAvailable: false,
  pointerLockPending: false,
  lastPointerX: 0,
  lastPointerY: 0,
  touchMoveX: 0,
  touchMoveY: 0,
  touchSneaking: false,
  touchJumpPressed: false,
  lastHitAt: -Infinity,
  lastLandingAt: -Infinity,
};
let attackAnimationStartedAt = -Infinity;

const playerPosition = new THREE.Vector3(-42, 1.65, 0);
camera.position.copy(playerPosition);
state.yaw = -Math.PI / 2;
camera.rotation.set(state.pitch, state.yaw, 0);
const heldItem = new THREE.Group();
heldItem.position.set(0.43, -0.42, -0.82);
heldItem.rotation.set(-0.18, -0.25, -0.36);
camera.add(heldItem);
const clock = new THREE.Clock();

function makeMesh(geometry, material, parent, x = 0, y = 0, z = 0) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(x, y, z);
  parent.add(mesh);
  return mesh;
}

function createAnimatedLeg(group, material, side) {
  const pivot = new THREE.Group();
  pivot.position.set(side * 0.24, 0.9, 0);
  makeMesh(new THREE.BoxGeometry(0.3, 0.85, 0.35), material, pivot, 0, -0.43, 0);
  group.add(pivot);
  return pivot;
}

function createAvatarSword(group) {
  const pivot = new THREE.Group();
  pivot.position.set(0.58, 1.12, 0.08);
  const blade = new THREE.MeshLambertMaterial({ color: '#d8e1e8', flatShading: true });
  const edge = new THREE.MeshLambertMaterial({ color: '#8998a8', flatShading: true });
  const handle = new THREE.MeshLambertMaterial({ color: '#684331', flatShading: true });
  makeMesh(new THREE.BoxGeometry(0.13, 0.56, 0.09), blade, pivot, 0, 0.38, 0);
  makeMesh(new THREE.BoxGeometry(0.34, 0.08, 0.13), edge, pivot, 0, 0.06, 0);
  makeMesh(new THREE.BoxGeometry(0.11, 0.24, 0.11), handle, pivot, 0, -0.1, 0);
  group.add(pivot);
  return pivot;
}

function registerAvatarAnimation(group, body, leftLeg, rightLeg, swordPivot) {
  return {
    body,
    bodyBaseY: body.position.y,
    leftLeg,
    rightLeg,
    swordPivot,
    lastX: group.position.x,
    lastZ: group.position.z,
    lastLandingAt: -Infinity,
    wasGrounded: true,
  };
}

function addWorldSurface(x, z, width, depth, top = 0, mesh = null, octagon = false) {
  worldSurfaces.push({ x, z, width, depth, top, mesh, octagon });
}

function createIsland(x, z, team) {
  const islandGroup = new THREE.Group();
  islandGroup.position.set(x, 0, z);
  scene.add(islandGroup);
  if (team) team.islandGroup = islandGroup;
  const base = makeMesh(new THREE.BoxGeometry(24, 1.88, 24), materials.terrainSoil, islandGroup, 0, -1.06, 0);
  base.receiveShadow = true;
  const top = makeMesh(new THREE.BoxGeometry(24, 0.24, 24), materials.terrainGrass, islandGroup, 0, -0.12, 0);
  addWorldSurface(x, z, 24, 24, 0, top);
  if (team) worldSurfaces[worldSurfaces.length - 1].teamId = team.id;
}

function addSpriteLabel(text, color, parent, x, y, z, width = 5) {
  const canvasLabel = document.createElement('canvas');
  canvasLabel.width = 512;
  canvasLabel.height = 128;
  const ctx = canvasLabel.getContext('2d');
  ctx.fillStyle = '#101426dd';
  ctx.fillRect(8, 12, 496, 104);
  ctx.strokeStyle = color;
  ctx.lineWidth = 8;
  ctx.strokeRect(8, 12, 496, 104);
  ctx.font = 'bold 48px Arial';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#ffffff';
  ctx.fillText(text, 256, 64);
  const texture = new THREE.CanvasTexture(canvasLabel);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.NearestFilter;
  texture.magFilter = THREE.NearestFilter;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false }));
  sprite.position.set(x, y, z);
  sprite.scale.set(width, width * 0.25, 1);
  parent.add(sprite);
  return sprite;
}

function createPig(team) {
  const group = new THREE.Group();
  const pink = new THREE.MeshLambertMaterial({ color: '#f394a8', flatShading: true });
  const darkPink = new THREE.MeshLambertMaterial({ color: '#d96884', flatShading: true });
  const hoof = new THREE.MeshLambertMaterial({ color: '#a74e65', flatShading: true });
  const x = team.x + (team.x < 0 ? -3 : team.x > 0 ? 3 : 0);
  const z = team.z + (team.z < 0 ? -3 : team.z > 0 ? 3 : 4);
  group.position.set(x, 0.25, z);
  makeMesh(new THREE.BoxGeometry(2.15, 1.35, 1.5), pink, group, 0, 0.25, 0);
  makeMesh(new THREE.BoxGeometry(1.05, 0.95, 0.95), pink, group, 0.94, 0.55, 0);
  makeMesh(new THREE.BoxGeometry(0.7, 0.37, 0.2), darkPink, group, 1.42, 0.36, 0);
  makeMesh(new THREE.BoxGeometry(0.28, 0.18, 0.14), hoof, group, 1.35, 0.38, -0.09);
  makeMesh(new THREE.BoxGeometry(0.28, 0.18, 0.14), hoof, group, 1.35, 0.38, 0.09);
  for (const side of [-1, 1]) {
    makeMesh(new THREE.BoxGeometry(0.36, 0.48, 0.38), pink, group, -0.64, -0.48, side * 0.43);
    makeMesh(new THREE.BoxGeometry(0.33, 0.53, 0.27), pink, group, 0.67, -0.47, side * 0.4);
    makeMesh(new THREE.BoxGeometry(0.24, 0.38, 0.17), darkPink, group, 0.63, 1.09, side * 0.33).rotation.z = -0.25;
    makeMesh(new THREE.BoxGeometry(0.13, 0.13, 0.1), new THREE.MeshBasicMaterial({ color: '#272134' }), group, 1.27, 0.76, side * 0.3);
  }
  makeMesh(new THREE.BoxGeometry(0.34, 0.17, 0.17), pink, group, -1.18, 0.49, 0).rotation.y = 0.5;
  const barBack = makeMesh(new THREE.BoxGeometry(2.6, 0.17, 0.08), new THREE.MeshBasicMaterial({ color: '#282136' }), group, 0, 1.7, 0);
  const barFill = makeMesh(new THREE.BoxGeometry(2.45, 0.1, 0.09), new THREE.MeshBasicMaterial({ color: team.color }), group, 0, 1.7, 0.05);
  addSpriteLabel(`${team.name.toUpperCase()} PIG`, team.color, group, 0, 2.35, 0, 3.8);
  scene.add(group);
  const pig = { team, group, x, z, health: 200, maxHealth: 200, alive: true, barBack, barFill };
  pigs.push(pig);
  for (const child of group.children) {
    child.userData.target = pig;
  }
  return pig;
}

function createShopkeeper(team) {
  const group = new THREE.Group();
  group.position.set(team.x - 5, 0, team.z + 5);
  const idle = { baseY: group.position.y, baseYaw: group.rotation.y, phase: Math.random() * Math.PI * 2 };
  group.userData.idleAnimation = idle;
  const robe = new THREE.MeshLambertMaterial({ color: '#7253c8', flatShading: true });
  const skin = new THREE.MeshLambertMaterial({ color: '#d9a97e', flatShading: true });
  const hat = new THREE.MeshLambertMaterial({ color: '#302449', flatShading: true });
  makeMesh(new THREE.BoxGeometry(1.05, 1.35, 0.8), robe, group, 0, 0.78, 0);
  makeMesh(new THREE.BoxGeometry(0.75, 0.72, 0.72), skin, group, 0, 1.83, 0);
  makeMesh(new THREE.BoxGeometry(0.9, 0.25, 0.9), hat, group, 0, 2.28, 0);
  makeMesh(new THREE.BoxGeometry(0.25, 0.15, 0.1), new THREE.MeshBasicMaterial({ color: '#272134' }), group, -0.18, 1.88, 0.38);
  makeMesh(new THREE.BoxGeometry(0.25, 0.15, 0.1), new THREE.MeshBasicMaterial({ color: '#272134' }), group, 0.18, 1.88, 0.38);
  addSpriteLabel('SHOP', '#c6a0ff', group, 0, 3, 0, 2.6);
  scene.add(group);
  return group;
}

function botHomePosition(team, slot) {
  const directionX = team.x < 0 ? -1 : team.x > 0 ? 1 : 0;
  const directionZ = team.z < 0 ? -1 : team.z > 0 ? 1 : 0;
  const distance = 4 + slot * 2;
  return { x: team.x + directionX * distance, z: team.z + directionZ * distance };
}

function createBot(team, slot = 0) {
  const group = new THREE.Group();
  const color = new THREE.MeshLambertMaterial({ color: team.color, flatShading: true });
  const skin = new THREE.MeshLambertMaterial({ color: '#ddb38c', flatShading: true });
  const dark = new THREE.MeshLambertMaterial({ color: team.dark, flatShading: true });
  const body = makeMesh(new THREE.BoxGeometry(0.95, 1.05, 0.65), color, group, 0, 0.83, 0);
  makeMesh(new THREE.BoxGeometry(0.76, 0.68, 0.68), skin, group, 0, 1.68, 0);
  makeMesh(new THREE.BoxGeometry(0.28, 0.16, 0.08), new THREE.MeshBasicMaterial({ color: '#272134' }), group, -0.18, 1.73, 0.36);
  makeMesh(new THREE.BoxGeometry(0.28, 0.16, 0.08), new THREE.MeshBasicMaterial({ color: '#272134' }), group, 0.18, 1.73, 0.36);
  const leftLeg = createAnimatedLeg(group, dark, -1);
  const rightLeg = createAnimatedLeg(group, dark, 1);
  const swordPivot = createAvatarSword(group);
  const spawn = botHomePosition(team, slot);
  group.position.set(spawn.x, 0, spawn.z);
  const animation = registerAvatarAnimation(group, body, leftLeg, rightLeg, swordPivot);
  addSpriteLabel(team.name.toUpperCase(), team.color, group, 0, 2.5, 0, 2.5);
  scene.add(group);
  const bot = {
    team, slot, active: false, group, health: 100, maxHealth: 100, alive: true, respawnAt: 0,
    attackAt: 0, lastAttackAt: -Infinity, hitAt: 0,
    animation,
    objectiveType: null, objectiveTarget: null, objectiveKey: null, nextObjectiveAt: 0,
    route: null, routeIndex: 0, routeRevision: -1, routeNextPlanAt: 0,
    routeTargetX: 0, routeTargetZ: 0, routeObjectiveKey: null,
    routeLastProgressAt: 0, routeLastDistance: Infinity,
    aggression: 0.85 + Math.random() * 0.3,
    caution: 0.85 + Math.random() * 0.3,
    resourcefulness: 0.85 + Math.random() * 0.3,
    combatTarget: null, apples: 0, nextHealAt: 0,
    iron: 1, gold: 0, emerald: 0, blocks: 48,
    weapon: 10, armor: 0, velocityY: 0, velocityX: 0, velocityZ: 0, onGround: true, jumpCooldown: 0,
    lastIronGen: 0, lastGoldGen: 0, nextPurchaseAt: 0, blockMaterial: new THREE.MeshLambertMaterial({ color: team.color, flatShading: true }),
  };
  entities.push(bot);
  team.bots.push(bot);
  if (slot === 0) team.bot = bot;
  for (const child of group.children) child.userData.target = bot;
  return bot;
}

function configureMatchMode(mode, onlineTeams = null) {
  selectedMatchMode = matchModes[mode] ? mode : 'ffa';
  const config = matchModes[selectedMatchMode];
  botNavigationRevision++;
  for (const team of teams) {
    team.active = config.activeTeams.includes(team.id);
    team.playerControlled = onlineTeams ? onlineTeams.includes(team.id) : team.id === 'green';
    team.eliminated = false;
    if (team.shop) team.shop.visible = team.active;
    if (team.pig?.group) team.pig.group.visible = team.active;
    if (team.generator) team.generator.visible = team.active;
    const botCount = onlineTeams ? 0 : config.botCounts[team.id] || 0;
    for (const bot of team.bots) {
      bot.active = team.active && bot.slot < botCount;
      bot.alive = bot.active;
      bot.health = bot.maxHealth;
      bot.respawnAt = 0;
      bot.attackAt = 0;
      bot.combatTarget = null;
      bot.objectiveType = null;
      bot.objectiveTarget = null;
      bot.objectiveKey = null;
      bot.nextObjectiveAt = 0;
      bot.route = null;
      bot.routeIndex = 0;
      bot.routeRevision = -1;
      bot.routeNextPlanAt = 0;
      bot.routeObjectiveKey = null;
      bot.group.visible = bot.active;
      const spawn = botHomePosition(team, bot.slot);
      bot.group.position.set(spawn.x, 0, spawn.z);
      bot.velocityX = 0;
      bot.velocityY = 0;
      bot.velocityZ = 0;
      bot.onGround = true;
    }
    if (team.pig) {
      team.pig.alive = true;
      team.pig.health = team.pig.maxHealth;
      team.pig.group.traverse((object) => {
        if (!object.isMesh) return;
        if (!object.userData.originalMaterial) object.userData.originalMaterial = object.material;
        object.material = object.userData.originalMaterial;
      });
      updatePigBar(team.pig);
    }
    if (team.islandGroup) team.islandGroup.visible = team.active;
  }
  for (const chip of document.querySelectorAll('.team-chip')) {
    const team = teams.find((entry) => entry.id === chip.dataset.teamId);
    chip.classList.toggle('hidden', !team?.active);
  }
  renderTeamStatus();
}

function createRemotePlayer(player) {
  const team = teams.find((entry) => entry.id === player.teamId);
  if (!team) return null;
  const group = new THREE.Group();
  const bodyMaterial = new THREE.MeshLambertMaterial({ color: team.color, flatShading: true });
  const skinMaterial = new THREE.MeshLambertMaterial({ color: '#ddb38c', flatShading: true });
  const darkMaterial = new THREE.MeshLambertMaterial({ color: team.dark, flatShading: true });
  const body = makeMesh(new THREE.BoxGeometry(0.95, 1.05, 0.65), bodyMaterial, group, 0, 0.83, 0);
  makeMesh(new THREE.BoxGeometry(0.76, 0.68, 0.68), skinMaterial, group, 0, 1.68, 0);
  makeMesh(new THREE.BoxGeometry(0.28, 0.16, 0.08),
    new THREE.MeshBasicMaterial({ color: '#272134' }), group, -0.18, 1.73, 0.36);
  makeMesh(new THREE.BoxGeometry(0.28, 0.16, 0.08),
    new THREE.MeshBasicMaterial({ color: '#272134' }), group, 0.18, 1.73, 0.36);
  const leftLeg = createAnimatedLeg(group, darkMaterial, -1);
  const rightLeg = createAnimatedLeg(group, darkMaterial, 1);
  const swordPivot = createAvatarSword(group);
  group.position.set(player.x, player.y - 1.65, player.z);
  const animation = registerAvatarAnimation(group, body, leftLeg, rightLeg, swordPivot);
  addSpriteLabel(player.name, team.color, group, 0, 2.5, 0, 2.8);
  scene.add(group);
  const remote = {
    id: player.id,
    kind: 'remotePlayer',
    team,
    group,
    health: player.health,
    maxHealth: 100,
    alive: player.alive,
    connected: player.connected,
    targetPosition: new THREE.Vector3(player.x, player.y - 1.65, player.z),
    animation,
    hitAt: -Infinity,
    lastAttackAt: -Infinity,
  };
  for (const child of group.children) child.userData.target = remote;
  remotePlayers.set(player.id, remote);
  return remote;
}

function applyNetworkBlock(block) {
  const key = `${block.x},${block.y},${block.z}`;
  if (networkBlockKeys.has(key)) return false;
  const team = teams.find((entry) => entry.id === block.teamId) ?? playerTeam();
  const mesh = makeBlock(block.x, block.y, block.z,
    new THREE.MeshLambertMaterial({ color: team.color, flatShading: true }));
  networkBlockKeys.add(key);
  networkBlockMeshes.add(mesh);
  return true;
}

function reconcileNetworkPickups(networkPickups = []) {
  const incomingIds = new Set();
  const existingIds = new Set(pickups.map((entry) => entry.id).filter(Boolean));
  for (const pickup of networkPickups) {
    incomingIds.add(pickup.id);
    if (existingIds.has(pickup.id)) continue;
    const colors = { iron: '#d9e1ef', gold: '#ffd04c', emerald: '#55f0a2' };
    const { x, y, z } = pickup.position;
    spawnPickup(pickup.resource, x, z, pickup.amount, colors[pickup.resource] || '#ffffff', y, pickup.teamId, pickup.id);
    existingIds.add(pickup.id);
  }
  for (let index = pickups.length - 1; index >= 0; index--) {
    const pickup = pickups[index];
    if (!pickup.serverManaged || incomingIds.has(pickup.id)) continue;
    scene.remove(pickup.mesh);
    pickups.splice(index, 1);
  }
}

function applyNetworkState(networkState) {
  const networkBlocks = networkState.blocks || [];
  while (networkBlockSyncIndex < networkBlocks.length) {
    applyNetworkBlock(networkBlocks[networkBlockSyncIndex]);
    networkBlockSyncIndex++;
  }
  reconcileNetworkPickups(networkState.pickups || []);
  const playersByTeam = new Map();
  const connectedPlayers = (networkState.players || []).filter((player) => player.connected).length;
  for (const player of networkState.players || []) {
    const teamPlayers = playersByTeam.get(player.teamId) || [];
    teamPlayers.push(player);
    playersByTeam.set(player.teamId, teamPlayers);
    if (player.id === onlinePlayerId) {
      const distance = Math.hypot(
        camera.position.x - player.x,
        camera.position.y - player.y,
        camera.position.z - player.z,
      );
      if (distance > 2.2) camera.position.set(player.x, player.y, player.z);
      const wasAlive = state.alive;
      state.alive = player.alive;
      state.health = player.health;
      let inventoryChanged = false;
      if (player.inventory) {
        for (const [key, value] of Object.entries(player.inventory)) {
          if (state.player[key] !== value) inventoryChanged = true;
          state.player[key] = value;
        }
      }
      if (wasAlive && !player.alive) showToast('Knocked out! Respawning at your pig.');
      if (!wasAlive && player.alive) {
        camera.position.set(player.x, player.y, player.z);
        state.velocityX = 0;
        state.velocityY = 0;
        state.velocityZ = 0;
        showToast('Respawned!');
      }
      $('#health-text').textContent = String(player.health);
      $('#health-fill').style.width = `${player.health}%`;
      updateResources();
      if (inventoryChanged) {
        updateHotbar();
        if (!shopPanel.classList.contains('hidden')) openShop();
      }
    } else {
      let remote = remotePlayers.get(player.id);
      if (!remote) remote = createRemotePlayer(player);
      if (!remote) continue;
      remote.team = teams.find((entry) => entry.id === player.teamId);
      remote.health = player.health;
      remote.alive = player.alive;
      remote.connected = player.connected;
      remote.targetPosition.set(player.x, player.y - 1.65, player.z);
      remote.group.visible = player.alive && player.connected;
    }
  }

  for (const pigStatus of networkState.pigs || []) {
    const team = teams.find((entry) => entry.id === pigStatus.teamId);
    if (!team?.pig) continue;
    const pigWasAlive = team.pig.alive;
    team.pig.health = pigStatus.health;
    team.pig.alive = pigStatus.alive;
    if (team.pig.alive && !pigWasAlive) {
      team.pig.group.traverse((object) => {
        if (object.isMesh && object.userData.originalMaterial) object.material = object.userData.originalMaterial;
      });
    } else if (!team.pig.alive && pigWasAlive) {
      team.pig.group.traverse((object) => {
        if (object.isMesh) object.material = new THREE.MeshLambertMaterial({ color: '#594e65', flatShading: true });
      });
    }
    updatePigBar(team.pig);
    const teamPlayers = playersByTeam.get(team.id) || [];
    team.eliminated = !team.pig.alive && teamPlayers.every((player) => !player.alive);
  }

  $('#network-indicator').textContent = `ONLINE · ${connectedPlayers}`;
  renderTeamStatus();
  if (networkState.winner && state.mode === 'playing') {
    endGame(networkState.winner === localTeamId, networkState.winner === 'draw');
  }
}

function beginOnlineMatch(message) {
  for (const remote of remotePlayers.values()) {
    scene.remove(remote.group);
    remote.group.traverse((object) => {
      object.geometry?.dispose();
      for (const material of (Array.isArray(object.material) ? object.material : [object.material])) {
        material?.map?.dispose();
        material?.dispose();
      }
    });
  }
  remotePlayers.clear();
  for (const mesh of networkBlockMeshes) {
    scene.remove(mesh);
    mesh.material.dispose();
    const meshIndex = buildMeshes.indexOf(mesh);
    if (meshIndex !== -1) buildMeshes.splice(meshIndex, 1);
  }
  if (networkBlockMeshes.size) {
    for (let index = worldSurfaces.length - 1; index >= 0; index--) {
      if (networkBlockMeshes.has(worldSurfaces[index].mesh)) worldSurfaces.splice(index, 1);
    }
  }
  networkBlockMeshes.clear();
  networkBlockKeys.clear();
  networkBlockSyncIndex = 0;
  onlineMatch = true;
  onlineRoomId = message.roomId;
  onlinePlayerId = message.playerId;
  localTeamId = message.teamId;
  selectedMatchMode = message.mode;
  const activeTeamsInMatch = message.teams;
  configureMatchMode(message.mode, activeTeamsInMatch);
  for (const team of activeTeams()) {
    team.shop = team.shop || createShopkeeper(team);
  }
  const localPlayer = message.state.players.find((player) => player.id === onlinePlayerId);
  if (localPlayer) {
    camera.position.set(localPlayer.x, localPlayer.y, localPlayer.z);
    state.yaw = localPlayer.yaw;
    state.pitch = 0;
    camera.rotation.set(state.pitch, state.yaw, 0);
  }
  state.started = true;
  state.mode = 'playing';
  state.alive = true;
  state.health = 100;
  state.velocityX = 0;
  state.velocityY = 0;
  state.velocityZ = 0;
  resetTouchInput();
  state.lastIronGen = performance.now() / 1000;
  state.lastGoldGen = state.lastIronGen;
  state.lastCentralGen = state.lastIronGen;
  for (const pickup of pickups) scene.remove(pickup.mesh);
  pickups.length = 0;
  $('.match-picker').classList.add('hidden');
  queueStatusPanel.classList.add('hidden');
  overlay.classList.add('hidden');
  hud.classList.remove('hidden');
  $('#network-indicator').classList.remove('hidden');
  $('#objective').textContent = `ONLINE · ${matchModes[message.mode].label}`;
  multiplayerStatus.textContent = `Connected to room ${onlineRoomId}.`;
  onlineMatchButton.textContent = 'IN ONLINE MATCH';
  onlineMatchButton.disabled = true;
  returnLobbyButton.classList.add('hidden');
  updateTouchControlsVisibility();
  updateHotbar();
  applyNetworkState(message.state);
  focusGameCanvas();
  requestGamePointerLock();
  showNotice('Online match started. Fight the other players!');
}

function handleMultiplayerMessage(message) {
  if (message.type === 'waiting') {
    multiplayerStatus.textContent = `Finding ${matchModes[message.mode].label}: ${message.players}/${message.needed} players.`;
    queueStatusCopy.textContent = `${multiplayerStatus.textContent} Move around while you wait.`;
  } else if (message.type === 'match_start') {
    beginOnlineMatch(message);
  } else if (message.type === 'state') {
    applyNetworkState(message);
  } else if (message.type === 'hit') {
    const attacker = remotePlayers.get(message.attackerId);
    const hitAt = performance.now() / 1000;
    if (attacker) attacker.lastAttackAt = hitAt;
    const targetName = message.targetType === 'pig'
      ? `${teams.find((team) => team.id === message.targetId)?.name || 'Team'} pig`
      : remotePlayers.get(message.targetId)?.team.name || 'player';
    if (message.attackerId === onlinePlayerId) showToast(`Hit ${targetName}! ${message.health} HP left.`);
    if (message.targetId === onlinePlayerId) {
      state.lastHitAt = hitAt;
      if (attacker) {
        const source = message.attackerPosition || attacker.group.position;
        const dx = camera.position.x - source.x;
        const dz = camera.position.z - source.z;
        const distance = Math.hypot(dx, dz) || 1;
        state.velocityX += dx / distance * 3.5;
        state.velocityZ += dz / distance * 3.5;
        state.velocityY = Math.max(state.velocityY, 2.4);
      }
    } else if (message.targetType === 'player') {
      const target = remotePlayers.get(message.targetId);
      if (target) {
        target.hitAt = hitAt;
        spawnHitEffect(target.group.position.clone().add(new THREE.Vector3(0, 1.05, 0)));
      }
    } else if (message.targetType === 'pig') {
      const pig = teams.find((team) => team.id === message.targetId)?.pig;
      if (pig?.group) spawnHitEffect(pig.group.position.clone().add(new THREE.Vector3(0, 1.1, 0)));
    }
  } else if (message.type === 'block_placed') {
    if (applyNetworkBlock(message.block)) networkBlockSyncIndex++;
  } else if (message.type === 'action_rejected') {
    const messages = {
      already_owned: 'You already own that upgrade.',
      already_full_health: 'You are already at full health.',
      cooldown: 'Wait before using another item.',
      insufficient_resources: 'Not enough resources.',
      invalid_item: 'That item is unavailable.',
      invalid_target: 'That target is unavailable.',
      invalid_position: 'That block placement is invalid.',
      not_alive: 'You cannot do that while knocked out.',
      out_of_range: 'Move closer to your team shop.',
      room_finished: 'This match has ended.',
      unavailable: 'You do not have that item.',
      unsupported_action: 'That item is disabled in online matches for now.',
    };
    showToast(messages[message.reason] || 'The server rejected that action.');
  } else if (message.type === 'error') {
    multiplayerStatus.textContent = message.message;
    queueStatusCopy.textContent = message.message;
  }
}

function sendMultiplayerMessage(message) {
  if (multiplayerSocket?.readyState === WebSocket.OPEN) {
    multiplayerSocket.send(JSON.stringify(message));
  }
}

function startWaitingArea() {
  state.mode = 'waiting';
  state.started = true;
  state.alive = true;
  state.health = 100;
  state.velocityX = 0;
  state.velocityY = 0;
  state.velocityZ = 0;
  state.yaw = Math.PI / 4;
  state.pitch = 0;
  camera.position.set(8, 1.65, 8);
  camera.rotation.set(0, state.yaw, 0);
  for (const bot of entities) bot.group.visible = false;
  $('.match-picker').classList.add('hidden');
  returnLobbyButton.classList.add('hidden');
  $('.online-controls').classList.add('hidden');
  overlay.classList.add('hidden');
  hud.classList.remove('hidden');
  queueStatusPanel.classList.remove('hidden');
  queueStatusCopy.textContent = `Connecting to ${matchModes[selectedMatchMode].label} matchmaking…`;
  $('#objective').textContent = `WAITING · ${matchModes[selectedMatchMode].label}`;
  focusGameCanvas();
  requestGamePointerLock();
  updateTouchControlsVisibility();
}

function returnToLobby(status) {
  if (onlineMatch) {
    onlineMatch = false;
    onlineRoomId = null;
    const socket = multiplayerSocket;
    multiplayerSocket = null;
    socket?.close();
  }
  if (hasGamePointerLock()) document.exitPointerLock?.();
  keys.clear();
  state.mode = 'menu';
  state.started = false;
  state.alive = true;
  state.velocityX = 0;
  state.velocityY = 0;
  state.velocityZ = 0;
  state.touchMoveX = 0;
  state.touchMoveY = 0;
  state.touchSneaking = false;
  state.touchJumpPressed = false;
  state.yaw = -Math.PI / 2;
  state.pitch = 0;
  camera.position.copy(playerPosition);
  camera.rotation.set(state.pitch, state.yaw, 0);
  configureMatchMode(selectedMatchMode);
  resetTouchInput();
  queueStatusPanel.classList.add('hidden');
  hud.classList.add('hidden');
  $('.match-picker').classList.remove('hidden');
  $('.online-controls').classList.remove('hidden');
  overlay.classList.remove('hidden');
  updateStartButtonLabel();
  onlineMatchButton.disabled = false;
  onlineMatchButton.textContent = 'FIND A GAME';
  onlineMatchButton.classList.remove('hidden');
  returnLobbyButton.classList.add('hidden');
  multiplayerStatus.textContent = status;
  updateTouchControlsVisibility();
  onlineMatchButton.focus();
}

function cancelMatchmaking() {
  if (multiplayerSocket && !onlineMatch) {
    const socket = multiplayerSocket;
    multiplayerSocket = null;
    socket.close();
    returnToLobby('Matchmaking cancelled.');
  }
}

function findOnlineMatch() {
  if (multiplayerSocket && !onlineMatch) {
    cancelMatchmaking();
    return;
  }
  if (onlineMatch) return;
  onlineMatchButton.disabled = false;
  onlineMatchButton.textContent = 'CANCEL SEARCH';
  multiplayerStatus.textContent = 'Connecting to multiplayer server…';
  queueStatusPanel.classList.remove('hidden');
  try {
    multiplayerSocket = new WebSocket(multiplayerServerUrl());
  } catch (error) {
    console.error('Could not open the matchmaking connection.', error);
    queueStatusPanel.classList.add('hidden');
    onlineMatchButton.textContent = 'FIND A GAME';
    multiplayerStatus.textContent = 'Could not start matchmaking. Check the server deployment and retry.';
    return;
  }
  const socket = multiplayerSocket;
  startWaitingArea();
  socket.addEventListener('open', () => {
    if (multiplayerSocket !== socket) return;
    socket.send(JSON.stringify({ type: 'join', mode: selectedMatchMode }));
    multiplayerStatus.textContent = 'Connected. Joining matchmaking queue…';
    queueStatusCopy.textContent = multiplayerStatus.textContent;
  });
  socket.addEventListener('message', (event) => {
    if (multiplayerSocket !== socket) return;
    try {
      handleMultiplayerMessage(JSON.parse(event.data));
    } catch (error) {
      console.error('Could not process a multiplayer server message.', error);
      multiplayerStatus.textContent = 'Received an invalid message from the multiplayer server.';
      queueStatusCopy.textContent = multiplayerStatus.textContent;
    }
  });
  socket.addEventListener('error', () => {
    if (multiplayerSocket === socket) {
      multiplayerStatus.textContent = 'Could not connect to the matchmaking server. Try again later.';
      queueStatusCopy.textContent = multiplayerStatus.textContent;
    }
  });
  socket.addEventListener('close', () => {
    if (multiplayerSocket !== socket) return;
    multiplayerSocket = null;
    onlineMatchButton.disabled = false;
    onlineMatchButton.textContent = 'FIND A GAME';
    if (onlineMatch) {
      state.mode = 'disconnected';
      $('#network-indicator').textContent = 'OFFLINE';
      overlayTitle.textContent = 'CONNECTION LOST';
      overlayCopy.textContent = 'The multiplayer server disconnected. Refresh to return to the lobby.';
      $('.match-picker').classList.add('hidden');
      queueStatusPanel.classList.add('hidden');
      startButton.textContent = 'REFRESH';
      returnLobbyButton.classList.remove('hidden');
      onlineMatchButton.classList.add('hidden');
      overlay.classList.remove('hidden');
      multiplayerStatus.textContent = 'Disconnected from the online match.';
      updateTouchControlsVisibility();
    } else {
      returnToLobby('Connection lost while searching. Click Find a Game to retry.');
    }
  });
}

function createWorld() {
  for (const team of teams) createIsland(team.x, team.z, team);
  makeMesh(new THREE.BoxGeometry(26, 2.88, 26), materials.stone, scene, 0, -1.56, 0);
  const centerTop = makeMesh(new THREE.BoxGeometry(26, 0.22, 26), materials.terrainGrass, scene, 0, -0.11, 0);
  addWorldSurface(0, 0, 26, 26, 0, centerTop);
  const centerGen = new THREE.Group();
  centerGen.position.set(0, 0, 0);
  makeMesh(new THREE.BoxGeometry(1.6, 1.1, 1.6), new THREE.MeshLambertMaterial({ color: '#5e466f', flatShading: true }), centerGen, 0, 0.55, 0);
  makeMesh(new THREE.BoxGeometry(0.75, 1.35, 0.75), new THREE.MeshLambertMaterial({ color: '#57e5a3', flatShading: true }), centerGen, 0, 1.6, 0);
  addSpriteLabel('EMERALD GENERATOR', '#74ffc0', centerGen, 0, 3, 0, 5.4);
  scene.add(centerGen);

  for (const team of teams) {
    const generator = new THREE.Group();
    generator.position.set(team.x, 0, team.z);
    makeMesh(new THREE.BoxGeometry(2.1, 0.75, 2.1), new THREE.MeshLambertMaterial({ color: '#6d6b84', flatShading: true }), generator, 0, 0.37, 0);
    makeMesh(new THREE.BoxGeometry(1.25, 0.22, 1.25), new THREE.MeshLambertMaterial({ color: team.color, flatShading: true }), generator, 0, 0.86, 0);
    addSpriteLabel('GENERATOR', team.color, generator, 0, 1.75, 0, 3.3);
    scene.add(generator);
    team.generator = generator;
    team.pig = createPig(team);
    team.shop = createShopkeeper(team);
    for (let slot = 0; slot < 4; slot++) createBot(team, slot);
  }
  createSkyClouds();
  createDecorations();
  configureMatchMode(selectedMatchMode);
}

function createSkyClouds() {
  const cloudMaterial = new THREE.MeshLambertMaterial({ color: '#f5fcff', flatShading: true });
  for (let cloudIndex = 0; cloudIndex < 20; cloudIndex++) {
    const cloud = new THREE.Group();
    const angle = cloudIndex * 2.399;
    const radius = 78 + (cloudIndex % 4) * 12;
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    const y = 30 + (cloudIndex % 5) * 5;
    for (let puff = 0; puff < 5; puff++) {
      const width = 3.8 + ((cloudIndex + puff) % 3) * 1.1;
      makeMesh(new THREE.BoxGeometry(width, 1.1 + (puff % 2) * 0.55, 3.2),
        cloudMaterial, cloud, (puff - 2) * 2.5, (puff % 2) * 0.55, (puff % 3 - 1) * 1.15);
    }
    cloud.position.set(x, y, z);
    scene.add(cloud);
  }
}

function createDecorations() {
  const rockMat = new THREE.MeshLambertMaterial({ color: '#627d82', flatShading: true });
  for (const team of teams) {
    for (let i = 0; i < 4; i++) {
      const angle = (Math.PI * 2 * i) / 4 + 0.45;
      const x = team.x + Math.cos(angle) * 8;
      const z = team.z + Math.sin(angle) * 8;
      const rock = makeMesh(new THREE.DodecahedronGeometry(0.45 + Math.random() * 0.5, 0), rockMat, scene, x, 0.25, z);
      rock.rotation.set(Math.random(), Math.random(), Math.random());
    }
  }
}

function spawnPickup(resource, x, z, amount, color, y = 0.55, teamId = null, id = null) {
  const geometry = resource === 'emerald' ? new THREE.OctahedronGeometry(0.38, 0) : new THREE.BoxGeometry(0.48, 0.48, 0.48);
  const material = new THREE.MeshLambertMaterial({ color, flatShading: true, emissive: color, emissiveIntensity: 0.12 });
  const offset = id ? 0 : 1.2;
  const mesh = makeMesh(geometry, material, scene,
    x + (Math.random() - 0.5) * offset, y, z + (Math.random() - 0.5) * offset);
  pickups.push({ mesh, resource, amount, teamId, id, serverManaged: Boolean(id), startY: y,
    phase: Math.random() * 10, createdAt: performance.now() / 1000 });
}

function updatePickups(time, delta) {
  for (let i = pickups.length - 1; i >= 0; i--) {
    const pickup = pickups[i];
    if (reducedMotionEnabled()) {
      pickup.mesh.rotation.y = 0;
      pickup.mesh.position.y = pickup.startY;
      pickup.mesh.scale.setScalar(1);
    } else {
      pickup.mesh.rotation.y += delta * 1.6;
      pickup.mesh.position.y = pickup.startY + Math.sin(time * 2.8 + pickup.phase) * 0.12;
      pickup.mesh.scale.setScalar(1 + Math.sin(time * 4 + pickup.phase) * 0.045);
    }
    if (!pickup.serverManaged && !onlineMatch && pickup.mesh.position.distanceTo(camera.position) < 1.8) {
      state.player[pickup.resource] += pickup.amount;
      updateResources();
      showToast(`+${pickup.amount} ${capitalize(pickup.resource)}`);
      scene.remove(pickup.mesh);
      pickups.splice(i, 1);
      continue;
    }
    const collector = !onlineMatch && entities.find((bot) => bot.active && bot.alive && pickup.teamId === bot.team.id &&
      pickup.mesh.position.distanceTo(bot.group.position) < 1.7);
    if (collector) {
      collector[pickup.resource] += pickup.amount;
      scene.remove(pickup.mesh);
      pickups.splice(i, 1);
      continue;
    }
    if (!pickup.serverManaged && time - pickup.createdAt > 75) {
      scene.remove(pickup.mesh);
      pickups.splice(i, 1);
    }
  }
}

function makeBlock(x, y, z, material = materials.wool, fromPlayer = false) {
  const mesh = makeMesh(buildBlockGeometry, material, scene, x, y, z);
  mesh.userData.isBlock = true;
  buildMeshes.push(mesh);
  worldSurfaces.push({ x, z, width: 0.5, depth: 0.5, top: y + 0.25, mesh });
  botNavigationRevision++;
  if (fromPlayer) {
    mesh.material = new THREE.MeshLambertMaterial({ color: playerTeam().color, flatShading: true });
  }
  return mesh;
}

function supportAt(x, z, feetY) {
  let highest = -Infinity;
  for (const surface of worldSurfaces) {
    if ((surface.mesh && !surface.mesh.visible) ||
        (surface.teamId && !teams.find((team) => team.id === surface.teamId)?.active)) continue;
    let withinSurface;
    if (surface.octagon) {
      const dx = x - surface.x;
      const dz = z - surface.z;
      const apothem = 13 * Math.cos(Math.PI / 8);
      withinSurface = [0, 1, 2, 3].every((side) => {
        const angle = side * Math.PI / 4;
        return Math.abs(dx * Math.cos(angle) + dz * Math.sin(angle)) <= apothem;
      });
    } else {
      withinSurface = Math.abs(x - surface.x) <= surface.width / 2 + 0.01 &&
        Math.abs(z - surface.z) <= surface.depth / 2 + 0.01;
    }
    if (withinSurface &&
        surface.top <= feetY + 0.22 && surface.top > highest) {
      highest = surface.top;
    }
  }
  return highest;
}

function getBlockPlacement() {
  const reach = 7;
  raycaster.setFromCamera(centerScreen, camera);
  raycaster.far = reach;
  const targets = worldSurfaces.filter((surface) => surface.mesh &&
    (!surface.teamId || teams.find((team) => team.id === surface.teamId)?.active)).map((surface) => surface.mesh);
  const hits = raycaster.intersectObjects(targets, false);
  const hit = hits[0];
  if (!hit || hit.distance > reach) {
    return state.onGround && state.pitch < -0.12
      ? getEdgeBridgePlacement(reach)
      : null;
  }
  const normal = hit.face.normal.clone().transformDirection(hit.object.matrixWorld);
  const snapForward = (coordinate) => Math.floor(coordinate * 2) * 0.5 + 0.25;
  const snapBackward = (coordinate) => Math.ceil(coordinate * 2) * 0.5 - 0.25;
  const targetSurface = worldSurfaces.find((surface) => surface.mesh === hit.object);
  const x = normal.x > 0.5 ? snapForward(hit.point.x) :
    normal.x < -0.5 ? snapBackward(hit.point.x) : snapForward(hit.point.x);
  const z = normal.z > 0.5 ? snapForward(hit.point.z) :
    normal.z < -0.5 ? snapBackward(hit.point.z) : snapForward(hit.point.z);
  const y = Math.abs(normal.y) > 0.5
    ? (normal.y > 0 ? snapForward(hit.point.y) : snapBackward(hit.point.y))
    : (targetSurface ? targetSurface.top - 0.25 : snapBackward(hit.point.y));
  const playerFeet = camera.position.y - 1.65;
  const overlapsPlayer = Math.abs(x - camera.position.x) < 0.25 + 0.3 &&
    Math.abs(z - camera.position.z) < 0.25 + 0.3 &&
    y - 0.25 < camera.position.y && y + 0.25 > playerFeet + 0.05;
  const inFrontOfPlayer = (x - camera.position.x) * -Math.sin(state.yaw) +
    (z - camera.position.z) * -Math.cos(state.yaw) > 0.1;
  const createsBridgeFromEdge = state.onGround && inFrontOfPlayer &&
    Math.abs(y + 0.25 - playerFeet) < 0.12 &&
    supportAt(x, z, playerFeet + 0.22) === -Infinity;
  const occupied = worldSurfaces.some((surface) =>
    Math.abs(surface.x - x) < (surface.width + 0.5) / 2 &&
    Math.abs(surface.z - z) < (surface.depth + 0.5) / 2 &&
    Math.abs(surface.top - (y + 0.25)) < 0.06);
  return { x, y, z, reach, normal, facePoint: hit.point.clone(), valid: y >= -3 && y <= 15 &&
    (!overlapsPlayer || createsBridgeFromEdge) && !occupied };
}

function getEdgeBridgePlacement(reach) {
  const feet = camera.position.y - 1.65;
  const support = supportAt(camera.position.x, camera.position.z, feet + 0.22);
  if (support === -Infinity) return null;
  const forwardX = -Math.sin(state.yaw);
  const forwardZ = -Math.cos(state.yaw);
  const x = Math.floor((camera.position.x + forwardX * 0.5) * 2) * 0.5 + 0.25;
  const z = Math.floor((camera.position.z + forwardZ * 0.5) * 2) * 0.5 + 0.25;
  const y = support - 0.25;
  const distance = Math.hypot(x - camera.position.x, y + 0.25 - camera.position.y, z - camera.position.z);
  const unsupported = supportAt(x, z, feet + 0.22) === -Infinity;
  const occupied = worldSurfaces.some((surface) =>
    Math.abs(surface.x - x) < (surface.width + 0.5) / 2 &&
    Math.abs(surface.z - z) < (surface.depth + 0.5) / 2 &&
    Math.abs(surface.top - (y + 0.25)) < 0.06);
  const ahead = (x - camera.position.x) * forwardX + (z - camera.position.z) * forwardZ > 0.05;
  if (!unsupported || !ahead || distance > reach || occupied) return null;
  return { x, y, z, reach, valid: true };
}

function updateBuildPreview() {
  if (state.mode !== 'playing' || !state.alive || state.selected !== 1 || shopPanel && !shopPanel.classList.contains('hidden')) {
    buildPreview.visible = false;
    placementFacePreview.visible = false;
    $('#crosshair').classList.remove('building', 'build-blocked');
    return;
  }
  const placement = getBlockPlacement();
  if (!placement) {
    buildPreview.visible = false;
    placementFacePreview.visible = false;
    $('#crosshair').classList.remove('building', 'build-blocked');
    return;
  }
  buildPreview.position.set(placement.x, placement.y, placement.z);
  buildPreview.material.color.set(placement.valid ? '#5dffc0' : '#ff5d70');
  buildPreview.visible = true;
  placementFacePreview.visible = Boolean(placement.normal && placement.facePoint);
  if (placementFacePreview.visible) {
    placementFacePreview.position.copy(placement.facePoint).addScaledVector(placement.normal, 0.012);
    placementFacePreview.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), placement.normal);
    placementFacePreview.material.color.set(placement.valid ? '#5dffc0' : '#ff5d70');
    const axis = Math.abs(placement.normal.x) > 0.5
      ? (placement.normal.x > 0 ? 'east' : 'west')
      : Math.abs(placement.normal.z) > 0.5
        ? (placement.normal.z > 0 ? 'south' : 'north')
        : (placement.normal.y > 0 ? 'top' : 'underside');
    $('#crosshair').setAttribute('aria-label', `${placement.valid ? 'Valid' : 'Blocked'} block placement on ${axis} face`);
  } else if (placement.valid) {
    $('#crosshair').setAttribute('aria-label', 'Valid edge block placement');
  } else {
    $('#crosshair').setAttribute('aria-label', 'Blocked block placement');
  }
  $('#crosshair').classList.toggle('building', placement.valid);
  $('#crosshair').classList.toggle('build-blocked', !placement.valid);
}

function buildAtAim() {
  if (state.player.blocks < 1) return showToast('You are out of wool.');
  const placement = getBlockPlacement();
  if (!placement) {
    return showToast('Aim at a surface within 7 blocks.');
  }
  if (!placement.valid) return showToast('That space is occupied or too close.');
  if (onlineMatch) {
    sendMultiplayerMessage({
      type: 'block',
      position: { x: placement.x, y: placement.y, z: placement.z },
    });
    return;
  }
  makeBlock(placement.x, placement.y, placement.z, materials.wool, true);
  state.player.blocks--;
  updateHotbar();
}

function getAimTarget() {
  raycaster.setFromCamera(centerScreen, camera);
  raycaster.far = 5.5;
  const hit = raycaster.intersectObjects(getCombatTargets(), false)[0];
  return hit?.object.userData.target ?? null;
}

function getCombatTargets() {
  const targets = [];
  for (const pig of pigs) if (pig.alive && pig.team.active) targets.push(...pig.group.children);
  for (const entity of entities) if (entity.active && entity.alive) targets.push(...entity.group.children);
  for (const remote of remotePlayers.values()) {
    if (remote.alive && remote.connected) targets.push(...remote.group.children);
  }
  return targets;
}

function shootArrow() {
  if (onlineMatch) {
    return showToast('Bows are disabled in online matches for now.');
  }
  if (!state.player.hasBow) return showToast('Buy a bow from the shop first.');
  if (state.player.arrows < 1) return showToast('You are out of arrows.');
  const now = performance.now() / 1000;
  if (now - state.lastAttack < 0.38) return;
  state.lastAttack = now;
  const direction = new THREE.Vector3();
  camera.getWorldDirection(direction);
  const origin = camera.position.clone().addScaledVector(direction, 0.65);
  const shaft = makeMesh(new THREE.BoxGeometry(0.07, 0.07, 0.72),
    new THREE.MeshLambertMaterial({ color: '#c1a16d', flatShading: true }), scene, origin.x, origin.y, origin.z);
  shaft.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction);
  arrows.add({ mesh: shaft, direction, velocity: 28, age: 0, previous: origin.clone() });
  state.player.arrows--;
  updateHotbar();
}

function updateArrows(delta) {
  for (const arrow of [...arrows]) {
    arrow.age += delta;
    const step = arrow.velocity * delta;
    arrow.mesh.position.addScaledVector(arrow.direction, step);
    raycaster.set(arrow.previous, arrow.direction);
    raycaster.far = step + 0.12;
    const hit = raycaster.intersectObjects(getCombatTargets(), false)[0];
    if (hit) {
      const target = hit.object.userData.target;
      if (target?.team.id !== localTeamId) {
        if (onlineMatch) {
          sendMultiplayerAttack(target);
          scene.remove(arrow.mesh);
          arrows.delete(arrow);
          continue;
        }
        if (pigs.includes(target)) damagePig(target, 26, 'Arrow');
        else if (target?.health) {
          target.health = Math.max(0, target.health - Math.ceil(26 * (1 - (target.armor || 0))));
          target.hitAt = performance.now() / 1000;
          knockbackBot(target, arrow.mesh.position.x, arrow.mesh.position.z, 3.2);
          if (target.health === 0) knockOutBot(target, target.hitAt);
          else showToast(`Arrow hit ${target.team.name} for 26`);
        }
      }
      scene.remove(arrow.mesh);
      arrows.delete(arrow);
    } else if (arrow.age > 1.1) {
      scene.remove(arrow.mesh);
      arrows.delete(arrow);
    } else arrow.previous.copy(arrow.mesh.position);
  }
}

function hasGamePointerLock() {
  return document.pointerLockElement === canvas;
}

function focusGameCanvas() {
  try {
    canvas.focus({ preventScroll: true });
  } catch {
    canvas.focus();
  }
}

function requestGamePointerLock(pointerX = window.innerWidth / 2, pointerY = window.innerHeight / 2) {
  focusGameCanvas();
  state.pointerLockPending = true;
  state.lastPointerX = pointerX;
  state.lastPointerY = pointerY;
  if (typeof canvas.requestPointerLock !== 'function') {
    state.pointerLockPending = false;
    state.fallbackAvailable = true;
    showNotice('Mouse lock is unavailable. Use arrow keys to look, or drag to turn.');
    return;
  }
  try {
    const request = canvas.requestPointerLock();
    if (request && typeof request.catch === 'function') {
      request.catch(() => {
        state.pointerLockPending = false;
        state.fallbackAvailable = true;
        showNotice('Mouse lock was blocked. Use arrow keys to look, or drag to turn.');
      });
    }
  } catch {
    state.pointerLockPending = false;
    state.fallbackAvailable = true;
    showNotice('Mouse lock was blocked. Use arrow keys to look, or drag to turn.');
  }
}

function attack(fromKeyboard = false) {
  if (state.mode !== 'playing' || (!fromKeyboard && !hasGamePointerLock() && !state.fallbackDragging)) return;
  if (state.selected === 4) return shootArrow();
  if (state.selected !== 0) return;
  const now = performance.now() / 1000;
  if (now - state.lastAttack < 0.48) return;
  state.lastAttack = now;
  attackAnimationStartedAt = now;
  const target = getAimTarget();
  if (!target || target.team?.id === localTeamId) return;
  if (onlineMatch) {
    sendMultiplayerAttack(target);
    return;
  }

  const damage = state.player.weapon;
  if (pigs.includes(target)) {
    damagePig(target, damage, 'You');
    return;
  }
  if (target.maxHealth) {
    target.health = Math.max(0, target.health - Math.ceil(damage * (1 - (target.armor || 0))));
    target.hitAt = now;
    knockbackBot(target, camera.position.x, camera.position.z, 4);
    if (target.health === 0) {
      knockOutBot(target, now);
    } else showToast(`Hit ${target.team.name} for ${damage}`);
    updatePigBar(target);
  }
}

function sendMultiplayerAttack(target) {
  const targetType = pigs.includes(target) ? 'pig' : 'player';
  const targetId = targetType === 'pig' ? target.team.id : target.id;
  sendMultiplayerMessage({ type: 'attack', target: { type: targetType, id: targetId } });
}

function knockOutBot(bot, now) {
  bot.alive = false;
  bot.group.visible = false;
  if (bot.team.pig.alive) {
    bot.respawnAt = now + 4;
    showToast(`${bot.team.name} bot down! It will respawn.`);
  } else if (bot.team.bots.every((teammate) => !teammate.active || !teammate.alive) &&
      (!bot.team.playerControlled || !state.alive)) {
    bot.team.eliminated = true;
    showToast(`${bot.team.name} team eliminated!`);
  }
  renderTeamStatus();
  checkEndState();
}

function updatePigBar(target) {
  if (!target.group) return;
  if (target.barFill) {
    const ratio = Math.max(0, target.health / target.maxHealth);
    target.barFill.scale.x = ratio;
    target.barFill.position.x = -(1 - ratio) * 1.2;
    target.barFill.material.color.set(target.health < target.maxHealth * 0.35 ? '#ff5b67' : target.team.color);
  }
}

function damagePig(pig, amount, attacker) {
  if (!pig.alive) return;
  pig.health = Math.max(0, pig.health - amount);
  spawnHitEffect(pig.group.position.clone().add(new THREE.Vector3(0, 1.1, 0)));
  updatePigBar(pig);
  showToast(`${attacker} damaged ${pig.team.name}'s pig! (${pig.health} HP)`);
  if (pig.health <= 0) {
    pig.alive = false;
    pig.group.traverse((obj) => {
      if (obj.isMesh) obj.material = new THREE.MeshLambertMaterial({ color: '#594e65', flatShading: true });
    });
    pig.team.pig = pig;
    showToast(`${pig.team.name}'s pig is gone! No more respawns.`);
    checkEliminations();
  }
}

function knockbackBot(bot, sourceX, sourceZ, force) {
  if (!bot?.group || !Number.isFinite(bot.velocityX)) return;
  const dx = bot.group.position.x - sourceX;
  const dz = bot.group.position.z - sourceZ;
  const distance = Math.hypot(dx, dz);
  if (distance < 0.001) return;
  bot.velocityX += dx / distance * force;
  bot.velocityZ += dz / distance * force;
  bot.velocityY = Math.max(bot.velocityY, 2.8);
  bot.onGround = false;
}

function checkEliminations() {
  for (const team of activeTeams()) {
    const botsOut = team.bots.every((bot) => !bot.active || !bot.alive);
    const playerOut = team.playerControlled && !state.alive;
    if (!team.pig.alive && botsOut && playerOut) {
      team.eliminated = true;
    }
  }
  renderTeamStatus();
  checkEndState();
}

function checkEndState() {
  if (!state.started || state.mode !== 'playing') return;
  if (onlineMatch) return;
  const userTeam = playerTeam();
  if (!userTeam.pig.alive && !state.alive &&
      userTeam.bots.every((bot) => !bot.active || !bot.alive)) userTeam.eliminated = true;
  const remaining = activeTeams().filter((team) => !team.eliminated);
  if (userTeam.eliminated) return endGame(false);
  if (remaining.length === 1 && remaining[0] === userTeam) endGame(true);
}

function endGame(won, draw = false) {
  if (onlineMatch) {
    onlineMatch = false;
    onlineRoomId = null;
    const socket = multiplayerSocket;
    multiplayerSocket = null;
    socket?.close();
  }
  state.mode = won ? 'won' : 'lost';
  document.exitPointerLock?.();
  shopPanel.classList.add('hidden');
  overlayTitle.textContent = draw ? 'MATCH DRAW' : won ? 'VICTORY!' : 'PIG DOWN';
  overlayCopy.textContent = draw ? 'Every team was eliminated at the same time.'
    : won ? 'All rival teams are out. The void is yours.' : 'Your pig is gone, and your last life was spent.';
  startButton.textContent = 'PLAY AGAIN';
  returnLobbyButton.classList.remove('hidden');
  $('.online-controls').classList.add('hidden');
  updateTouchControlsVisibility();
  overlay.classList.remove('hidden');
}

function spawnPlayer() {
  const team = playerTeam();
  camera.position.set(team.x, 1.65, team.z);
  state.velocityY = 0;
  state.velocityX = 0;
  state.velocityZ = 0;
  state.health = 100;
  state.alive = true;
  $('#health-text').textContent = '100';
  $('#health-fill').style.width = '100%';
}

function hurtPlayer(amount, sourceX = camera.position.x, sourceZ = camera.position.z) {
  if (!state.alive || state.mode !== 'playing') return;
  state.lastHitAt = performance.now() / 1000;
  state.health = Math.max(0, state.health - Math.ceil(amount * (1 - state.player.armor)));
  const awayX = camera.position.x - sourceX;
  const awayZ = camera.position.z - sourceZ;
  const awayLength = Math.hypot(awayX, awayZ);
  if (awayLength > 0.001) {
    state.velocityX += awayX / awayLength * 4;
    state.velocityZ += awayZ / awayLength * 4;
    state.velocityY = Math.max(state.velocityY, 2.8);
  }
  $('#health-text').textContent = String(state.health);
  $('#health-fill').style.width = `${state.health}%`;
  if (state.health === 0) {
    state.alive = false;
    if (playerTeam().pig.alive) {
      state.respawnAt = performance.now() / 1000 + 5;
      showToast('You were knocked out! Respawning in 5 seconds…');
    } else {
      showToast('Your pig is gone. No respawns left.');
      checkEliminations();
      checkEndState();
    }
  }
}

function botRespawn(bot) {
  bot.alive = true;
  bot.health = 100;
  bot.objectiveType = null;
  bot.objectiveTarget = null;
  bot.objectiveKey = null;
  bot.nextObjectiveAt = 0;
  bot.route = null;
  bot.routeIndex = 0;
  bot.routeRevision = -1;
  bot.velocityX = 0;
  bot.velocityZ = 0;
  bot.velocityY = 0;
  bot.onGround = true;
  bot.group.visible = true;
  const spawn = botHomePosition(bot.team, bot.slot);
  bot.group.position.set(spawn.x, 0, spawn.z);
  showToast(`${bot.team.name} bot respawned.`);
}

function movePlayer(delta) {
  if (!state.alive) {
    $('#stance-indicator').classList.add('hidden');
    if (!onlineMatch && performance.now() / 1000 >= state.respawnAt && playerTeam().pig.alive) spawnPlayer();
    return;
  }
  const wasGrounded = state.onGround;
  const forwardInput = (keys.has(bindings.forward) ? 1 : 0) - (keys.has(bindings.back) ? 1 : 0) + state.touchMoveY;
  const sideInput = (keys.has(bindings.right) ? 1 : 0) - (keys.has(bindings.left) ? 1 : 0) + state.touchMoveX;
  const inputLength = Math.hypot(forwardInput, sideInput) || 1;
  const sneaking = state.touchSneaking || keys.has(bindings.sneak) ||
    (bindings.sneak === 'ShiftLeft' && keys.has('ShiftRight'));
  const boosted = performance.now() / 1000 < state.player.speedBoostUntil;
  const speed = (sneaking ? 1.7 : 6) * (boosted && !sneaking ? 1.35 : 1);
  const desiredX = (-Math.sin(state.yaw) * forwardInput + Math.cos(state.yaw) * sideInput) / inputLength * speed;
  const desiredZ = (-Math.cos(state.yaw) * forwardInput - Math.sin(state.yaw) * sideInput) / inputLength * speed;
  const acceleration = state.onGround ? 34 : 10;
  state.velocityX = THREE.MathUtils.damp(state.velocityX, desiredX, inputLength > 0 ? acceleration : (state.onGround ? 18 : 1.8), delta);
  state.velocityZ = THREE.MathUtils.damp(state.velocityZ, desiredZ, inputLength > 0 ? acceleration : (state.onGround ? 18 : 1.8), delta);
  const feet = camera.position.y - 1.65;
  const currentSupport = supportAt(camera.position.x, camera.position.z, feet + 0.22);
  let nextX = camera.position.x + state.velocityX * delta;
  let nextZ = camera.position.z + state.velocityZ * delta;
  if (isBlocked(nextX, camera.position.z, feet)) {
    nextX = camera.position.x;
    state.velocityX = 0;
  }
  if (isBlocked(nextX, nextZ, feet)) {
    nextZ = camera.position.z;
    state.velocityZ = 0;
  }
  if (sneaking && state.onGround && currentSupport > -Infinity &&
      supportAt(nextX, nextZ, feet + 0.22) < currentSupport - 0.05) {
    nextX = camera.position.x;
    nextZ = camera.position.z;
    state.velocityX = 0;
    state.velocityZ = 0;
  }
  camera.position.x = nextX;
  camera.position.z = nextZ;
  $('#stance-indicator').classList.toggle('hidden', !sneaking);
  if ((keys.has(bindings.jump) || state.touchJumpPressed) && state.onGround) {
    state.velocityY = 8.2;
    state.onGround = false;
  }
  state.touchJumpPressed = false;
  state.velocityY -= 21 * delta;
  camera.position.y += state.velocityY * delta;
  const newFeet = camera.position.y - 1.65;
  const support = supportAt(camera.position.x, camera.position.z, newFeet);
  if (support > -Infinity && newFeet <= support && state.velocityY < 0) {
    camera.position.y = support + 1.65;
    state.velocityY = 0;
    state.onGround = true;
  } else state.onGround = false;
  if (!wasGrounded && state.onGround) state.lastLandingAt = performance.now() / 1000;
  if (!onlineMatch && camera.position.y < -24) {
    hurtPlayer(100);
    if (state.alive) {
      camera.position.set(-42, 1.65, 0);
      state.velocityY = 0;
      state.velocityX = 0;
      state.velocityZ = 0;
    }
  }
}

function isBlocked(x, z, feet) {
  for (const block of buildMeshes) {
    const top = block.position.y + 0.25;
    const bottom = block.position.y - 0.25;
    if (feet < bottom + 0.05 && feet + 1.8 > bottom + 0.05 &&
        Math.abs(x - block.position.x) < 0.55 && Math.abs(z - block.position.z) < 0.55 &&
        feet < top - 0.05) {
      const isFloorBlock = Math.abs(feet - bottom) < 0.08;
      if (!isFloorBlock) return true;
    }
  }
  return false;
}

function botNavigationKey(gx, gz) {
  return `${gx},${gz}`;
}

function botNavigationNodeMap() {
  if (botNavigationSurfaceCache && botNavigationCacheRevision === botNavigationRevision) {
    return botNavigationSurfaceCache;
  }
  const nodes = new Map();
  const blockers = new Map();
  for (const surface of worldSurfaces) {
    if ((surface.mesh && !surface.mesh.visible) ||
        (surface.teamId && !teams.find((team) => team.id === surface.teamId)?.active)) continue;
    const minGX = Math.ceil((surface.x - surface.width / 2 - 0.25) * 2);
    const maxGX = Math.floor((surface.x + surface.width / 2 - 0.25) * 2);
    const minGZ = Math.ceil((surface.z - surface.depth / 2 - 0.25) * 2);
    const maxGZ = Math.floor((surface.z + surface.depth / 2 - 0.25) * 2);
    for (let gx = minGX; gx <= maxGX; gx++) {
      const x = 0.25 + gx * 0.5;
      for (let gz = minGZ; gz <= maxGZ; gz++) {
        const z = 0.25 + gz * 0.5;
        if (surface.octagon) {
          const dx = x - surface.x;
          const dz = z - surface.z;
          const apothem = 13 * Math.cos(Math.PI / 8);
          if (![0, 1, 2, 3].every((side) => {
            const angle = side * Math.PI / 4;
            return Math.abs(dx * Math.cos(angle) + dz * Math.sin(angle)) <= apothem;
          })) continue;
        }
        const key = botNavigationKey(gx, gz);
        const prior = nodes.get(key);
        if (!prior || surface.top > prior.y) nodes.set(key, { gx, gz, x, z, y: surface.top });
      }
    }
  }
  for (const block of buildMeshes) {
    const centerGX = Math.round((block.position.x - 0.25) * 2);
    const centerGZ = Math.round((block.position.z - 0.25) * 2);
    for (let gx = centerGX - 1; gx <= centerGX + 1; gx++) {
      for (let gz = centerGZ - 1; gz <= centerGZ + 1; gz++) {
        const key = botNavigationKey(gx, gz);
        if (!blockers.has(key)) blockers.set(key, []);
        blockers.get(key).push(block);
      }
    }
  }
  botNavigationSurfaceCache = nodes;
  botNavigationBlockerCache = blockers;
  botNavigationCacheRevision = botNavigationRevision;
  return nodes;
}

function isBotNavigationBlocked(node) {
  for (const block of botNavigationBlockerCache.get(botNavigationKey(node.gx, node.gz)) || []) {
    const top = block.position.y + 0.25;
    const bottom = block.position.y - 0.25;
    if (node.y < bottom + 0.05 && node.y + 1.8 > bottom + 0.05 &&
        Math.abs(node.x - block.position.x) < 0.55 &&
        Math.abs(node.z - block.position.z) < 0.55 && node.y < top - 0.05) return true;
  }
  return false;
}

function botRouteHeapPush(heap, entry) {
  heap.push(entry);
  let index = heap.length - 1;
  while (index > 0) {
    const parent = Math.floor((index - 1) / 2);
    if (heap[parent].score <= entry.score) break;
    heap[index] = heap[parent];
    index = parent;
  }
  heap[index] = entry;
}

function botRouteHeapPop(heap) {
  const first = heap[0];
  const last = heap.pop();
  if (heap.length && last) {
    let index = 0;
    while (true) {
      const left = index * 2 + 1;
      const right = left + 1;
      if (left >= heap.length) break;
      const child = right < heap.length && heap[right].score < heap[left].score ? right : left;
      if (heap[child].score >= last.score) break;
      heap[index] = heap[child];
      index = child;
    }
    heap[index] = last;
  }
  return first;
}

function nearestBotNavigationNode(nodes, x, z, feet, radius) {
  const centerGX = Math.round((x - 0.25) * 2);
  const centerGZ = Math.round((z - 0.25) * 2);
  const radiusCells = Math.ceil(radius * 2);
  let closest = null;
  let closestScore = Infinity;
  for (let gx = centerGX - radiusCells; gx <= centerGX + radiusCells; gx++) {
    for (let gz = centerGZ - radiusCells; gz <= centerGZ + radiusCells; gz++) {
      const node = nodes.get(botNavigationKey(gx, gz));
      if (!node || Math.abs(node.y - feet) > 0.85 || isBotNavigationBlocked(node)) continue;
      const distance = Math.hypot(node.x - x, node.z - z);
      if (distance > radius) continue;
      const score = distance + Math.abs(node.y - feet) * 1.5;
      if (score < closestScore) {
        closest = node;
        closestScore = score;
      }
    }
  }
  return closest;
}

function botRouteHeuristic(gx, gz, goalGX, goalGZ) {
  const dx = Math.abs(goalGX - gx);
  const dz = Math.abs(goalGZ - gz);
  return 0.5 * (Math.max(dx, dz) + (Math.SQRT2 - 1) * Math.min(dx, dz));
}

function findBotRoute(bot, target) {
  const targetX = target.group?.position.x ?? target.mesh?.position.x ?? target.x;
  const targetZ = target.group?.position.z ?? target.mesh?.position.z ?? target.z;
  if (!Number.isFinite(targetX) || !Number.isFinite(targetZ)) return { waypoint: null, deferred: false };
  const nodes = botNavigationNodeMap();
  const start = nearestBotNavigationNode(nodes, bot.group.position.x, bot.group.position.z, bot.group.position.y, 1.25);
  const targetFeet = target.kind === 'player'
    ? target.group.position.y - 1.65
    : target.group?.position.y ?? target.mesh?.position.y ?? bot.group.position.y;
  const goal = nearestBotNavigationNode(nodes, targetX, targetZ, targetFeet, 2.2);
  if (!start || !goal) return null;

  const margin = 14;
  const minGX = Math.max(-145, Math.min(start.gx, goal.gx) - margin);
  const maxGX = Math.min(145, Math.max(start.gx, goal.gx) + margin);
  const minGZ = Math.max(-145, Math.min(start.gz, goal.gz) - margin);
  const maxGZ = Math.min(145, Math.max(start.gz, goal.gz) + margin);
  const directions = [
    [1, 0], [-1, 0], [0, 1], [0, -1],
    [1, 1], [1, -1], [-1, 1], [-1, -1],
  ];
  const startKey = `${start.gx},${start.gz},0,0,0`;
  const open = [];
  const bestCost = new Map([[startKey, 0]]);
  const parents = new Map();
  const states = new Map([[startKey, { ...start, gap: 0, bridgeY: 0, bridgeCount: 0, key: startKey }]]);
  botRouteHeapPush(open, { key: startKey, score: botRouteHeuristic(start.gx, start.gz, goal.gx, goal.gz) });
  let foundKey = null;
  let expanded = 0;

  while (open.length && expanded < 18000) {
    const entry = botRouteHeapPop(open);
    const current = states.get(entry.key);
    if (!current || entry.score > bestCost.get(entry.key) + botRouteHeuristic(current.gx, current.gz, goal.gx, goal.gz) + 0.001) continue;
    expanded++;
    if (current.gx === goal.gx && current.gz === goal.gz) {
      foundKey = current.key;
      break;
    }

    for (const [stepX, stepZ] of directions) {
      const gx = current.gx + stepX;
      const gz = current.gz + stepZ;
      if (gx < minGX || gx > maxGX || gz < minGZ || gz > maxGZ) continue;
      const neighbor = nodes.get(botNavigationKey(gx, gz));
      if (neighbor && isBotNavigationBlocked(neighbor)) continue;
      if (Math.abs(stepX) + Math.abs(stepZ) === 2 && neighbor) {
        const horizontal = nodes.get(botNavigationKey(current.gx + stepX, current.gz));
        const vertical = nodes.get(botNavigationKey(current.gx, current.gz + stepZ));
        const horizontalOpen = horizontal && Math.abs(horizontal.y - current.y) <= 0.72 &&
          !isBotNavigationBlocked(horizontal);
        const verticalOpen = vertical && Math.abs(vertical.y - current.y) <= 0.72 &&
          !isBotNavigationBlocked(vertical);
        if (!horizontalOpen && !verticalOpen) continue;
      }

      let gap = current.gap;
      let bridgeY = current.bridgeY;
      let bridgeCount = current.bridgeCount;
      if (neighbor) {
        const referenceY = current.gap > 0 ? current.bridgeY : current.y;
        if (Math.abs(neighbor.y - referenceY) > (current.gap > 0 ? 1.2 : 0.72)) continue;
        gap = 0;
        bridgeY = 0;
      } else {
        if (current.gap === 0) bridgeY = current.y;
        gap += 1;
        if (gap > Math.max(3, bot.blocks + 3)) continue;
        if (gap === 4) bridgeCount += 4;
        else if (gap > 4) bridgeCount++;
        if (bridgeCount > bot.blocks) continue;
      }

      const key = `${gx},${gz},${gap},${Math.round(bridgeY * 4)},${bridgeCount}`;
      const distance = Math.hypot(stepX, stepZ) * 0.5;
      const stepCost = distance * (neighbor ? 1 + Math.abs((neighbor.y ?? current.y) - current.y) * 1.2 : 3.4);
      const nextCost = bestCost.get(current.key) + stepCost;
      if (nextCost >= (bestCost.get(key) ?? Infinity)) continue;
      bestCost.set(key, nextCost);
      const next = { gx, gz, x: 0.25 + gx * 0.5, z: 0.25 + gz * 0.5,
        y: neighbor?.y ?? current.y, gap, bridgeY, bridgeCount, key };
      states.set(key, next);
      parents.set(key, current.key);
      botRouteHeapPush(open, { key, score: nextCost + botRouteHeuristic(gx, gz, goal.gx, goal.gz) });
    }
  }

  if (!foundKey) return null;
  const path = [];
  for (let key = foundKey; key && key !== startKey; key = parents.get(key)) {
    const node = states.get(key);
    if (node) path.push({ x: node.x, z: node.z, y: node.y, bridge: node.gap > 0 });
  }
  path.reverse();
  return { waypoints: path, targetX, targetZ, revision: botNavigationRevision };
}

function updateBotRoute(bot, target, now, routeBudget) {
  const targetX = target.group?.position.x ?? target.mesh?.position.x ?? target.x;
  const targetZ = target.group?.position.z ?? target.mesh?.position.z ?? target.z;
  if (!Number.isFinite(targetX) || !Number.isFinite(targetZ)) return null;
  const currentWaypoint = bot.route?.waypoints[bot.routeIndex];
  if (currentWaypoint && Math.hypot(currentWaypoint.x - bot.group.position.x,
    currentWaypoint.z - bot.group.position.z) < 0.34) {
    bot.routeIndex++;
    bot.routeLastProgressAt = now;
  }
  const nextWaypoint = bot.route?.waypoints[bot.routeIndex];
  const distance = nextWaypoint
    ? Math.hypot(nextWaypoint.x - bot.group.position.x, nextWaypoint.z - bot.group.position.z)
    : Infinity;
  if (Number.isFinite(bot.routeLastDistance) && distance < bot.routeLastDistance - 0.08) {
    bot.routeLastProgressAt = now;
  }
  const stalled = nextWaypoint && now - bot.routeLastProgressAt > 1.6;
  const targetMoved = Math.hypot(targetX - bot.routeTargetX, targetZ - bot.routeTargetZ) > 1.2;
  const needsRoute = !bot.route || bot.routeRevision !== botNavigationRevision ||
    bot.routeObjectiveKey !== bot.objectiveKey || now >= bot.routeNextPlanAt || targetMoved || stalled;
  if (needsRoute) {
    const routeIsStillUsable = bot.route && bot.routeRevision === botNavigationRevision &&
      bot.routeObjectiveKey === bot.objectiveKey;
    if (routeBudget.used) {
      return {
        waypoint: routeIsStillUsable ? bot.route.waypoints[bot.routeIndex] ?? null : null,
        deferred: !routeIsStillUsable,
      };
    }
    routeBudget.used = true;
    bot.route = findBotRoute(bot, target);
    bot.routeIndex = 0;
    bot.routeRevision = botNavigationRevision;
    bot.routeNextPlanAt = now + (bot.route ? 0.85 : 0.35);
    bot.routeTargetX = targetX;
    bot.routeTargetZ = targetZ;
    bot.routeObjectiveKey = bot.objectiveKey;
    bot.routeLastProgressAt = now;
    bot.routeLastDistance = Infinity;
  }
  const waypoint = bot.route?.waypoints[bot.routeIndex] ?? null;
  bot.routeLastDistance = waypoint
    ? Math.hypot(waypoint.x - bot.group.position.x, waypoint.z - bot.group.position.z)
    : Infinity;
  return { waypoint, deferred: false };
}

function purchaseBotGear(bot, now) {
  if (now < bot.nextPurchaseAt) return;
  bot.nextPurchaseAt = now + 3;
  const inCombat = bot.objectiveType === 'defend' || bot.objectiveType === 'engage';
  const options = [];
  const desiredBlockStock = bot.objectiveType === 'raid' ? 80 : 72;
  if (bot.iron >= 4 && bot.blocks < desiredBlockStock) {
    options.push({ kind: 'blocks', score: 1.1 + (desiredBlockStock - bot.blocks) / 32 * 1.2 +
      (bot.objectiveType === 'raid' ? 0.35 : 0) });
  }
  if (bot.weapon < 22 && bot.iron >= 12) {
    options.push({ kind: 'ironWeapon', score: 1.1 + bot.aggression * 0.65 + (inCombat ? 0.7 : 0) });
  }
  if (bot.weapon < 34 && bot.gold >= 8) {
    options.push({ kind: 'diamondWeapon', score: 1.5 + bot.aggression * 0.75 + (inCombat ? 0.55 : 0) });
  }
  if (bot.armor === 0 && bot.gold >= 8) {
    options.push({ kind: 'armor', score: 1.2 + bot.caution * 0.8 + (inCombat ? 0.5 : 0) });
  }
  if (bot.apples < 1 && bot.health < 70 && bot.gold >= 4) {
    options.push({ kind: 'apple', score: 2.4 + (70 - bot.health) / 70 * 1.5 + bot.caution * 0.35 });
  }
  options.sort((a, b) => b.score - a.score);
  const choice = options[0]?.kind;
  if (choice === 'blocks') {
    bot.iron -= 4;
    bot.blocks += 32;
  } else if (choice === 'ironWeapon') {
    bot.iron -= 12;
    bot.weapon = 22;
  } else if (choice === 'diamondWeapon') {
    bot.gold -= 8;
    bot.weapon = 34;
  } else if (choice === 'armor') {
    bot.gold -= 8;
    bot.armor = 0.3;
  } else if (choice === 'apple') {
    bot.gold -= 4;
    bot.apples++;
  }
}

function botHasJumpLanding(bot, directionX, directionZ) {
  const pos = bot.group.position;
  return [1, 1.4, 1.8].some((distance) => {
    const landingX = pos.x + directionX * distance;
    const landingZ = pos.z + directionZ * distance;
    const landing = supportAt(landingX, landingZ, pos.y + 1.1);
    return landing > pos.y - 0.8 && landing <= pos.y + 0.72;
  });
}

function botBuildAhead(bot, directionX, directionZ, skipForJump = false) {
  const pos = bot.group.position;
  const probeDistance = Math.abs(directionX) > 0.5 && Math.abs(directionZ) > 0.5 ? 0.34 : 0.38;
  const probeX = pos.x + directionX * probeDistance;
  const probeZ = pos.z + directionZ * probeDistance;
  if (skipForJump) return false;
  const currentSupport = supportAt(pos.x, pos.z, pos.y + 0.22);
  if (supportAt(probeX, probeZ, pos.y + 0.22) > -Infinity ||
      currentSupport === -Infinity || bot.blocks < 1) return false;
  const x = Math.floor(probeX * 2) * 0.5 + 0.25;
  const z = Math.floor(probeZ * 2) * 0.5 + 0.25;
  const y = currentSupport - 0.25;
  const occupied = worldSurfaces.some((surface) =>
    Math.abs(surface.x - x) < (surface.width + 0.5) / 2 &&
    Math.abs(surface.z - z) < (surface.depth + 0.5) / 2 &&
    Math.abs(surface.top - (y + 0.25)) < 0.06);
  if (!occupied) {
    makeBlock(x, y, z, bot.blockMaterial);
    bot.blocks--;
    return true;
  }
  return false;
}

function botTakeHit(bot, target, now) {
  bot.attackAt = now + 1.05;
  bot.lastAttackAt = now;
  if (target.kind === 'player') {
    hurtPlayer(13, bot.group.position.x, bot.group.position.z);
    return;
  }
  if (pigs.includes(target)) {
    damagePig(target, 17, bot.team.name);
    return;
  }
  target.health = Math.max(0, target.health - Math.ceil(bot.weapon * (1 - (target.armor || 0))));
  target.hitAt = now;
  spawnHitEffect(target.group.position.clone().add(new THREE.Vector3(0, 1.05, 0)));
  knockbackBot(target, bot.group.position.x, bot.group.position.z, 4);
  if (target.health === 0) knockOutBot(target, now);
}

function estimateBotCombatRisk(bot, enemies, allies) {
  let incomingPressure = 0;
  let alliedPressure = 0;
  let nearbyEnemies = 0;
  let nearbyAllies = 0;
  const addPressure = (entity, isEnemy) => {
    const distance = Math.hypot(entity.group.position.x - bot.group.position.x,
      entity.group.position.z - bot.group.position.z);
    if (distance > 12) return;
    const weapon = entity.kind === 'player' ? state.player.weapon : entity.weapon;
    const armorMitigation = isEnemy ? 1 - (bot.armor || 0) : 1;
    const damagePerSecond = Math.max(6, weapon || 10) * armorMitigation / 1.05;
    const proximity = Math.max(0, Math.min(1, (12 - distance) / 8));
    if (isEnemy) {
      incomingPressure += damagePerSecond * proximity;
      if (distance < 6) nearbyEnemies++;
    } else {
      alliedPressure += damagePerSecond * proximity;
      if (distance < 6) nearbyAllies++;
    }
  };
  for (const enemy of enemies) addPressure(enemy, true);
  for (const ally of allies) addPressure(ally, false);
  if (bot.team.id === localTeamId && state.alive) {
    addPressure({ kind: 'player', group: { position: camera.position } }, false);
  }
  return {
    incomingPressure,
    alliedPressure,
    nearbyEnemies,
    nearbyAllies,
    outnumbered: nearbyEnemies > nearbyAllies + 1 || incomingPressure > alliedPressure * 1.35,
  };
}

function findBotRetreatWaypoint(bot, enemies) {
  const options = [];
  for (let step = 0; step < 8; step++) {
    const angle = (Math.PI * 2 * step) / 8;
    const x = bot.team.x + Math.cos(angle) * 7;
    const z = bot.team.z + Math.sin(angle) * 7;
    const support = supportAt(x, z, bot.group.position.y + 0.22);
    if (support === -Infinity || isBlocked(x, z, support)) continue;
    const nearestEnemy = enemies.reduce((nearest, enemy) => Math.min(nearest,
      Math.hypot(enemy.group.position.x - x, enemy.group.position.z - z)), Infinity);
    options.push({ kind: 'waypoint', team: bot.team, x, z, y: support,
      score: nearestEnemy - Math.hypot(x - bot.team.pig.x, z - bot.team.pig.z) * 0.12 });
  }
  options.sort((a, b) => b.score - a.score);
  return options[0] ?? null;
}

function botObjectiveKey(type, target) {
  if (type === 'retreat') return `retreat:${target.team.id}`;
  if (type === 'home') return `home:${target.team.id}`;
  if (type === 'raid') return `pig:${target.team.id}`;
  if (type === 'resupply') return `pickup:${target.mesh.uuid}`;
  if (target.kind === 'player') return 'player';
  return `bot:${target.team.id}:${target.slot}`;
}

function botObjectiveIsValid(bot) {
  const target = bot.objectiveTarget;
  if (!target) return false;
  if (bot.objectiveType === 'retreat') return target.team.id === bot.team.id && bot.health < 55;
  if (bot.objectiveType === 'home') return target.team.id === bot.team.id && bot.team.active;
  if (bot.objectiveType === 'raid') return target.alive && target.team.id !== bot.team.id;
  if (bot.objectiveType === 'resupply') return pickups.includes(target) && target.teamId === bot.team.id;
  if (bot.objectiveType === 'defend' || bot.objectiveType === 'engage') {
    return target.team?.id !== bot.team.id && (target.kind === 'player' ? state.alive : target.alive);
  }
  return false;
}

function chooseBotObjective(bot, enemies, now) {
  if (now < bot.nextObjectiveAt && botObjectiveIsValid(bot)) return;
  const pos = bot.group.position;
  const options = [];
  const allies = entities.filter((ally) => ally !== bot && ally.active && ally.alive && ally.team.id === bot.team.id);
  const risk = estimateBotCombatRisk(bot, enemies, allies);
  const consider = (type, target, score) => {
    if (!target || !Number.isFinite(score)) return;
    const key = botObjectiveKey(type, target);
    if (key === bot.objectiveKey) score += 0.28;
    options.push({ type, target, key, score: score + Math.random() * 0.035 });
  };

  const homeThreat = enemies.some((enemy) =>
    Math.hypot(enemy.group.position.x - bot.team.pig.x, enemy.group.position.z - bot.team.pig.z) < 14);
  if (bot.health < 55 && enemies.length && risk.outnumbered && !homeThreat) {
    const retreat = findBotRetreatWaypoint(bot, enemies);
    if (retreat) {
      const healthNeed = (55 - bot.health) / 55;
      const pressureNeed = risk.incomingPressure / Math.max(1, risk.alliedPressure + 1);
      consider('retreat', retreat, 2.2 + healthNeed * 2.2 + Math.min(1.4, pressureNeed));
    }
  }

  for (const enemy of enemies) {
    const enemyPos = enemy.group.position;
    const distance = Math.hypot(enemyPos.x - pos.x, enemyPos.z - pos.z);
    const homeDistance = Math.hypot(enemyPos.x - bot.team.pig.x, enemyPos.z - bot.team.pig.z);
    if (homeDistance < 14) {
      const homePressure = (14 - homeDistance) / 14;
      const damagedPig = 1 - bot.team.pig.health / bot.team.pig.maxHealth;
      const allyAlreadyDefending = allies.filter((ally) => ally.objectiveType === 'defend' &&
        ally.objectiveKey === botObjectiveKey('defend', enemy)).length;
      consider('defend', enemy, 2.0 + homePressure * 1.7 + damagedPig * 0.45 + bot.caution * 0.3 -
        distance * 0.055 - allyAlreadyDefending * 0.65);
    }
    const allyAlreadyEngaging = allies.filter((ally) => ally.objectiveType === 'engage' &&
      ally.objectiveKey === botObjectiveKey('engage', enemy)).length;
    const targetHealth = enemy.kind === 'player' ? state.health : enemy.health;
    const targetMaxHealth = enemy.kind === 'player' ? 100 : enemy.maxHealth || 100;
    const targetWeapon = enemy.kind === 'player' ? state.player.weapon : enemy.weapon || 10;
    consider('engage', enemy, scoreBotEngagement({
      distance,
      aggression: bot.aggression,
      targetHealth,
      targetMaxHealth,
      targetWeapon,
      botHealth: bot.health,
      outnumbered: risk.outnumbered,
      allyFocus: allyAlreadyEngaging,
    }));
  }

  for (const pig of pigs) {
    if (!pig.alive || pig.team.id === bot.team.id || !pig.team.active) continue;
    const distance = Math.hypot(pig.x - pos.x, pig.z - pos.z);
    const vulnerability = 1 - pig.health / pig.maxHealth;
    const alliedFocus = allies.filter((ally) => ally.objectiveType === 'raid' && ally.objectiveKey === `pig:${pig.team.id}`).length;
    consider('raid', pig, 1.55 * bot.aggression + vulnerability * 0.75 - distance * 0.019 - alliedFocus * 0.62);
  }

  for (const pickup of pickups) {
    if (pickup.teamId !== bot.team.id) continue;
    const distance = Math.hypot(pickup.mesh.position.x - pos.x, pickup.mesh.position.z - pos.z);
    let need = 0;
    if (pickup.resource === 'iron') {
      if (bot.blocks <= 24) need += 0.8 + (24 - bot.blocks) / 24;
      if (bot.weapon < 22 && bot.iron < 12) need += 0.75;
    } else if (pickup.resource === 'gold') {
      if (bot.weapon < 34 && bot.gold < 8) need += 0.85;
      if (bot.armor === 0 && bot.gold < 8) need += 0.75;
    }
    if (need <= 0) continue;
    const alliedFocus = allies.filter((ally) => ally.objectiveType === 'resupply' && ally.objectiveTarget === pickup).length;
    consider('resupply', pickup, 0.95 + need * bot.resourcefulness - distance * 0.1 - alliedFocus * 0.7);
  }

  options.sort((a, b) => b.score - a.score);
  const choice = options[0];
  bot.objectiveType = choice?.type ?? null;
  bot.objectiveTarget = choice?.target ?? null;
  bot.objectiveKey = choice?.key ?? null;
  bot.nextObjectiveAt = now + 0.32 + Math.random() * 0.12;
  bot.combatTarget = choice?.type === 'defend' || choice?.type === 'engage' ? choice.target : null;
}

function moveBots(delta, now) {
  const scheduledRoute = nextScheduledItem(entities, botRoutePlannerCursor,
    (candidate) => candidate.active && candidate.alive);
  botRoutePlannerCursor = scheduledRoute.nextCursor;
  const routeBudget = { used: false };
  const firstBotIndex = scheduledRoute.index < 0 ? 0 : scheduledRoute.index;
  for (let offset = 0; offset < entities.length; offset++) {
    const bot = entities[(firstBotIndex + offset) % entities.length];
    if (!bot.active) continue;
    const team = bot.team;
    if (!bot.alive) {
      if (team.pig.alive && now >= bot.respawnAt) botRespawn(bot);
      continue;
    }

    const pos = bot.group.position;
    if (now >= bot.nextObjectiveAt || !botObjectiveIsValid(bot)) {
      const enemies = entities.filter((enemy) => enemy !== bot && enemy.active && enemy.alive && enemy.team.id !== team.id &&
        (Math.hypot(enemy.group.position.x - pos.x, enemy.group.position.z - pos.z) < 10 ||
         Math.hypot(enemy.group.position.x - team.pig.x, enemy.group.position.z - team.pig.z) < 14));
      if (team.id !== localTeamId && state.alive &&
          (Math.hypot(camera.position.x - pos.x, camera.position.z - pos.z) < 10 ||
          Math.hypot(camera.position.x - team.pig.x, camera.position.z - team.pig.z) < 14)) {
        enemies.push({ kind: 'player', team: playerTeam(), group: { position: camera.position } });
      }
      chooseBotObjective(bot, enemies, now);
    }
    purchaseBotGear(bot, now);
    if (bot.objectiveType === 'retreat' && bot.health <= 60 && bot.apples > 0 && now >= bot.nextHealAt) {
      bot.apples--;
      bot.health = Math.min(bot.maxHealth, bot.health + 40);
      bot.nextHealAt = now + 3;
    }
    let hostile = bot.objectiveType === 'defend' || bot.objectiveType === 'engage'
      ? bot.objectiveTarget : null;
    let hostileDistance = hostile
      ? Math.hypot(hostile.group.position.x - pos.x, hostile.group.position.z - pos.z)
      : Infinity;
    let combatTarget = hostile;
    let goalPig = bot.objectiveType === 'raid' ? bot.objectiveTarget : null;
    let goalPickup = bot.objectiveType === 'resupply' ? bot.objectiveTarget : null;
    let goalWaypoint = bot.objectiveType === 'retreat' ? bot.objectiveTarget : null;
    let goalTarget = combatTarget || goalPig || goalPickup || goalWaypoint || team.pig;
    let targetX = combatTarget?.group.position.x ?? goalPig?.x ?? goalPickup?.mesh.position.x ?? goalWaypoint?.x ?? team.x;
    let targetZ = combatTarget?.group.position.z ?? goalPig?.z ?? goalPickup?.mesh.position.z ?? goalWaypoint?.z ?? team.z;
    let directTargetDistance = Math.hypot(targetX - pos.x, targetZ - pos.z);
    let interactionRange = combatTarget ? 3.4 : goalPig ? 2.8 : goalPickup ? 1.45 : 1.1;
    let routeResult = directTargetDistance > interactionRange
      ? updateBotRoute(bot, goalTarget, now, routeBudget) : { waypoint: null, deferred: false };
    let routeWaypoint = routeResult.waypoint;
    if (!routeWaypoint && !routeResult.deferred && directTargetDistance > interactionRange) {
      if (bot.objectiveType !== 'home') {
        bot.objectiveType = 'home';
        bot.objectiveTarget = team.pig;
        bot.objectiveKey = `home:${team.id}`;
        bot.nextObjectiveAt = now + 0.8;
        bot.route = null;
        combatTarget = null;
        hostile = null;
        hostileDistance = Infinity;
        goalPig = null;
        goalPickup = null;
        goalWaypoint = null;
        goalTarget = team.pig;
        targetX = team.pig.x;
        targetZ = team.pig.z;
        directTargetDistance = Math.hypot(targetX - pos.x, targetZ - pos.z);
        interactionRange = 1.1;
        routeResult = directTargetDistance > interactionRange
          ? updateBotRoute(bot, team.pig, now, routeBudget) : { waypoint: null, deferred: false };
        routeWaypoint = routeResult.waypoint;
      }
    }
    const routeUnavailable = !routeWaypoint && directTargetDistance > interactionRange;
    const goalX = routeWaypoint?.x ?? targetX;
    const goalZ = routeWaypoint?.z ?? targetZ;
    const targetDistance = Math.hypot(goalX - pos.x, goalZ - pos.z);
    const attackRange = combatTarget ? 3.4 : 2.8;
    if (routeResult.deferred) {
      bot.velocityX = 0;
      bot.velocityZ = 0;
    } else if ((combatTarget && hostileDistance <= 3.4) && directTargetDistance <= attackRange) {
      bot.group.lookAt(goalX, 1, goalZ);
      if (now >= bot.attackAt) botTakeHit(bot, combatTarget, now);
    } else if (goalPig && directTargetDistance <= 3.4) {
      bot.group.lookAt(goalX, 1, goalZ);
      if (now >= bot.attackAt) botTakeHit(bot, goalPig, now);
    } else if (goalPickup && directTargetDistance <= 1.45) {
      bot.velocityX = 0;
      bot.velocityZ = 0;
    } else if (goalWaypoint && directTargetDistance <= 1.1) {
      bot.velocityX = 0;
      bot.velocityZ = 0;
    } else if (routeUnavailable) {
      bot.velocityX = 0;
      bot.velocityZ = 0;
    } else {
      const dx = goalX - pos.x;
      const dz = goalZ - pos.z;
      const distance = Math.hypot(dx, dz) || 1;
      const directionX = dx / distance;
      const directionZ = dz / distance;
      bot.group.lookAt(pos.x + directionX, 1, pos.z + directionZ);
      const probeDistance = Math.abs(directionX) > 0.5 && Math.abs(directionZ) > 0.5 ? 0.34 : 0.38;
      const probeUnsupported = supportAt(pos.x + directionX * probeDistance, pos.z + directionZ * probeDistance, pos.y + 0.22) === -Infinity;
      const jumpingGap = bot.onGround && probeUnsupported && botHasJumpLanding(bot, directionX, directionZ);
      const placedBridgeBlock = botBuildAhead(bot, directionX, directionZ, jumpingGap);

      const acceleration = bot.onGround ? 24 : 7;
      bot.velocityX = THREE.MathUtils.damp(bot.velocityX, directionX * 3, acceleration, delta);
      bot.velocityZ = THREE.MathUtils.damp(bot.velocityZ, directionZ * 3, acceleration, delta);
      let nextX = pos.x + bot.velocityX * delta;
      let nextZ = pos.z + bot.velocityZ * delta;
      const blockedAhead = isBlocked(nextX, pos.z, pos.y) || isBlocked(nextX, nextZ, pos.y);
      const higherLanding = supportAt(nextX, nextZ, pos.y + 1.1);
      const needsStepUp = higherLanding > pos.y + 0.08 && higherLanding <= pos.y + 0.72;
      if (bot.onGround && now >= bot.jumpCooldown &&
          (blockedAhead || needsStepUp || jumpingGap || placedBridgeBlock && pos.y <= 0.05)) {
        bot.velocityY = 7.2;
        bot.onGround = false;
        bot.jumpCooldown = now + (placedBridgeBlock ? 0.95 : 0.55);
      }
      if (isBlocked(nextX, pos.z, pos.y)) {
        nextX = pos.x;
        bot.velocityX = 0;
      }
      if (isBlocked(nextX, nextZ, pos.y)) {
        nextZ = pos.z;
        bot.velocityZ = 0;
      }
      const supportedNext = supportAt(nextX, nextZ, pos.y + 0.22) > -Infinity;
      const safeJumpFlight = bot.velocityY > 0 && botHasJumpLanding(bot, directionX, directionZ);
      if (supportedNext || safeJumpFlight) {
        pos.x = nextX;
        pos.z = nextZ;
      } else {
        bot.velocityX = 0;
        bot.velocityZ = 0;
      }
    }

    bot.velocityY -= 21 * delta;
    pos.y += bot.velocityY * delta;
    const support = supportAt(pos.x, pos.z, pos.y + 0.22);
    if (support > -Infinity && pos.y <= support && bot.velocityY < 0) {
      pos.y = support;
      bot.velocityY = 0;
      bot.onGround = true;
    } else {
      bot.onGround = false;
    }
    if (pos.y < -12) {
      knockOutBot(bot, now);
      continue;
    }
    if (bot.hitAt && now - bot.hitAt > 0.13) bot.group.position.y = pos.y;
  }
}

function updateAvatarAnimation(entity, time, delta, grounded) {
  const animation = entity.animation;
  if (!animation || !entity.group.visible) return;
  const dx = entity.group.position.x - animation.lastX;
  const dz = entity.group.position.z - animation.lastZ;
  const speed = delta > 0 ? Math.hypot(dx, dz) / delta : 0;
  animation.lastX = entity.group.position.x;
  animation.lastZ = entity.group.position.z;
  if (!animation.wasGrounded && grounded) animation.lastLandingAt = time;
  animation.wasGrounded = grounded;

  const pose = avatarPose(time, speed, grounded, time - animation.lastLandingAt,
    time - (entity.hitAt ?? -Infinity), reducedMotionEnabled());
  const swordPose = firstPersonAttackPose(time - (entity.lastAttackAt ?? -Infinity), reducedMotionEnabled());
  animation.leftLeg.rotation.x = pose.leftLeg;
  animation.rightLeg.rotation.x = pose.rightLeg;
  animation.swordPivot.rotation.set(swordPose.rotationX, swordPose.rotationY, 0);
  animation.body.position.y = animation.bodyBaseY + pose.bodyBob + pose.bodySquash * 0.35;
  animation.body.scale.y = 1 - pose.bodySquash;
  animation.body.rotation.x = pose.hitTilt;
}

function spawnHitEffect(position) {
  if (reducedMotionEnabled() || !position) return;
  const group = new THREE.Group();
  group.position.copy(position);
  for (let index = 0; index < 6; index++) {
    const angle = (index / 6) * Math.PI * 2;
    const spark = new THREE.Mesh(hitSparkGeometry, hitSparkMaterial);
    spark.position.set(Math.cos(angle) * 0.22, (index % 2) * 0.12, Math.sin(angle) * 0.22);
    group.add(spark);
  }
  scene.add(group);
  hitEffects.add({ group, age: 0 });
}

function updateHitEffects(delta) {
  for (const effect of hitEffects) {
    effect.age += delta;
    if (effect.age >= 0.24) {
      scene.remove(effect.group);
      hitEffects.delete(effect);
      continue;
    }
    const progress = effect.age / 0.24;
    effect.group.scale.setScalar(1 - progress * 0.82);
    effect.group.position.y += delta * 0.22;
    effect.group.rotation.y += delta * 4;
  }
}

function updateVisualAnimations(time, delta) {
  const reducedMotion = reducedMotionEnabled();
  const playerPose = avatarPose(time, Math.hypot(state.velocityX, state.velocityZ), state.onGround,
    time - state.lastLandingAt, time - state.lastHitAt, reducedMotion);
  const attackPose = firstPersonAttackPose(time - attackAnimationStartedAt, reducedMotion);
  heldItem.position.set(0.43, -0.42 + playerPose.bodyBob - playerPose.bodySquash * 0.12, -0.82 + attackPose.offsetZ);
  heldItem.rotation.set(-0.18 + attackPose.rotationX + playerPose.hitTilt,
    -0.25 + attackPose.rotationY, -0.36 + playerPose.bodySquash * 0.6);

  for (const entity of entities) updateAvatarAnimation(entity, time, delta, entity.onGround);
  for (const remote of remotePlayers.values()) {
    const grounded = Math.abs(remote.group.position.y - remote.targetPosition.y) < 0.12;
    updateAvatarAnimation(remote, time, delta, grounded);
  }
  for (const team of teams) {
    const shop = team.shop;
    const idle = shop?.userData.idleAnimation;
    if (!shop || !idle) continue;
    const pose = shopkeeperIdlePose(time, idle.phase, reducedMotion);
    shop.position.y = idle.baseY + pose.bob;
    shop.rotation.y = idle.baseYaw + pose.yaw;
  }
  updateHitEffects(delta);
}

function useItem() {
  if (state.mode !== 'playing' || !state.alive) return;
  if (state.selected === 2) {
    if (onlineMatch) {
      sendMultiplayerMessage({ type: 'use', itemId: 'apple' });
      return;
    }
    if (state.player.apples < 1) return showToast('No apples left.');
    if (state.health >= 100) return showToast('You are already at full health.');
    state.player.apples--;
    state.health = Math.min(100, state.health + 40);
    $('#health-text').textContent = String(state.health);
    $('#health-fill').style.width = `${state.health}%`;
    updateHotbar();
    showToast('Golden apple! +40 health.');
  } else if (state.selected === 3) {
    if (onlineMatch) return showToast('Fireballs are disabled in online matches for now.');
    throwFireball();
  } else if (state.selected === 5) {
    if (onlineMatch) return showToast('Pearls are disabled in online matches for now.');
    usePearl();
  } else if (state.selected === 6) {
    if (onlineMatch) return showToast('Speed potions are disabled in online matches for now.');
    useSpeedPotion();
  }
}

function usePearl() {
  if (onlineMatch) return showToast('Pearls are disabled in online matches for now.');
  if (state.player.pearls < 1) return showToast('No ender pearls left.');
  raycaster.setFromCamera(centerScreen, camera);
  raycaster.far = 24;
  const surfaces = worldSurfaces.filter((surface) => surface.mesh &&
    (!surface.teamId || teams.find((team) => team.id === surface.teamId)?.active)).map((surface) => surface.mesh);
  const hit = raycaster.intersectObjects(surfaces, false).find((entry) =>
    entry.face.normal.clone().transformDirection(entry.object.matrixWorld).y > 0.8);
  if (!hit) return showToast('Aim at a landing surface within 24 blocks.');
  const surface = worldSurfaces.find((entry) => entry.mesh === hit.object);
  if (!surface) return showToast('That is not a safe landing surface.');
  const support = supportAt(hit.point.x, hit.point.z, hit.point.y + 0.25);
  if (support === -Infinity) return showToast('That landing is not safe.');
  state.player.pearls--;
  camera.position.set(hit.point.x, support + 1.65, hit.point.z);
  state.velocityY = 0;
  state.onGround = true;
  updateHotbar();
  showToast('Ender pearl!');
}

function useSpeedPotion() {
  if (onlineMatch) return showToast('Speed potions are disabled in online matches for now.');
  if (state.player.potions < 1) return showToast('No speed potions left.');
  state.player.potions--;
  state.player.speedBoostUntil = performance.now() / 1000 + 18;
  updateHotbar();
  showToast('Speed boost! Move faster for 18 seconds.');
}

function throwFireball() {
  if (onlineMatch) return showToast('Fireballs are disabled in online matches for now.');
  if (state.player.fireballs < 1) return showToast('No fireballs left.');
  state.player.fireballs--;
  updateHotbar();
  const direction = new THREE.Vector3();
  camera.getWorldDirection(direction);
  const ball = makeMesh(new THREE.SphereGeometry(0.23, 6, 5), new THREE.MeshBasicMaterial({ color: '#ff8b3d' }), scene,
    camera.position.x, camera.position.y - 0.1, camera.position.z);
  const start = ball.position.clone();
  let age = 0;
  const fly = (delta) => {
    age += delta;
    ball.position.addScaledVector(direction, delta * 14);
    if (age > 0.7 || ball.position.distanceTo(start) > 10) {
      scene.remove(ball);
      for (const bot of entities) {
        if (bot.active && bot.alive && bot.group.position.distanceTo(ball.position) < 4) {
          bot.health = Math.max(0, bot.health - Math.ceil(45 * (1 - bot.armor)));
          knockbackBot(bot, ball.position.x, ball.position.z, 5);
          if (!bot.health) knockOutBot(bot, performance.now() / 1000);
        }
      }
      for (const pig of pigs) {
        if (pig.team.active && pig.alive && pig.group.position.distanceTo(ball.position) < 4) {
          damagePig(pig, 35, 'Fireball');
        }
      }
      for (let i = 0; i < 8; i++) {
        const angle = (i / 8) * Math.PI * 2;
        makeBlock(Math.round(ball.position.x + Math.cos(angle)), Math.round(ball.position.y - 0.6), Math.round(ball.position.z + Math.sin(angle)),
          new THREE.MeshLambertMaterial({ color: '#ff9651', flatShading: true }));
      }
      fireballs.delete(fly);
    }
  };
  fireballs.add(fly);
}
const fireballs = new Set();

const catalog = [
  { id: 'blocks', label: 'Wool blocks ×32', description: 'Build your own bridge or cover', icon: '🧱', price: { iron: 4 }, grant: () => state.player.blocks += 32 },
  { id: 'sword', label: 'Iron sword', description: 'Stronger melee hits', icon: '⚔️', price: { iron: 12 }, canBuy: () => state.player.weapon < 22, disabledLabel: 'Owned', grant: () => state.player.weapon = 22 },
  { id: 'diamond-sword', label: 'Diamond sword', description: 'Heavy melee damage', icon: '🗡️', price: { gold: 8 }, canBuy: () => state.player.weapon < 34, disabledLabel: 'Owned', grant: () => state.player.weapon = 34 },
  { id: 'apple', label: 'Golden apple', description: 'Restore 40 health', icon: '🍎', price: { gold: 4 }, grant: () => state.player.apples++ },
  { id: 'fireball', label: 'Fireball', description: 'Blast enemies and pigs', icon: '🔥', price: { gold: 5 }, grant: () => state.player.fireballs++ },
  { id: 'armor', label: 'Chainmail armor', description: 'Take 30% less damage', icon: '🛡️', price: { gold: 8 }, canBuy: () => state.player.armor === 0, disabledLabel: 'Owned', grant: () => state.player.armor = 0.3 },
  { id: 'bow', label: 'Bow', description: 'Ranged attacks · equip slot 5', icon: '🏹', price: { emerald: 3 }, canBuy: () => !state.player.hasBow, disabledLabel: 'Owned', grant: () => state.player.hasBow = true },
  { id: 'arrows', label: 'Arrow pack ×8', description: 'Ammunition for your bow', icon: '➶', price: { gold: 3 }, canBuy: () => state.player.hasBow, disabledLabel: 'Buy bow first', grant: () => state.player.arrows += 8 },
  { id: 'speed-potion', label: 'Speed potion', description: 'Move 35% faster for 18 sec', icon: '🧪', price: { emerald: 2 }, grant: () => state.player.potions++ },
  { id: 'pearl', label: 'Ender pearl', description: 'Teleport to a surface in sight', icon: '🟢', price: { emerald: 4 }, grant: () => state.player.pearls++ },
];

function openShop() {
  shopItems.innerHTML = '';
  for (const item of catalog) {
    const row = document.createElement('div');
    row.className = 'shop-item';
    const cost = Object.entries(item.price).map(([name, amount]) => `${amount} ${capitalize(name)}`).join(' + ');
    const onlineSupported = !onlineMatch || ['blocks', 'sword', 'diamond-sword', 'apple', 'armor'].includes(item.id);
    const canBuy = onlineSupported && (item.canBuy ? item.canBuy() : true);
    const canAfford = canBuy && Object.entries(item.price).every(([name, amount]) => state.player[name] >= amount);
    const buttonLabel = !onlineSupported ? 'Disabled online' : canBuy ? cost : item.disabledLabel || 'Unavailable';
    row.innerHTML = `<span class="item-icon">${item.icon}</span><span><strong>${item.label}</strong><small>${item.description}</small></span><button ${canAfford ? '' : 'disabled'}>${buttonLabel}</button>`;
    row.querySelector('button').addEventListener('click', () => buy(item));
    shopItems.append(row);
  }
  shopPanel.classList.remove('hidden');
  if (hasGamePointerLock()) document.exitPointerLock?.();
  updateInteraction();
  updateBuildPreview();
}

function buy(item) {
  if (onlineMatch) {
    sendMultiplayerMessage({ type: 'buy', itemId: item.id });
    return;
  }
  if (item.canBuy && !item.canBuy()) return showToast('You already own that upgrade.');
  if (!Object.entries(item.price).every(([name, amount]) => state.player[name] >= amount)) return showToast('Not enough resources.');
  for (const [name, amount] of Object.entries(item.price)) state.player[name] -= amount;
  item.grant();
  openShop();
  updateResources();
  updateHotbar();
  showToast(`Bought ${item.label}.`);
}

function closeShop() {
  shopPanel.classList.add('hidden');
  updateInteraction();
  if (state.mode === 'playing' || state.mode === 'waiting') requestGamePointerLock();
}

function updateResources() {
  for (const name of ['iron', 'gold', 'emerald']) $(`#${name}-count`).textContent = String(state.player[name]);
}

const slotDefinitions = [
  { name: 'Sword', icon: '⚔️' },
  { name: 'Wool', icon: '🧱', count: () => state.player.blocks },
  { name: 'Apple', icon: '🍎', count: () => state.player.apples },
  { name: 'Fireball', icon: '🔥', count: () => state.player.fireballs },
  { name: 'Bow', icon: '🏹', count: () => state.player.arrows },
  { name: 'Pearl', icon: '🟢', count: () => state.player.pearls },
  { name: 'Speed', icon: '🧪', count: () => state.player.potions },
];

function updateHeldItem() {
  heldItem.clear();
  if (state.selected === 0) {
    const blade = new THREE.MeshLambertMaterial({ color: '#d8e1e8', flatShading: true });
    const edge = new THREE.MeshLambertMaterial({ color: '#8998a8', flatShading: true });
    const handle = new THREE.MeshLambertMaterial({ color: '#684331', flatShading: true });
    makeMesh(new THREE.BoxGeometry(0.16, 0.64, 0.1), blade, heldItem, 0, 0.34, 0);
    makeMesh(new THREE.BoxGeometry(0.34, 0.09, 0.14), edge, heldItem, 0, -0.04, 0);
    makeMesh(new THREE.BoxGeometry(0.12, 0.27, 0.12), handle, heldItem, 0, -0.22, 0);
    makeMesh(new THREE.BoxGeometry(0.2, 0.12, 0.14), edge, heldItem, 0, -0.4, 0);
  } else if (state.selected === 1) {
    makeMesh(new THREE.BoxGeometry(0.44, 0.44, 0.44), new THREE.MeshLambertMaterial({ color: playerTeam().color, flatShading: true }), heldItem);
  } else if (state.selected === 2) {
    makeMesh(new THREE.BoxGeometry(0.35, 0.38, 0.35), new THREE.MeshLambertMaterial({ color: '#d9474d', flatShading: true }), heldItem);
    makeMesh(new THREE.BoxGeometry(0.1, 0.16, 0.1), new THREE.MeshLambertMaterial({ color: '#598b3f', flatShading: true }), heldItem, 0.04, 0.25, 0);
  } else if (state.selected === 3) {
    makeMesh(new THREE.BoxGeometry(0.38, 0.38, 0.38), new THREE.MeshLambertMaterial({ color: '#ff7b32', emissive: '#8f260b', flatShading: true }), heldItem);
    makeMesh(new THREE.BoxGeometry(0.2, 0.2, 0.2), new THREE.MeshLambertMaterial({ color: '#ffd052', flatShading: true }), heldItem, 0, 0.02, 0);
  } else if (state.selected === 4) {
    const wood = new THREE.MeshLambertMaterial({ color: '#895a3d', flatShading: true });
    makeMesh(new THREE.BoxGeometry(0.1, 0.85, 0.1), wood, heldItem);
    makeMesh(new THREE.BoxGeometry(0.11, 0.78, 0.08), new THREE.MeshLambertMaterial({ color: '#d8c69f', flatShading: true }), heldItem, 0.13, 0, 0);
  } else if (state.selected === 5) {
    makeMesh(new THREE.BoxGeometry(0.35, 0.35, 0.35), new THREE.MeshLambertMaterial({ color: '#50bd8c', flatShading: true }), heldItem);
  } else {
    makeMesh(new THREE.BoxGeometry(0.3, 0.42, 0.3), new THREE.MeshLambertMaterial({ color: '#8c64d5', flatShading: true }), heldItem);
    makeMesh(new THREE.BoxGeometry(0.14, 0.14, 0.14), new THREE.MeshLambertMaterial({ color: '#c9a2ff', flatShading: true }), heldItem, 0, 0.22, 0);
  }
}

function updateHotbar() {
  const bar = $('#hotbar');
  bar.innerHTML = '';
  slotDefinitions.forEach((slot, index) => {
    const button = document.createElement('button');
    button.className = `slot${state.selected === index ? ' selected' : ''}`;
    button.setAttribute('aria-label', `${index + 1}: ${slot.name}`);
    button.innerHTML = `<span class="slot-number">${index + 1}</span><span class="slot-icon">${slot.icon}</span><span class="slot-name">${slot.name}</span>${slot.count ? `<span class="slot-count">${slot.count()}</span>` : ''}`;
    button.addEventListener('click', () => { state.selected = index; updateHotbar(); });
    bar.append(button);
  });
  updateHeldItem();
}

let lastTeamStatusSignature = null;

function renderTeamStatus() {
  const visibleTeams = activeTeams();
  const signature = visibleTeams.map((team) =>
    `${team.id}:${team.eliminated}:${team.pig.alive}`).join('|');
  if (signature === lastTeamStatusSignature) return;
  lastTeamStatusSignature = signature;
  const container = $('#team-status');
  container.innerHTML = '';
  for (const team of visibleTeams) {
    const chip = document.createElement('span');
    chip.className = `team-chip${team.eliminated ? ' out' : ''}`;
    chip.dataset.teamId = team.id;
    chip.innerHTML = `<i style="background:${team.color}"></i>${team.name} ${team.pig.alive ? '♥' : '×'}`;
    container.append(chip);
  }
}

function showToast(message) {
  const toast = $('#toast');
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(state.toastTimer);
  state.toastTimer = setTimeout(() => toast.classList.remove('show'), 1900);
}

function showNotice(message) {
  const notice = $('#notice');
  notice.textContent = message;
  notice.classList.add('show');
  clearTimeout(state.noticeTimer);
  state.noticeTimer = setTimeout(() => notice.classList.remove('show'), 2300);
}

function capitalize(value) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function updateInteraction() {
  const shop = playerTeam().shop;
  if (!shop) {
    $('#interaction').classList.add('hidden');
    return;
  }
  const shopPos = shop.position;
  const distance = Math.hypot(camera.position.x - shopPos.x, camera.position.z - shopPos.z);
  const interaction = $('#interaction');
  if (distance < 4 && state.alive && state.mode === 'playing' && shopPanel.classList.contains('hidden')) {
    interaction.innerHTML = 'Press <kbd>E</kbd> to trade with the shopkeeper';
    interaction.classList.remove('hidden');
  } else if (distance < 4 && !shopPanel.classList.contains('hidden')) {
    interaction.innerHTML = '<kbd>E</kbd> close shop';
    interaction.classList.remove('hidden');
  } else interaction.classList.add('hidden');
}

function updateGenerator(time) {
  if (time - state.lastIronGen > 2.3) {
    state.lastIronGen = time;
    spawnPickup('iron', playerTeam().x, playerTeam().z, 1, '#d9e1ef');
  }
  if (time - state.lastGoldGen > 8) {
    state.lastGoldGen = time;
    spawnPickup('gold', playerTeam().x, playerTeam().z, 1, '#ffd04c', 0.75);
  }
  if (time - state.lastCentralGen > 6) {
    state.lastCentralGen = time;
    spawnPickup('emerald', 0, 0, 1, '#55f0a2', 1.2);
  }
  for (const team of activeTeams()) {
    if (!team.bots.some((bot) => bot.active) || !team.pig.alive) continue;
    if (time - team.lastIronGen > 2.3) {
      team.lastIronGen = time;
      spawnPickup('iron', team.x, team.z, 1, '#d9e1ef', 0.55, team.id);
    }
    if (time - team.lastGoldGen > 8) {
      team.lastGoldGen = time;
      spawnPickup('gold', team.x, team.z, 1, '#ffd04c', 0.75, team.id);
    }
  }
}

function saveSettings() {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ bindings, fieldOfView, touchControlsEnabled }));
  } catch (error) {
    console.warn('Could not save game settings.', error);
    showNotice('Settings could not be saved in this browser.');
  }
}

function resetTouchInput() {
  joystickPointerId = null;
  lookPointerId = null;
  state.touchMoveX = 0;
  state.touchMoveY = 0;
  state.touchSneaking = false;
  state.touchJumpPressed = false;
  sneakTouchButton?.setAttribute('aria-pressed', 'false');
  joystickKnob.style.transform = 'translate(0, 0)';
}

function updateTouchControlsVisibility() {
  const visible = touchControlsEnabled && (state.mode === 'playing' || state.mode === 'waiting');
  touchControls.classList.toggle('hidden', !visible);
  touchControls.classList.toggle('waiting', state.mode === 'waiting');
}

function setTouchControls(enabled, persist = true) {
  touchControlsEnabled = enabled;
  touchControlsToggle.checked = enabled;
  touchControlsSettingsToggle.checked = enabled;
  if (!enabled) resetTouchInput();
  updateTouchControlsVisibility();
  if (persist) saveSettings();
}

function updateJoystick(event) {
  const bounds = touchJoystick.getBoundingClientRect();
  const radius = Math.max(1, (bounds.width - 50) / 2);
  const dx = event.clientX - (bounds.left + bounds.width / 2);
  const dy = event.clientY - (bounds.top + bounds.height / 2);
  const distance = Math.hypot(dx, dy);
  const scale = distance > radius ? radius / distance : 1;
  const knobX = dx * scale;
  const knobY = dy * scale;
  state.touchMoveX = THREE.MathUtils.clamp(knobX / radius, -1, 1);
  state.touchMoveY = THREE.MathUtils.clamp(-knobY / radius, -1, 1);
  joystickKnob.style.transform = `translate(${knobX}px, ${knobY}px)`;
}

function releaseJoystick(event) {
  if (event.pointerId !== joystickPointerId) return;
  joystickPointerId = null;
  state.touchMoveX = 0;
  state.touchMoveY = 0;
  joystickKnob.style.transform = 'translate(0, 0)';
}

function handleTouchAction(action) {
  if (action === 'jump') {
    state.touchJumpPressed = true;
  } else if (action === 'sneak') {
    state.touchSneaking = true;
  } else if (action === 'attack') {
    if (state.selected === 0 || state.selected === 4) attack(true);
    else useItem();
  } else if (action === 'build' && state.mode === 'playing') {
    state.selected = 1;
    updateHotbar();
    buildAtAim();
  } else if (action === 'shop' && state.mode === 'playing') {
    if (!shopPanel.classList.contains('hidden')) closeShop();
    else if (playerTeam().shop &&
        Math.hypot(camera.position.x - playerTeam().shop.position.x,
          camera.position.z - playerTeam().shop.position.z) < 4) openShop();
  } else if (action === 'utility') {
    useItem();
  }
}

function keyName(code) {
  if (code === 'Space') return 'Space';
  if (code === 'ShiftLeft' || code === 'ShiftRight') return 'Shift';
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Arrow')) return code.slice(5);
  return code;
}

function renderBindings() {
  const list = $('#binding-list');
  list.innerHTML = '';
  for (const [action, label] of Object.entries(BINDING_LABELS)) {
    const row = document.createElement('div');
    row.className = 'binding-row';
    const name = document.createElement('span');
    name.textContent = label;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `binding-key${pendingRebind === action ? ' waiting' : ''}`;
    button.textContent = pendingRebind === action ? 'PRESS A KEY…' : keyName(bindings[action]);
    button.setAttribute('aria-label', `${label}: ${button.textContent}`);
    button.addEventListener('click', () => {
      pendingRebind = action;
      renderBindings();
      $('#binding-list').querySelector('.binding-key.waiting')?.focus();
    });
    row.append(name, button);
    list.append(row);
  }
}

function openSettings() {
  keys.clear();
  pendingRebind = null;
  renderBindings();
  settingsPanel.classList.remove('hidden');
  if (hasGamePointerLock()) document.exitPointerLock?.();
}

function closeSettings() {
  pendingRebind = null;
  settingsPanel.classList.add('hidden');
  if (state.mode === 'playing') requestGamePointerLock();
  else $('#menu-settings-button').focus();
}

function handleRebind(event) {
  if (!pendingRebind) return;
  const code = keyboardCode(event);
  event.preventDefault();
  event.stopImmediatePropagation();
  if (code === 'Escape') {
    pendingRebind = null;
    renderBindings();
    return;
  }
  if (!code) return;
  const conflicting = Object.keys(bindings).find((action) => action !== pendingRebind && bindings[action] === code);
  if (conflicting) {
    showNotice(`That key is already used for ${BINDING_LABELS[conflicting]}.`);
    pendingRebind = null;
    renderBindings();
    return;
  }
  bindings[pendingRebind] = code;
  pendingRebind = null;
  saveSettings();
  renderBindings();
}

function startGame() {
  if (state.mode === 'disconnected') {
    window.location.reload();
    return;
  }
  if (state.started && state.mode === 'playing') {
    focusGameCanvas();
    if (!hasGamePointerLock()) requestGamePointerLock();
    overlay.classList.add('hidden');
    return;
  }
  if (state.mode === 'won' || state.mode === 'lost') window.location.reload();
  state.started = true;
  state.mode = 'playing';
  returnLobbyButton.classList.add('hidden');
  $('.match-picker').classList.add('hidden');
  $('.online-controls').classList.add('hidden');
  queueStatusPanel.classList.add('hidden');
  overlay.classList.add('hidden');
  hud.classList.remove('hidden');
  updateTouchControlsVisibility();
  focusGameCanvas();
  const now = performance.now() / 1000;
  state.lastIronGen = now;
  state.lastGoldGen = now;
  state.lastCentralGen = now;
  updateHotbar();
  renderTeamStatus();
  $('#objective').textContent = `${matchModes[selectedMatchMode].label} · Protect your pig!`;
  requestGamePointerLock();
  showNotice(state.fallbackAvailable
    ? 'No mouse lock: use arrow keys to look and WASD to move.'
    : 'Collect iron at your generator. Keep an eye on your pig!');
}

function updateStartButtonLabel() {
  startButton.textContent = `START · ${matchModes[selectedMatchMode].label} VS BOTS`;
}

document.addEventListener('pointerlockchange', () => {
  if (hasGamePointerLock() && state.mode === 'playing') {
    state.pointerLockPending = false;
    state.fallbackAvailable = false;
    state.fallbackDragging = false;
    overlay.classList.add('hidden');
  } else if (state.mode === 'playing' && shopPanel.classList.contains('hidden') &&
      settingsPanel.classList.contains('hidden') &&
      !state.pointerLockPending && !state.fallbackAvailable) {
    overlayTitle.textContent = 'PAUSED';
    overlayCopy.textContent = 'Click resume when you are ready to jump back in.';
    $('.match-picker').classList.add('hidden');
    startButton.textContent = 'RESUME';
    overlay.classList.remove('hidden');
  }
});
document.addEventListener('pointerlockerror', () => {
  state.pointerLockPending = false;
  state.fallbackAvailable = true;
  showNotice('Mouse lock was blocked. Use arrow keys to look, or drag to turn.');
});

document.addEventListener('mousemove', (event) => {
  if (!hasGamePointerLock() || (state.mode !== 'playing' && state.mode !== 'waiting')) return;
  updateLook(event.movementX ?? event.mozMovementX ?? 0, event.movementY ?? event.mozMovementY ?? 0);
});
function updateLook(deltaX, deltaY) {
  state.yaw -= deltaX * 0.0021;
  state.pitch = THREE.MathUtils.clamp(state.pitch - deltaY * 0.0021, -1.48, 1.48);
  camera.rotation.set(state.pitch, state.yaw, 0);
  updateHeading();
}

function updateHeading() {
  const east = -Math.sin(state.yaw);
  const north = Math.cos(state.yaw);
  const angle = (Math.atan2(east, north) * 180 / Math.PI + 360) % 360;
  const directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  $('#heading-indicator').textContent = directions[Math.round(angle / 45) % directions.length];
}

canvas.addEventListener('pointerdown', (event) => {
  if ((state.mode !== 'playing' && state.mode !== 'waiting') || !state.alive ||
      !shopPanel.classList.contains('hidden')) return;
  focusGameCanvas();
  if (!hasGamePointerLock()) {
    event.preventDefault();
    state.lastPointerX = event.clientX;
    state.lastPointerY = event.clientY;
    state.fallbackDragging = true;
    canvas.setPointerCapture?.(event.pointerId);
    if (!state.fallbackAvailable && !state.pointerLockPending) requestGamePointerLock(event.clientX, event.clientY);
  }
  if (state.mode === 'playing' && (hasGamePointerLock() || state.fallbackDragging)) {
    if (event.button === 0) {
      if (state.selected === 0 || state.selected === 4) attack();
      else useItem();
    } else if (event.button === 2) {
      if (state.selected === 1) buildAtAim();
      else if (state.selected === 3) throwFireball();
    }
  }
});
document.addEventListener('pointermove', (event) => {
  if (hasGamePointerLock() || !state.fallbackDragging ||
      (state.mode !== 'playing' && state.mode !== 'waiting')) return;
  const deltaX = event.clientX - state.lastPointerX;
  const deltaY = event.clientY - state.lastPointerY;
  state.lastPointerX = event.clientX;
  state.lastPointerY = event.clientY;
  updateLook(deltaX, deltaY);
});
document.addEventListener('pointerup', () => {
  if (!hasGamePointerLock()) state.fallbackDragging = false;
});
touchJoystick.addEventListener('pointerdown', (event) => {
  if (!touchControlsEnabled || (state.mode !== 'playing' && state.mode !== 'waiting')) return;
  event.preventDefault();
  joystickPointerId = event.pointerId;
  updateJoystick(event);
  if (event.pointerType !== 'touch') touchJoystick.setPointerCapture?.(event.pointerId);
});
touchJoystick.addEventListener('pointermove', (event) => {
  if (event.pointerId === joystickPointerId) updateJoystick(event);
});
touchJoystick.addEventListener('pointerup', releaseJoystick);
touchJoystick.addEventListener('pointercancel', releaseJoystick);
touchLookArea.addEventListener('pointerdown', (event) => {
  if (!touchControlsEnabled || (state.mode !== 'playing' && state.mode !== 'waiting')) return;
  event.preventDefault();
  lookPointerId = event.pointerId;
  state.lastPointerX = event.clientX;
  state.lastPointerY = event.clientY;
  if (event.pointerType !== 'touch') touchLookArea.setPointerCapture?.(event.pointerId);
});
touchLookArea.addEventListener('pointermove', (event) => {
  if (event.pointerId !== lookPointerId) return;
  event.preventDefault();
  updateLook(event.clientX - state.lastPointerX, event.clientY - state.lastPointerY);
  state.lastPointerX = event.clientX;
  state.lastPointerY = event.clientY;
});
const releaseLook = (event) => {
  if (event.pointerId === lookPointerId) lookPointerId = null;
};
touchLookArea.addEventListener('pointerup', releaseLook);
touchLookArea.addEventListener('pointercancel', releaseLook);
const sneakTouchButton = document.querySelector('[data-touch-action="sneak"]');
for (const button of document.querySelectorAll('[data-touch-action]')) {
  button.addEventListener('click', () => {
    const action = button.dataset.touchAction;
    if (action === 'sneak') {
      state.touchSneaking = !state.touchSneaking;
      button.setAttribute('aria-pressed', String(state.touchSneaking));
    } else handleTouchAction(action);
  });
}
touchControlsToggle.addEventListener('change', () => setTouchControls(touchControlsToggle.checked));
touchControlsSettingsToggle.addEventListener('change', () => setTouchControls(touchControlsSettingsToggle.checked));
$('#cancel-matchmaking').addEventListener('click', cancelMatchmaking);
document.addEventListener('keydown', (event) => {
  const code = keyboardCode(event);
  if (!settingsPanel.classList.contains('hidden') && code === 'Escape' && !pendingRebind) {
    closeSettings();
    return;
  }
  if (!settingsPanel.classList.contains('hidden')) return;
  const movementCodes = [bindings.forward, bindings.back, bindings.left, bindings.right, bindings.jump, bindings.sneak,
    'Space', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'];
  if ((state.mode === 'playing' || state.mode === 'waiting') && movementCodes.includes(code)) {
    event.preventDefault();
  }
  if (state.mode === 'playing' || state.mode === 'waiting') {
    const keyLook = 0.055;
    if (code === 'ArrowLeft') updateLook(-keyLook / 0.0021, 0);
    if (code === 'ArrowRight') updateLook(keyLook / 0.0021, 0);
    if (code === 'ArrowUp') updateLook(0, -keyLook / 0.0021);
    if (code === 'ArrowDown') updateLook(0, keyLook / 0.0021);
  }
  if (code) keys.add(code);
  const slot = Object.keys(bindings).find((action) => action.startsWith('slot') && bindings[action] === code);
  if (slot) {
    state.selected = Number(slot.slice(4)) - 1;
    updateHotbar();
  }
  if (event.repeat || state.mode !== 'playing') return;
  if (code === bindings.shop) {
    if (!shopPanel.classList.contains('hidden')) closeShop();
    else if (playerTeam().shop &&
        Math.hypot(camera.position.x - playerTeam().shop.position.x,
          camera.position.z - playerTeam().shop.position.z) < 4) openShop();
  }
});
document.addEventListener('keyup', (event) => keys.delete(keyboardCode(event)));
window.addEventListener('blur', () => {
  keys.clear();
  state.fallbackDragging = false;
  resetTouchInput();
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    keys.clear();
    resetTouchInput();
  }
});
canvas.addEventListener('contextmenu', (event) => event.preventDefault());
document.addEventListener('wheel', (event) => {
  if (state.mode !== 'playing') return;
  state.selected = (state.selected + (event.deltaY > 0 ? 1 : slotDefinitions.length - 1)) % slotDefinitions.length;
  updateHotbar();
}, { passive: true });
startButton.addEventListener('click', startGame);
returnLobbyButton.addEventListener('click', () => returnToLobby('Back in the lobby. Choose a mode to play.'));
onlineMatchButton.addEventListener('click', findOnlineMatch);
for (const button of document.querySelectorAll('[data-match-mode]')) {
  button.addEventListener('click', () => {
    if (state.started) return;
    configureMatchMode(button.dataset.matchMode);
    for (const card of document.querySelectorAll('[data-match-mode]')) {
      const selected = card === button;
      card.classList.toggle('selected', selected);
      card.setAttribute('aria-pressed', String(selected));
    }
    overlayCopy.textContent = `${matchModes[selectedMatchMode].label}: protect your pig, gather resources, and build your own way across the void.`;
    updateStartButtonLabel();
  });
}
$('#close-shop').addEventListener('click', closeShop);
$('#help-button').addEventListener('click', () => showNotice('WASD move · Space jump · Shift sneak · Mouse/touch drag look · click/tap attack · right-click or Build button place · E shop'));
$('#settings-button').addEventListener('click', openSettings);
$('#menu-settings-button').addEventListener('click', openSettings);
$('#close-settings').addEventListener('click', closeSettings);
$('#done-settings').addEventListener('click', closeSettings);
$('#reset-bindings').addEventListener('click', () => {
  Object.assign(bindings, DEFAULT_BINDINGS);
  fieldOfView = 76;
  camera.fov = fieldOfView;
  camera.updateProjectionMatrix();
  $('#fov-slider').value = String(fieldOfView);
  $('#fov-value').textContent = `${fieldOfView}°`;
  pendingRebind = null;
  saveSettings();
  renderBindings();
});
$('#fov-slider').addEventListener('input', (event) => {
  fieldOfView = Number(event.target.value);
  camera.fov = fieldOfView;
  camera.updateProjectionMatrix();
  $('#fov-value').textContent = `${fieldOfView}°`;
  saveSettings();
});
$('#fov-slider').value = String(fieldOfView);
$('#fov-value').textContent = `${fieldOfView}°`;
window.addEventListener('keydown', handleRebind, true);
renderBindings();
setTouchControls(touchControlsEnabled, false);
updateStartButtonLabel();

const crosshair = $('#crosshair');
let lastAimTarget = null;
let fpsReportStartedAt = performance.now();
let fpsReportFrameCount = 0;

function frame() {
  requestAnimationFrame(frame);
  const delta = Math.min(clock.getDelta(), 0.045);
  const time = performance.now() / 1000;
  if (state.mode === 'playing' || state.mode === 'waiting') {
    heldItem.visible = state.alive && state.mode === 'playing';
    movePlayer(delta);
    if (state.mode === 'waiting') {
      if (camera.position.y < -25) {
        camera.position.set(8, 1.65, 8);
        state.velocityX = 0;
        state.velocityY = 0;
        state.velocityZ = 0;
      }
    } else {
      if (onlineMatch && time - lastNetworkMoveAt >= 0.05) {
        lastNetworkMoveAt = time;
        sendMultiplayerMessage({
          type: 'move',
          position: { x: camera.position.x, y: camera.position.y, z: camera.position.z },
          yaw: state.yaw,
        });
      }
      if (!onlineMatch) {
        moveBots(delta, time);
        updateGenerator(time);
      }
      updatePickups(time, delta);
      if (!onlineMatch) updateArrows(delta);
      updateInteraction();
      const target = state.alive ? getAimTarget() : null;
      if (target !== lastAimTarget) {
        lastAimTarget = target;
        crosshair.classList.toggle('targeting', Boolean(target));
        crosshair.setAttribute('aria-label', target ? `Aiming at ${target.team.name}` : 'Aim reticle');
      }
      if (!onlineMatch) for (const fly of [...fireballs]) fly(delta);
      if (!onlineMatch && camera.position.y < -25 && state.alive) hurtPlayer(100);
    }
  } else heldItem.visible = false;
  for (const remote of remotePlayers.values()) {
    remote.group.position.lerp(remote.targetPosition, Math.min(1, delta * 14));
  }
  updateVisualAnimations(time, delta);
  renderer.render(scene, camera);
  fpsReportFrameCount += 1;
  const fpsReportNow = performance.now();
  if (fpsReportNow - fpsReportStartedAt >= 500) {
    const sampledFps = Math.round(fpsReportFrameCount * 1000 / (fpsReportNow - fpsReportStartedAt));
    const nextScale = nextRenderScale(adaptiveRenderScale, sampledFps);
    if (nextScale !== adaptiveRenderScale) {
      adaptiveRenderScale = nextScale;
      renderer.setPixelRatio(adaptiveRenderScale);
      renderer.setSize(window.innerWidth, window.innerHeight);
    }
    if (window.parent !== window) {
      window.parent.postMessage({
        type: 'void-pig-wars-fps',
        fps: sampledFps,
      }, '*');
    }
    fpsReportStartedAt = fpsReportNow;
    fpsReportFrameCount = 0;
  }
}

createWorld();
updateHeading();
updateHotbar();
renderTeamStatus();
frame();

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
