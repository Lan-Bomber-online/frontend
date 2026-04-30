let hideTimer = null;
let activeLoads = 0;

export function showPageLoader(text = 'Loading') {
  const loader = document.querySelector('#pageLoader');
  const label = document.querySelector('#pageLoaderText');
  if (!loader) return;

  if (hideTimer) {
    clearTimeout(hideTimer);
    hideTimer = null;
  }

  if (label) label.textContent = text;
  loader.classList.add('active');
  loader.setAttribute('aria-hidden', 'false');
}

export function hidePageLoader(delay = 420) {
  const loader = document.querySelector('#pageLoader');
  if (!loader) return;

  if (hideTimer) clearTimeout(hideTimer);
  hideTimer = setTimeout(() => {
    loader.classList.remove('active');
    loader.setAttribute('aria-hidden', 'true');
    hideTimer = null;
  }, delay);
}

export function beginPageLoading(text = 'Loading') {
  activeLoads += 1;
  showPageLoader(text);
}

export function endPageLoading(delay = 260) {
  activeLoads = Math.max(0, activeLoads - 1);
  if (activeLoads === 0) hidePageLoader(delay);
}
