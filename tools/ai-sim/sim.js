// Headless-прогон ИИ kittyfooda: версия A против версии B.
// Каждая версия — свой vm-контекст со своим кодом из index.html.
// Состояние партии живёт в харнессе (нейтрально: стороны 0 и 1);
// для решения стороны S в её контекст кладётся G «с её точки зрения»
// (S = 'ai', соперник = 'player'), включая G.turn='ai'.
// Парные раздачи: партия i играется дважды с одинаковыми колодами
// (сид), стороны меняются местами — гасит удачу раздачи и первого хода.
//
// usage: node sim.js <a.html|pimc:N> <b.html|pimc:N> <diffA> <diffB> <pairs> <seed> [label]
// Пример: git show <commit>:index.html > /tmp/old.html
//         node tools/ai-sim/sim.js index.html /tmp/old.html 4 4 50 1 new-vs-old
// pimc:N — прототип из pimc.js с N мирами (без лимита времени).
// Правила/яку/раздачи берутся из REF_HTML (по умолчанию index.html репо).
const fs = require('fs');
const vm = require('vm');

function loadEngine(htmlPath, diff) {
  const html = fs.readFileSync(htmlPath, 'utf8');
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
  let code = scripts[scripts.length - 1];
  code = code.replace(/^let G=/m, 'var G=').replace(/^let DIFF=/m, 'var DIFF=');
  const sink = new Proxy(function () {}, {
    get: (t, k) => (k === Symbol.toPrimitive ? () => 0 : sink),
    apply: () => sink, set: () => true,
  });
  const store = {};
  const ctx = {
    console, Math, JSON, Date, Object, Array, Set, Map, Number, String, Promise,
    parseInt, parseFloat, isFinite, Infinity, NaN,
    setTimeout: () => 0, clearTimeout: () => {},
    window: {}, Image: function () { return sink; },
    localStorage: { getItem: k => store[k] ?? null, setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } },
    document: { getElementById: () => sink, addEventListener() {}, createElement: () => sink, documentElement: sink, body: sink },
    navigator: {}, fetch: () => new Promise(() => {}),
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(code, ctx);
  vm.runInContext('logEvent=function(){};draw=function(){};persistState=function(){};', ctx);
  ctx.DIFF = diff;
  return ctx;
}

// Детерминированный RNG для раздач
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeDeal(engine, rnd) {
  for (;;) {
    const d = engine.buildDeck();
    for (let i = d.length - 1; i > 0; i--) { const j = (rnd() * (i + 1)) | 0; [d[i], d[j]] = [d[j], d[i]]; }
    if (engine.validDeal(d)) return d;
  }
}

// Вид состояния для решающей стороны s
function viewFor(S, s) {
  const o = 1 - s;
  return {
    phase: 'wait', round: S.round, targetScore: S.targetScore,
    scores: [S.scores[o], S.scores[s]], turn: 'ai',
    deck: S.deck, table: S.table,
    aHand: S.hand[s], pHand: S.hand[o], aCap: S.cap[s], pCap: S.cap[o],
    aKoiKoi: S.koi[s], koiKoi: S.koi[o], aKoiCount: S.koiCount[s],
    aPrevPts: S.prevPts[s], prevPts: S.prevPts[o],
    aPrevYakuKey: S.prevKey[s], prevYakuKey: S.prevKey[o],
  };
}
function decide(eng, S, s, fn) {
  eng.G = viewFor(S, s);
  return fn(eng);
}

function applyCapture(S, card, s, ids) {
  if (!ids || !ids.length) { S.table = [...S.table, card]; return; }
  const set = new Set(ids);
  const taken = S.table.filter(c => set.has(c.id));
  S.table = S.table.filter(c => !set.has(c.id));
  S.cap[s] = [...S.cap[s], card, ...taken];
}

const yakuPts = (eng, cap) => eng.yakuPts(eng.getYaku(cap));

// Один раунд. Возвращает {winner: 0|1|null, pts}
function playRound(engines, S, deal, dealer, stats) {
  const ref = REF;
  // раздача: deal[0..7] — первому ходящему, [8..15] — второму
  S.hand = [null, null];
  S.hand[dealer] = deal.slice(0, 8); S.hand[1 - dealer] = deal.slice(8, 16);
  S.table = deal.slice(16, 24); S.deck = deal.slice(24);
  S.cap = [[], []]; S.koi = [false, false]; S.koiCount = [0, 0];
  S.prevPts = [0, 0]; S.prevKey = ['', ''];
  let s = dealer;
  const doubled = () => S.koi[0] || S.koi[1];
  for (;;) {
    if (!S.hand[s].length) break; // руки кончились — исчерпание
    const eng = engines[s];
    // 1) ход с руки
    const move = decide(eng, S, s, e => e.aiChooseMove());
    const card = S.hand[s][move.handIndex];
    trackChoice(stats, s, S, move.captureIds, card, true);
    S.hand[s] = S.hand[s].filter((_, i) => i !== move.handIndex);
    applyCapture(S, card, s, move.captureIds);
    // 2) добор
    if (S.deck.length) {
      const dc = S.deck[S.deck.length - 1];
      S.deck = S.deck.slice(0, -1);
      const ids = decide(eng, S, s, e => e.aiChooseCaptureIds(dc));
      trackChoice(stats, s, S, ids, dc, false);
      applyCapture(S, dc, s, ids);
    }
    // 3) яку / мяу-мяу
    const y = ref.getYaku(S.cap[s]), pts = ref.yakuPts(y), key = ref.yakuKey(y);
    if (pts > 0 && (pts > S.prevPts[s] || key !== S.prevKey[s])) {
      S.prevPts[s] = pts; S.prevKey[s] = key;
      const koi = decide(eng, S, s, e => e.aiShouldKoiKoi(pts));
      if (!koi) return { winner: s, pts: doubled() ? pts * 2 : pts };
      S.koi[s] = true; S.koiCount[s]++;
    }
    if (!S.hand[0].length && !S.hand[1].length) break;
    s = 1 - s;
  }
  const p0 = yakuPts(ref, S.cap[0]), p1 = yakuPts(ref, S.cap[1]);
  if (p0 > p1) return { winner: 0, pts: p0 - p1 };
  if (p1 > p0) return { winner: 1, pts: p1 - p0 };
  return { winner: null, pts: 0 };
}

// Целевая метрика: выбор между 2 вариантами захвата «простая vs непростая»
function trackChoice(stats, s, Sbefore, ids, card, fromHand) {
  const same = Sbefore.table.filter(c => c.m === card.m);
  if (same.length !== 2) return;
  const types = same.map(c => c.t);
  if (!(types.includes('plain') && types.some(t => t !== 'plain'))) return;
  const chosen = same.find(c => ids.includes(c.id));
  if (!chosen) return;
  stats.choice[s].total++;
  if (chosen.t === 'plain') stats.choice[s].plain++;
}

function playMatch(engines, rnd, firstDealer, stats) {
  const S = { round: 1, targetScore: 30, scores: [0, 0] };
  let dealer = firstDealer;
  for (let r = 0; r < 60; r++) {
    const deal = makeDeal(REF, rnd);
    const res = playRound(engines, S, deal, dealer, stats);
    if (res.winner != null) { S.scores[res.winner] += res.pts; dealer = res.winner; }
    stats.rounds++;
    if (S.scores[0] >= S.targetScore || S.scores[1] >= S.targetScore) break;
    S.round++;
  }
  return S.scores;
}

const [aPath, bPath, dA, dB, pairsArg, seedArg, label = ''] = process.argv.slice(2);
const pairs = +pairsArg, seed = +seedArg;
const REF = loadEngine(process.env.REF_HTML || __dirname + '/../../index.html', 4);
const { makePimc } = require('./pimc.js');
const mk = (p, d) => p.startsWith('pimc') ? makePimc(REF.buildDeck(), { worlds: +(p.split(':')[1] || 200) }) : loadEngine(p, +d);
const engA = mk(aPath, dA), engB = mk(bPath, dB);
const stats = { rounds: 0, choice: { A: { total: 0, plain: 0 }, B: { total: 0, plain: 0 } } };
let winsA = 0, winsB = 0, draws = 0, ptsA = 0, ptsB = 0;
const t0 = Date.now();
for (let i = 0; i < pairs; i++) {
  for (const aSeat of [0, 1]) {
    const engines = aSeat === 0 ? [engA, engB] : [engB, engA];
    const local = { rounds: 0, choice: [{ total: 0, plain: 0 }, { total: 0, plain: 0 }] };
    const scores = playMatch(engines, mulberry32(seed * 1000 + i), 0, local);
    const sA = scores[aSeat], sB = scores[1 - aSeat];
    stats.rounds += local.rounds;
    for (const [k, seat] of [['A', aSeat], ['B', 1 - aSeat]]) {
      stats.choice[k].total += local.choice[seat].total;
      stats.choice[k].plain += local.choice[seat].plain;
    }
    ptsA += sA; ptsB += sB;
    if (sA > sB) winsA++; else if (sB > sA) winsB++; else draws++;
  }
}
const n = winsA + winsB + draws;
const pct = (winsA + draws / 2) / n;
const se = Math.sqrt(pct * (1 - pct) / n);
console.log(JSON.stringify({
  label, games: n, winsA, winsB, draws, winRateA: +pct.toFixed(4), ci95: [+(pct - 1.96 * se).toFixed(3), +(pct + 1.96 * se).toFixed(3)],
  avgScoreA: +(ptsA / n).toFixed(2), avgScoreB: +(ptsB / n).toFixed(2), rounds: stats.rounds,
  plainChoiceA: `${stats.choice.A.plain}/${stats.choice.A.total}`, plainChoiceB: `${stats.choice.B.plain}/${stats.choice.B.total}`,
  sec: Math.round((Date.now() - t0) / 1000),
  pimc: [engA, engB].filter(e => e.stats).map(e => ({ decisions: e.stats.decisions, playouts: e.stats.playouts, msPerDecision: +(e.stats.ms / Math.max(1, e.stats.decisions)).toFixed(1), usPerPlayout: +(1000 * e.stats.ms / Math.max(1, e.stats.playouts)).toFixed(1) })),
}));
