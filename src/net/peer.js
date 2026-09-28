import { Emitter } from '../util/emitter.js';
import { loadScript } from '../util/dom.js';
import { CONFIG } from '../config.js';

// Peer-to-peer over WebRTC with PeerJS: its public signaling server introduces
// the two browsers, then everything flows directly between them (PeerJS also
// ships TURN relays for networks where a direct path is impossible). No game
// server of our own — the site stays a static folder.

// 2: online fights are three rounds, a KO ends only the round
// 3: hit zones (atk.zone), the dodge window
export const PROTOCOL = 3;
/** What the other side sees of us besides the skeleton (shop gloves). */
export const profile = { glove: 'classic', title: null, rank: null, shorts: 'classic' };
const ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';

export class NetError extends Error {
  /** @param {'lib'|'server'|'timeout'|'taken'|'nobody'|'busy'|'version'|'full'|'aborted'|'peer'} code */
  constructor(code, cause) {
    super(code);
    this.code = code;
    this.cause = cause;
  }
}

let PeerCtor = null;
async function peerLib() {
  if (!PeerCtor) {
    await loadScript(new URL('../../vendor/peerjs/peerjs.min.js', import.meta.url).href).catch((e) => {
      throw new NetError('lib', e);
    });
    PeerCtor = window.peerjs?.Peer ?? window.Peer;
    if (!PeerCtor) throw new NetError('lib');
  }
  return PeerCtor;
}

export const randomCode = (n = 5) => Array.from({ length: n }, () => ALPHABET[Math.floor(Math.random() * ALPHABET.length)]).join('');
export const roomLink = (code) => `${location.origin}${location.pathname}#room=${code}`;
const roomId = (code) => `${CONFIG.net.prefix}room-${code}`;
// pool 'quick' — обычный поиск, 'ranked' — рейтинговый: игроки ищут только внутри своего пула.
const slotId = (i, pool = 'quick') => `${CONFIG.net.prefix}${pool}-${i}`;

function openPeer(Peer, id = null) {
  return new Promise((resolve, reject) => {
    const peer = id ? new Peer(id, { debug: 0 }) : new Peer({ debug: 0 });
    const cleanup = () => {
      clearTimeout(timer);
      peer.off('open', onOpen);
      peer.off('error', onError);
    };
    const onOpen = () => {
      cleanup();
      resolve(peer);
    };
    const onError = (e) => {
      cleanup();
      peer.destroy();
      const code = e?.type === 'unavailable-id' ? 'taken' : ['network', 'server-error', 'socket-error', 'socket-closed'].includes(e?.type) ? 'server' : 'peer';
      reject(new NetError(code, e));
    };
    const timer = setTimeout(() => {
      cleanup();
      peer.destroy();
      reject(new NetError('server'));
    }, CONFIG.net.connectTimeoutMs);
    peer.on('open', onOpen);
    peer.on('error', onError);
  });
}

/** A data connection speaking small JSON messages {t: type, ...}, with ping and liveness. */
export class Wire extends Emitter {
  constructor(conn, peer = null) {
    super();
    this.conn = conn;
    this.peer = peer;
    this.open = conn.open;
    this.rtt = null;
    this.lastSeen = performance.now();
    this.ended = false;
    this.early = []; // video signaling that came before anyone listened (see net/video.js)
    this.earlyOpen = true;
    conn.on('open', () => {
      this.open = true;
      this.lastSeen = performance.now();
      this.emit('open');
    });
    conn.on('data', (m) => {
      if (!m || typeof m !== 'object' || typeof m.t !== 'string') return;
      this.lastSeen = performance.now();
      if (m.t === 'ping') this.send('pong', { at: m.at });
      else if (m.t === 'pong') {
        const rtt = performance.now() - m.at;
        this.rtt = this.rtt == null ? rtt : this.rtt * 0.7 + rtt * 0.3;
      } else if (this.earlyOpen && (m.t === 'sdp' || m.t === 'ice')) this.early.push(m);
      else this.emit(m.t, m);
    });
    conn.on('close', () => this.#end());
    conn.on('error', () => this.#end());
    this.timer = setInterval(() => {
      if (!this.open) return;
      this.send('ping', { at: performance.now() });
      if (performance.now() - this.lastSeen > 9000) this.#end(); // the other side vanished silently
    }, CONFIG.net.pingMs);
  }

  /** Hands over the buffered video signaling; from now on it's emitted as usual. */
  takeEarly() {
    this.earlyOpen = false;
    return this.early.splice(0);
  }

  send(t, payload = {}) {
    if (!this.open) return;
    try {
      this.conn.send({ t, ...payload });
    } catch {
      /* the channel is closing; 'close' will follow */
    }
  }

  #end() {
    if (this.ended) return;
    this.ended = true;
    this.open = false;
    clearInterval(this.timer);
    this.emit('close');
    this.peer?.destroy();
  }

  close() {
    this.send('bye');
    setTimeout(() => {
      try {
        this.conn.close();
      } catch {
        /* already gone */
      }
      this.#end();
    }, 80);
  }
}

function waitFor(wire, type, ms) {
  return new Promise((resolve, reject) => {
    const off = wire.on(type, (m) => {
      clearTimeout(timer);
      offClose();
      off();
      resolve(m);
    });
    const offClose = wire.on('close', () => {
      clearTimeout(timer);
      off();
      reject(new NetError('peer'));
    });
    const timer = setTimeout(() => {
      off();
      offClose();
      reject(new NetError('timeout'));
    }, ms);
  });
}

/** Opens `conn` or explains why not (nobody there / timeout). */
function connect(peer, targetId) {
  return new Promise((resolve, reject) => {
    const conn = peer.connect(targetId, { reliable: true, serialization: 'json' });
    const wire = new Wire(conn);
    const onError = (e) => {
      if (e?.type === 'peer-unavailable' && String(e.message ?? '').includes(targetId)) fail(new NetError('nobody', e));
    };
    const fail = (err) => {
      clearTimeout(timer);
      peer.off('error', onError);
      wire.close();
      reject(err);
    };
    const done = () => {
      clearTimeout(timer);
      peer.off('error', onError);
      resolve(wire);
    };
    const timer = setTimeout(() => fail(new NetError('timeout')), CONFIG.net.connectTimeoutMs);
    peer.on('error', onError);
    if (conn.open) done();
    else wire.on('open', done);
  });
}

/** Joiner side of the handshake: say hello, expect hello (or busy) back. */
async function greet(wire, name) {
  wire.send('hello', { v: PROTOCOL, name, glove: profile.glove, title: profile.title, rank: profile.rank, shorts: profile.shorts });
  const reply = await Promise.race([waitFor(wire, 'hello', 6000), waitFor(wire, 'busy', 6000).then(() => Promise.reject(new NetError('busy')))]);
  if (reply.v !== PROTOCOL) throw new NetError('version');
  return reply;
}

/**
 * Host side: accept the first peer that says hello, turn everyone else away.
 * `isTaken()` lets a quick-match host refuse once it found a match elsewhere.
 */
function acceptOne(peer, name, isTaken = () => false) {
  return new Promise((resolve) => {
    let paired = false;
    peer.on('connection', (conn) => {
      const wire = new Wire(conn);
      const off = wire.on('hello', (m) => {
        off();
        if (paired || isTaken() || m.v !== PROTOCOL) {
          wire.send('busy');
          setTimeout(() => wire.close(), 150);
          return;
        }
        paired = true;
        wire.send('hello', { v: PROTOCOL, name, glove: profile.glove, title: profile.title, rank: profile.rank, shorts: profile.shorts });
        resolve({ wire, hello: m });
      });
    });
  });
}

/** Private room: a short code (and a link / QR) for a friend. */
export async function hostRoom({ name }) {
  const Peer = await peerLib();
  let code = randomCode();
  let peer = null;
  for (let attempt = 0; attempt < 4 && !peer; attempt++) {
    try {
      peer = await openPeer(Peer, roomId(code));
    } catch (e) {
      if (e.code !== 'taken') throw e;
      code = randomCode();
    }
  }
  if (!peer) throw new NetError('taken');
  const guest = acceptOne(peer, name).then((r) => {
    r.wire.peer = peer;
    peer.disconnect(); // frees the room id on the signaling server; our connection stays
    return { ...r, role: 'host' };
  });
  return { code, link: roomLink(code), guest, cancel: () => peer.destroy() };
}

export async function joinRoom(code, { name }) {
  const Peer = await peerLib();
  const peer = await openPeer(Peer);
  try {
    const wire = await connect(peer, roomId(code));
    const hello = await greet(wire, name);
    wire.peer = peer;
    peer.disconnect();
    return { wire, hello, role: 'guest' };
  } catch (e) {
    peer.destroy();
    throw e;
  }
}

async function tryJoin(peer, id, name) {
  let wire = null;
  try {
    wire = await connect(peer, id);
    const hello = await greet(wire, name);
    return { wire, hello };
  } catch {
    wire?.close();
    return null;
  }
}

const shuffle = (a) => a.map((v) => [Math.random(), v]).sort((x, y) => x[0] - y[0]).map((x) => x[1]);

/**
 * Random opponent without a lobby server: a handful of well-known "slot" ids on
 * the signaling server. First we knock on every occupied slot; if nobody's
 * waiting, we take a free slot and wait — while periodically knocking on the
 * slots below ours, so two people who arrived at once still find each other.
 * Only higher slots knock on lower ones, so two waiters never cross-connect.
 */
export async function quickMatch({ name, onStatus = () => {}, signal, pool = 'quick' }) {
  const Peer = await peerLib();
  const me = await openPeer(Peer);
  const slots = [...Array(CONFIG.net.quickSlots).keys()];
  const aborted = () => signal?.aborted;
  const finish = (r, role) => {
    r.wire.peer = me;
    me.disconnect();
    return { ...r, role };
  };
  try {
    onStatus('search');
    for (const i of shuffle(slots)) {
      if (aborted()) throw new NetError('aborted');
      const r = await tryJoin(me, slotId(i, pool), name);
      if (r) return finish(r, 'guest');
    }
    for (const i of slots) {
      if (aborted()) throw new NetError('aborted');
      let host;
      try {
        host = await openPeer(Peer, slotId(i, pool));
      } catch (e) {
        if (e.code === 'taken') continue;
        throw e;
      }
      onStatus('waiting', i);
      let settled = false;
      const accepted = acceptOne(host, name, () => settled);
      const found = (async () => {
        while (!settled && !aborted()) {
          await new Promise((res) => setTimeout(res, CONFIG.net.rescanMs));
          for (let j = 0; j < i && !settled; j++) {
            const r = await tryJoin(me, slotId(j, pool), name);
            if (r) return r;
          }
        }
        return null;
      })();
      const stop = new Promise((res) => signal?.addEventListener('abort', () => res(null), { once: true }));
      const winner = await Promise.race([accepted.then((r) => ({ r, role: 'host' })), found.then((r) => r && { r, role: 'guest' }), stop]);
      settled = true;
      if (!winner) {
        host.destroy();
        throw new NetError('aborted');
      }
      if (winner.role === 'host') {
        winner.r.wire.peer = host;
        host.disconnect();
        me.destroy();
        return { ...winner.r, role: 'host' };
      }
      host.destroy();
      return finish(winner.r, 'guest');
    }
    throw new NetError('full');
  } catch (e) {
    me.destroy();
    throw e;
  }
}
