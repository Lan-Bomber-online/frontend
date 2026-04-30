import { api } from '../api/client.js';
import { state } from '../core/state.js';
import { showError } from '../ui/status.js';

const rankingLabels = {
  all_time: 'All Time',
  weekly: 'Weekly',
  monthly: 'Monthly',
  wins: 'Wins',
  win_rate: 'Win Rate',
  games: 'Games'
};

let currentType = 'all_time';

function fmt(value) {
  return Number(value || 0).toLocaleString();
}

function pct(value) {
  return `${Number(value || 0).toFixed(2)}%`;
}

function displayName(item) {
  return item.nickname || `User #${item.userId}`;
}

function avatar(item) {
  if (item.profileImageUrl) return `<img src="${item.profileImageUrl}" alt="" />`;
  return '<div class="ranking-avatar__fallback"></div>';
}

function renderMyRank(item) {
  const card = document.querySelector('#myRankCard');
  if (!card) return;
  if (!item) {
    card.innerHTML = '<div><strong>My Rank</strong><span>No ranked matches yet.</span></div>';
    return;
  }

  card.innerHTML = `
    <div>
      <strong>My Rank</strong>
      <span>${rankingLabels[currentType]} leaderboard</span>
    </div>
    <div class="my-rank-card__stats">
      <b>#${item.rank}</b>
      <span>${fmt(item.score)} pts</span>
      <span>${item.wins}W / ${item.losses}L</span>
      <span>${pct(item.winRate)}</span>
    </div>
  `;
}

function renderRankings(items) {
  const table = document.querySelector('#rankingTable');
  if (!table) return;
  if (!items.length) {
    table.innerHTML = '<div class="empty-state">No ranking data yet.</div>';
    return;
  }

  const myId = Number(state.user?.userId || state.user?.user_id || 0);
  table.innerHTML = `
    <div class="ranking-head">
      <span>Rank</span>
      <span>Player</span>
      <span>Score</span>
      <span>Record</span>
      <span>Win Rate</span>
      <span>K/D</span>
      <span>Streak</span>
    </div>
    ${items.map((item) => {
      const isMe = Number(item.userId) === myId;
      const kd = item.deaths > 0 ? (item.kills / item.deaths).toFixed(2) : item.kills > 0 ? fmt(item.kills) : '0.00';
      return `
        <div class="ranking-row ${isMe ? 'mine' : ''}">
          <strong>#${item.rank}</strong>
          <div class="ranking-player">
            <div class="ranking-avatar">${avatar(item)}</div>
            <span>${displayName(item)}</span>
          </div>
          <span>${fmt(item.score)}</span>
          <span>${item.wins}W ${item.losses}L · ${fmt(item.totalGames)}</span>
          <span>${pct(item.winRate)}</span>
          <span>${item.kills}/${item.deaths} · ${kd}</span>
          <span>${fmt(item.bestWinStreak)}</span>
        </div>
      `;
    }).join('')}
  `;
}

export async function loadRankings(options = {}) {
  try {
    const data = await api(`/api/rankings?type=${encodeURIComponent(currentType)}&limit=50&includeMe=true`, {
      loader: !options.silent,
      loaderText: 'Loading rankings'
    });
    renderMyRank(data.me);
    renderRankings(data.items || []);
  } catch (err) {
    showError(err);
  }
}

export function bindRankingsActions() {
  document.querySelector('#rankingTabs')?.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-ranking-type]');
    if (!button) return;
    currentType = button.dataset.rankingType;
    document.querySelectorAll('.ranking-tab').forEach((tab) => {
      tab.classList.toggle('active', tab === button);
    });
    await loadRankings();
  });

  document.querySelector('#btnRefreshRankings')?.addEventListener('click', () => {
    loadRankings();
  });
}
