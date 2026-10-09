const { chromium } = require(process.env.PW || '/opt/node-tools/node_modules/playwright');
(async () => {
  const [,, url, out, w, h, mode] = process.argv;
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: +w, height: +h }, deviceScaleFactor: 3 });
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  await p.route(/telegram\.org/, r => r.fulfill({ body: '' }));
  await p.goto(url);
  await p.waitForTimeout(500);
  if (mode !== 'start') {
    await p.evaluate(() => { newGame(); });
    await p.waitForTimeout(400);
    await p.evaluate((mode) => {
      // Подставим «середину раунда», чтобы видеть ячейки яку и выбор
      if (mode === 'mid') {
        G.phase = 'select'; G.turn = 'player';
        const take = (arr, n) => arr.splice(0, n);
        G.pCap.push(...take(G.deck, 7)); G.aCap.push(...take(G.deck, 5));
        G.pHand.splice(6); G.aHand.splice(6); G.sel = G.pHand.length ? 0 : null;
        G.msg = 'Ваш ход — выберите карту из руки';
      }
      if (mode === 'choose') {
        G.phase = 'choose'; G.msg = 'Яку! Санко = 5. Стоп или Мяу-Мяу?';
        G.aiPreview = G.deck[G.deck.length - 1];
        G.table.push(...G.deck.splice(0, 3));
      }
      draw();
    }, mode);
    await p.waitForTimeout(800);
  }
  await p.screenshot({ path: out });
  console.log(out, errs.length ? 'ERRORS: ' + errs.join(' | ') : 'no errors');
  await b.close();
})();
