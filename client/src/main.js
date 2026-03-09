// Entry point: lobby + room control binding
(function () {
  function generateRoomId() {
    return Math.random().toString(36).slice(2, 8).toUpperCase();
  }

  function getRoomFromUrl() {
    const match = window.location.pathname.match(/\/room\/([^/]+)/);
    return match ? decodeURIComponent(match[1]) : null;
  }

  function getSavedName() {
    return localStorage.getItem('fc_displayName') || '';
  }

  function saveName(name) {
    localStorage.setItem('fc_displayName', name);
  }

  // ---- Lobby ----
  function initLobby(prefilledRoom) {
    document.getElementById('lobby').classList.remove('hidden');

    const nameInput = document.getElementById('display-name');
    const roomInput = document.getElementById('room-input');
    const joinBtn = document.getElementById('join-btn');

    nameInput.value = getSavedName();
    if (prefilledRoom) roomInput.value = prefilledRoom;

    joinBtn.addEventListener('click', () => startCall(nameInput.value.trim(), roomInput.value.trim()));
    nameInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') roomInput.focus(); });
    roomInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') startCall(nameInput.value.trim(), roomInput.value.trim()); });

    nameInput.focus();
  }

  async function startCall(displayName, roomId) {
    if (!displayName) { UI.showToast('Enter your name'); return; }
    if (!roomId) roomId = generateRoomId();

    saveName(displayName);

    // Update URL without reload
    const newUrl = `/room/${encodeURIComponent(roomId)}`;
    if (window.location.pathname !== newUrl) {
      window.history.pushState({}, '', newUrl);
    }

    const ok = await Room.join(roomId, displayName);
    if (ok) initRoomControls(roomId);
  }

  // ---- Room controls ----
  function initRoomControls(roomId) {
    document.getElementById('mute-btn').addEventListener('click', () => Room.toggleAudio());
    document.getElementById('camera-btn').addEventListener('click', () => Room.toggleVideo());
    document.getElementById('screen-btn').addEventListener('click', () => Room.toggleScreenShare());
    document.getElementById('leave-btn').addEventListener('click', () => Room.leave());

    // Chat toggle
    document.getElementById('chat-btn').addEventListener('click', () => {
      const sidebar = document.getElementById('chat-sidebar');
      sidebar.classList.toggle('hidden');
      document.getElementById('chat-btn').classList.toggle('active', !sidebar.classList.contains('hidden'));
    });

    // Copy link
    document.getElementById('copy-link-btn').addEventListener('click', () => {
      const link = `${window.location.origin}/room/${encodeURIComponent(roomId)}`;
      navigator.clipboard.writeText(link).then(() => UI.showToast('Invite link copied!')).catch(() => UI.showToast(link));
    });

    // Chat form
    document.getElementById('chat-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const input = document.getElementById('chat-input');
      const message = input.value.trim();
      if (!message) return;
      Signaling.sendChatMessage(roomId, message);
      input.value = '';
    });
  }

  // ---- Init ----
  const roomFromUrl = getRoomFromUrl();
  initLobby(roomFromUrl);
})();
