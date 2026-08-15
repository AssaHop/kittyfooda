// api/create-invoice.js
// Создаёт ссылку на оплату через Telegram Stars.
// Вызывается из игры: POST { telegram_id, item, amount_stars }

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const BOT_TOKEN = process.env.BOT_TOKEN;
  if (!BOT_TOKEN) return res.status(500).json({ error: 'Server misconfigured: missing BOT_TOKEN' });

  const { item, amount_stars, title, description } = req.body || {};
  if (!item || !amount_stars) {
    return res.status(400).json({ error: 'item and amount_stars are required' });
  }

  try {
    const r = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/createInvoiceLink`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: title || 'Покупка в KittyFooda',
        description: description || item,
        payload: item, // это вернётся нам в webhook, чтобы знать что купили
        currency: 'XTR', // Telegram Stars
        prices: [{ label: title || item, amount: amount_stars }], // для XTR amount = кол-во звёзд
      }),
    });

    const data = await r.json();
    if (!data.ok) {
      return res.status(500).json({ error: 'Telegram API error', details: data });
    }
    return res.status(200).json({ invoice_link: data.result });
  } catch (e) {
    return res.status(500).json({ error: 'Unexpected error', details: String(e) });
  }
}
