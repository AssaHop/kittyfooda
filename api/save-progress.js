// api/save-progress.js
// Сохраняет/читает прогресс игрока + полное состояние текущей партии.
// telegram_id берётся ТОЛЬКО из подписанного Telegram initData, из тела запроса — никогда.

import { verifyInitData, extractInitData, applyCors } from './_verify.js';

export default async function handler(req, res) {
  applyCors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY;
  const BOT_TOKEN = process.env.BOT_TOKEN;
  if (!SUPABASE_URL || !SUPABASE_SECRET_KEY) {
    return res.status(500).json({ error: 'Server misconfigured: missing Supabase env vars' });
  }

  // ── Аутентификация ──────────────────────────────────────────────
  const auth = verifyInitData(extractInitData(req), BOT_TOKEN);
  if (!auth.ok) return res.status(401).json({ error: 'Unauthorized', reason: auth.error });

  const telegramId = auth.telegramId;
  const username = auth.user.username || auth.user.first_name || '';

  const headers = {
    apikey: SUPABASE_SECRET_KEY,
    Authorization: `Bearer ${SUPABASE_SECRET_KEY}`,
    'Content-Type': 'application/json',
  };

  try {
    if (req.method === 'GET') {
      const r = await fetch(
        `${SUPABASE_URL}/rest/v1/users?telegram_id=eq.${telegramId}&select=*`,
        { headers }
      );
      const data = await r.json();
      return res.status(200).json({ user: data[0] || null });
    }

    if (req.method === 'POST') {
      const { result, game_state } = req.body || {};

      // username берём из подписанных данных, а не из тела
      let patch = { telegram_id: telegramId, username };

      // Автосохранение состояния партии (может прийти без result — просто снапшот хода)
      if (game_state !== undefined) {
        patch.game_state = game_state; // null явно чистит сохранение
      }

      // Итог матча — обновляем накопительную статистику и чистим game_state
      if (result === 'win' || result === 'lose' || result === 'draw') {
        const cur = await fetch(
          `${SUPABASE_URL}/rest/v1/users?telegram_id=eq.${telegramId}&select=wins,losses,draws`,
          { headers }
        );
        const curData = await cur.json();
        const row = curData[0] || { wins: 0, losses: 0, draws: 0 };
        patch.wins = (row.wins || 0) + (result === 'win' ? 1 : 0);
        patch.losses = (row.losses || 0) + (result === 'lose' ? 1 : 0);
        patch.draws = (row.draws || 0) + (result === 'draw' ? 1 : 0);
        patch.game_state = null;
      }

      const r = await fetch(`${SUPABASE_URL}/rest/v1/users?on_conflict=telegram_id`, {
        method: 'POST',
        headers: { ...headers, Prefer: 'resolution=merge-duplicates,return=representation' },
        body: JSON.stringify([patch]),
      });

      if (!r.ok) {
        const err = await r.text();
        console.error('Supabase error', err);
        return res.status(500).json({ error: 'Supabase error' });
      }
      const data = await r.json();
      return res.status(200).json({ user: data[0] });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (e) {
    console.error('save-progress error', e);
    return res.status(500).json({ error: 'Unexpected error' });
  }
}
