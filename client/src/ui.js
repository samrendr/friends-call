// DOM manipulation: video tiles, chat, controls
const UI = (() => {
  let currentSpotlight = null; // socketId of spotlighted tile, or null
  let currentViewMode = 'grid'; // 'grid' | 'spotlight' | 'focus'

  // ---- Video Tiles ----

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

    // Expand/spotlight button (top-left, visible on hover)
    const expandBtn = document.createElement('button');
    expandBtn.className = 'tile-expand-btn';
    expandBtn.title = 'Spotlight';
    expandBtn.textContent = '⤢';
    expandBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      _handleTileClick(socketId);
    });

    tile.appendChild(video);
    tile.appendChild(label);
    tile.appendChild(icons);
    tile.appendChild(expandBtn);

    // Click anywhere on tile to spotlight
    tile.addEventListener('click', () => _handleTileClick(socketId));

    document.getElementById('video-grid').appendChild(tile);
    _attachPointerListeners(tile); // inherit active pointer mode if on
    applyLayout();
    return tile;
  }

  function _handleTileClick(socketId) {
    if (currentSpotlight === socketId) {
      // Already spotlighted → back to grid
      setViewMode('grid');
    } else {
      currentSpotlight = socketId;
      if (currentViewMode === 'grid') currentViewMode = 'spotlight';
      _syncViewModeButtons();
      applyLayout();
    }
  }

  function removeVideoTile(socketId) {
    // Find tile wherever it might be (grid or inside spotlight containers)
    const tile = document.querySelector(`.video-tile[data-socket-id="${socketId}"]`);
    if (tile) tile.remove();
    if (currentSpotlight === socketId) currentSpotlight = null;
    applyLayout();
  }

  function updateTileStream(socketId, stream) {
    const tile = document.querySelector(`.video-tile[data-socket-id="${socketId}"]`);
    if (!tile) return;
    const video = tile.querySelector('video');
    if (video) video.srcObject = stream;
  }

  // ---- Layout Engine ----

  function applyLayout() {
    const grid = document.getElementById('video-grid');
    if (!grid) return;

    // 1. Restore any tiles from injected spotlight containers back to grid
    grid.querySelectorAll('.spotlight-main, .spotlight-sidebar').forEach(container => {
      [...container.children].forEach(child => grid.appendChild(child));
      container.remove();
    });

    // 2. Clear spotlight classes + reset inline styles on grid
    grid.querySelectorAll('.video-tile').forEach(t => t.classList.remove('spotlighted'));
    grid.style.cssText = '';
    grid.className = 'video-grid';

    const tiles = [...grid.querySelectorAll('.video-tile')];
    const spotlightTile = currentSpotlight
      ? grid.querySelector(`.video-tile[data-socket-id="${currentSpotlight}"]`)
      : null;

    // 3. Apply the right layout
    if (!spotlightTile || currentViewMode === 'grid') {
      // Grid mode: auto column count
      _applyGridColumns(tiles.length);
      return;
    }

    spotlightTile.classList.add('spotlighted');
    grid.classList.add(`mode-${currentViewMode}`);

    if (currentViewMode === 'spotlight') {
      const main = document.createElement('div');
      main.className = 'spotlight-main';
      const sidebar = document.createElement('div');
      sidebar.className = 'spotlight-sidebar';

      tiles.forEach(tile => {
        if (tile === spotlightTile) main.appendChild(tile);
        else sidebar.appendChild(tile);
      });

      if (sidebar.children.length === 0) sidebar.style.display = 'none';

      grid.appendChild(main);
      grid.appendChild(sidebar);
    }
    // focus mode: CSS hides non-spotlighted tiles (.mode-focus .video-tile:not(.spotlighted))
  }

  function _applyGridColumns(count) {
    const grid = document.getElementById('video-grid');
    if (count <= 1) grid.style.gridTemplateColumns = '1fr';
    else if (count <= 4) grid.style.gridTemplateColumns = 'repeat(2, 1fr)';
    else if (count <= 9) grid.style.gridTemplateColumns = 'repeat(3, 1fr)';
    else grid.style.gridTemplateColumns = 'repeat(auto-fit, minmax(220px, 1fr))';
  }

  // ---- View Mode ----

  function setViewMode(mode) {
    currentViewMode = mode;
    if (mode === 'grid') {
      currentSpotlight = null;
    } else if (!currentSpotlight) {
      // Auto-spotlight the first non-self tile, or first tile
      const firstOther = document.querySelector('.video-tile:not([data-socket-id="self"])');
      const first = firstOther || document.querySelector('.video-tile');
      if (first) currentSpotlight = first.dataset.socketId;
    }
    _syncViewModeButtons();
    applyLayout();
  }

  function _syncViewModeButtons() {
    document.querySelectorAll('.view-mode-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.mode === currentViewMode);
    });
  }

  // ---- Tile state ----

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

  // ---- Chat ----

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

  // ---- Misc ----

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

  // ---- Remote control UI ----

  function setControlAvailable(available, agentName) {
    const btn = document.getElementById('control-btn');
    if (!btn) return;
    btn.classList.toggle('hidden', !available);
    if (available && agentName) {
      btn.querySelector('.ctrl-label').textContent = agentName.length > 9 ? agentName.slice(0, 8) + '…' : agentName;
    }
    document.getElementById('video-grid').classList.remove('control-active');
  }

  function setControlBtnState(state) { // 'available' | 'pending' | 'active'
    const btn = document.getElementById('control-btn');
    if (!btn) return;
    const isActive  = state === 'active';
    const isPending = state === 'pending';
    btn.querySelector('.ctrl-icon').textContent = isActive ? '🟢' : '🕹';
    btn.querySelector('.ctrl-label').textContent = isPending ? 'Pending…' : isActive ? 'Stop Ctrl' : 'Control';
    btn.classList.toggle('ctrl-btn-danger', isActive);
    btn.disabled = isPending;
    document.getElementById('video-grid').classList.toggle('control-active', isActive);
  }

  // ---- Reconnect overlay ----

  function showReconnecting(show) {
    let bar = document.getElementById('reconnect-bar');
    if (show && !bar) {
      bar = document.createElement('div');
      bar.id = 'reconnect-bar';
      bar.className = 'reconnect-bar';
      bar.innerHTML = '<span class="reconnect-spinner"></span> Connection lost — reconnecting...';
      document.body.appendChild(bar);
    } else if (!show && bar) {
      bar.remove();
    }
  }

  // ---- Laser pointer ----

  let _pointerActive = false;
  let _pointerOnMove = null;
  let _pointerOnEnd = null;

  function _attachPointerListeners(tile) {
    if (tile._pmHandler) tile.removeEventListener('mousemove', tile._pmHandler);
    if (tile._pmLeave) tile.removeEventListener('mouseleave', tile._pmLeave);
    if (!_pointerActive) { tile.style.cursor = ''; return; }

    tile.style.cursor = 'crosshair';
    tile._pmHandler = (e) => {
      const rect = tile.getBoundingClientRect();
      const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      const y = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
      _pointerOnMove && _pointerOnMove(tile.dataset.socketId, x, y);
    };
    tile._pmLeave = () => {
      _pointerOnEnd && _pointerOnEnd();
    };
    tile.addEventListener('mousemove', tile._pmHandler);
    tile.addEventListener('mouseleave', tile._pmLeave);
  }

  function setPointerMode(active, onMove, onEnd) {
    _pointerActive = active;
    _pointerOnMove = onMove;
    _pointerOnEnd = onEnd;
    document.querySelectorAll('.video-tile').forEach(_attachPointerListeners);
  }

  function showPointerDot(targetSocketId, fromId, x, y, displayName) {
    const tile = document.querySelector(`.video-tile[data-socket-id="${targetSocketId}"]`);
    if (!tile) return;

    const dotId = `ptr-${CSS.escape(fromId)}`;
    let dot = document.getElementById(dotId);

    if (!dot) {
      dot = document.createElement('div');
      dot.id = dotId;
      dot.className = fromId === 'local' ? 'pointer-dot pointer-dot--local' : 'pointer-dot';
      const ring = document.createElement('div');
      ring.className = 'pointer-ring';
      const label = document.createElement('span');
      label.className = 'pointer-label';
      dot.appendChild(ring);
      dot.appendChild(label);
    }

    // Move to correct tile if pointer crossed tiles
    if (dot.parentElement !== tile) tile.appendChild(dot);

    dot.style.left = `${x * 100}%`;
    dot.style.top = `${y * 100}%`;
    dot.querySelector('.pointer-label').textContent = escapeHtml(displayName);
  }

  function hidePointerDot(fromId) {
    const dotId = `ptr-${CSS.escape(fromId)}`;
    const dot = document.getElementById(dotId);
    if (dot) dot.remove();
  }

  // ---- Emoji Reactions ----

  const REACTION_SETS = {
    funny:   ['🤡','💩','💀','👻','🫠','👽','🤮','🙈','😵','🥴','🫡','🤌'],
    hype:    ['🔥','🚀','💥','🎉','🏆','⚡','🤯','🎊','👑','💪','🌋','🎸'],
    love:    ['❤️','😍','🥰','💯','✨','💎','🌈','🥂','🎂','🫶','🌟','👌'],
    text:    ['LOL','OMG','GG','NOOO','WOW','LFG','BRUH','WTF','LETS GO','YEET','EZ','gg ez'],
  };

  let _activeReactionTab = 'funny';

  function showEmojiSplash(content, displayName) {
    const isText = content.length > 2 && /^[A-Za-z\s]+$/.test(content);
    const count = isText ? 1 : (Math.random() > 0.6 ? 2 : 1); // 40% chance of double burst
    for (let i = 0; i < count; i++) {
      setTimeout(() => _spawnSplash(content, displayName, isText), i * 180);
    }
  }

  function _spawnSplash(content, displayName, isText) {
    const el = document.createElement('div');
    el.className = isText ? 'emoji-splash emoji-splash--text' : 'emoji-splash';

    const face = document.createElement('span');
    face.className = 'emoji-splash-face';
    face.textContent = content;

    const name = document.createElement('span');
    name.className = 'emoji-splash-name';
    name.textContent = escapeHtml(displayName);

    el.appendChild(face);
    el.appendChild(name);

    // Random horizontal + slight wobble via CSS var
    el.style.left = `${12 + Math.random() * 68}%`;
    const wobble = ((Math.random() - 0.5) * 30).toFixed(1);
    el.style.setProperty('--wobble', `${wobble}deg`);
    // Random duration 2.5–3.5s
    el.style.animationDuration = `${(2.5 + Math.random()).toFixed(2)}s`;

    document.body.appendChild(el);
    el.addEventListener('animationend', () => el.remove(), { once: true });
  }

  function toggleEmojiPicker(onSelect) {
    const existing = document.getElementById('emoji-picker');
    if (existing) { existing.remove(); return; }

    const picker = document.createElement('div');
    picker.id = 'emoji-picker';
    picker.className = 'emoji-picker';

    // Tab bar
    const tabs = document.createElement('div');
    tabs.className = 'reaction-tabs';
    const tabLabels = { funny: '😂 Funny', hype: '🔥 Hype', love: '❤️ Love', text: '💬 Text' };

    const grid = document.createElement('div');
    grid.className = 'reaction-grid';

    function renderTab(tab) {
      _activeReactionTab = tab;
      tabs.querySelectorAll('.reaction-tab').forEach(t =>
        t.classList.toggle('active', t.dataset.tab === tab));
      grid.innerHTML = '';
      REACTION_SETS[tab].forEach(item => {
        const btn = document.createElement('button');
        btn.className = tab === 'text' ? 'reaction-btn reaction-btn--text' : 'reaction-btn';
        btn.textContent = item;
        btn.title = item;
        btn.addEventListener('click', () => { onSelect(item); picker.remove(); });
        grid.appendChild(btn);
      });
    }

    Object.entries(tabLabels).forEach(([key, label]) => {
      const tab = document.createElement('button');
      tab.className = 'reaction-tab';
      tab.dataset.tab = key;
      tab.textContent = label;
      tab.addEventListener('click', () => renderTab(key));
      tabs.appendChild(tab);
    });

    picker.appendChild(tabs);
    picker.appendChild(grid);

    // Position above the React button
    const reactBtn = document.getElementById('react-btn');
    const rect = reactBtn.getBoundingClientRect();
    // Use top (distance from top of viewport) instead of bottom to avoid transform conflicts
    picker.style.position = 'fixed';
    picker.style.left = `${rect.left + rect.width / 2}px`;
    picker.style.top = `${rect.top - 8}px`; // will be adjusted after append
    picker.style.transform = 'translateX(-50%) translateY(-100%)';

    document.body.appendChild(picker);
    renderTab(_activeReactionTab);

    // Close on outside click
    setTimeout(() => {
      function onOutside(e) {
        if (!picker.contains(e.target) && e.target !== reactBtn) {
          picker.remove();
          document.removeEventListener('click', onOutside, { capture: true });
        }
      }
      document.addEventListener('click', onOutside, { capture: true });
    }, 0);
  }

  return {
    createVideoTile, removeVideoTile, updateTileStream, setTileIconState,
    addChatMessage, updateParticipantCount, setRoomName,
    showToast, setCtrlState, showRoom, showLobby,
    showEmojiSplash, toggleEmojiPicker,
    setViewMode, setSpotlight: (id) => _handleTileClick(id),
    showReconnecting, setPointerMode, showPointerDot, hidePointerDot,
    setControlAvailable, setControlBtnState
  };
})();
