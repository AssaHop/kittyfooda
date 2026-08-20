// api/create-invoice.js
// Создаёт ссылку на оплату через Telegram Stars.
// Цены заданы на сервере — клиент не может назначить свою.

import { verifyInitData, extractInitData, applyCors } from './_verify.js';

// Каталог: единственный источник правды по ценам
const CATALOG = {
  hint: { stars: 15, title: 'Подсказка', description: 'Показывает лучший ход в текущей ситуации' },
};

export default async function handler(req, res) {
  applyCors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const BOT_TOKEN = process.env.BOT_TOKEN;
  if (!BOT_TOKEN) return res.status(500).json({ error: 'Server misconfigured: missing BOT_TOKEN' });

  const auth = verifyInitData(extractInitData(req), BOT_TOKEN);
  if (!auth.ok) return res.status(401).json({ error: 'Unauthorized', reason: auth.error });

  const { item } = req.body || {};
  const product = CATALOG[item];
  if (!product) return res.status(400).json({ error: 'Unknown item' });

  try {
    const r = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/createInvoiceLink`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: product.title,
        description: product.description,
        // Payload вернётся в webhook. Кладём и id покупателя — для сверки с msg.from.id.
        payload: `${item}:${auth.telegramId}`,
        currency: 'XTR', // Telegram Stars
        prices: [{ label: product.title, amount: product.stars }],
      }),
    });

    const data = await r.json();
    if (!data.ok) {
      console.error('Telegram API error', data);
      return res.status(500).json({ error: 'Telegram API error' });
    }
    return res.status(200).json({ invoice_link: data.result });
  } catch (e) {
    console.error('create-invoice error', e);
    return res.status(500).json({ error: 'Unexpected error' });
  }
}
