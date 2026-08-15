// api/telegram-webhook.js
// Принимает обновления от Telegram Bot API (в т.ч. успешные платежи).
// Telegram сам будет слать сюда POST-запросы после настройки webhook.

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(200).json({ ok: true });

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY;
  const BOT_TOKEN = process.env.BOT_TOKEN;

  const update = req.body;

  try {
    // ── 1. Telegram спрашивает разрешения перед оплатой — обязаны ответить ОК ──
    if (update.pre_checkout_query) {
      await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/answerPreCheckoutQuery`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pre_checkout_query_id: update.pre_checkout_query.id,
          ok: true,
        }),
      });
      return res.status(200).json({ ok: true });
    }

    // ── 2. Успешная оплата — начисляем покупку ──
    const msg = update.message;
    if (msg && msg.successful_payment) {
      const sp = msg.successful_payment;
      const telegramId = msg.from.id;
      const item = sp.invoice_payload;
      const amount = sp.total_amount; // в Stars
      const chargeId = sp.telegram_payment_charge_id;

      const headers = {
        apikey: SUPABASE_SECRET_KEY,
        Authorization: `Bearer ${SUPABASE_SECRET_KEY}`,
        'Content-Type': 'application/json',
      };

      // Идемпотентная запись — payment_charge_id уникален,
      // повторный webhook с тем же ID просто не создаст дубль
      const insertRes = await fetch(`${SUPABASE_URL}/rest/v1/payments`, {
        method: 'POST',
        headers: { ...headers, Prefer: 'return=representation' },
        body: JSON.stringify([{
          telegram_id: telegramId,
          payment_charge_id: chargeId,
          item,
          amount,
        }]),
      });

      // Если запись создалась успешно (не дубль) — начисляем бустер игроку
      if (insertRes.status === 201) {
        // Получаем текущий баланс
        const userRes = await fetch(
          `${SUPABASE_URL}/rest/v1/users?telegram_id=eq.${telegramId}&select=stars_balance`,
          { headers }
        );
        const userData = await userRes.json();
        const currentBalance = userData[0]?.stars_balance || 0;

        await fetch(`${SUPABASE_URL}/rest/v1/users?telegram_id=eq.${telegramId}`, {
          method: 'PATCH',
          headers,
          body: JSON.stringify({ stars_balance: currentBalance + amount }),
        });
      }
      // Если 409/конфликт по unique — значит уже обработано ранее, ничего не делаем
    }

    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error('webhook error', e);
    return res.status(200).json({ ok: true }); // Telegram ждёт 200 даже при внутренней ошибке
  }
}
