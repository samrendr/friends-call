// Media utilities: getUserMedia, screen share, track management
const Media = (() => {
  let localStream = null;
  let screenStream = null;
  let originalVideoTrack = null;

  async function getLocalStream() {
    localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    return localStream;
  }

  function getStream() { return localStream; }

  function toggleAudio(enabled) {
    if (!localStream) return;
    localStream.getAudioTracks().forEach(t => { t.enabled = enabled; });
  }

  function toggleVideo(enabled) {
    if (!localStream) return;
    localStream.getVideoTracks().forEach(t => { t.enabled = enabled; });
  }

  async function startScreenShare(peers) {
    screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
    const screenTrack = screenStream.getVideoTracks()[0];

    // Remember original video track
    originalVideoTrack = localStream.getVideoTracks()[0];

    // Replace in local stream
    localStream.removeTrack(originalVideoTrack);
    localStream.addTrack(screenTrack);

    // Replace on all peer connections
    peers.forEach(peer => peer.replaceTrack('video', screenTrack));

    // When user stops via browser UI
    screenTrack.onended = () => stopScreenShare(peers);

    return screenTrack;
  }

  function stopScreenShare(peers) {
    if (!screenStream) return;

    screenStream.getTracks().forEach(t => t.stop());
    screenStream = null;

    if (!originalVideoTrack) return;

    // Restore camera track
    const current = localStream.getVideoTracks()[0];
    if (current) localStream.removeTrack(current);
    localStream.addTrack(originalVideoTrack);

    peers.forEach(peer => peer.replaceTrack('video', originalVideoTrack));

    originalVideoTrack = null;
  }

  function isScreenSharing() { return screenStream !== null; }

  function stopAll() {
    if (localStream) localStream.getTracks().forEach(t => t.stop());
    if (screenStream) screenStream.getTracks().forEach(t => t.stop());
    localStream = null;
    screenStream = null;
  }

  return { getLocalStream, getStream, toggleAudio, toggleVideo, startScreenShare, stopScreenShare, isScreenSharing, stopAll };
})();
