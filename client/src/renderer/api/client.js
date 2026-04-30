import { API_BASE } from '../config/appConfig.js';
import { beginPageLoading, endPageLoading } from '../ui/loading.js';

export async function api(path, options = {}) {
  const { loader = true, loaderText = 'Loading', ...fetchOptions } = options;
  let didShowLoader = false;
  let loaderTimer = null;

  if (loader) {
    loaderTimer = setTimeout(() => {
      didShowLoader = true;
      beginPageLoading(loaderText);
    }, 180);
  }
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      credentials: 'include',
      headers: {
        'content-type': 'application/json',
        ...(fetchOptions.headers || {})
      },
      ...fetchOptions
    });

    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      const message = body.error?.message || body.message || `HTTP ${res.status}`;
      throw new Error(message);
    }

    return body.data ?? body;
  } finally {
    if (loaderTimer) clearTimeout(loaderTimer);
    if (didShowLoader) endPageLoading();
  }
}
