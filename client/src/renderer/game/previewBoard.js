import { BALLOON_PAD, CHAR_OFFSET_Y, ITEM_PAD, SPRITE_SCALE } from '../config/appConfig.js';
import { state } from '../core/state.js';
import { imageSources } from '../data/assets.js';
import { maps } from '../data/maps.js';

export const images = {};
const playerDirCache = new Map();
const playerLastPosition = new Map();
let pendingImageRedraw = false;
let pendingBoardFrame = false;
let liveLayerCache = null;

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
  const keys = ['Z', 'X', 'C', 'V', 'B'];
  slots.innerHTML = keys.map((key, index) => {
    const item = inventory[index] || null;
    const img = item ? itemImage(item) : null;
    return `
      <div class="item-slot ${item ? 'filled' : 'empty'}">
        <span>${key}</span>
        ${img?.src ? `<img src="${img.src}" alt="${item}" />` : '<div class="item-slot__empty"></div>'}
      </div>
    `;
  }).join('');
}

function playerColorBySlot(slotNo) {
  return ['blue', 'green', 'red', 'yellow', 'purple', 'white'][Math.max(0, (slotNo || 1) - 1)] || 'blue';
}

export function preloadGameSprites() {
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

function liveLayerKey(map, tileSize) {
  const blocks = state.gameState.blocks || [];
  let solidCount = 0;
  let softCount = 0;
  for (const block of blocks) {
    if (block.destructible) softCount += 1;
    else solidCount += 1;
  }
  return `${state.gameState.mapId || state.mapId}|${map.width}x${map.height}|${tileSize}|${solidCount}|${softCount}`;
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
        drawImageIfReady(layerCtx, images.softBlock, block.x * tileSize, block.y * tileSize, tileSize, tileSize);
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
    .filter((player) => !player.left && !player.disconnected)
    .sort((a, b) => (a.slotNo || 0) - (b.slotNo || 0));
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
  const waterballs = [images.waterball, images.waterball_green, images.waterball_red, images.waterball_yellow];
  for (const bomb of state.gameState.bombs || []) {
    const owner = playersById.get(bomb.ownerUserId);
    const img = waterballs[Math.max(0, (owner?.slotNo || 1) - 1) % waterballs.length];
    drawImageIfReady(ctx, img, bomb.x * tileSize + balloonPad, bomb.y * tileSize + balloonPad, balloonSize, balloonSize);
  }

  const short = tileSize * (28 / 40);
  for (const explosion of state.gameState.explosions || []) {
    const originX = explosion.originX ?? explosion.x;
    const originY = explosion.originY ?? explosion.y;
    const tiles = explosion.tiles || [{ x: originX, y: originY }];
    drawImageIfReady(ctx, images.splashCenter, originX * tileSize, originY * tileSize, tileSize, tileSize);
    for (const tile of tiles) {
      if (tile.x === originX && tile.y === originY) continue;
      if (tile.y === originY) {
        drawImageIfReady(ctx, images.splashHorizontal, tile.x * tileSize, tile.y * tileSize + (tileSize - short) / 2, tileSize, short);
      } else {
        drawImageIfReady(ctx, images.splashVertical, tile.x * tileSize + (tileSize - short) / 2, tile.y * tileSize, short, tileSize);
      }
    }
  }

  const spriteSize = tileSize * SPRITE_SCALE * 2;
  for (const player of players) {
    const cx = player.x * tileSize;
    const cy = player.y * tileSize;
    const color = playerColorBySlot(player.slotNo);
    const { direction, moving } = getPlayerDirection(player);
    const trapped = player.state === 'Trapped';
    const dead = player.state === 'Dead' || player.isAlive === false || player.disconnected || player.left;
    const img = playerSpriteImage(color, direction, moving, trapped) || images[`${color}PlayerFrontdefault`] || images.bluePlayer;
    ctx.globalAlpha = dead ? 0.45 : 1;
    drawImageIfReady(ctx, img, cx - tileSize * SPRITE_SCALE, cy - tileSize * SPRITE_SCALE + tileSize * CHAR_OFFSET_Y, spriteSize, spriteSize);
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

    ctx.font = `bold ${Math.max(10, tileSize * 0.2)}px Segoe UI, sans-serif`;
    ctx.textAlign = 'center';
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(0,0,0,0.75)';
    ctx.fillStyle = '#eef4fb';
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
    const remaining = Math.max(0, 180 - Math.floor((state.gameState.tick || 0) / 60));
    const minutes = Math.floor(remaining / 60);
    const seconds = String(remaining % 60).padStart(2, '0');
    const timer = document.querySelector('#gameTimer');
    if (timer) timer.textContent = `${minutes}:${seconds}`;
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
    drawImageIfReady(ctx, b.img, b.x * tileSize + balloonPad, b.y * tileSize + balloonPad, size, size);
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
