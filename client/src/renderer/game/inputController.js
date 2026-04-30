const directionCodes = {
  ArrowUp: 'up',
  KeyW: 'up',
  ArrowDown: 'down',
  KeyS: 'down',
  ArrowLeft: 'left',
  KeyA: 'left',
  ArrowRight: 'right',
  KeyD: 'right'
};

const keys = {
  up: false,
  down: false,
  left: false,
  right: false
};

const dirStack = [];
let placeQueued = false;
let itemSlotQueued = -1;
let bound = false;

function isTypingTarget(event) {
  const tag = event.target?.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
}

function onKeyDown(event) {
  if (isTypingTarget(event)) return;

  const key = directionCodes[event.code];
  if (key) {
    const existingIndex = dirStack.indexOf(key);
    if (existingIndex >= 0) dirStack.splice(existingIndex, 1);
    dirStack.push(key);
    syncDirectionKeys();
    event.preventDefault();
    return;
  }

  if (event.code === 'Space' && !event.repeat) {
    placeQueued = true;
    event.preventDefault();
  }

  const itemSlot = {
    KeyZ: 0,
    KeyX: 1,
    KeyC: 2,
    KeyV: 3,
    KeyB: 4
  }[event.code];
  if (itemSlot !== undefined) {
    if (!event.repeat) itemSlotQueued = itemSlot;
    event.preventDefault();
  }
}

function onKeyUp(event) {
  if (isTypingTarget(event)) return;

  const key = directionCodes[event.code];
  if (key) {
    const existingIndex = dirStack.indexOf(key);
    if (existingIndex >= 0) dirStack.splice(existingIndex, 1);
    syncDirectionKeys();
    event.preventDefault();
  }
}

function syncDirectionKeys() {
  keys.up = false;
  keys.down = false;
  keys.left = false;
  keys.right = false;

  const preferredDirection = dirStack[dirStack.length - 1];
  if (preferredDirection) keys[preferredDirection] = true;
}

export function bindGameInput() {
  if (bound) return;
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  bound = true;
}

export function unbindGameInput() {
  if (!bound) return;
  window.removeEventListener('keydown', onKeyDown);
  window.removeEventListener('keyup', onKeyUp);
  bound = false;
  dirStack.length = 0;
  keys.up = false;
  keys.down = false;
  keys.left = false;
  keys.right = false;
  placeQueued = false;
  itemSlotQueued = -1;
}

export function getInputKeys() {
  return { ...keys };
}

export function consumePlaceQueued() {
  const queued = placeQueued;
  placeQueued = false;
  return queued;
}

export function consumeItemSlotQueued() {
  const queued = itemSlotQueued;
  itemSlotQueued = -1;
  return queued;
}
