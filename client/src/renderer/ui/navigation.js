import { titles } from '../config/appConfig.js';
import { $, optional } from '../core/dom.js';
import { accessStatus, state } from '../core/state.js';
import { schedulePreviewBoardDraw } from '../game/previewBoard.js';
import { stopGameSession } from '../game/gameSession.js';

export function showView(viewId) {
  const guardedView = guardView(viewId);
  if (guardedView !== viewId) viewId = guardedView;

  if (state.currentView === 'gameView' && viewId !== 'gameView') {
    stopGameSession();
  }

  state.currentView = viewId;
  document.body.classList.toggle('is-game-view', viewId === 'gameView');
  document.querySelectorAll('.view').forEach((view) => view.classList.toggle('active', view.id === viewId));
  document.querySelectorAll('.step').forEach((step) => step.classList.toggle('active', step.dataset.target === viewId));

  const meta = titles[viewId];
  $('#pageTitle').textContent = meta.title;
  $('#pageSubtitle').textContent = meta.subtitle;
  $('#statusPill').textContent = meta.status;
  if (viewId === 'gameView') schedulePreviewBoardDraw();
  if (viewId === 'rankingsView') {
    import('../rankings/rankingsView.js').then(({ loadRankings }) => loadRankings({ silent: true }));
  }
}

export function guardView(viewId) {
  if (viewId === 'authView') return viewId;
  if (!state.user) return 'authView';

  const status = accessStatus();
  if (status === 'profile_required') return viewId === 'profileView' ? viewId : 'profileView';
  if (status === 'access_code_required') return viewId === 'profileView' || viewId === 'codeView' ? viewId : 'codeView';
  if (status !== 'approved') return 'authView';
  if (state.currentRoom && viewId !== 'roomView' && viewId !== 'gameView') {
    return state.currentRoom.status === 'playing' || state.gameState ? 'gameView' : 'roomView';
  }
  if (viewId === 'roomView' && !state.currentRoom) return 'lobbyView';
  if (viewId === 'gameView' && !state.currentRoom && !state.gameState) return 'lobbyView';
  return viewId;
}

export function refreshNavigationState() {
  const status = accessStatus();
  document.querySelectorAll('.step').forEach((step) => {
    const target = step.dataset.target;
    let enabled = false;
    if (target === 'authView') enabled = true;
    else if (state.user && status === 'profile_required') enabled = target === 'profileView';
    else if (state.user && status === 'access_code_required') enabled = target === 'profileView' || target === 'codeView';
    else if (state.user && status === 'approved') {
      enabled = state.currentRoom
        ? target === 'roomView'
        : target !== 'roomView' && target !== 'gameView';
    }

    step.disabled = !enabled;
    step.classList.toggle('locked', !enabled);
  });
}

export function bindStepNavigation() {
  document.body.addEventListener('click', (event) => {
    const button = event.target.closest('[data-target]');
    if (!button?.dataset.target) return;
    showView(button.dataset.target);
  });
}

export function setStatusPill(value) {
  const pill = optional('#statusPill');
  if (pill) pill.textContent = value;
}
