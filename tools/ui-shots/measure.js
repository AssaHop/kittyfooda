const { chromium } = require('/opt/node-tools/node_modules/playwright');
(async () => {
  const b = await chromium.launch();
  for (const [w,h,name] of [[393,852,'iPhone 15'],[412,915,'Android 412×915'],[375,667,'16:9 375×667']]) {
    const p = await b.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 3 });
    await p.route(/telegram\.org/, r => r.fulfill({ body: '' }));
    await p.goto('file://'+require('path').resolve(__dirname,'../../index.html')); await p.waitForTimeout(200);
    const r = await p.evaluate(() => { newGame(); const L=boardLayout(); const t=tableLayout(L)[0], hd=playerHandLayout(L);
      const px=v=>+(v*VIEW.k*VIEW.dpr).toFixed(1);
      return {k:+(VIEW.k*VIEW.dpr).toFixed(3), card:[px(BCW),px(BCH)], table0:[px(t.w),px(t.h)],
        deckLeftFromSafe:px(L.deck.x-L.sx), gapDeckTable:px(L.colX-(L.deck.x+BCW)), gapTable:px(B_GAP),
        safeW:px(SAFE_W), top:px(L.sTop), topPct:+(L.sTop/L.VH*100).toFixed(1), botPct:+((L.VH-L.sBot)/L.VH*100).toFixed(1),
        aiFromTop:px(L.ai.y-L.sTop), band:px(L.band.h), aiAlignedHand: L.ai.x===hd[0].x };
    });
    console.log(name, JSON.stringify(r)); await p.close();
  }
  await b.close();
})();
