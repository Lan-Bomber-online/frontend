import { state } from '../core/state.js';
import { skins } from '../data/skins.js';

export function renderPlayerSlots() {
  const players = state.currentRoom?.players || [];
  const slots = document.querySelector('#playerSlots');
  if (!slots) return;

  const isTeamMode = state.currentRoom?.gameMode === 'TEAM';
  if (isTeamMode) {
    const teamA = players.filter((player) => player.team === 0).sort((a, b) => a.slotNo - b.slotNo);
    const teamB = players.filter((player) => player.team === 1).sort((a, b) => a.slotNo - b.slotNo);
    slots.classList.add('team-mode');
    slots.innerHTML = `
      <div class="team-column team-a">
        <div class="team-header">A Team ${teamA.length}/3</div>
        ${renderTeamSlots(teamA, 0)}
      </div>
      <div class="team-column team-b">
        <div class="team-header">B Team ${teamB.length}/3</div>
        ${renderTeamSlots(teamB, 1)}
      </div>
    `;
    return;
  }

  slots.classList.remove('team-mode');
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

function renderTeamSlots(players, team) {
  return Array.from({ length: 3 }, (_, index) => {
    const player = players[index] || null;
    if (!player) {
      return `<div class="player-slot empty team-${team}"><div class="empty-avatar"></div><strong>Empty</strong><span>Team ${team === 0 ? 'A' : 'B'}</span></div>`;
    }
    const skin = skins[(player.slotNo - 1) % skins.length];
    const name = player.nickname || `Player ${player.userId}`;
    return `
      <div class="player-slot team-${team}">
        <img src="/assets/images/characters/${skin}/front/default.png" alt="" />
        <strong>${name}</strong>
        <span>${player.userId === state.currentRoom?.hostUserId ? 'Host' : player.isReady ? 'Ready' : 'Not ready'} · Team ${team === 0 ? 'A' : 'B'}</span>
      </div>
    `;
  }).join('');
}
