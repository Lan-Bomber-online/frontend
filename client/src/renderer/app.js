import { accessStatus, state } from './core/state.js';
import { bindAuthActions, handleGoogleRedirect, loadMe, routeAfterAccountStep, setPendingAccessCode } from './auth/authFlow.js';
import { renderMapOptions } from './game/mapPicker.js';
import { bindProfileActions, renderSkins } from './profile/profileView.js';
import { bindRankingsActions } from './rankings/rankingsView.js';
import { bindRoomActions, loadRooms, renderRooms } from './rooms/roomsApi.js';
import { renderPlayerSlots } from './rooms/roomSlots.js';
import { bindStepNavigation, refreshNavigationState, showView } from './ui/navigation.js';
import { refreshBackendStatus } from './ui/status.js';

export function init() {
  setPendingAccessCode(state.pendingAccessCode);
  renderSkins();
  renderRooms();
  renderPlayerSlots();
  renderMapOptions();

  bindStepNavigation();
  bindAuthActions();
  bindProfileActions();
  bindRankingsActions();
  bindRoomActions();

  refreshBackendStatus({ loader: true });
  showView('authView');
  refreshNavigationState();

  handleGoogleRedirect().then(async (handled) => {
    if (handled) return;
    const user = await loadMe();
    if (user) await routeAfterAccountStep();
    else showView('authView');
  });

  setInterval(refreshBackendStatus, 5000);
  setInterval(() => {
    if (state.currentView === 'lobbyView' && accessStatus() === 'approved') {
      loadRooms({ silent: true });
    }
  }, 1000);
}
