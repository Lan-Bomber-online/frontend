import { WS_BASE } from '../config/appConfig.js';
import { state } from '../core/state.js';
import { beginPageLoading, endPageLoading } from '../ui/loading.js';
import { showError } from '../ui/status.js';
import { preloadGameSprites, schedulePreviewBoardDraw } from './previewBoard.js';
import { bindGameInput, consumeItemSlotQueued, consumePlaceQueued, getInputKeys, unbindGameInput } from './inputController.js';

let inputTimer = null;
let waitingForFirstState = false;

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

function startInputLoop() {
  clearInputTimer();
  inputTimer = setInterval(() => {
    if (state.currentView !== 'gameView') return;
    sendSocketMessage({ type: 'player_input', keys: getInputKeys() });
    if (consumePlaceQueued()) sendSocketMessage({ type: 'place_bomb' });
    const itemSlot = consumeItemSlotQueued();
    if (itemSlot >= 0) sendSocketMessage({ type: 'use_item', slot: itemSlot });
  }, 50);
}

export function stopGameSession() {
  clearInputTimer();
  unbindGameInput();
  if (waitingForFirstState) {
    waitingForFirstState = false;
    endPageLoading(0);
  }
  if (state.gameSocket) {
    state.gameSocket.close();
    state.gameSocket = null;
  }
  state.gameStarted = false;
  state.gameState = null;
}

export function startGameSession(roomId) {
  stopGameSession();
  bindGameInput();
  state.gameStarted = true;
  waitingForFirstState = true;
  beginPageLoading('Loading game');
  preloadGameSprites();

  const socket = new WebSocket(`${WS_BASE}/ws/rooms/${roomId}`);
  state.gameSocket = socket;

  socket.addEventListener('open', () => {
    startInputLoop();
  });

  socket.addEventListener('message', (event) => {
    try {
      const message = JSON.parse(event.data);
      if (message.type === 'game_state' || message.type === 'room_state') {
        state.gameState = message.state;
        if (message.state?.mapId) state.mapId = message.state.mapId;
        schedulePreviewBoardDraw();
        if (waitingForFirstState) {
          waitingForFirstState = false;
          endPageLoading(180);
        }
      } else if (message.type === 'game_start') {
        state.gameStarted = true;
      } else if (message.type === 'game_end') {
        clearInputTimer();
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
