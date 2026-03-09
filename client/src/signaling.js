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

  function on(event, cb) { socket.on(event, cb); }
  function off(event, cb) { socket.off(event, cb); }

  return { connect, getSocket, joinRoom, sendOffer, sendAnswer, sendIceCandidate, sendChatMessage, sendToggleState, on, off };
})();
