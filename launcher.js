const gameUrlInput = document.querySelector('#game-url');
const launchButton = document.querySelector('#launch-game');
const placeholderLaunchButton = document.querySelector('#placeholder-launch');
const gameFrame = document.querySelector('#game-frame');
const gamePlaceholder = document.querySelector('#game-placeholder');
const launcherStatus = document.querySelector('#launcher-status');
const fpsDisplay = document.querySelector('#fps-display');
let storageUnavailable = false;
let savedGameUrl = null;
try {
  savedGameUrl = localStorage.getItem('void-pig-wars-game-url');
} catch {
  storageUnavailable = true;
}
const defaultGameUrl = ['localhost', '127.0.0.1'].includes(window.location.hostname)
  ? new URL('./index.html', window.location.href).href
  : 'https://vflzx.github.io/void-pig-wars/';

gameUrlInput.value = savedGameUrl || defaultGameUrl;

function setLauncherStatus(message) {
  launcherStatus.textContent = storageUnavailable ? `${message} The URL will not be saved.` : message;
}

function launchGame() {
  let gameUrl;
  try {
    gameUrl = new URL(gameUrlInput.value.trim(), window.location.href);
  } catch {
    launcherStatus.textContent = 'Enter a valid game URL to launch.';
    gameUrlInput.focus();
    return;
  }
  if (!['http:', 'https:'].includes(gameUrl.protocol)) {
    launcherStatus.textContent = 'The game URL must use HTTP or HTTPS.';
    gameUrlInput.focus();
    return;
  }

  if (!storageUnavailable) {
    try {
      localStorage.setItem('void-pig-wars-game-url', gameUrl.href);
    } catch {
      storageUnavailable = true;
    }
  }
  fpsDisplay.textContent = '--';
  setLauncherStatus('Loading game…');
  gamePlaceholder.hidden = true;
  gameFrame.hidden = false;
  gameFrame.src = gameUrl.href;
}

launchButton.addEventListener('click', launchGame);
placeholderLaunchButton.addEventListener('click', launchGame);
gameUrlInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') launchGame();
});

gameFrame.addEventListener('load', () => {
  setLauncherStatus('Game loaded. Click inside the game to play.');
});

window.addEventListener('message', (event) => {
  if (event.source !== gameFrame.contentWindow) return;
  const message = event.data;
  if (message?.type !== 'void-pig-wars-fps' || !Number.isFinite(message.fps)) return;

  fpsDisplay.textContent = String(message.fps);
  setLauncherStatus('Game running · click inside the game to play.');
});
