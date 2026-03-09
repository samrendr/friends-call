// Signaling layer: wraps Socket.IO for WebRTC coordination
const Signaling = (() => {
  let socket = null;

  function connect(serverUrl) {
    socket = io(serverUrl);
    return socket;
  }

  function getSocket() { return socket; }

  function joinRoom(roomId, displayName) {
    socket.emit('join-room', { roomId, displayName });
  }

  function sendOffer(targetId, sdp) {
    socket.emit('offer', { targetId, sdp });
  }

  function sendAnswer(targetId, sdp) {
    socket.emit('answer', { targetId, sdp });
  }

  function sendIceCandidate(targetId, candidate) {
    socket.emit('ice-candidate', { targetId, candidate });
  }

  function sendChatMessage(roomId, message) {
    socket.emit('chat-message', { roomId, message });
  }

  function sendToggleState(roomId, kind, enabled) {
    socket.emit('toggle-state', { roomId, kind, enabled });
  }

  function sendEmojiReaction(roomId, emoji) {
    socket.emit('emoji-reaction', { roomId, emoji });
  }

  function sendControlRequest(agentId, myName) { socket.emit('control-request', { agentId, requesterName: myName }); }
  function sendControlGrant(controllerId, controllerName) { socket.emit('control-grant', { controllerId, controllerName }); }
  function sendControlDeny(controllerId) { socket.emit('control-deny', { controllerId }); }
  function sendControlEvent(agentId, type, data) { socket.emit('control-event', { agentId, type, ...data }); }
  function sendControlRevoke(agentId) { socket.emit('control-revoke', { agentId }); }

  function sendPointerMove(roomId, targetSocketId, x, y) {
    socket.emit('pointer-move', { roomId, targetSocketId, x, y });
  }

  function sendPointerEnd(roomId) {
    socket.emit('pointer-end', { roomId });
  }

  function on(event, cb) { socket.on(event, cb); }
  function off(event, cb) { socket.off(event, cb); }
  // For socket.io manager events (reconnect, etc.)
  function onManager(event, cb) { socket.io.on(event, cb); }

  return {
    connect, getSocket, joinRoom, sendOffer, sendAnswer, sendIceCandidate,
    sendChatMessage, sendToggleState, sendEmojiReaction,
    sendPointerMove, sendPointerEnd,
    sendControlRequest, sendControlGrant, sendControlDeny, sendControlEvent, sendControlRevoke,
    on, off, onManager
  };
})();
