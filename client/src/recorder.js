// Recorder: captures all video tiles + mixed audio via MediaRecorder
const Recorder = (() => {
  let _recorder = null;
  let _chunks = [];
  let _canvas = null;
  let _ctx = null;
  let _audioCtx = null;
  let _dest = null;
  let _active = false;
  let _animFrame = null;

  function _getSupportedMime() {
    const types = [
      'video/webm;codecs=vp9,opus',
      'video/webm;codecs=vp8,opus',
      'video/webm',
      'video/mp4'
    ];
    return types.find(t => MediaRecorder.isTypeSupported(t)) || '';
  }

  function _drawFrame() {
    if (!_active) return;
    const videos = [...document.querySelectorAll('.video-tile video')];
    const count = videos.length;

    _ctx.fillStyle = '#0f1117';
    _ctx.fillRect(0, 0, _canvas.width, _canvas.height);

    if (count > 0) {
      const cols = count <= 1 ? 1 : count <= 4 ? 2 : 3;
      const rows = Math.ceil(count / cols);
      const tw = Math.floor(_canvas.width / cols);
      const th = Math.floor(_canvas.height / rows);

      videos.forEach((v, i) => {
        const col = i % cols;
        const row = Math.floor(i / cols);
        try { _ctx.drawImage(v, col * tw, row * th, tw, th); } catch (_) {}
      });
    }

    _animFrame = requestAnimationFrame(_drawFrame);
  }

  function _connectStream(stream) {
    if (!stream || !_audioCtx || !_dest) return;
    const audioTracks = stream.getAudioTracks();
    if (audioTracks.length === 0) return;
    try {
      const src = _audioCtx.createMediaStreamSource(stream);
      src.connect(_dest);
    } catch (_) {}
  }

  function start(localStream, peerStreams) {
    if (_active) return false;
    if (!window.MediaRecorder) return false;

    _active = true;
    _chunks = [];

    _canvas = document.createElement('canvas');
    _canvas.width = 1280;
    _canvas.height = 720;
    _ctx = _canvas.getContext('2d');

    _audioCtx = new AudioContext();
    _dest = _audioCtx.createMediaStreamDestination();

    _connectStream(localStream);
    peerStreams.forEach(s => _connectStream(s));

    const canvasStream = _canvas.captureStream(25);
    _dest.stream.getAudioTracks().forEach(t => canvasStream.addTrack(t));

    const mime = _getSupportedMime();
    _recorder = new MediaRecorder(canvasStream, mime ? { mimeType: mime } : {});
    _recorder.ondataavailable = (e) => { if (e.data && e.data.size > 0) _chunks.push(e.data); };
    _recorder.onstop = _save;
    _recorder.start(1000);

    _drawFrame();
    return true;
  }

  function stop() {
    if (!_active) return;
    _active = false;
    cancelAnimationFrame(_animFrame);
    if (_recorder && _recorder.state !== 'inactive') _recorder.stop();
    if (_audioCtx) { _audioCtx.close(); _audioCtx = null; }
    _dest = null;
  }

  function addPeerStream(stream) {
    if (_active) _connectStream(stream);
  }

  function isRecording() { return _active; }

  function _save() {
    if (_chunks.length === 0) return;
    const mime = _getSupportedMime();
    const ext = mime.includes('mp4') ? 'mp4' : 'webm';
    const blob = new Blob(_chunks, { type: mime || 'video/webm' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const ts = new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-');
    a.download = `friendscall-${ts}.${ext}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    _chunks = [];
  }

  return { start, stop, isRecording, addPeerStream };
})();
