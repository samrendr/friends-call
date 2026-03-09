// Core room orchestrator: connects signaling, peers, media, and UI
const Room = (() => {
  const peers = new Map(); // socketId -> Peer instance
  let mySocketId = null;
  let myDisplayName = null;
  let currentRoomId = null;
  let audioEnabled = true;
  let videoEnabled = true;
  let _hasConnected = false;
  let _agentInfo = null;    // { agentId, displayName, screenWidth, screenHeight }
  let _controlActive = false;

  function getPeersArray() {
    return [...peers.values()];
  }

  function makeOnIceCandidate() {
    return (targetId, candidate) => Signaling.sendIceCandidate(targetId, candidate);
  }

  function makeOnNegotiationNeeded() {
    return (targetId, sdp) => Signaling.sendOffer(targetId, sdp);
  }

  function makeOnRemoteStream() {
    return (socketId, stream) => {
      const peer = peers.get(socketId);
      const displayName = peer ? peer.displayName : socketId;
      if (!document.querySelector(`.video-tile[data-socket-id="${socketId}"]`)) {
        UI.createVideoTile(socketId, displayName, stream);
      } else {
        UI.updateTileStream(socketId, stream);
      }
      // Add audio to active recording if one is running
      if (Recorder.isRecording()) Recorder.addPeerStream(stream);
    };
  }

  function createPeer(socketId, displayName) {
    const peer = new Peer({
      socketId,
      displayName,
      localStream: Media.getStream(),
      onRemoteStream: makeOnRemoteStream(),
      onIceCandidate: makeOnIceCandidate(),
      onNegotiationNeeded: makeOnNegotiationNeeded()
    });
    peers.set(socketId, peer);
    return peer;
  }

  function removePeer(socketId) {
    const peer = peers.get(socketId);
    if (peer) {
      peer.close();
      peers.delete(socketId);
    }
    UI.removeVideoTile(socketId);
    UI.updateParticipantCount(peers.size + 1);
  }

  // ---- Reconnect ----

  function _handleReconnect() {
    UI.showReconnecting(false);
    UI.showToast('Back online — rejoining call...', 3000);

    // Close and remove all stale peer connections
    peers.forEach((peer, socketId) => {
      peer.close();
      UI.removeVideoTile(socketId);
    });
    peers.clear();

    // Re-join the room (media stream is still live)
    Signaling.joinRoom(currentRoomId, myDisplayName);
  }

  // ---- Signaling event bindings ----

  function bindSignalingEvents() {
    // Auto-reconnect: detect drop vs. intentional leave
    Signaling.on('disconnect', (reason) => {
      if (reason === 'io client disconnect') return; // user clicked Leave
      UI.showReconnecting(true);
    });

    // Socket connected — detect reconnection by checking _hasConnected flag
    Signaling.on('connect', () => {
      if (!_hasConnected) { _hasConnected = true; return; }
      _handleReconnect();
    });

    Signaling.onManager('reconnect_failed', () => {
      UI.showReconnecting(false);
      UI.showToast('Could not reconnect. Please refresh the page.', 0);
    });

    // Existing participants list (we are new joiner — initiate offers to everyone)
    Signaling.on('room-joined', async ({ socketId, participants, roomId }) => {
      mySocketId = socketId;
      currentRoomId = roomId;

      for (const p of participants) {
        const peer = createPeer(p.socketId, p.displayName);
        const sdp = await peer.createOffer();
        Signaling.sendOffer(p.socketId, sdp);
      }

      UI.updateParticipantCount(participants.length + 1);
    });

    // Someone joined after us
    Signaling.on('user-joined', ({ socketId, displayName }) => {
      UI.showToast(`${displayName} joined`);
      UI.updateParticipantCount(peers.size + 2);
    });

    // Incoming offer
    Signaling.on('offer', async ({ fromId, displayName, sdp }) => {
      let peer = peers.get(fromId);
      if (!peer) peer = createPeer(fromId, displayName);

      const answerSdp = await peer.handleOffer(sdp);
      Signaling.sendAnswer(fromId, answerSdp);
    });

    // Incoming answer
    Signaling.on('answer', async ({ fromId, sdp }) => {
      const peer = peers.get(fromId);
      if (peer) await peer.handleAnswer(sdp);
    });

    // ICE candidate
    Signaling.on('ice-candidate', async ({ fromId, candidate }) => {
      const peer = peers.get(fromId);
      if (peer) await peer.addIceCandidate(candidate);
    });

    // Someone left
    Signaling.on('user-left', ({ socketId }) => {
      removePeer(socketId);
    });

    // Room full
    Signaling.on('room-full', ({ max }) => {
      UI.showToast(`Room is full (max ${max} participants)`, 4000);
      UI.showLobby();
    });

    // Chat message
    Signaling.on('chat-message', (data) => {
      UI.addChatMessage({ ...data, isSelf: data.fromId === mySocketId });
    });

    // Remote peer toggle state
    Signaling.on('peer-toggle-state', ({ fromId, kind, enabled }) => {
      UI.setTileIconState(fromId, kind, enabled);
    });

    // Incoming emoji reaction (sender shows immediately, skip own echo)
    Signaling.on('emoji-reaction', ({ fromId, displayName, emoji }) => {
      if (fromId !== mySocketId) UI.showEmojiSplash(emoji, displayName);
    });

    // Agent connected (remote-agent.js joined the room)
    Signaling.on('agent-ready', ({ agentId, displayName, screenWidth, screenHeight }) => {
      _agentInfo = { agentId, displayName, screenWidth, screenHeight };
      UI.showToast(`🕹 ${displayName} is ready for remote control`, 3000);
      UI.setControlAvailable(true, displayName);
    });

    Signaling.on('agent-left', ({ agentId }) => {
      if (!_agentInfo || _agentInfo.agentId !== agentId) return;
      if (_controlActive) _stopControl();
      _agentInfo = null;
      UI.setControlAvailable(false);
      UI.showToast('Remote agent disconnected');
    });

    // Control granted by agent
    Signaling.on('control-granted', ({ agentId, agentName, screenWidth, screenHeight }) => {
      if (_agentInfo) { _agentInfo.screenWidth = screenWidth; _agentInfo.screenHeight = screenHeight; }
      _controlActive = true;
      UI.setControlBtnState('active');
      UI.showToast(`✅ Controlling ${agentName} — move your mouse over the video area`, 4000);
      _attachControlListeners();
    });

    Signaling.on('control-denied', () => {
      UI.setControlBtnState('available');
      UI.showToast('Control request was denied');
    });

    // Control revoked (agent pressed Ctrl+C or ended session)
    Signaling.on('control-revoked', () => {
      _controlActive = false;
      _detachControlListeners();
      UI.setControlBtnState('available');
      UI.showToast('Remote control ended by agent');
    });

  }

  // ---- Join ----

  async function join(roomId, displayName) {
    myDisplayName = displayName;
    currentRoomId = roomId;

    let stream;
    try {
      stream = await Media.getLocalStream();
    } catch (err) {
      UI.showToast('Camera/mic access denied. Check permissions.', 5000);
      console.error(err);
      return false;
    }

    UI.showRoom();
    UI.setRoomName(roomId);
    UI.createVideoTile('self', displayName, stream, true);

    Signaling.connect(window.location.origin);
    bindSignalingEvents();
    Signaling.joinRoom(roomId, displayName);

    return true;
  }

  // ---- Controls ----

  function toggleAudio() {
    audioEnabled = !audioEnabled;
    Media.toggleAudio(audioEnabled);
    UI.setTileIconState('self', 'audio', audioEnabled);
    Signaling.sendToggleState(currentRoomId, 'audio', audioEnabled);

    const btn = document.getElementById('mute-btn');
    btn.querySelector('.ctrl-icon').textContent = audioEnabled ? '🎙️' : '🔇';
    btn.querySelector('.ctrl-label').textContent = audioEnabled ? 'Mute' : 'Unmute';
    UI.setCtrlState(btn, audioEnabled);
    return audioEnabled;
  }

  function toggleVideo() {
    videoEnabled = !videoEnabled;
    Media.toggleVideo(videoEnabled);
    UI.setTileIconState('self', 'video', videoEnabled);
    Signaling.sendToggleState(currentRoomId, 'video', videoEnabled);

    const btn = document.getElementById('camera-btn');
    btn.querySelector('.ctrl-icon').textContent = videoEnabled ? '📷' : '📵';
    btn.querySelector('.ctrl-label').textContent = videoEnabled ? 'Camera' : 'Off';
    UI.setCtrlState(btn, videoEnabled);
    return videoEnabled;
  }

  async function toggleScreenShare() {
    const btn = document.getElementById('screen-btn');
    if (Media.isScreenSharing()) {
      Media.stopScreenShare(getPeersArray());
      btn.classList.remove('active');
      btn.querySelector('.ctrl-label').textContent = 'Share';
      UI.showToast('Screen share stopped');
    } else {
      try {
        const track = await Media.startScreenShare(getPeersArray());
        btn.classList.add('active');
        btn.querySelector('.ctrl-label').textContent = 'Stop';
        UI.showToast('Screen sharing started');
        track.onended = () => {
          btn.classList.remove('active');
          btn.querySelector('.ctrl-label').textContent = 'Share';
        };
      } catch (err) {
        if (err.name !== 'NotAllowedError') UI.showToast('Screen share failed');
      }
    }
  }

  // ---- Remote control ----

  function toggleControl() {
    _controlActive ? _stopControl() : _requestControl();
  }

  function _requestControl() {
    if (!_agentInfo) return;
    Signaling.sendControlRequest(_agentInfo.agentId, myDisplayName);
    UI.setControlBtnState('pending');
    UI.showToast(`Asking ${_agentInfo.displayName} for control...`, 5000);
  }

  function _stopControl() {
    if (!_agentInfo) return;
    Signaling.sendControlRevoke(_agentInfo.agentId);
    _controlActive = false;
    _detachControlListeners();
    UI.setControlBtnState('available');
  }

  function _attachControlListeners() {
    const zone = document.getElementById('video-grid');

    const throttledMove = _throttle((e) => {
      if (!_controlActive || !_agentInfo) return;
      const { x, y } = _mapCoords(e.clientX, e.clientY);
      Signaling.sendControlEvent(_agentInfo.agentId, 'mousemove', { x, y });
    }, 33); // ~30 fps

    zone._cMove = throttledMove;
    zone._cClick = (e) => {
      if (!_controlActive || !_agentInfo) return;
      e.preventDefault();
      const { x, y } = _mapCoords(e.clientX, e.clientY);
      const type = e.type === 'dblclick' ? 'dblclick' : 'click';
      Signaling.sendControlEvent(_agentInfo.agentId, type, { x, y, button: e.button === 2 ? 'right' : 'left' });
    };
    zone._cCtx = (e) => {
      if (!_controlActive || !_agentInfo) return;
      e.preventDefault();
      const { x, y } = _mapCoords(e.clientX, e.clientY);
      Signaling.sendControlEvent(_agentInfo.agentId, 'rightclick', { x, y });
    };
    zone._cScroll = (e) => {
      if (!_controlActive || !_agentInfo) return;
      e.preventDefault();
      Signaling.sendControlEvent(_agentInfo.agentId, 'scroll', { x: e.deltaX, y: e.deltaY });
    };
    zone._cKey = (e) => {
      if (!_controlActive || !_agentInfo) return;
      // Don't intercept when user is typing in chat/input
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      e.preventDefault();
      const mods = [];
      if (e.ctrlKey)  mods.push('control');
      if (e.shiftKey) mods.push('shift');
      if (e.altKey)   mods.push('alt');
      if (e.metaKey)  mods.push('command');
      const isPrintable = e.key.length === 1 && !e.ctrlKey && !e.metaKey;
      if (isPrintable) {
        Signaling.sendControlEvent(_agentInfo.agentId, 'typestring', { key: e.key });
      } else {
        Signaling.sendControlEvent(_agentInfo.agentId, 'keypress', { key: e.key, modifiers: mods });
      }
    };

    zone.addEventListener('mousemove', zone._cMove);
    zone.addEventListener('click',     zone._cClick);
    zone.addEventListener('dblclick',  zone._cClick);
    zone.addEventListener('contextmenu', zone._cCtx);
    zone.addEventListener('wheel', zone._cScroll, { passive: false });
    document.addEventListener('keydown', zone._cKey);
    zone.style.cursor = 'crosshair';
  }

  function _detachControlListeners() {
    const zone = document.getElementById('video-grid');
    if (!zone) return;
    zone.removeEventListener('mousemove',    zone._cMove);
    zone.removeEventListener('click',        zone._cClick);
    zone.removeEventListener('dblclick',     zone._cClick);
    zone.removeEventListener('contextmenu',  zone._cCtx);
    zone.removeEventListener('wheel',        zone._cScroll);
    document.removeEventListener('keydown',  zone._cKey);
    zone.style.cursor = '';
  }

  function _mapCoords(clientX, clientY) {
    if (!_agentInfo) return { x: 0, y: 0 };
    const zone = document.getElementById('video-grid');
    const rect = zone.getBoundingClientRect();
    const relX = Math.max(0, Math.min(1, (clientX - rect.left)  / rect.width));
    const relY = Math.max(0, Math.min(1, (clientY - rect.top)   / rect.height));
    return {
      x: Math.round(relX * _agentInfo.screenWidth),
      y: Math.round(relY * _agentInfo.screenHeight)
    };
  }

  function _throttle(fn, ms) {
    let last = 0;
    return (...args) => { const now = Date.now(); if (now - last >= ms) { last = now; fn(...args); } };
  }

  // ---- Leave ----

  function leave() {
    _hasConnected = false;
    if (Recorder.isRecording()) Recorder.stop();
    peers.forEach(p => p.close());
    peers.clear();
    Media.stopAll();
    window.location.href = '/';
  }

  function toggleRecording() {
    const btn = document.getElementById('record-btn');
    if (Recorder.isRecording()) {
      Recorder.stop();
      btn.querySelector('.ctrl-icon').textContent = '⏺️';
      btn.querySelector('.ctrl-label').textContent = 'Record';
      btn.classList.remove('active');
      UI.showToast('Recording saved — check your downloads', 3000);
    } else {
      // Collect streams from all existing peer video elements
      const peerStreams = [...document.querySelectorAll('.video-tile:not([data-socket-id="self"]) video')]
        .map(v => v.srcObject).filter(Boolean);
      const ok = Recorder.start(Media.getStream(), peerStreams);
      if (!ok) { UI.showToast('Recording not supported in this browser'); return; }
      btn.querySelector('.ctrl-icon').textContent = '⏹️';
      btn.querySelector('.ctrl-label').textContent = 'Stop';
      btn.classList.add('active');
      UI.showToast('Recording started', 2000);
    }
  }

  function sendReaction(emoji) {
    UI.showEmojiSplash(emoji, myDisplayName);
    Signaling.sendEmojiReaction(currentRoomId, emoji);
  }

  function getRoomId() { return currentRoomId; }

  return {
    join, toggleAudio, toggleVideo, toggleScreenShare, toggleControl, toggleRecording,
    leave, getRoomId, getPeersArray, sendReaction
  };
})();
