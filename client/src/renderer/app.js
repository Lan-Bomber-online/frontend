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
  refreshNavigationState();

  handleGoogleRedirect().then(async (handled) => {
    if (handled) {
      history.replaceState({ view: state.currentView }, '', '/');
      return;
    }
    const user = await loadMe();
    if (user) await routeAfterAccountStep();
    else showView('authView');
    history.replaceState({ view: state.currentView }, '', '/');
  });

  window.addEventListener('popstate', async () => {
    if (!state.user) return;
    await routeAfterAccountStep();
    history.replaceState({ view: state.currentView }, '', '/');
  });

  setInterval(refreshBackendStatus, 5000);
  setInterval(() => {
    if (state.currentView === 'lobbyView' && accessStatus() === 'approved') {
      loadRooms({ silent: true });
    }
  }, 1000);
}
