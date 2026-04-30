import { state } from '../core/state.js';
import { maps } from '../data/maps.js';
import { updateRoomMap } from '../rooms/roomsApi.js';
import { drawPreviewBoard } from './previewBoard.js';

export function renderMapOptions() {
  const selects = document.querySelectorAll('[data-map-select]');
  const options = Object.values(maps).map((map) => `<option value="${map.id}">${map.name} (${map.width}x${map.height})</option>`).join('');

  selects.forEach((select) => {
    select.innerHTML = options;
    select.value = state.mapId;
    select.addEventListener('change', async () => {
      const nextMapId = select.value;
      state.mapId = nextMapId;
      document.querySelectorAll('[data-map-select]').forEach((other) => { other.value = state.mapId; });
      drawPreviewBoard();

      if (state.currentView === 'roomView' && state.currentRoom?.hostUserId === state.user?.userId) {
        try {
          await updateRoomMap(nextMapId);
        } catch (err) {
          console.error(err);
        }
      }
    });
  });
}
