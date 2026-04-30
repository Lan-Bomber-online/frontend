import { api } from '../api/client.js';
import { state } from '../core/state.js';
import { startGameSession, stopGameSession } from '../game/gameSession.js';
import { drawPreviewBoard } from '../game/previewBoard.js';
import { showView } from '../ui/navigation.js';
import { showError } from '../ui/status.js';
import { renderPlayerSlots } from './roomSlots.js';

const ROOM_REFRESH_MS = 500;

let roomRefreshTimer = null;

export function stopRoomRefresh() {
  if (roomRefreshTimer) {
    clearInterval(roomRefreshTimer);
    roomRefreshTimer = null;
  }
}

function startRoomRefresh(roomId) {
  stopRoomRefresh();
  roomRefreshTimer = setInterval(async () => {
    if (state.currentView !== 'roomView' || state.currentRoom?.roomId !== Number(roomId)) {
      stopRoomRefresh();
      return;
    }

    try {
      await loadRoom(roomId, { startRefresh: false, silent: true });
    } catch (err) {
      console.warn('Room refresh failed', err);
    }
  }, ROOM_REFRESH_MS);
}

export function renderRooms() {
  const list = document.querySelector('#roomList');
  if (!list) return;

  if (!state.rooms.length) {
    list.innerHTML = '<div class="empty-state">No rooms are open.</div>';
    return;
  }

  list.innerHTML = state.rooms.map((room) => `
    <article class="room-card">
      <div>
        <strong>${room.roomName}</strong>
        <span>${room.status} / code ${room.roomCode}</span>
      </div>
      <div class="room-count">${room.currentPlayers}/${room.maxPlayers}</div>
      <button class="btn" type="button" data-room-id="${room.roomId || ''}" data-room-code="${room.roomCode || ''}">Join</button>
    </article>
  `).join('');

  list.querySelectorAll('[data-room-id], [data-room-code]').forEach((button) => {
    button.addEventListener('click', async () => {
      try {
        if (!button.dataset.roomId) {
          showView('roomView');
          return;
        }
        await api(`/api/rooms/${button.dataset.roomId}/join`, { method: 'POST' });
        await loadRoom(button.dataset.roomId);
        showView('roomView');
      } catch (err) {
        showError(err);
      }
    });
  });
}

export async function loadRooms(options = {}) {
  try {
    state.rooms = await api('/api/rooms');
    renderRooms();
  } catch (err) {
    state.rooms = [];
    renderRooms();
    if (!options.silent) showError(err);
  }
}

export async function loadRoom(roomId, options = {}) {
  const previousMapId = state.mapId;
  state.currentRoom = await api(`/api/rooms/${roomId}`, {
    loader: !options.silent,
    loaderText: 'Loading room'
  });
  if (state.currentRoom.mapId) state.mapId = state.currentRoom.mapId;
  state.ready = !!state.currentRoom.players?.find((p) => p.userId === state.user?.userId)?.isReady;

  const isParticipant = !!state.currentRoom.players?.find((p) => p.userId === state.user?.userId);
  if (!isParticipant && state.currentView === 'roomView') {
    stopRoomRefresh();
    state.currentRoom = null;
    state.ready = false;
    await loadRooms({ silent: true });
    showView('lobbyView');
    return;
  }

  const roomName = document.querySelector('#roomNameText');
  if (roomName) roomName.textContent = `${state.currentRoom.roomName} (${state.currentRoom.roomCode})`;

  const readyToggle = document.querySelector('#readyToggle');
  if (readyToggle) readyToggle.checked = state.ready;

  syncRoomSettingsControls(previousMapId);
  renderPlayerSlots();
  if (options.startRefresh !== false) startRoomRefresh(roomId);

  if (state.currentView === 'roomView' && state.currentRoom.status === 'playing') {
    stopRoomRefresh();
    showView('gameView');
    startGameSession(state.currentRoom.roomId);
    drawPreviewBoard();
  }
}

function syncRoomSettingsControls(previousMapId = state.mapId) {
  const isHost = state.currentRoom?.hostUserId === state.user?.userId;
  document.querySelectorAll('[data-map-select]').forEach((select) => {
    select.value = state.mapId;
    select.disabled = state.currentView === 'roomView' && !isHost;
  });
  if (state.currentView === 'gameView' || previousMapId !== state.mapId) drawPreviewBoard();
}

export async function updateRoomMap(mapId) {
  if (!state.currentRoom) return;
  const previousMapId = state.mapId;
  state.currentRoom = await api(`/api/rooms/${state.currentRoom.roomId}/settings`, {
    method: 'PATCH',
    body: JSON.stringify({ mapId })
  });
  state.mapId = state.currentRoom.mapId || mapId;
  syncRoomSettingsControls(previousMapId);
}

export async function createRoom() {
  const roomName = document.querySelector('#roomNameInput')?.value.trim();
  if (!roomName) {
    showError(new Error('Room name is required.'));
    return;
  }

  const room = await api('/api/rooms', {
    method: 'POST',
    body: JSON.stringify({ roomName })
  });
  await loadRooms();
  await loadRoom(room.roomId);
  showView('roomView');
}

export async function joinByCode() {
  const roomCode = document.querySelector('#roomCodeInput')?.value.trim();
  if (!roomCode) return;

  const joined = await api('/api/rooms/join-by-code', {
    method: 'POST',
    body: JSON.stringify({ roomCode })
  });
  await loadRoom(joined.roomId);
  showView('roomView');
}

export async function setReady(isReady) {
  if (!state.currentRoom) return;
  state.currentRoom = await api(`/api/rooms/${state.currentRoom.roomId}/ready`, {
    method: 'PATCH',
    body: JSON.stringify({ isReady })
  });
  renderPlayerSlots();
}

export async function startGame() {
  if (!state.currentRoom) return;
  state.currentRoom = await api(`/api/rooms/${state.currentRoom.roomId}/start`, { method: 'POST' });
  stopRoomRefresh();
  showView('gameView');
  startGameSession(state.currentRoom.roomId);
  drawPreviewBoard();
}

export async function leaveCurrentRoom() {
  const roomId = state.currentRoom?.roomId || state.gameState?.roomId;
  if (!roomId) {
    stopGameSession();
    stopRoomRefresh();
    state.currentRoom = null;
    state.gameState = null;
    state.ready = false;
    await loadRooms({ silent: true });
    showView('lobbyView');
    return;
  }

  try {
    await api(`/api/rooms/${roomId}/leave`, { method: 'POST' });
  } finally {
    stopGameSession();
    stopRoomRefresh();
    state.currentRoom = null;
    state.gameState = null;
    state.ready = false;
    await loadRooms({ silent: true });
    showView('lobbyView');
  }
}

export function leaveGameView() {
  stopGameSession();
  state.gameState = null;
}

export function bindRoomActions() {
  document.querySelector('#btnCreateRoom')?.addEventListener('click', async () => {
    try { await createRoom(); } catch (err) { showError(err); }
  });
  document.querySelector('#btnJoinByCode')?.addEventListener('click', async () => {
    try { await joinByCode(); } catch (err) { showError(err); }
  });
  document.querySelector('#readyToggle')?.addEventListener('change', async (event) => {
    try { await setReady(event.target.checked); } catch (err) { showError(err); }
  });
  document.querySelector('#btnStartGame')?.addEventListener('click', async () => {
    try { await startGame(); } catch (err) { showError(err); }
  });
  document.querySelectorAll('[data-leave-room]').forEach((button) => {
    button.addEventListener('click', async (event) => {
      event.preventDefault();
      event.stopPropagation();
      try { await leaveCurrentRoom(); } catch (err) { showError(err); }
    });
  });
}
