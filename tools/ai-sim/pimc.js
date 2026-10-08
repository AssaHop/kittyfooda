// PIMC-ИИ для kittyfooda (прототип): подстановка скрытых карт + доигрывание
// раунда до конца быстрой политикой. Интерфейс как у движка игры:
// this.G (вид «ИИ = a», соперник = p), aiChooseMove / aiChooseCaptureIds /
// aiShouldKoiKoi. Руку соперника НЕ читает — только её размер.

function makePimc(deck, opts = {}) {
  const WORLDS = opts.worlds || 200;
  const KOI_WORLDS = opts.koiWorlds || WORLDS;
  const rnd = opts.rnd || Math.random;
  // атрибуты карт по id
  const M = [], T = [], SUB = [];
  deck.forEach(c => { M[c.id] = c.m; T[c.id] = c.t; SUB[c.id] = c.sub || ''; });
  const N = deck.length;

  // ── яку (зеркало getYaku из index.html) ─────────────────────────
  function yakuPts(cap) {
    let B = 0, rain = false, cur = false, moon = false, sake = false, boar = false, deer = false, bfly = false;
    let A = 0, R = 0, poetry = 0, blue = 0, P = 0;
    for (const id of cap) {
      const t = T[id], s = SUB[id];
      if (t === 'bright') { B++; if (s === 'rain') rain = true; if (s === 'curtain') cur = true; if (s === 'moon') moon = true; }
      else if (t === 'animal') { A++; if (s === 'sake') sake = true; if (s === 'boar') boar = true; if (s === 'deer') deer = true; if (s === 'butterfly') bfly = true; }
      else if (t === 'ribbon') { R++; if (s === 'poetry') poetry++; if (s === 'blue') blue++; }
      else P++;
    }
    let p = 0;
    if (B >= 5) p += 10; else if (B === 4) p += rain ? 7 : 8; else if (B === 3 && !rain) p += 5;
    if (boar && deer && bfly) p += 5;
    if (cur && sake) p += 3;
    if (moon && sake) p += 3;
    if (poetry >= 3) p += 5;
    if (blue >= 3) p += 5;
    if (R >= 5) p += R - 4;
    if (A >= 5) p += A - 4;
    if (P >= 10) p += P - 9;
    return p;
  }

  // ── быстрая политика доигрывания ────────────────────────────────
  function val(id) {
    const t = T[id], s = SUB[id];
    if (t === 'bright') return s === 'rain' ? 4 : 6;
    if (t === 'animal') return (s === 'boar' || s === 'deer' || s === 'butterfly' || s === 'sake') ? 4 : 2;
    if (t === 'ribbon') return (s === 'poetry' || s === 'blue') ? 3.5 : 2;
    return 1;
  }
  // варианты захвата карты id со стола table → массив массивов id
  function captureOpts(id, table) {
    const m = M[id], same = [];
    for (const t of table) if (M[t] === m) same.push(t);
    if (same.length === 0) return [[]];
    if (same.length === 2) return [[same[0]], [same[1]]];
    return [same];
  }
  function bestOpt(id, table) {
    const os = captureOpts(id, table);
    if (os.length === 1) return os[0];
    return val(os[0][0]) >= val(os[1][0]) ? os[0] : os[1];
  }
  function applyCap(st, side, id, ids) {
    if (!ids.length) { st.table.push(id); return; }
    st.table = st.table.filter(t => !ids.includes(t));
    st.caps[side].push(id, ...ids);
  }
  function policyPlay(st, side) {
    const hand = st.hands[side];
    let bi = 0, bs = -Infinity, bids = null;
    for (let i = 0; i < hand.length; i++) {
      const ids = bestOpt(hand[i], st.table);
      let s;
      if (ids.length) { s = 10 + val(hand[i]); for (const t of ids) s += val(t); }
      else s = -val(hand[i]);
      if (s > bs) { bs = s; bi = i; bids = ids; }
    }
    const id = hand[bi];
    hand.splice(bi, 1);
    applyCap(st, side, id, bids);
  }
  function policyKoi(pts, handLeft) { return pts <= 2 && handLeft >= 4; }

  function drawStep(st, side) {
    if (!st.deck.length) return;
    const id = st.deck.pop();
    applyCap(st, side, id, bestOpt(id, st.table));
  }
  // null — раунд продолжается; число — итог раунда с точки зрения ИИ (side 0)
  function yakuCheck(st, side, decide) {
    const pts = yakuPts(st.caps[side]);
    if (pts > st.prev[side]) {
      st.prev[side] = pts;
      const koi = decide ? decide(pts) : policyKoi(pts, st.hands[side].length);
      if (!koi) return (side === 0 ? 1 : -1) * pts * (st.koi[0] || st.koi[1] ? 2 : 1);
      st.koi[side] = true;
    }
    return null;
  }
  function exhaust(st) { return yakuPts(st.caps[0]) - yakuPts(st.caps[1]); }
  // phase: 'aiDraw' | 'aiYaku' | 'oppTurn'
  function playout(st, phase) {
    let side;
    if (phase === 'aiDraw') { drawStep(st, 0); const r = yakuCheck(st, 0); if (r != null) return r; side = 1; }
    else if (phase === 'aiYaku') { const r = yakuCheck(st, 0); if (r != null) return r; side = 1; }
    else side = 1;
    for (;;) {
      if (!st.hands[side].length) return exhaust(st);
      policyPlay(st, side);
      drawStep(st, side);
      const r = yakuCheck(st, side);
      if (r != null) return r;
      if (!st.hands[0].length && !st.hands[1].length) return exhaust(st);
      side ^= 1;
    }
  }

  // ── миры ─────────────────────────────────────────────────────────
  const ids = cs => cs.map(c => c.id);
  function baseFromG(G) {
    return {
      aHand: ids(G.aHand), table: ids(G.table), aCap: ids(G.aCap), pCap: ids(G.pCap),
      pHandN: G.pHand.length, deckN: G.deck.length,
      koi: [!!G.aKoiKoi, !!G.koiKoi], prev: [G.aPrevPts || 0, G.prevPts || 0],
    };
  }
  function sampleWorlds(b, n, exclude = []) {
    const known = new Set([...b.aHand, ...b.table, ...b.aCap, ...b.pCap, ...exclude]);
    const unknown = [];
    for (let i = 0; i < N; i++) if (!known.has(i)) unknown.push(i);
    const out = [];
    for (let w = 0; w < n; w++) {
      const u = unknown.slice();
      for (let i = u.length - 1; i > 0; i--) { const j = (rnd() * (i + 1)) | 0; [u[i], u[j]] = [u[j], u[i]]; }
      out.push({ pHand: u.slice(0, b.pHandN), deck: u.slice(b.pHandN, b.pHandN + b.deckN) });
    }
    return out;
  }
  function stateFor(b, w) {
    return {
      hands: [b.aHand.slice(), w.pHand.slice()], deck: w.deck.slice(), table: b.table.slice(),
      caps: [b.aCap.slice(), b.pCap.slice()], koi: b.koi.slice(), prev: b.prev.slice(),
    };
  }

  const api = {
    G: null, stats: { decisions: 0, playouts: 0, ms: 0 },
    aiChooseMove() {
      const t0 = Date.now();
      const b = baseFromG(api.G);
      const moves = [];
      b.aHand.forEach((id, hi) => captureOpts(id, b.table).forEach(c => moves.push({ hi, id, c })));
      if (moves.length === 1) return toMove(moves[0]);
      const worlds = sampleWorlds(b, WORLDS);
      const sum = new Array(moves.length).fill(0);
      for (const w of worlds) {
        for (let k = 0; k < moves.length; k++) {
          const st = stateFor(b, w), mv = moves[k];
          st.hands[0].splice(mv.hi, 1);
          applyCap(st, 0, mv.id, mv.c);
          sum[k] += playout(st, 'aiDraw');
        }
      }
      api.stats.playouts += worlds.length * moves.length;
      let bk = 0; for (let k = 1; k < moves.length; k++) if (sum[k] > sum[bk]) bk = k;
      api.stats.decisions++; api.stats.ms += Date.now() - t0;
      return toMove(moves[bk]);
      function toMove(mv) { return { handIndex: mv.hi, card: api.G.aHand[mv.hi], captureIds: mv.c }; }
    },
    aiChooseCaptureIds(card) {
      const b = baseFromG(api.G);
      const os = captureOpts(card.id, b.table);
      if (os.length === 1) return os[0];
      const t0 = Date.now();
      // добранная карта уже не в колоде и не на столе — исключаем из неизвестных
      const worlds = sampleWorlds({ ...b }, WORLDS, [card.id]);
      const sum = [0, 0];
      for (const w of worlds) for (let k = 0; k < 2; k++) {
        const st = stateFor(b, w);
        applyCap(st, 0, card.id, os[k]);
        sum[k] += playout(st, 'aiYaku');
      }
      api.stats.playouts += worlds.length * 2;
      api.stats.decisions++; api.stats.ms += Date.now() - t0;
      return sum[1] > sum[0] ? os[1] : os[0];
    },
    aiShouldKoiKoi(pts) {
      const G = api.G;
      if (!G.aHand.length) return false;
      const t0 = Date.now();
      const b = baseFromG(G);
      b.prev[0] = pts;
      const stopNow = pts * (b.koi[0] || b.koi[1] ? 2 : 1);
      const worlds = sampleWorlds(b, KOI_WORLDS);
      let sum = 0;
      for (const w of worlds) {
        const st = stateFor(b, w);
        st.koi[0] = true;
        sum += playout(st, 'oppTurn');
      }
      api.stats.playouts += worlds.length;
      api.stats.decisions++; api.stats.ms += Date.now() - t0;
      return sum / worlds.length > stopNow;
    },
    _yakuPts: yakuPts,
  };
  return api;
}
module.exports = { makePimc };
