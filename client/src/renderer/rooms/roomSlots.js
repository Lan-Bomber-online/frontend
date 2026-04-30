import { state } from '../core/state.js';
import { skins } from '../data/skins.js';

export function renderPlayerSlots() {
  const players = state.currentRoom?.players || [];
  const slots = document.querySelector('#playerSlots');
  if (!slots) return;

  const slotData = Array.from({ length: 6 }, (_, index) => {
    const slotNo = index + 1;
    return players.find((p) => p.slotNo === slotNo) || null;
  });

  slots.innerHTML = slotData.map((player, index) => {
    const skin = skins[index % skins.length];
    if (!player) return '<div class="player-slot empty"><div class="empty-avatar"></div><strong>Empty</strong><span>Waiting</span></div>';

    const name = player.nickname || `Player ${player.userId}`;
    return `
      <div class="player-slot">
        <img src="/assets/images/characters/${skin}/front/default.png" alt="" />
        <strong>${name}</strong>
        <span>${player.userId === state.currentRoom?.hostUserId ? 'Host' : player.isReady ? 'Ready' : 'Not ready'}</span>
      </div>
    `;
  }).join('');
}
