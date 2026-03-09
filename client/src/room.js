// Core room orchestrator: connects signaling, peers, media, and UI
const Room = (() => {
  const peers = new Map(); // socketId -> Peer instance
  let mySocketId = null;
  let myDisplayName = null;
  let currentRoomId = null;
  let audioEnabled = true;
  let videoEnabled = true;

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
      // Create tile if it doesn't exist yet
      if (!document.querySelector(`.video-tile[data-socket-id="${socketId}"]`)) {
        UI.createVideoTile(socketId, displayName, stream);
      } else {
        UI.updateTileStream(socketId, stream);
      }
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

  function bindSignalingEvents() {
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
      // Don't create peer yet — wait for their offer
      UI.showToast(`${displayName} joined`);
      UI.updateParticipantCount(peers.size + 2); // +1 for new user, +1 for self
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
  }

  async function join(roomId, displayName) {
    myDisplayName = displayName;
    currentRoomId = roomId;

    // Get media first
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

    // Show own video
    UI.createVideoTile('self', displayName, stream, true);

    // Connect and join
    Signaling.connect(window.location.origin);
    bindSignalingEvents();
    Signaling.joinRoom(roomId, displayName);

    return true;
  }

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

  function leave() {
    peers.forEach(p => p.close());
    peers.clear();
    Media.stopAll();
    window.location.href = '/';
  }

  function getRoomId() { return currentRoomId; }
  function getMySocketId() { return mySocketId; }

  return { join, toggleAudio, toggleVideo, toggleScreenShare, leave, getRoomId, getPeersArray };
})();
