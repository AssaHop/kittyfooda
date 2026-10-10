const { chromium } = require('/opt/node-tools/node_modules/playwright');
(async () => {
  const b = await chromium.launch();
  for (const [w,h,name] of [[393,852,'iPhone 15'],[412,915,'Android 412×915'],[375,667,'16:9 375×667']]) {
    const p = await b.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 3 });
    await p.route(/telegram\.org/, r => r.fulfill({ body: '' }));
    await p.goto('file://'+require('path').resolve(__dirname,'../../index.html')); await p.waitForTimeout(200);
    const r = await p.evaluate(() => { newGame(); const L=boardLayout(); const t=tableLayout(L)[0], hd=playerHandLayout(L);
      const px=v=>+(v*VIEW.k*VIEW.dpr).toFixed(1);
      const T=tableLayout(L);
      return {k:+(VIEW.k*VIEW.dpr).toFixed(3), card:[px(BCW),px(BCH)], table0:[px(T[0].w),px(T[0].h)],
        sidePct:+(L.sx/L.VW*100).toFixed(1), topPct:+(L.sTop/L.VH*100).toFixed(1), botPct:+((L.VH-L.sBot)/L.VH*100).toFixed(1),
        safeW:px(SAFE_W), padPct:+(L.pad/(L.sBot-L.sTop)*100).toFixed(1),
        gapDeckTable:px(L.colX-(L.deck.x+BCW)), gapX:px(B_GAP), rowW:px(T[3].x+T[3].w-L.sx),
        tableH:px(L.table.h), deck:[px(L.deck.w),px(L.deck.h)], cellsGap:px(L.cellsGap), band:px(L.band.h),
        handCentered:Math.abs(hd[0].x+(hd[3].x+BCW)-L.VW)<0.01, aiAtZoneLeft:L.ai.x===L.sx };
    });
    console.log(name, JSON.stringify(r)); await p.close();
  }
  await b.close();
})();
