// api/_catalog.js
// Каталог товаров — единственный источник правды по ценам.
// Используется при создании счёта и при проверке оплаты в вебхуке.

export const CATALOG = {
  hint: { stars: 15, hints: 1, title: 'Подсказка', description: 'Показывает лучший ход в текущей ситуации' },
};

/** payload счёта: "<item>:<telegram_id>" → { item, telegramId } или null */
export function parsePayload(payload) {
  const m = /^([a-z_]+):(\d+)$/.exec(String(payload || ''));
  if (!m || !CATALOG[m[1]]) return null;
  return { item: m[1], telegramId: Number(m[2]) };
}
