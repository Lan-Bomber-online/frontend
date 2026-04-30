export const state = {
  mapId: 'map1',
  user: null,
  rooms: [],
  currentRoom: null,
  gameMode: 'FFA',
  gameDurationSeconds: 180,
  ready: false,
  currentView: 'authView',
  gameSocket: null,
  gameState: null,
  gameStarted: false,
  googleClientId: null,
  googleReady: false,
  pendingAccessCode: sessionStorage.getItem('lanBomberInviteCode') || ''
};

export function accessStatus() {
  return state.user?.accessStatus || state.user?.access_status || null;
}
