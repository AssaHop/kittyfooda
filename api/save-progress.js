// api/save-progress.js
// Сохраняет/читает прогресс игрока в Supabase.
// Вызывается из игры через fetch('/api/save-progress', {...})

export default async function handler(req, res) {
  // CORS — разрешаем запросы из Telegram WebView
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY;

  if (!SUPABASE_URL || !SUPABASE_SECRET_KEY) {
    return res.status(500).json({ error: 'Server misconfigured: missing Supabase env vars' });
  }

  const headers = {
    apikey: SUPABASE_SECRET_KEY,
    Authorization: `Bearer ${SUPABASE_SECRET_KEY}`,
    'Content-Type': 'application/json',
  };

  try {
    if (req.method === 'GET') {
      const telegramId = req.query.telegram_id;
      if (!telegramId) return res.status(400).json({ error: 'telegram_id required' });

      const r = await fetch(
        `${SUPABASE_URL}/rest/v1/users?telegram_id=eq.${telegramId}&select=*`,
        { headers }
      );
      const data = await r.json();
      return res.status(200).json({ user: data[0] || null });
    }

    if (req.method === 'POST') {
      const { telegram_id, username, stars_balance } = req.body;
      if (!telegram_id) return res.status(400).json({ error: 'telegram_id required' });

      const r = await fetch(`${SUPABASE_URL}/rest/v1/users`, {
        method: 'POST',
        headers: { ...headers, Prefer: 'resolution=merge-duplicates,return=representation' },
        body: JSON.stringify([{ telegram_id, username, stars_balance }]),
      });

      if (!r.ok) {
        const err = await r.text();
        return res.status(500).json({ error: 'Supabase error', details: err });
      }
      const data = await r.json();
      return res.status(200).json({ user: data[0] });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (e) {
    return res.status(500).json({ error: 'Unexpected error', details: String(e) });
  }
}
