import { WS_BASE } from '../config/appConfig.js';
import { state } from '../core/state.js';
import { beginPageLoading, endPageLoading } from '../ui/loading.js';
import { showError } from '../ui/status.js';
import { prepareGameRenderAssets, schedulePreviewBoardDraw } from './previewBoard.js';
import { bindGameInput, consumeItemSlotQueued, consumePlaceQueued, getInputKeys, unbindGameInput } from './inputController.js';

let inputTimer = null;
let waitingForFirstState = false;
let lastInputSignature = '';
let pendingGameMessage = null;
let pendingGameMessageFrame = false;
let sessionRunId = 0;

function clearInputTimer() {
  if (inputTimer) {
    clearInterval(inputTimer);
    inputTimer = null;
  }
}

function sendSocketMessage(message) {
  const socket = state.gameSocket;
  if (!socket || socket.readyState !== WebSocket.OPEN) return;
  socket.send(JSON.stringify(message));
}

function hideGameEndOverlay() {
  document.querySelector('#gameEndOverlay')?.remove();
}

function playerName(entry) {
  return entry?.nickname || `P${entry?.slotNo || ''}` || 'Player';
}

function playerColor(slotNo) {
  return ['blue', 'green', 'red', 'yellow', 'purple', 'white'][Math.max(0, (slotNo || 1) - 1)] || 'blue';
}

function playerSkin(entry, slotNo) {
  const skin = entry?.skin || entry?.profileImageUrl || entry?.profile_image_url;
  return ['blue', 'green', 'purple', 'red', 'white', 'yellow'].includes(skin) ? skin : playerColor(slotNo);
}

async function returnToRoom(message) {
  const roomId = message.roomId ?? message.room_id ?? state.currentRoom?.roomId ?? state.gameState?.roomId;
  if (!roomId) {
    window.location.reload();
    return;
  }
  const [{ loadRoom }, { showView }] = await Promise.all([
    import('../rooms/roomsApi.js'),
    import('../ui/navigation.js')
  ]);
  await loadRoom(roomId, { startRefresh: true, silent: true });
  state.gameState = null;
  state.gameStarted = false;
  hideGameEndOverlay();
  showView('roomView');
}

function showGameEndOverlay(message) {
  const frame = document.querySelector('.game-frame');
  if (!frame) return;

  hideGameEndOverlay();
  const myId = Number(state.user?.userId || state.user?.user_id || 0);
  const winnerId = message.winnerUserId ?? message.winner_user_id ?? null;
  const winnerTeam = message.winnerTeam ?? message.winner_team ?? null;
  const gameMode = message.gameMode ?? message.game_mode ?? state.gameState?.gameMode ?? 'FFA';
  const ranking = Array.isArray(message.ranking) ? message.ranking : [];
  const myEntry = ranking.find((entry) => Number(entry.userId ?? entry.user_id) === myId);
  const didWin = gameMode === 'TEAM'
    ? winnerTeam !== null && Number(myEntry?.team) === Number(winnerTeam)
    : winnerId !== null && Number(winnerId) === myId;
  const title = gameMode === 'TEAM' && winnerTeam !== null
    ? didWin ? 'Team Victory!' : 'Team Defeat'
    : winnerId === null ? 'Draw' : didWin ? 'Victory!' : 'Game Result';

  const overlay = document.createElement('div');
  overlay.id = 'gameEndOverlay';
  overlay.className = 'game-end-overlay';
  overlay.innerHTML = `
    <div class="game-end-panel">
      <h2>${title}</h2>
      <div class="game-end-list">
        ${ranking.slice(0, 6).map((entry, index) => {
          const slotNo = entry.slotNo ?? entry.slot_no ?? index + 1;
          const color = playerSkin(entry, slotNo);
          const rank = entry.rank || index + 1;
          const isMe = Number(entry.userId ?? entry.user_id) === myId;
          const medal = ['1st', '2nd', '3rd'][rank - 1] || `${rank}th`;
          const teamLabel = gameMode === 'TEAM' ? `Team ${entry.team === 0 ? 'A' : 'B'}` : '';
          const label = gameMode === 'TEAM'
            ? `${teamLabel}${winnerTeam !== null && Number(entry.team) === Number(winnerTeam) ? ' Winner' : ''}`
            : rank === 1 && winnerId !== null ? 'Winner' : entry.state || '';
          return `
          <div class="game-end-row rank-${Math.min(rank, 4)} ${isMe ? 'mine' : ''}">
            <strong>${medal}</strong>
            <img src="/assets/images/characters/${color}/front/default.png" alt="" />
            <span>${playerName(entry)}</span>
            <em>${label}</em>
          </div>
        `; }).join('')}
      </div>
      <button class="btn primary" type="button" data-game-end-room>Back to room</button>
    </div>
  `;
  overlay.querySelector('[data-game-end-room]')?.addEventListener('click', async () => {
    try {
      await returnToRoom(message);
    } catch (err) {
      showError(err);
    }
  });
  frame.appendChild(overlay);
}

function queueGameState(message) {
  const previousBlocks =
    message.state?.blocks ||
    pendingGameMessage?.state?.blocks ||
    state.gameState?.blocks ||
    [];
  pendingGameMessage = {
    ...message,
    state: {
      ...(pendingGameMessage?.state || {}),
      ...message.state,
      blocks: previousBlocks
    }
  };
  if (pendingGameMessageFrame) return;
  pendingGameMessageFrame = true;
  requestAnimationFrame(() => {
    pendingGameMessageFrame = false;
    const latest = pendingGameMessage;
    pendingGameMessage = null;
    if (!latest) return;

    state.gameState = {
      ...(state.gameState || {}),
      ...latest.state,
      blocks: latest.state.blocks || state.gameState?.blocks || []
    };
    if (latest.state?.mapId) state.mapId = latest.state.mapId;
    if (latest.state?.gameDurationSeconds) state.gameDurationSeconds = latest.state.gameDurationSeconds;
    schedulePreviewBoardDraw();
    if (waitingForFirstState) {
      waitingForFirstState = false;
      endPageLoading(180);
    }
  });
}

function startInputLoop() {
  clearInputTimer();
  lastInputSignature = '';
  inputTimer = setInterval(() => {
    if (state.currentView !== 'gameView') return;
    const keys = getInputKeys();
    const inputSignature = `${keys.up ? 1 : 0}${keys.down ? 1 : 0}${keys.left ? 1 : 0}${keys.right ? 1 : 0}`;
    if (inputSignature !== lastInputSignature) {
      lastInputSignature = inputSignature;
      sendSocketMessage({ type: 'player_input', keys });
    }
    if (consumePlaceQueued()) sendSocketMessage({ type: 'place_bomb' });
    const itemSlot = consumeItemSlotQueued();
    if (itemSlot >= 0) sendSocketMessage({ type: 'use_item', slot: itemSlot });
  }, 50);
}

export function stopGameSession() {
  sessionRunId += 1;
  clearInputTimer();
  unbindGameInput();
  hideGameEndOverlay();
  if (waitingForFirstState) {
    waitingForFirstState = false;
    endPageLoading(0);
  }
  pendingGameMessage = null;
  pendingGameMessageFrame = false;
  if (state.gameSocket) {
    state.gameSocket.close();
    state.gameSocket = null;
  }
  state.gameStarted = false;
  state.gameState = null;
}

export async function startGameSession(roomId) {
  stopGameSession();
  const runId = sessionRunId;
  hideGameEndOverlay();
  bindGameInput();
  state.gameStarted = true;
  waitingForFirstState = true;
  beginPageLoading('Loading game');

  try {
    await prepareGameRenderAssets();
  } catch (err) {
    console.warn('Game asset preparation failed', err);
  }
  if (runId !== sessionRunId || state.currentView !== 'gameView') return;

  const socket = new WebSocket(`${WS_BASE}/ws/rooms/${roomId}`);
  state.gameSocket = socket;

  socket.addEventListener('open', () => {
    startInputLoop();
  });

  socket.addEventListener('message', (event) => {
    try {
      const message = JSON.parse(event.data);
      if (message.type === 'game_state' || message.type === 'room_state') {
        queueGameState(message);
      } else if (message.type === 'game_start') {
        state.gameStarted = true;
      } else if (message.type === 'game_end') {
        clearInputTimer();
        state.gameStarted = false;
        state.gameResult = message;
        showGameEndOverlay(message);
      } else if (message.type === 'error') {
        showError(new Error(message.message || message.code || 'Game socket error'));
      }
    } catch (err) {
      showError(err);
    }
  });

  socket.addEventListener('close', () => {
    clearInputTimer();
    unbindGameInput();
    if (waitingForFirstState) {
      waitingForFirstState = false;
      endPageLoading(0);
    }
    if (state.gameSocket === socket) state.gameSocket = null;
  });

  socket.addEventListener('error', () => {
    if (waitingForFirstState) {
      waitingForFirstState = false;
      endPageLoading(0);
    }
    showError(new Error('Game WebSocket connection failed.'));
  });
}
