// DOM manipulation: video tiles, chat, controls
const UI = (() => {
  function createVideoTile(socketId, displayName, stream, isSelf = false) {
    const tile = document.createElement('div');
    tile.className = 'video-tile';
    tile.dataset.socketId = socketId;

    const video = document.createElement('video');
    video.autoplay = true;
    video.playsInline = true;
    if (isSelf) video.muted = true;
    if (stream) video.srcObject = stream;

    const label = document.createElement('div');
    label.className = 'tile-label';
    label.textContent = isSelf ? `${displayName} (You)` : displayName;

    const icons = document.createElement('div');
    icons.className = 'tile-icons';

    tile.appendChild(video);
    tile.appendChild(label);
    tile.appendChild(icons);

    document.getElementById('video-grid').appendChild(tile);
    updateGrid();
    return tile;
  }

  function removeVideoTile(socketId) {
    const tile = document.querySelector(`.video-tile[data-socket-id="${socketId}"]`);
    if (tile) tile.remove();
    updateGrid();
  }

  function updateTileStream(socketId, stream) {
    const tile = document.querySelector(`.video-tile[data-socket-id="${socketId}"]`);
    if (!tile) return;
    const video = tile.querySelector('video');
    if (video) video.srcObject = stream;
  }

  function updateGrid() {
    const grid = document.getElementById('video-grid');
    const count = grid.children.length;
    if (count <= 1) {
      grid.style.gridTemplateColumns = '1fr';
    } else if (count <= 4) {
      grid.style.gridTemplateColumns = 'repeat(2, 1fr)';
    } else if (count <= 9) {
      grid.style.gridTemplateColumns = 'repeat(3, 1fr)';
    } else {
      grid.style.gridTemplateColumns = 'repeat(auto-fit, minmax(220px, 1fr))';
    }
  }

  function setTileIconState(socketId, kind, enabled) {
    const tile = document.querySelector(`.video-tile[data-socket-id="${socketId}"]`);
    if (!tile) return;
    const icons = tile.querySelector('.tile-icons');
    const id = `tile-icon-${socketId}-${kind}`;
    let icon = document.getElementById(id);

    if (enabled) {
      if (icon) icon.remove();
      return;
    }

    if (!icon) {
      icon = document.createElement('div');
      icon.className = 'tile-icon';
      icon.id = id;
      icons.appendChild(icon);
    }
    icon.textContent = kind === 'audio' ? '🔇' : '📵';
  }

  function addChatMessage({ fromId, displayName, message, timestamp, isSelf }) {
    const messages = document.getElementById('chat-messages');
    const msg = document.createElement('div');
    msg.className = `chat-msg${isSelf ? ' self' : ''}`;

    const time = new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    msg.innerHTML = `
      <span class="chat-sender">${escapeHtml(displayName)}</span>
      <span class="chat-text">${escapeHtml(message)}</span>
      <span class="chat-time">${time}</span>
    `;

    messages.appendChild(msg);
    messages.scrollTop = messages.scrollHeight;
  }

  function updateParticipantCount(count) {
    const el = document.getElementById('participant-count');
    if (el) el.textContent = `${count} participant${count !== 1 ? 's' : ''}`;
  }

  function setRoomName(name) {
    const el = document.getElementById('room-name-display');
    if (el) el.textContent = name;
  }

  function showToast(msg, duration = 2500) {
    const toast = document.getElementById('toast');
    toast.textContent = msg;
    toast.classList.remove('hidden');
    clearTimeout(UI._toastTimer);
    UI._toastTimer = setTimeout(() => toast.classList.add('hidden'), duration);
  }

  function setCtrlState(btn, active) {
    btn.classList.toggle('active', active);
    btn.classList.toggle('off', !active);
  }

  function escapeHtml(str) {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function showRoom() {
    document.getElementById('lobby').classList.add('hidden');
    document.getElementById('room').classList.remove('hidden');
  }

  function showLobby() {
    document.getElementById('lobby').classList.remove('hidden');
    document.getElementById('room').classList.add('hidden');
  }

  return {
    createVideoTile, removeVideoTile, updateTileStream, setTileIconState,
    addChatMessage, updateParticipantCount, setRoomName,
    showToast, setCtrlState, showRoom, showLobby
  };
})();
