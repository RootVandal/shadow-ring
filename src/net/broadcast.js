import { peerLib, openPeer, connect, Wire, NetError } from './peer.js';
import { CONFIG } from '../config.js';

// ТРАНСЛЯЦИИ ОНЛАЙН-БОЁВ ДЛЯ ЗРИТЕЛЕЙ.
// Хост боя открывает на сигнальном сервере ещё один адрес — «эфир» live-N — и
// рассылает всем подключившимся зрителям:
//   info  имена и перчатки бойцов (сразу при подключении)
//   tv    позы обоих, HP, фаза, раунд, счёт — CONFIG.spectate.tvHz раз в секунду
//   hit   кто кого ударил (вспышка, звук, цифра урона)
//   end   итог боя
// Красный угол — хост, синий — гость. Камеры зрителям не передаются, только скелет.
// Зритель сам ничего в бой не отправляет — он не может на него повлиять.

const liveId = (i) => `${CONFIG.net.prefix}live-${i}`;

/** Сторона хоста: эфир одного боя. */
export class Broadcast {
  /** Занимает первый свободный эфир. */
  static async open(info) {
    const Peer = await peerLib();
    for (let i = 0; i < CONFIG.spectate.slots; i++) {
      try {
        return new Broadcast(await openPeer(Peer, liveId(i)), info);
      } catch (e) {
        if (e.code !== 'taken') throw e;
      }
    }
    throw new NetError('full');
  }

  constructor(peer, info) {
    this.peer = peer;
    this.info = info;
    this.viewers = new Set();
    this.closed = false;
    peer.on('error', () => {}); // ошибки эфира не должны мешать бою
    peer.on('disconnected', () => {
      if (this.closed) return;
      try {
        peer.reconnect(); // чтобы новые зрители могли найти бой
      } catch {
        /* эфир просто перестанет принимать новых зрителей */
      }
    });
    peer.on('connection', (conn) => {
      const wire = new Wire(conn);
      const hello = () => {
        if (this.viewers.size >= CONFIG.spectate.maxViewers) wire.close();
        else {
          this.viewers.add(wire);
          wire.send('info', this.info);
        }
      };
      if (wire.open) hello();
      else wire.on('open', hello);
      wire.on('close', () => this.viewers.delete(wire));
    });
  }

  get watching() {
    return this.viewers.size;
  }

  send(t, payload) {
    for (const w of this.viewers) w.send(t, payload);
  }

  close() {
    if (this.closed) return;
    this.closed = true;
    for (const w of this.viewers) w.close();
    this.viewers.clear();
    setTimeout(() => this.peer.destroy(), 400);
  }
}

/**
 * Сторона зрителя: стучится во все эфиры сразу; про каждый найденный бой
 * вызывает onFound({slot, wire, info}). Вернёт функцию, которая всё закрывает.
 */
export async function findBroadcasts(onFound) {
  const Peer = await peerLib();
  const peer = await openPeer(Peer);
  peer.on('error', () => {});
  const wires = [];
  let stopped = false;
  const tries = [...Array(CONFIG.spectate.slots).keys()].map(async (slot) => {
    try {
      const wire = await connect(peer, liveId(slot));
      if (stopped) return wire.close();
      wires.push(wire);
      const off = wire.on('info', (info) => {
        off();
        if (!stopped) onFound({ slot, wire, info });
      });
    } catch {
      /* в этом эфире никого */
    }
  });
  return {
    done: Promise.all(tries),
    /** Закрывает всё, кроме keep (выбранного боя). */
    stop(keep = null) {
      stopped = true;
      for (const w of wires) if (w !== keep) w.close();
      if (!keep) setTimeout(() => peer.destroy(), 300);
    },
    peer,
  };
}
