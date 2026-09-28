import { load, save } from '../util/store.js';

// МАГАЗИН ПЕРЧАТОК: деньги за онлайн-победы, перчатки видит соперник.
// Всё хранится в этом браузере (как и рекорды).
// Добавить перчатку: запись в GLOVES + материал в render/materials.js (gloveMaterialFor).

export const WIN_REWARD = 250;

export const GLOVES = [
  {
    id: 'classic',
    name: 'Классика',
    price: 0,
    desc: 'Перчатки цвета твоего угла. С ними начинал каждый — и каждый их помнит.',
  },
  {
    id: 'violet',
    name: 'Фиолетовый шторм',
    price: 250,
    desc: 'Глубокий фиолетовый лак. Первая покупка, после которой соперник понимает: ты тут не первый день.',
  },
  {
    id: 'gold',
    name: 'Чемпион',
    price: 1000,
    desc: 'Полированное золото, как на поясе. Тяжело смотрятся, легко бьют. Надевают те, кто уже побеждал.',
  },
  {
    id: 'polka',
    name: 'Горошек',
    price: 2500,
    desc: 'Красные в белый горошек — дерзость в чистом виде. Проиграть в таких стыдно, поэтому в них не проигрывают.',
  },
  {
    id: 'legend',
    name: 'Легенда',
    code: 'BOXINGLEGENDS',
    effect: 'legend',
    desc: 'Чёрная кожа и золотая кромка. Каждый точный удар разрывается золотой ударной волной. Не продаются — только для тех, кто знает слово.',
  },
  // Перчатки разработчика: в магазине их не видно, пока код не введён (hidden).
  // Любой пропущенный удар — нокаут в раунде. Бой в них не идёт в рекорды и не приносит денег.
  // Код хранится хэшем (codeHash = hashCode('КОД')), чтобы его нельзя было прочитать в исходниках.
  {
    id: 'onehit',
    name: 'Ваншот',
    codeHash: 'c20a8190',
    hidden: true,
    effect: 'onehit',
    desc: 'Перчатки разработчика. Любой удар, который дошёл до цели, — нокаут. От уклона и нырка всё равно можно уйти. Бои в них не идут в рекорды и не приносят денег.',
  },
  // Перчатки за рейтинг (game/ranked.js): не продаются, выдаются при входе в ранг.
  // С Платины — узорная текстура и свой эффект удара (effect: 'rank').
  { id: 'r-silver', name: 'Серебряный ранг', rank: 'Серебро', desc: 'Полированное серебро. Выдаются за выход в Серебро в рейтинговых матчах.' },
  { id: 'r-gold', name: 'Золотой ранг', rank: 'Золото', desc: 'Яркое рейтинговое золото — не путать с купленным. Только за ранг Золото.' },
  { id: 'r-plat', name: 'Платиновый ранг', rank: 'Платина', effect: 'rank', desc: 'Платина в мелкие соты. Точный удар отдаётся белой ударной волной.' },
  { id: 'r-diamond', name: 'Алмазный ранг', rank: 'Алмаз', effect: 'rank', desc: 'Гранёные, переливаются на свету, как камень. Удар — голубая вспышка.' },
  { id: 'r-legend', name: 'Ранг Легенда', rank: 'Легенда', effect: 'rank', desc: 'Чёрные с живым пламенем. Каждый точный удар — огненная волна.' },
  { id: 'r-impossible', name: 'Невозможные', rank: 'Невозможный', effect: 'rank', desc: 'Кусок ночного неба: звёзды и туманности. Удар — фиолетовый взрыв. Их почти ни у кого нет.' },
];

export const gloveById = (id) => GLOVES.find((g) => g.id === id) ?? GLOVES[0];

/** Выдать перчатки (за ранг). Надевать не заставляем. */
export function grant(id) {
  const w = read();
  if (w.owned.includes(id)) return false;
  w.owned.push(id);
  save('wallet', w);
  return true;
}

// ТИТУЛЫ: надпись над ником (в меню и на плашке с HP в бою), её видит соперник.
// Вид каждого титула — классы .title--<id> в css/app.css.
export const TITLES = [
  { id: 'kms', name: 'КМС', price: 3000, desc: 'Кандидат в мастера спорта. Уже не новичок — соперник это видит.' },
  { id: 'master', name: 'Мастер спорта', price: 6000, desc: 'Звание, которое не дают просто так. Красная плашка над ником.' },
  { id: 'legend', name: 'Легенда', price: 10000, desc: 'О твоих боях рассказывают в раздевалке. Золотая надпись.' },
  { id: 'dohlyak', name: 'Дохляк', price: 1000, desc: 'Для тех, кто любит, когда его недооценивают. Смешно — пока не прилетит.' },
  { id: 'vip', name: 'VIP золотой', price: 500000, desc: 'Самый дорогой титул в игре. Переливается золотом — видно издалека.' },
];

// ТРУСЫ: видны на манекене — соперник онлайн видит их на тебе. Вид — render/materials.js (shortsMaterialFor).
export const SHORTS = [
  { id: 'classic', name: 'Классические', price: 0, desc: 'Трусы цвета твоего угла. Скромно и по делу.' },
  { id: 'thong', name: 'Смешные стринги', price: 500, desc: 'Розовые, с кружевом. Соперник смеётся — и пропускает удар.' },
  { id: 'elephant', name: 'Со слоником', price: 1200, desc: 'Серый слоник спереди, хобот вниз. Самые милые трусы на ринге.' },
  { id: 'leopard', name: 'Леопардовые', price: 1800, desc: 'Дикий принт для дикого боя. Хищник видно издалека.' },
  { id: 'iwin', name: 'I\'ll win', price: 2500, desc: 'Чёрные с надписью «I\'LL WIN» спереди. Обещание, которое надо сдержать.' },
  { id: 'supreme', name: 'Supreme красные', price: 7500, desc: 'Красные, с белой надписью. Самые дорогие трусы в игре — дороже только понты.' },
];

/** Трусы по id; неизвестные (от соперника) — классические. */
export const shortsById = (id) => SHORTS.find((s) => s.id === id) ?? SHORTS[0];

/** Купить трусы (и сразу надеть). @returns {{ok:boolean, reason?:'owned'|'money'}} */
export function buyShorts(id) {
  const w = read();
  const s = shortsById(id);
  if (w.shortsOwned.includes(s.id)) return { ok: false, reason: 'owned' };
  if (w.money < s.price) return { ok: false, reason: 'money' };
  w.money -= s.price;
  w.shortsOwned.push(s.id);
  w.shorts = s.id;
  save('wallet', w);
  return { ok: true };
}

/** Надеть купленные трусы. */
export function wearShorts(id) {
  const w = read();
  if (!w.shortsOwned.includes(id)) return false;
  w.shorts = id;
  save('wallet', w);
  return true;
}

/** Титул по id или null (неизвестные id от соперника тоже дают null). */
export const titleById = (id) => TITLES.find((t) => t.id === id) ?? null;

/** Бьёт ли надетая перчатка с одного удара. */
export const isOneHit = (id) => gloveById(id).effect === 'onehit';

/** Короткий хэш строки (FNV-1a) — для скрытых кодов. */
export function hashCode(s) {
  let h = 0x811c9dc5;
  for (const ch of s) {
    h ^= ch.codePointAt(0);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16);
}

function read() {
  const w = load('wallet', null);
  return {
    money: Number.isFinite(w?.money) ? w.money : 0,
    owned: Array.isArray(w?.owned) ? w.owned : ['classic'],
    equipped: typeof w?.equipped === 'string' ? w.equipped : 'classic',
    codes: Array.isArray(w?.codes) ? w.codes : [],
    titles: Array.isArray(w?.titles) ? w.titles : [],
    title: typeof w?.title === 'string' ? w.title : null,
    shortsOwned: Array.isArray(w?.shortsOwned) ? w.shortsOwned : ['classic'],
    shorts: typeof w?.shorts === 'string' ? w.shorts : 'classic',
  };
}

export const wallet = () => read();

export function earn(amount) {
  const w = read();
  w.money += amount;
  save('wallet', w);
  return w;
}

/** @returns {{ok:boolean, reason?:'owned'|'money'|'code'}} */
export function buy(id) {
  const w = read();
  const g = gloveById(id);
  if (w.owned.includes(id)) return { ok: false, reason: 'owned' };
  if (g.code) return { ok: false, reason: 'code' };
  if (g.rank) return { ok: false, reason: 'rank' };
  if (w.money < g.price) return { ok: false, reason: 'money' };
  w.money -= g.price;
  w.owned.push(id);
  w.equipped = id;
  save('wallet', w);
  return { ok: true };
}

/** Промокоды на деньги (срабатывают один раз): КОД: сумма. Коды на перчатки — поле `code` в GLOVES. */
const MONEY_CODES = { MILLIONARE: 1_000_000 };

/** Промокоды на набор перчаток: КОД → какие перчатки выдать. RANKED — все перчатки за рейтинг. */
const PACK_CODES = { RANKED: () => GLOVES.filter((g) => g.rank).map((g) => g.id) };

/**
 * Promo codes: some unlock gloves that aren't for sale, some pay money.
 * @returns {null | {money:number, used?:boolean} | object} glove, money result, or null
 */
export function redeem(code) {
  const c = String(code).trim().toUpperCase();
  if (PACK_CODES[c]) {
    const ids = PACK_CODES[c]();
    const w = read();
    const fresh = ids.filter((id) => !w.owned.includes(id));
    w.owned.push(...fresh);
    save('wallet', w);
    return { pack: ids, fresh: fresh.length };
  }
  if (MONEY_CODES[c]) {
    const w = read();
    w.codes = Array.isArray(w.codes) ? w.codes : [];
    if (w.codes.includes(c)) return { money: 0, used: true };
    w.codes.push(c);
    w.money += MONEY_CODES[c];
    save('wallet', w);
    return { money: MONEY_CODES[c] };
  }
  const g = GLOVES.find((x) => (x.code && x.code === c) || (x.codeHash && x.codeHash === hashCode(c)));
  if (!g) return null;
  const w = read();
  if (!w.owned.includes(g.id)) w.owned.push(g.id);
  w.equipped = g.id;
  save('wallet', w);
  return g;
}

export function equip(id) {
  const w = read();
  if (!w.owned.includes(id)) return false;
  w.equipped = id;
  save('wallet', w);
  return true;
}

/** Купить титул (и сразу надеть). @returns {{ok:boolean, reason?:'owned'|'money'}} */
export function buyTitle(id) {
  const w = read();
  const t = titleById(id);
  if (!t) return { ok: false, reason: 'owned' };
  if (w.titles.includes(id)) return { ok: false, reason: 'owned' };
  if (w.money < t.price) return { ok: false, reason: 'money' };
  w.money -= t.price;
  w.titles.push(id);
  w.title = id;
  save('wallet', w);
  return { ok: true };
}

/** Надеть купленный титул или снять (id = null). */
export function wearTitle(id) {
  const w = read();
  if (id !== null && !w.titles.includes(id)) return false;
  w.title = id;
  save('wallet', w);
  return true;
}
