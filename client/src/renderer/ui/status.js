import { API_BASE } from '../config/appConfig.js';
import { beginPageLoading, endPageLoading } from './loading.js';

export function showError(error) {
  const el = document.querySelector('#backendStatus');
  if (el) {
    el.className = 'backend-status error';
    el.textContent = `Error: ${error.message || error}`;
  }
  console.error(error);
}

export async function refreshBackendStatus(options = {}) {
  const el = document.querySelector('#backendStatus');
  if (!el) return;
  const { loader = false } = options;
  let didShowLoader = false;
  let loaderTimer = null;

  if (loader) {
    loaderTimer = setTimeout(() => {
      didShowLoader = true;
      beginPageLoading('Backend checking');
    }, 180);
  }
  try {
    const [healthRes, statusRes] = await Promise.all([
      fetch(`${API_BASE}/health`),
      fetch(`${API_BASE}/api/status`)
    ]);
    if (!healthRes.ok || !statusRes.ok) throw new Error(`HTTP ${healthRes.status}/${statusRes.status}`);

    const health = await healthRes.json();
    const status = await statusRes.json();
    el.className = 'backend-status ok';
    el.textContent = `Backend: ${health.status} / rooms ${status.data?.activeRooms ?? 0} / players ${status.data?.activePlayers ?? 0}`;
  } catch {
    el.className = 'backend-status error';
    el.textContent = 'Backend: offline';
  } finally {
    if (loaderTimer) clearTimeout(loaderTimer);
    if (didShowLoader) endPageLoading();
  }
}
