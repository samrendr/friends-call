// Wraps one RTCPeerConnection per remote participant
class Peer {
  constructor({ socketId, displayName, localStream, onRemoteStream, onIceCandidate, onNegotiationNeeded }) {
    this.socketId = socketId;
    this.displayName = displayName;
    this._onRemoteStream = onRemoteStream;
    this._onIceCandidate = onIceCandidate;
    this._onNegotiationNeeded = onNegotiationNeeded;

    this.pc = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
      ]
    });

    this._setupEvents();

    // Add local tracks
    if (localStream) {
      localStream.getTracks().forEach(track => this.pc.addTrack(track, localStream));
    }
  }

  _setupEvents() {
    this.pc.onicecandidate = (e) => {
      if (e.candidate) this._onIceCandidate(this.socketId, e.candidate);
    };

    this.pc.ontrack = (e) => {
      this._onRemoteStream(this.socketId, e.streams[0]);
    };

    this.pc.onnegotiationneeded = async () => {
      try {
        const offer = await this.pc.createOffer();
        await this.pc.setLocalDescription(offer);
        this._onNegotiationNeeded(this.socketId, this.pc.localDescription);
      } catch (err) {
        console.error('negotiationneeded error', err);
      }
    };

    this.pc.oniceconnectionstatechange = () => {
      console.log(`[Peer ${this.socketId}] ICE: ${this.pc.iceConnectionState}`);
    };
  }

  async createOffer() {
    const offer = await this.pc.createOffer();
    await this.pc.setLocalDescription(offer);
    return this.pc.localDescription;
  }

  async handleOffer(sdp) {
    await this.pc.setRemoteDescription(new RTCSessionDescription(sdp));
    const answer = await this.pc.createAnswer();
    await this.pc.setLocalDescription(answer);
    return this.pc.localDescription;
  }

  async handleAnswer(sdp) {
    await this.pc.setRemoteDescription(new RTCSessionDescription(sdp));
  }

  async addIceCandidate(candidate) {
    try {
      await this.pc.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (err) {
      console.warn('Failed to add ICE candidate', err);
    }
  }

  replaceTrack(kind, newTrack) {
    const sender = this.pc.getSenders().find(s => s.track && s.track.kind === kind);
    if (sender) sender.replaceTrack(newTrack);
  }

  close() {
    this.pc.close();
  }
}
