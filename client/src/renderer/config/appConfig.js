export const TILE_SIZE = 40;
export const SPRITE_SCALE = 0.8;
export const CHAR_OFFSET_Y = -0.15;
export const ITEM_PAD = 0.12;
export const BALLOON_PAD = -0.1;

export const API_BASE = window.LAN_BOMBER_API_BASE || `${location.protocol}//${location.hostname}:8080`;
export const WS_BASE = window.LAN_BOMBER_WS_BASE || `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.hostname}:8080`;

export const titles = {
  authView: { title: 'Invite', subtitle: 'Enter an invite code before Google signup.', status: 'invite_required' },
  profileView: { title: 'Profile', subtitle: 'Choose your nickname and character color.', status: 'profile_required' },
  codeView: { title: 'Invite Code', subtitle: 'Verify your invite code to unlock the lobby.', status: 'access_code_required' },
  lobbyView: { title: 'Lobby', subtitle: 'Create a room or join an existing same Wi-Fi room.', status: 'approved' },
  rankingsView: { title: 'Rankings', subtitle: 'Compare scores, wins, win rate, and match volume.', status: 'approved' },
  roomView: { title: 'Room', subtitle: 'Up to 6 players can ready up before the host starts.', status: 'approved' },
  gameView: { title: 'Game', subtitle: 'Map, item, block, balloon, and effect preview based on the original renderer.', status: 'playing' }
};
