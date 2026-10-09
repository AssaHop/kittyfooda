// api/telegram-webhook.js
// Принимает обновления от Telegram Bot API (в т.ч. успешные платежи).
// Telegram сам будет слать сюда POST-запросы после настройки webhook.

import crypto from 'crypto';
import { CATALOG, parsePayload } from './_catalog.js';

function secretMatches(got, expected) {
  const a = Buffer.from(String(got || ''));
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(200).json({ ok: true });

  // Без этой проверки кто угодно, зная URL, мог прислать поддельный
  // successful_payment и начислить себе звёзды без реальной оплаты.
  // Секрет задаётся один раз через Telegram API (см. api/TODO-security.md).
  const WEBHOOK_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!WEBHOOK_SECRET || !secretMatches(req.headers['x-telegram-bot-api-secret-token'], WEBHOOK_SECRET)) {
    return res.status(401).json({ ok: false });
  }

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY;
  const BOT_TOKEN = process.env.BOT_TOKEN;

  const update = req.body || {};

  try {
    // ── 1. Telegram спрашивает разрешения перед оплатой ──
    // Сверяем товар и сумму с каталогом: платить можно только то, что выставил сервер.
    if (update.pre_checkout_query) {
      const q = update.pre_checkout_query;
      const parsed = parsePayload(q.invoice_payload);
      const product = parsed && CATALOG[parsed.item];
      const ok = !!product && q.currency === 'XTR' && q.total_amount === product.stars;
      if (!ok) console.error('pre_checkout rejected', q.invoice_payload, q.currency, q.total_amount);
      await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/answerPreCheckoutQuery`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(ok
          ? { pre_checkout_query_id: q.id, ok: true }
          : { pre_checkout_query_id: q.id, ok: false, error_message: 'Товар недоступен, попробуйте ещё раз' }),
      });
      return res.status(200).json({ ok: true });
    }

    // ── 2. Успешная оплата — записываем платёж и начисляем покупку ──
    const msg = update.message;
    if (msg && msg.successful_payment) {
      const sp = msg.successful_payment;
      const parsed = parsePayload(sp.invoice_payload);
      const product = parsed && CATALOG[parsed.item];
      if (!product) console.error('payment with unknown payload', sp.invoice_payload);

      // Одна транзакция в базе (функция record_payment, docs/sql/): запись
      // платежа + начисление. Повтор с тем же charge_id ничего не начислит.
      const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/record_payment`, {
        method: 'POST',
        headers: {
          apikey: SUPABASE_SECRET_KEY,
          Authorization: `Bearer ${SUPABASE_SECRET_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          p_telegram_id: msg.from.id, // платит этот пользователь — ему и начисляем
          p_charge_id: sp.telegram_payment_charge_id,
          p_item: sp.invoice_payload,
          p_amount: sp.total_amount, // в Stars
          p_hints: product ? product.hints : 0,
        }),
      });
      if (!r.ok) throw new Error(`record_payment failed: ${r.status} ${await r.text()}`);
    }

    return res.status(200).json({ ok: true });
  } catch (e) {
    // Не 200: Telegram повторит доставку. Повтор безопасен — платёж
    // идемпотентен по payment_charge_id. Иначе оплата терялась бы молча.
    console.error('webhook error', e);
    return res.status(500).json({ ok: false });
  }
}
