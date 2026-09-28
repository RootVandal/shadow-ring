import { h } from '../util/dom.js';
import { titleById } from '../game/shop.js';

/** Надпись-титул над ником (стили — .title-tag и .title--<id> в css/app.css). Нет титула — null. */
export function titleTag(id) {
  const t = titleById(id);
  return t ? h(`span.title-tag.title--${t.id}`, t.name) : null;
}
