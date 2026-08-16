// api/save-progress.js
// Сохраняет/читает прогресс игрока + полное состояние текущей партии.

export default async function handler(req, res) {
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
      const { telegram_id, username, result, game_state } = req.body;
      if (!telegram_id) return res.status(400).json({ error: 'telegram_id required' });

      let patch = { telegram_id, username };

      // Автосохранение состояния партии (может прийти без result — просто снапшот хода)
      if (game_state !== undefined) {
        patch.game_state = game_state; // null явно чистит сохранение (партия завершена/начата заново)
      }

      // Итог матча — обновляем накопительную статистику и чистим game_state
      if (result === 'win' || result === 'lose' || result === 'draw') {
        const cur = await fetch(
          `${SUPABASE_URL}/rest/v1/users?telegram_id=eq.${telegram_id}&select=wins,losses,draws`,
          { headers }
        );
        const curData = await cur.json();
        const row = curData[0] || { wins: 0, losses: 0, draws: 0 };
        patch.wins = (row.wins || 0) + (result === 'win' ? 1 : 0);
        patch.losses = (row.losses || 0) + (result === 'lose' ? 1 : 0);
        patch.draws = (row.draws || 0) + (result === 'draw' ? 1 : 0);
        patch.game_state = null;
      }

      const r = await fetch(`${SUPABASE_URL}/rest/v1/users`, {
        method: 'POST',
        headers: { ...headers, Prefer: 'resolution=merge-duplicates,return=representation' },
        body: JSON.stringify([patch]),
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
