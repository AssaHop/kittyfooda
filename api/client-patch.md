# Правки в index.html

## 1. Отправка initData во все запросы

Заменить блок объявления `TG_USER` (сразу после `const API_BASE = ...`):

```js
const API_BASE = 'https://kittyfooda.vercel.app';
let TG_USER = null;
let TG_INIT_DATA = '';
if (window.Telegram && window.Telegram.WebApp) {
  TG_INIT_DATA = window.Telegram.WebApp.initData || '';
  TG_USER = (window.Telegram.WebApp.initDataUnsafe || {}).user || null;
}

// Единая точка запросов к бэкенду: подпись уходит в заголовке,
// работает и для GET, и для POST.
function apiFetch(path, options = {}) {
  const headers = Object.assign(
    { 'Content-Type': 'application/json' },
    options.headers || {},
    TG_INIT_DATA ? { 'X-Telegram-Init-Data': TG_INIT_DATA } : {}
  );
  return fetch(`${API_BASE}${path}`, Object.assign({}, options, { headers }));
}
```

`TG_USER` остаётся только для отрисовки на клиенте (показать имя, понять что мы в Telegram).
Сервер его больше не слушает — берёт id из подписи.

## 2. syncUser

`telegram_id` и `username` из тела убираем — сервер возьмёт их из подписи.

```js
async function syncUser(){
  if(!TG_USER) return null;
  try{
    await apiFetch('/api/save-progress', { method:'POST', body: JSON.stringify({}) });
    const r = await apiFetch('/api/save-progress');
    const data = await r.json();
    if(data.user){
      PLAYER_STATS.wins=data.user.wins||0;
      PLAYER_STATS.losses=data.user.losses||0;
      PLAYER_STATS.draws=data.user.draws||0;
      if(data.user.game_state){ SAVED_GAME=data.user.game_state; }
      hintsOwnedSync();
    }
    SYNC_DONE=true; draw();
    return data.user || null;
  }catch(e){ console.warn('syncUser failed', e); SYNC_DONE=true; return null; }
}
```

## 3. saveMatchResult

```js
await apiFetch('/api/save-progress', { method:'POST', body: JSON.stringify({ result }) });
```

## 4. persistState — не сохраняем фазу wait

```js
const snap=['select','choose','captureSelect','roundover'].includes(G.phase)?G:null;
apiFetch('/api/save-progress',{ method:'POST', body:JSON.stringify({ game_state: snap }) })
  .catch(e=>console.warn('persistState failed',e));
```

## 5. buyHint — цену задаёт сервер

```js
const r = await apiFetch('/api/create-invoice', {
  method:'POST',
  body: JSON.stringify({ item:'hint' })
});
```

Константу `HINT_PRICE` на клиенте можно оставить только для показа цены в UI.

## 6. Продолжение игры — страховка от старых снапшотов

В обработчике клика по кнопке «ПРОДОЛЖИТЬ ИГРУ»:

```js
if(SAVED_GAME){
  G=SAVED_GAME; SAVED_GAME=null;
  if(G.phase==='wait'){
    G.phase='select'; G.turn='player';
    G.msg='Ваш ход — выберите карту из руки';
  }
  draw();
}
```
