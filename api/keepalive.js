// api/keepalive.js
// Ежедневный лёгкий запрос к базе (Vercel Cron, см. vercel.json).
// Бесплатный Supabase усыпляет проект после недели без запросов, а спящая
// база молча теряет сохранения и статистику.

export default async function handler(req, res) {
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY;
  if (!SUPABASE_URL || !SUPABASE_SECRET_KEY) return res.status(500).json({ ok: false });
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/users?select=id&limit=1`, {
      headers: { apikey: SUPABASE_SECRET_KEY, Authorization: `Bearer ${SUPABASE_SECRET_KEY}` },
    });
    return res.status(r.ok ? 200 : 502).json({ ok: r.ok });
  } catch (e) {
    console.error('keepalive error', e);
    return res.status(502).json({ ok: false });
  }
}
