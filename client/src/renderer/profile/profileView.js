import { api } from '../api/client.js';
import { state } from '../core/state.js';
import { skins } from '../data/skins.js';
import { showError } from '../ui/status.js';
import { setUser, routeAfterAccountStep } from '../auth/authFlow.js';

function userSkin() {
  const skin = state.user?.profileImageUrl || state.user?.profile_image_url;
  return skins.includes(skin) ? skin : 'blue';
}

function selectedSkin() {
  return document.querySelector('.skin-card.selected')?.dataset.skin || userSkin();
}

export function renderSkins() {
  const grid = document.querySelector('#skinGrid');
  if (!grid) return;
  const activeSkin = userSkin();

  grid.innerHTML = skins.map((skin, index) => `
    <button class="skin-card${skin === activeSkin || (!activeSkin && index === 0) ? ' selected' : ''}" type="button" data-skin="${skin}">
      <img src="/assets/images/characters/${skin}/front/default.png" alt="${skin}" />
      <span>${skin}</span>
    </button>
  `).join('');

  grid.querySelectorAll('.skin-card').forEach((button) => {
    button.addEventListener('click', () => {
      grid.querySelectorAll('.skin-card').forEach((card) => card.classList.remove('selected'));
      button.classList.add('selected');
    });
  });
}

export function bindProfileActions() {
  document.querySelector('#btnSaveProfile')?.addEventListener('click', async () => {
    try {
      const nickname = document.querySelector('#nicknameInput')?.value?.trim();
      if (!nickname) {
        showError(new Error('Nickname is required.'));
        return;
      }

      const user = await api('/api/users/me', {
        method: 'PATCH',
        body: JSON.stringify({ nickname, skin: selectedSkin() })
      });
      setUser(user);
      await routeAfterAccountStep();
    } catch (err) {
      showError(err);
    }
  });

  document.querySelector('#nicknameInput')?.addEventListener('input', (event) => {
    const name = event.target.value.trim();
    const preview = document.querySelector('#profilePreviewName');
    if (preview) preview.textContent = name || state.user?.nickname || 'Player';
  });
}
