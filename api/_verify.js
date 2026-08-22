// api/_verify.js
// Проверка подлинности Telegram WebApp initData.
// Схема Telegram: secret = HMAC_SHA256(key="WebAppData", msg=BOT_TOKEN)
//                 hash   = HMAC_SHA256(key=secret, msg=data_check_string)
// data_check_string — все поля кроме hash, отсортированы по ключу, склеены через \n.

import crypto from 'crypto';

const MAX_AGE_SECONDS = 60 * 60; // 1 час — защита от повторного использования перехваченной initData

/**
 * @returns {{ok:true, user:object, telegramId:number} | {ok:false, error:string}}
 */
export function verifyInitData(initData, botToken) {
  if (!botToken) return { ok: false, error: 'BOT_TOKEN not configured' };
  if (!initData || typeof initData !== 'string') return { ok: false, error: 'initData missing' };

  let params;
  try {
    params = new URLSearchParams(initData);
  } catch {
    return { ok: false, error: 'initData malformed' };
  }

  const hash = params.get('hash');
  if (!hash) return { ok: false, error: 'hash missing' };

  // Собираем data_check_string
  const pairs = [];
  for (const [k, v] of params.entries()) {
    if (k === 'hash') continue;
    pairs.push(`${k}=${v}`);
  }
  pairs.sort();
  const dataCheckString = pairs.join('\n');

  const secret = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
  const computed = crypto.createHmac('sha256', secret).update(dataCheckString).digest('hex');

  // Сравнение постоянного времени — против timing-атак
  const a = Buffer.from(computed, 'hex');
  const b = Buffer.from(hash, 'hex');
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return { ok: false, error: 'signature invalid' };
  }

  // Свежесть: старый перехваченный initData не должен работать вечно
  const authDate = Number(params.get('auth_date') || 0);
  if (!authDate) return { ok: false, error: 'auth_date missing' };
  const age = Math.floor(Date.now() / 1000) - authDate;
  if (age > MAX_AGE_SECONDS) return { ok: false, error: 'initData expired' };
  if (age < -300) return { ok: false, error: 'auth_date in the future' };

  let user;
  try {
    user = JSON.parse(params.get('user') || 'null');
  } catch {
    return { ok: false, error: 'user field malformed' };
  }
  if (!user || !user.id) return { ok: false, error: 'user missing' };

  return { ok: true, user, telegramId: user.id };
}

/**
 * Достаёт initData из заголовка (работает и для GET, и для POST)
 * с запасным вариантом в теле/query для обратной совместимости.
 */
export function extractInitData(req) {
  return (
    req.headers['x-telegram-init-data'] ||
    (req.body && req.body.init_data) ||
    (req.query && req.query.init_data) ||
    ''
  );
}

/** Разрешаем только свой фронтенд, а не '*' */
export function applyCors(req, res) {
  const allowed = [
    'https://assahop.github.io',
    'https://web.telegram.org',
  ];
  const origin = req.headers.origin;
  if (allowed.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Telegram-Init-Data');
}
