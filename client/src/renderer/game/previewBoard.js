import { BALLOON_PAD, CHAR_OFFSET_Y, ITEM_PAD, SPRITE_SCALE } from '../config/appConfig.js';
import { state } from '../core/state.js';
import { imageSources } from '../data/assets.js';
import { maps } from '../data/maps.js';

export const images = {};
const playerDirCache = new Map();
const playerLastPosition = new Map();
const bombKickAnimations = new Map();
const completedBombKickAnimations = new Set();
const scaledImageCache = new Map();
const pendingScaledImages = new Set();
const decodedImages = new WeakSet();
let preloadPromise = null;
let lastPreparedTileSize = 0;
let pendingImageRedraw = false;
let pendingBoardFrame = false;
let liveLayerCache = null;
let lastItemSlotsKey = '';
let lastTimerText = '';
const BOMB_KICK_ANIM_MS = 140;
const BOMB_BREATHE_PERIOD_MS = 700;

window.addEventListener('resize', () => {
  if (state.currentView === 'gameView') schedulePreviewBoardDraw();
});

function shouldRedrawForImageLoad() {
  return state.currentView === 'roomView' || state.currentView === 'gameView';
}

function scheduleImageRedraw() {
  if (!shouldRedrawForImageLoad() || pendingImageRedraw) return;
  pendingImageRedraw = true;
  requestAnimationFrame(() => {
    pendingImageRedraw = false;
    if (shouldRedrawForImageLoad()) schedulePreviewBoardDraw();
  });
}

for (const [key, src] of Object.entries(imageSources)) {
  const img = new Image();
  img.src = src;
  img.onload = scheduleImageRedraw;
  images[key] = img;
}

function loadImage(key, src) {
  if (images[key]) return images[key];
  const img = new Image();
  img.src = src;
  img.onload = scheduleImageRedraw;
  images[key] = img;
  return img;
}

function decodeImage(img) {
  if (!img || decodedImages.has(img)) return Promise.resolve();
  const markDecoded = () => {
    decodedImages.add(img);
  };

  if (img.complete && img.naturalWidth > 0) {
    markDecoded();
    return Promise.resolve();
  }

  if (typeof img.decode === 'function') {
    return img.decode().then(markDecoded).catch(() => {});
  }

  return new Promise((resolve) => {
    img.addEventListener('load', () => {
      markDecoded();
      resolve();
    }, { once: true });
    img.addEventListener('error', resolve, { once: true });
  });
}

function isSpawnSafe(map, x, y) {
  return map.spawnPoints.some((p) => Math.abs(p.x - x) + Math.abs(p.y - y) <= 1);
}

function shouldPlaceSoftBlock(map, x, y) {
  if (map.grid[y][x] === '#') return false;
  if (isSpawnSafe(map, x, y)) return false;
  const v = (x * 37 + y * 19 + map.id.charCodeAt(3) * 11) % 100;
  return v < 56;
}

function tileKey(x, y) {
  return `${x},${y}`;
}

function isWalkable(map, x, y) {
  return map.grid[y]?.[x] === '.';
}

function buildExplosionTiles(map) {
  const origin = findPreviewOrigin(map);
  const tiles = [origin];
  for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
    for (let step = 1; step <= 2; step++) {
      const x = origin.x + dx * step;
      const y = origin.y + dy * step;
      if (!isWalkable(map, x, y)) break;
      tiles.push({ x, y });
    }
  }
  return tiles;
}

function findPreviewOrigin(map) {
  const cx = Math.floor(map.width / 2);
  const cy = Math.floor(map.height / 2);
  const candidates = [
    { x: cx, y: cy },
    { x: cx - 1, y: cy },
    { x: cx + 1, y: cy },
    { x: cx, y: cy - 1 },
    { x: cx, y: cy + 1 },
    { x: map.spawnPoints[4]?.x ?? 1, y: map.spawnPoints[4]?.y ?? 1 }
  ];
  return candidates.find((p) => isWalkable(map, p.x, p.y)) ?? map.spawnPoints[0];
}

function makePreviewLayout(map) {
  const explosionTiles = buildExplosionTiles(map);
  const reserved = new Set(explosionTiles.map((t) => tileKey(t.x, t.y)));
  for (const p of map.spawnPoints) reserved.add(tileKey(p.x, p.y));

  const balloons = [
    { x: map.spawnPoints[0].x + 1, y: map.spawnPoints[0].y, img: images.waterball },
    { x: map.spawnPoints[1].x - 1, y: map.spawnPoints[1].y, img: images.waterball_green },
    { x: map.spawnPoints[2].x + 1, y: map.spawnPoints[2].y, img: images.waterball_red }
  ].filter((b) => isWalkable(map, b.x, b.y) && !reserved.has(tileKey(b.x, b.y)));
  for (const b of balloons) reserved.add(tileKey(b.x, b.y));

  const softBlocks = new Set();
  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      if (reserved.has(tileKey(x, y))) continue;
      if (shouldPlaceSoftBlock(map, x, y)) softBlocks.add(tileKey(x, y));
    }
  }

  const fallbackItems = [
    { x: Math.floor(map.width / 2), y: 1, itemType: 'Speed' },
    { x: Math.floor(map.width / 2), y: Math.floor(map.height / 2), itemType: 'Power' },
    { x: Math.max(2, map.width - 4), y: Math.max(2, map.height - 4), itemType: 'Needle' },
    { x: 3, y: Math.max(2, map.height - 4), itemType: 'Balloon' },
    { x: Math.max(3, map.width - 5), y: 3, itemType: 'Shield' },
    { x: Math.max(2, map.width - 6), y: Math.max(2, Math.floor(map.height / 2)), itemType: 'Glove' }
  ];
  const itemSource = map.presetItems?.slice(0, 28) || fallbackItems;
  const items = [];
  for (const item of itemSource) {
    const key = tileKey(item.x, item.y);
    if (!isWalkable(map, item.x, item.y)) continue;
    if (reserved.has(key) || softBlocks.has(key)) continue;
    items.push(item);
    reserved.add(key);
    if (items.length >= 10) break;
  }

  return { softBlocks, items, balloons, explosionTiles };
}

function itemImage(type) {
  return images[`item${type}`] || images.itemBalloon;
}

function currentPlayer() {
  const userId = state.user?.userId || state.user?.user_id;
  if (!userId) return null;
  return livePlayers().find((player) => Number(player.userId) === Number(userId)) || null;
}

function renderItemSlots() {
  const slots = document.querySelector('#gameItemSlots');
  if (!slots) return;

  const player = currentPlayer();
  const inventory = player?.inventory || [];
  const shieldActive = !!(player?.shieldUntilTick && player.shieldUntilTick > (state.gameState?.tick || 0));
  const slotsKey = `${player?.userId || 'none'}|${inventory.join(',')}|${player?.hasGlove ? 1 : 0}|${shieldActive ? 1 : 0}`;
  if (slotsKey === lastItemSlotsKey) return;
  lastItemSlotsKey = slotsKey;

  const keys = ['Z', 'X', 'C', 'V', 'B'];
  const gloveSlot = player?.hasGlove ? `
    <div class="item-slot filled passive" title="Glove">
      <span>G</span>
      <img src="${images.itemGlove?.src || ''}" alt="Glove" />
    </div>
  ` : '';
  const shieldSlot = shieldActive ? `
    <div class="item-slot filled active-shield" title="Shield active">
      <span>S</span>
      <img src="${images.itemShield?.src || ''}" alt="Shield" />
    </div>
  ` : '';

  slots.innerHTML = keys.map((key, index) => {
    const item = inventory[index] || null;
    const img = item ? itemImage(item) : null;
    return `
      <div class="item-slot ${item ? 'filled' : 'empty'}">
        <span>${key}</span>
        ${img?.src ? `<img src="${img.src}" alt="${item}" />` : '<div class="item-slot__empty"></div>'}
      </div>
    `;
  }).join('') + gloveSlot + shieldSlot;
}

function playerColorBySlot(slotNo) {
  return ['blue', 'green', 'red', 'yellow', 'purple', 'white'][Math.max(0, (slotNo || 1) - 1)] || 'blue';
}

function playerSkin(player) {
  const skin = player?.skin || player?.profileImageUrl || player?.profile_image_url;
  return ['blue', 'green', 'purple', 'red', 'white', 'yellow'].includes(skin)
    ? skin
    : playerColorBySlot(player?.slotNo);
}

function waterballImageForPlayer(player) {
  const bySkin = {
    blue: images.waterball,
    green: images.waterball_green,
    purple: images.waterball_purple,
    red: images.waterball_red,
    white: images.waterball_white,
    yellow: images.waterball_yellow
  };
  return bySkin[playerSkin(player)] || images.waterball;
}

export function preloadGameSprites() {
  if (preloadPromise) return preloadPromise;
  preloadPromise = (async () => {
    for (const color of ['blue', 'green', 'red', 'yellow', 'purple', 'white']) {
      loadImage(`${color}PlayerPanic`, `/assets/images/characters/${color}/panic.png`);
      for (const frame of ['default', '1', '2']) {
        loadImage(`${color}PlayerFront${frame}`, `/assets/images/characters/${color}/front/${frame}.png`);
        loadImage(`${color}PlayerBack${frame}`, `/assets/images/characters/${color}/back/${frame}.png`);
      }
      for (const frame of ['default', '1', '2']) {
        loadImage(`${color}PlayerLeft${frame}`, `/assets/images/characters/${color}/side/left_${frame}.png`);
        loadImage(`${color}PlayerRight${frame}`, `/assets/images/characters/${color}/side/right_${frame}.png`);
      }
    }
    await Promise.all(Object.values(images).map(decodeImage));
  })();
  return preloadPromise;
}

function playerSpriteImage(color, direction, moving, trapped) {
  if (trapped) return loadImage(`${color}PlayerPanic`, `/assets/images/characters/${color}/panic.png`);
  const frame = moving ? (Math.floor(performance.now() / 180) % 2 === 0 ? '1' : '2') : 'default';
  if (direction === 'left') return loadImage(`${color}PlayerLeft${frame}`, `/assets/images/characters/${color}/side/left_${frame}.png`);
  if (direction === 'right') return loadImage(`${color}PlayerRight${frame}`, `/assets/images/characters/${color}/side/right_${frame}.png`);
  if (direction === 'up') return loadImage(`${color}PlayerBack${frame}`, `/assets/images/characters/${color}/back/${frame}.png`);
  return loadImage(`${color}PlayerFront${frame}`, `/assets/images/characters/${color}/front/${frame}.png`);
}

function getPlayerDirection(player) {
  const key = String(player.userId);
  const previous = playerLastPosition.get(key);
  const dx = previous ? player.x - previous.x : 0;
  const dy = previous ? player.y - previous.y : 0;
  const moving = Math.abs(dx) > 0.01 || Math.abs(dy) > 0.01;
  let direction = player.direction || playerDirCache.get(key) || 'down';

  if (moving) {
    if (Math.abs(dx) >= Math.abs(dy)) direction = dx > 0 ? 'right' : 'left';
    else direction = dy > 0 ? 'down' : 'up';
    playerDirCache.set(key, direction);
  }
  playerLastPosition.set(key, { x: player.x, y: player.y });

  return { direction, moving };
}

function drawTileBackground(ctx, map, tileSize) {
  ctx.fillStyle = '#070e1a';
  ctx.fillRect(0, 0, map.width * tileSize, map.height * tileSize);
  ctx.strokeStyle = '#0d1a2e';
  ctx.lineWidth = 1;
  for (let y = 0; y <= map.height; y++) {
    ctx.beginPath();
    ctx.moveTo(0, y * tileSize);
    ctx.lineTo(map.width * tileSize, y * tileSize);
    ctx.stroke();
  }
  for (let x = 0; x <= map.width; x++) {
    ctx.beginPath();
    ctx.moveTo(x * tileSize, 0);
    ctx.lineTo(x * tileSize, map.height * tileSize);
    ctx.stroke();
  }
}

function drawSolidWall(ctx, x, y, tileSize) {
  const px = x * tileSize;
  const py = y * tileSize;
  ctx.fillStyle = '#1a2740';
  ctx.fillRect(px, py, tileSize, tileSize);
  ctx.strokeStyle = '#111e30';
  ctx.strokeRect(px + 0.5, py + 0.5, tileSize - 1, tileSize - 1);
  ctx.fillStyle = '#2a3d58';
  ctx.fillRect(px + 2, py + 2, tileSize - 4, 3);
  ctx.fillRect(px + 2, py + 2, 3, tileSize - 4);
}

function drawImageIfReady(ctx, img, x, y, w, h) {
  if (img?.complete) ctx.drawImage(img, x, y, w, h);
}

function bombPhaseOffset(id) {
  const text = String(id ?? 'bomb');
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) {
    hash = (hash * 31 + text.charCodeAt(i)) >>> 0;
  }
  return hash % BOMB_BREATHE_PERIOD_MS;
}

function easeOutCubic(t) {
  return 1 - Math.pow(1 - t, 3);
}

function drawScaledImage(ctx, img, cacheKey, x, y, w, h) {
  if (!img?.complete) return;
  const width = Math.max(1, Math.round(w));
  const height = Math.max(1, Math.round(h));
  const key = `${cacheKey}|${width}x${height}`;
  let cached = scaledImageCache.get(key);
  if (cached) {
    ctx.drawImage(cached, x, y, w, h);
    return;
  }

  scheduleScaledImage(img, key, width, height);
  ctx.drawImage(img, x, y, w, h);
}

function createScaledImage(img, width, height) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const cacheCtx = canvas.getContext('2d');
  cacheCtx.imageSmoothingEnabled = true;
  cacheCtx.drawImage(img, 0, 0, width, height);
  return canvas;
}

function warmScaledImage(img, cacheKey, w, h) {
  if (!img?.complete) return;
  const width = Math.max(1, Math.round(w));
  const height = Math.max(1, Math.round(h));
  const key = `${cacheKey}|${width}x${height}`;
  if (!scaledImageCache.has(key)) {
    scaledImageCache.set(key, createScaledImage(img, width, height));
  }
}

function scheduleScaledImage(img, key, width, height) {
  if (pendingScaledImages.has(key) || scaledImageCache.has(key)) return;
  pendingScaledImages.add(key);

  const run = () => {
    try {
      scaledImageCache.set(key, createScaledImage(img, width, height));
    } finally {
      pendingScaledImages.delete(key);
      liveLayerCache = null;
      if (state.currentView === 'gameView') schedulePreviewBoardDraw();
    }
  };

  if ('requestIdleCallback' in window) {
    window.requestIdleCallback(run, { timeout: 80 });
  } else {
    setTimeout(run, 0);
  }
}

export async function prepareGameRenderAssets() {
  await preloadGameSprites();

  const canvas = document.querySelector('#previewCanvas');
  const map = maps[state.mapId] || maps.map1;
  if (!canvas || !map) return;

  const rect = canvas.getBoundingClientRect();
  const width = Math.max(320, Math.floor(rect.width || canvas.clientWidth || 0));
  const height = Math.max(240, Math.floor(rect.height || canvas.clientHeight || 0));
  const tileSize = Math.floor(Math.min(width / map.width, height / map.height));
  if (!tileSize || tileSize === lastPreparedTileSize) return;
  lastPreparedTileSize = tileSize;

  const balloonPad = tileSize * BALLOON_PAD;
  const balloonSize = tileSize - balloonPad * 2;
  const splashShort = tileSize * (28 / 40);
  const spriteSize = tileSize * SPRITE_SCALE * 2;

  warmScaledImage(images.softBlock, `block:${images.softBlock?.src || 'soft'}`, tileSize, tileSize);
  for (const img of [
    images.waterball,
    images.waterball_green,
    images.waterball_purple,
    images.waterball_red,
    images.waterball_white,
    images.waterball_yellow
  ]) {
    warmScaledImage(img, `bomb:${img?.src || 'waterball'}`, balloonSize, balloonSize);
  }
  warmScaledImage(images.splashCenter, `splash:${images.splashCenter?.src || 'center'}`, tileSize, tileSize);
  warmScaledImage(images.splashHorizontal, `splash:${images.splashHorizontal?.src || 'horizontal'}`, tileSize, splashShort);
  warmScaledImage(images.splashVertical, `splash:${images.splashVertical?.src || 'vertical'}`, splashShort, tileSize);

  for (const color of ['blue', 'green', 'red', 'yellow', 'purple', 'white']) {
    for (const key of [
      `${color}PlayerPanic`,
      `${color}PlayerFrontdefault`,
      `${color}PlayerFront1`,
      `${color}PlayerFront2`,
      `${color}PlayerBackdefault`,
      `${color}PlayerBack1`,
      `${color}PlayerBack2`,
      `${color}PlayerLeftdefault`,
      `${color}PlayerLeft1`,
      `${color}PlayerLeft2`,
      `${color}PlayerRightdefault`,
      `${color}PlayerRight1`,
      `${color}PlayerRight2`
    ]) {
      const img = images[key];
      warmScaledImage(img, `player:${img?.src || key}`, spriteSize, spriteSize);
    }
  }
}

function liveLayerKey(map, tileSize) {
  const blocks = state.gameState.blocks || [];
  let solidCount = 0;
  let softCount = 0;
  let positionHash = 0;
  for (const block of blocks) {
    if (block.destructible) softCount += 1;
    else solidCount += 1;
    positionHash = (positionHash + (block.x + 1) * 31 + (block.y + 1) * 997 + (block.destructible ? 7 : 13)) % 1000003;
  }
  return `${state.gameState.mapId || state.mapId}|${map.width}x${map.height}|${tileSize}|${solidCount}|${softCount}|${positionHash}`;
}

function drawLiveStaticLayer(ctx, map, tileSize) {
  const key = liveLayerKey(map, tileSize);
  if (!liveLayerCache || liveLayerCache.key !== key) {
    const canvas = document.createElement('canvas');
    canvas.width = map.width * tileSize;
    canvas.height = map.height * tileSize;
    const layerCtx = canvas.getContext('2d');
    drawTileBackground(layerCtx, map, tileSize);

    for (const block of state.gameState.blocks || []) {
      if (block.destructible) {
        drawScaledImage(layerCtx, images.softBlock, `block:${images.softBlock?.src || 'soft'}`, block.x * tileSize, block.y * tileSize, tileSize, tileSize);
      } else {
        drawSolidWall(layerCtx, block.x, block.y, tileSize);
      }
    }

    liveLayerCache = { key, canvas };
  }
  ctx.drawImage(liveLayerCache.canvas, 0, 0);
}

function livePlayers() {
  const source = state.gameState?.players;
  if (!source) return [];
  const players = Array.isArray(source) ? source : Object.values(source);
  return players
    .filter((player) => !player.left && !player.disconnected && player.state !== 'Dead' && player.isAlive !== false)
    .sort((a, b) => (a.slotNo || 0) - (b.slotNo || 0));
}

function teamColor(team) {
  return Number(team) === 1
    ? { stroke: 'rgba(248, 113, 113, 0.95)', fill: 'rgba(127, 29, 29, 0.32)', label: '#fecaca', name: '#fca5a5', text: 'B' }
    : { stroke: 'rgba(96, 165, 250, 0.95)', fill: 'rgba(30, 64, 175, 0.32)', label: '#bfdbfe', name: '#93c5fd', text: 'A' };
}

function drawTeamMarker(ctx, player, cx, cy, tileSize) {
  if (state.gameState?.gameMode !== 'TEAM') return;
  const color = teamColor(player.team);
  ctx.save();
  ctx.fillStyle = color.fill;
  ctx.strokeStyle = color.stroke;
  ctx.lineWidth = Math.max(2, tileSize * 0.055);
  ctx.beginPath();
  ctx.ellipse(cx, cy + tileSize * 0.27, tileSize * 0.36, tileSize * 0.17, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  const badgeSize = Math.max(14, tileSize * 0.28);
  const bx = cx + tileSize * 0.34;
  const by = cy - tileSize * 0.42;
  ctx.fillStyle = color.stroke;
  ctx.beginPath();
  ctx.arc(bx, by, badgeSize * 0.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#06101d';
  ctx.font = `bold ${Math.max(10, badgeSize * 0.62)}px Segoe UI, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(color.text, bx, by + 0.5);
  ctx.restore();
}

function displayBombPosition(bomb) {
  const fromX = bomb.kickFromX;
  const fromY = bomb.kickFromY;
  const startedTick = bomb.kickStartedTick;
  if (fromX === undefined || fromY === undefined || startedTick === undefined) {
    return { x: bomb.x, y: bomb.y };
  }

  const animKey = `${bomb.id}|${fromX},${fromY}|${bomb.x},${bomb.y}|${startedTick}`;
  if (completedBombKickAnimations.has(animKey)) return { x: bomb.x, y: bomb.y };

  let anim = bombKickAnimations.get(bomb.id);
  if (!anim || anim.key !== animKey) {
    anim = {
      key: animKey,
      fromX,
      fromY,
      toX: bomb.x,
      toY: bomb.y,
      startTime: performance.now()
    };
    bombKickAnimations.set(bomb.id, anim);
  }

  const progress = Math.min(1, (performance.now() - anim.startTime) / BOMB_KICK_ANIM_MS);
  if (progress >= 1) {
    bombKickAnimations.delete(bomb.id);
    completedBombKickAnimations.add(animKey);
    return { x: bomb.x, y: bomb.y };
  }

  schedulePreviewBoardDraw();
  const ease = easeOutCubic(progress);
  return {
    x: anim.fromX + (anim.toX - anim.fromX) * ease,
    y: anim.fromY + (anim.toY - anim.fromY) * ease
  };
}

function drawBouncyBomb(ctx, img, cacheKey, bombId, x, y, size) {
  const now = performance.now();
  const breatheT = ((now + bombPhaseOffset(bombId)) % BOMB_BREATHE_PERIOD_MS) / BOMB_BREATHE_PERIOD_MS;
  const factor = (1 - Math.cos(breatheT * Math.PI * 2)) / 2;
  const scaleX = 1 + factor * 0.18;
  const scaleY = 1 - factor * 0.18;
  const pivotX = x + size * 0.5;
  const pivotY = y + size * 0.9;

  ctx.save();
  ctx.translate(pivotX, pivotY);
  ctx.scale(scaleX, scaleY);
  ctx.translate(-pivotX, -pivotY);
  drawScaledImage(ctx, img, cacheKey, x, y, size, size);
  ctx.restore();
}

function drawLiveBoard(ctx, map, tileSize) {
  drawLiveStaticLayer(ctx, map, tileSize);
  const players = livePlayers();
  const playersById = new Map(players.map((player) => [player.userId, player]));

  const blockKeys = new Set();
  for (const block of state.gameState.blocks || []) {
    blockKeys.add(tileKey(block.x, block.y));
  }

  const itemPad = tileSize * ITEM_PAD;
  for (const item of state.gameState.items || []) {
    if (!isWalkable(map, item.x, item.y) || blockKeys.has(tileKey(item.x, item.y))) continue;
    const img = itemImage(item.kind || item.itemType);
    drawImageIfReady(ctx, img, item.x * tileSize + itemPad, item.y * tileSize + itemPad, tileSize - itemPad * 2, tileSize - itemPad * 2);
  }

  const balloonPad = tileSize * BALLOON_PAD;
  const balloonSize = tileSize - balloonPad * 2;
  for (const bomb of state.gameState.bombs || []) {
    const owner = playersById.get(bomb.ownerUserId);
    const img = waterballImageForPlayer(owner);
    const pos = displayBombPosition(bomb);
    drawBouncyBomb(ctx, img, `bomb:${img?.src || 'waterball'}`, bomb.id, pos.x * tileSize + balloonPad, pos.y * tileSize + balloonPad, balloonSize);
  }
  if (state.currentView === 'gameView' && state.gameState.bombs?.length) {
    schedulePreviewBoardDraw();
  }

  const short = tileSize * (28 / 40);
  for (const explosion of state.gameState.explosions || []) {
    const originX = explosion.originX ?? explosion.x;
    const originY = explosion.originY ?? explosion.y;
    const tiles = explosion.tiles || [{ x: originX, y: originY }];
    drawScaledImage(ctx, images.splashCenter, `splash:${images.splashCenter?.src || 'center'}`, originX * tileSize, originY * tileSize, tileSize, tileSize);
    for (const tile of tiles) {
      if (tile.x === originX && tile.y === originY) continue;
      if (tile.y === originY) {
        drawScaledImage(ctx, images.splashHorizontal, `splash:${images.splashHorizontal?.src || 'horizontal'}`, tile.x * tileSize, tile.y * tileSize + (tileSize - short) / 2, tileSize, short);
      } else {
        drawScaledImage(ctx, images.splashVertical, `splash:${images.splashVertical?.src || 'vertical'}`, tile.x * tileSize + (tileSize - short) / 2, tile.y * tileSize, short, tileSize);
      }
    }
  }

  const spriteSize = tileSize * SPRITE_SCALE * 2;
  for (const player of players) {
    const cx = player.x * tileSize;
    const cy = player.y * tileSize;
    const color = playerSkin(player);
    const { direction, moving } = getPlayerDirection(player);
    const trapped = player.state === 'Trapped';
    const dead = player.state === 'Dead' || player.isAlive === false || player.disconnected || player.left;
    const img = playerSpriteImage(color, direction, moving, trapped) || images[`${color}PlayerFrontdefault`] || images.bluePlayer;
    drawTeamMarker(ctx, player, cx, cy, tileSize);
    ctx.globalAlpha = dead ? 0.45 : 1;
    drawScaledImage(ctx, img, `player:${img?.src || color}`, cx - tileSize * SPRITE_SCALE, cy - tileSize * SPRITE_SCALE + tileSize * CHAR_OFFSET_Y, spriteSize, spriteSize);
    ctx.globalAlpha = 1;
    if (trapped) {
      ctx.strokeStyle = 'rgba(100, 220, 255, 0.85)';
      ctx.lineWidth = 2.5;
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      ctx.arc(cx, cy, tileSize * 0.46, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    if (!dead && player.shieldUntilTick && player.shieldUntilTick > (state.gameState.tick || 0)) {
      ctx.strokeStyle = 'rgba(255, 210, 50, 0.85)';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(cx, cy, tileSize * 0.6, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.font = `bold ${Math.max(10, tileSize * 0.2)}px Segoe UI, sans-serif`;
    ctx.textAlign = 'center';
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(0,0,0,0.75)';
    ctx.fillStyle = state.gameState?.gameMode === 'TEAM' ? teamColor(player.team).name : '#eef4fb';
    ctx.strokeText(player.nickname || `P${player.slotNo || ''}`, cx, cy - tileSize * 0.48);
    ctx.fillText(player.nickname || `P${player.slotNo || ''}`, cx, cy - tileSize * 0.48);
  }
}

export function schedulePreviewBoardDraw() {
  if (pendingBoardFrame) return;
  pendingBoardFrame = true;
  requestAnimationFrame(() => {
    pendingBoardFrame = false;
    drawPreviewBoard();
  });
}

export function drawPreviewBoard() {
  const canvas = document.querySelector('#previewCanvas');
  if (!canvas) return;
  const rect = canvas.getBoundingClientRect();
  const nextWidth = Math.max(320, Math.floor(rect.width));
  const nextHeight = Math.max(240, Math.floor(rect.height));
  if (canvas.width !== nextWidth || canvas.height !== nextHeight) {
    canvas.width = nextWidth;
    canvas.height = nextHeight;
    liveLayerCache = null;
  }
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const map = maps[state.mapId] || maps.map1;
  const tileSize = Math.floor(Math.min(canvas.width / map.width, canvas.height / map.height));
  const offsetX = Math.floor((canvas.width - tileSize * map.width) / 2);
  const offsetY = Math.floor((canvas.height - tileSize * map.height) / 2);

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#050b14';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.save();
  ctx.translate(offsetX, offsetY);

  if (state.currentView === 'gameView' && state.gameState) {
    drawLiveBoard(ctx, map, tileSize);
    ctx.restore();
    const duration = state.gameState.gameDurationSeconds || state.gameDurationSeconds || 180;
    const remaining = Math.max(0, duration - Math.floor((state.gameState.tick || 0) / 60));
    const minutes = Math.floor(remaining / 60);
    const seconds = String(remaining % 60).padStart(2, '0');
    const timer = document.querySelector('#gameTimer');
    const timerText = `${minutes}:${seconds}`;
    if (timer && timerText !== lastTimerText) {
      timer.textContent = timerText;
      lastTimerText = timerText;
    }
    renderItemSlots();
    return;
  }

  const layout = makePreviewLayout(map);
  drawTileBackground(ctx, map, tileSize);

  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      if (map.grid[y][x] === '#') drawSolidWall(ctx, x, y, tileSize);
      else if (layout.softBlocks.has(tileKey(x, y))) {
        drawImageIfReady(ctx, images.softBlock, x * tileSize, y * tileSize, tileSize, tileSize);
      }
    }
  }

  const itemPad = tileSize * ITEM_PAD;
  for (const item of layout.items) {
    const img = itemImage(item.itemType);
    drawImageIfReady(ctx, img, item.x * tileSize + itemPad, item.y * tileSize + itemPad, tileSize - itemPad * 2, tileSize - itemPad * 2);
  }

  const balloonPad = tileSize * BALLOON_PAD;
  for (const b of layout.balloons) {
    const size = tileSize - balloonPad * 2;
    drawBouncyBomb(ctx, b.img, `preview-bomb:${b.img?.src || 'waterball'}`, `${b.x},${b.y}`, b.x * tileSize + balloonPad, b.y * tileSize + balloonPad, size);
  }

  const origin = layout.explosionTiles[0];
  drawImageIfReady(ctx, images.splashCenter, origin.x * tileSize, origin.y * tileSize, tileSize, tileSize);
  const short = tileSize * (28 / 40);
  for (const t of layout.explosionTiles.slice(1)) {
    if (t.y === origin.y) {
      drawImageIfReady(ctx, images.splashHorizontal, t.x * tileSize, t.y * tileSize + (tileSize - short) / 2, tileSize, short);
    } else {
      drawImageIfReady(ctx, images.splashVertical, t.x * tileSize + (tileSize - short) / 2, t.y * tileSize, short, tileSize);
    }
  }

  const roomPlayers = state.currentRoom?.players || [];
  const playerImages = [images.bluePlayer, images.greenPlayer, images.redPlayer, images.yellowPlayer];
  const players = roomPlayers
    .slice(0, map.spawnPoints.length)
    .map((player, index) => ({
      p: map.spawnPoints[index],
      img: playerImages[index % playerImages.length],
      name: player.nickname || player.email || `#${player.userId}`
    }));
  const spriteSize = tileSize * SPRITE_SCALE * 2;
  for (const player of players) {
    const cx = (player.p.x + 0.5) * tileSize;
    const cy = (player.p.y + 0.5) * tileSize;
    drawImageIfReady(ctx, player.img, cx - tileSize * SPRITE_SCALE, cy - tileSize * SPRITE_SCALE + tileSize * CHAR_OFFSET_Y, spriteSize, spriteSize);
    ctx.font = `bold ${Math.max(10, tileSize * 0.2)}px Segoe UI, sans-serif`;
    ctx.textAlign = 'center';
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(0,0,0,0.75)';
    ctx.fillStyle = '#eef4fb';
    ctx.strokeText(player.name, cx, cy - tileSize * 0.48);
    ctx.fillText(player.name, cx, cy - tileSize * 0.48);
  }

  ctx.restore();
}
