import { api } from '../api/client.js';
import { optional } from '../core/dom.js';
import { accessStatus, state } from '../core/state.js';
import { leaveGameView, loadRoom, loadRooms, savedRoomId, stopRoomRefresh } from '../rooms/roomsApi.js';
import { refreshNavigationState, setStatusPill, showView } from '../ui/navigation.js';
import { showError } from '../ui/status.js';

const GOOGLE_AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';

let loginMode = 'signup';

export function setUser(user) {
  state.user = user;
  const logoutButton = optional('#btnLogout');
  if (user) {
    setStatusPill(`${user.accessStatus || user.access_status || 'unknown'} / ${user.nickname || user.email || 'user'}`);
    logoutButton?.classList.remove('hidden');
  } else {
    setStatusPill('signed_out');
    logoutButton?.classList.add('hidden');
  }
  refreshNavigationState();
}

export async function loadMe() {
  try {
    const user = await api('/api/auth/me');
    setUser(user);
    return user;
  } catch {
    setUser(null);
    return null;
  }
}

async function loadAuthConfig() {
  const config = await api('/api/auth/config');
  state.googleClientId = config.googleClientId;
  return config;
}

async function completeGoogleLogin(idToken) {
  const payload = { idToken };
  if (loginMode === 'signup' && state.pendingAccessCode) {
    payload.inviteCode = state.pendingAccessCode;
  }

  const user = await api('/api/auth/google', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
  setUser(user);
  await routeAfterAccountStep();
}

async function logout() {
  await api('/api/auth/logout', { method: 'POST' });
  leaveGameView();
  stopRoomRefresh();
  setPendingAccessCode('');
  state.rooms = [];
  state.currentRoom = null;
  state.ready = false;
  setUser(null);
  showView('authView');
}

async function startGoogleRedirect(mode) {
  const statusEl = optional('#loginStatus');
  loginMode = mode;

  try {
    const config = await loadAuthConfig();
    const nonce = crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`;

    sessionStorage.setItem('lanBomberLoginMode', mode);
    sessionStorage.setItem('lanBomberGoogleNonce', nonce);

    const params = new URLSearchParams({
      client_id: config.googleClientId,
      redirect_uri: `${location.origin}/oauth/callback`,
      response_type: 'id_token',
      scope: 'openid email profile',
      nonce,
      prompt: 'select_account'
    });

    if (statusEl) statusEl.textContent = 'Opening Google...';
    location.assign(`${GOOGLE_AUTH_ENDPOINT}?${params}`);
  } catch (err) {
    if (statusEl) statusEl.textContent = 'Google login is not configured.';
    showError(err);
  }
}

export async function handleGoogleRedirect() {
  if (!location.hash) return false;

  const params = new URLSearchParams(location.hash.slice(1));
  const idToken = params.get('id_token');
  const error = params.get('error');
  if (!idToken && !error) return false;

  history.replaceState(null, '', '/');
  loginMode = sessionStorage.getItem('lanBomberLoginMode') || 'signup';

  if (error) {
    showError(new Error(params.get('error_description') || error));
    return true;
  }

  try {
    setPendingAccessCode(sessionStorage.getItem('lanBomberInviteCode') || '');
    await completeGoogleLogin(idToken);
  } catch (err) {
    showError(err);
    showView('authView');
  } finally {
    sessionStorage.removeItem('lanBomberLoginMode');
    sessionStorage.removeItem('lanBomberGoogleNonce');
  }

  return true;
}

export function setPendingAccessCode(code) {
  state.pendingAccessCode = code.trim();
  if (state.pendingAccessCode) {
    sessionStorage.setItem('lanBomberInviteCode', state.pendingAccessCode);
  } else {
    sessionStorage.removeItem('lanBomberInviteCode');
  }

  const signupInput = optional('#signupInviteCodeInput');
  const verifyInput = optional('#accessCodeInput');
  if (signupInput && signupInput.value !== state.pendingAccessCode) signupInput.value = state.pendingAccessCode;
  if (verifyInput && verifyInput.value !== state.pendingAccessCode) verifyInput.value = state.pendingAccessCode;
}

async function verifyPendingAccessCode() {
  if (!state.pendingAccessCode) return false;
  await api('/api/access-codes/verify', {
    method: 'POST',
    body: JSON.stringify({ code: state.pendingAccessCode })
  });
  setPendingAccessCode('');
  const user = await loadMe();
  return accessStatus() === 'approved' || (user?.accessStatus || user?.access_status) === 'approved';
}

export async function routeAfterAccountStep() {
  const status = accessStatus();
  if (status === 'approved') {
    const roomId = savedRoomId();
    if (roomId) {
      try {
        await loadRoom(roomId);
        showView(state.currentRoom?.status === 'playing' ? 'gameView' : 'roomView');
        return;
      } catch {
        localStorage.removeItem('lanBomberCurrentRoomId');
      }
    }
    await loadRooms();
    showView('lobbyView');
    return;
  }

  if (status === 'profile_required') {
    showView('profileView');
    return;
  }

  if (status === 'access_code_required') {
    if (state.pendingAccessCode) {
      try {
        await verifyPendingAccessCode();
        if (accessStatus() === 'approved') {
          await loadRooms();
          showView('lobbyView');
          return;
        }
      } catch (err) {
        showError(err);
      }
    }
    showView('codeView');
    return;
  }

  showView('authView');
}

export function bindAuthActions() {
  optional('#btnLogout')?.addEventListener('click', async () => {
    try {
      await logout();
    } catch (err) {
      showError(err);
    }
  });

  optional('#btnGoogle')?.addEventListener('click', async () => {
    try {
      const code = optional('#signupInviteCodeInput')?.value?.trim();
      if (!code) {
        showError(new Error('Invite code is required before Google signup.'));
        return;
      }
      setPendingAccessCode(code);
      await startGoogleRedirect('signup');
    } catch (err) {
      showError(err);
    }
  });

  optional('#btnGoogleLogin')?.addEventListener('click', async () => {
    try {
      await startGoogleRedirect('login');
    } catch (err) {
      showError(err);
    }
  });

  optional('#signupInviteCodeInput')?.addEventListener('input', (event) => {
    if (!event.target.value.trim()) setPendingAccessCode('');
  });

  optional('#btnVerifyCode')?.addEventListener('click', async () => {
    try {
      const code = optional('#accessCodeInput')?.value?.trim();
      if (!code) {
        showError(new Error('Invite code is required.'));
        return;
      }
      setPendingAccessCode(code);
      await verifyPendingAccessCode();
      await routeAfterAccountStep();
    } catch (err) {
      showError(err);
    }
  });
}
