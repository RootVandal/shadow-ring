import { Emitter } from '../util/emitter.js';

// The opponent's webcam, on the same WebRTC connection the game data already
// uses. After pairing we leave the signaling server (peer.disconnect()), so
// PeerJS can't place a media call any more — instead we add the camera track to
// the existing RTCPeerConnection and renegotiate over our own data channel,
// using the "perfect negotiation" pattern: both sides may add a track at once,
// the polite side (the guest) yields when offers collide.
//
// Wire messages:  sdp  {d: {type, sdp}}      ice  {c: RTCIceCandidateInit}

const MAX_BITRATE = 450_000; // bps — a small tile, not a video call

export class VideoLink extends Emitter {
  /**
   * @param {object} o
   * @param {import('./peer.js').Wire} o.wire
   * @param {boolean} o.polite
   * @param {MediaStream|null} o.stream  my camera, or null to only watch
   */
  constructor({ wire, polite, stream }) {
    super();
    this.wire = wire;
    this.polite = polite;
    this.stream = null;
    this.makingOffer = false;
    this.ignoreOffer = false;
    this.pc = wire.conn?.peerConnection ?? null;
    if (!this.pc) return;
    const pc = this.pc;

    pc.addEventListener('track', (e) => {
      if (e.track.kind !== 'video') return;
      this.stream = e.streams[0] ?? new MediaStream([e.track]);
      e.track.addEventListener('ended', () => this.#lost());
      e.track.addEventListener('mute', () => this.emit('video', null));
      e.track.addEventListener('unmute', () => this.emit('video', this.stream));
      this.emit('video', this.stream);
    });
    pc.addEventListener('icecandidate', (e) => {
      if (e.candidate) this.wire.send('ice', { c: e.candidate.toJSON() });
    });
    pc.addEventListener('negotiationneeded', () => this.#offer());
    // Encodings only exist once the track is negotiated.
    pc.addEventListener('signalingstatechange', () => {
      if (pc.signalingState === 'stable' && this.sender && !this.limited) this.#limitBitrate();
    });
    wire.on('sdp', (m) => this.#onSdp(m.d));
    wire.on('ice', (m) => this.#onIce(m.c));
    for (const m of wire.takeEarly?.() ?? []) wire.emit(m.t, m);

    const track = stream?.getVideoTracks()[0];
    if (track) this.sender = pc.addTrack(track, stream);
  }

  async #offer() {
    try {
      this.makingOffer = true;
      await this.pc.setLocalDescription();
      this.#sendSdp();
    } catch (e) {
      console.warn('video offer failed', e);
    } finally {
      this.makingOffer = false;
    }
  }

  #sendSdp() {
    const d = this.pc.localDescription;
    if (d) this.wire.send('sdp', { d: { type: d.type, sdp: d.sdp } });
  }

  async #onSdp(d) {
    if (!this.pc || !d || (d.type !== 'offer' && d.type !== 'answer') || typeof d.sdp !== 'string') return;
    try {
      const collision = d.type === 'offer' && (this.makingOffer || this.pc.signalingState !== 'stable');
      this.ignoreOffer = !this.polite && collision;
      if (this.ignoreOffer) return;
      await this.pc.setRemoteDescription(d);
      if (d.type === 'offer') {
        await this.pc.setLocalDescription();
        this.#sendSdp();
      }
    } catch (e) {
      console.warn('video negotiation failed', e);
    }
  }

  async #onIce(c) {
    if (!this.pc || !c || typeof c !== 'object') return;
    try {
      await this.pc.addIceCandidate(c);
    } catch (e) {
      if (!this.ignoreOffer) console.warn('video ICE candidate rejected', e);
    }
  }

  async #limitBitrate() {
    try {
      const p = this.sender.getParameters();
      if (!p.encodings?.length) return;
      this.limited = true;
      p.encodings[0].maxBitrate = MAX_BITRATE;
      await this.sender.setParameters(p);
    } catch {
      /* not supported here — the browser's default is fine too */
    }
  }

  #lost() {
    this.stream = null;
    this.emit('video', null);
  }
}
