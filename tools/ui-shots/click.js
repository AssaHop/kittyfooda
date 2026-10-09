const { chromium } = require('/opt/node-tools/node_modules/playwright');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 3 });
  const errs=[]; p.on('pageerror', e => errs.push(e.message));
  await p.route(/telegram\.org/, r => r.fulfill({ body: '' }));
  await p.goto('file://'+require('path').resolve(__dirname,'../../index.html')); await p.waitForTimeout(300);
  // старт: клик по кнопке «Мастер», потом «Новая игра» (в системе 450×800)
  const L = async (x,y)=>p.evaluate(([x,y])=>({x:VIEW.lx+x*VIEW.ls,y:VIEW.ly+y*VIEW.ls}),[x,y]);
  let c=await L(225+141,800-232+15); await p.mouse.click(c.x,c.y);
  console.log('DIFF',await p.evaluate(()=>DIFF));
  c=await L(225,800-186+19); await p.mouse.click(c.x,c.y); await p.waitForTimeout(300);
  for(let turn=0;turn<6;turn++){
    await p.waitForFunction(()=>G.phase==='select'&&G.turn==='player'||G.phase==='choose'||G.phase==='roundover'||G.phase==='captureSelect',null,{timeout:20000});
    const st=await p.evaluate(()=>G.phase);
    if(st==='roundover'||st==='choose'){console.log('phase',st);break;}
    if(st==='captureSelect'){
      const t=await p.evaluate(()=>{const L=boardLayout();const r=tableLayout(L).find(t=>G.aiTargets.some(a=>a.id===t.card.id));return {x:(r.x+r.w/2)*VIEW.k,y:(r.y+r.h/2)*VIEW.k};});
      await p.mouse.click(t.x,t.y); continue;
    }
    const n0=await p.evaluate(()=>G.pHand.length);
    const pos=await p.evaluate(()=>{const h=playerHandLayout()[0];return {x:(h.x+95)*VIEW.k,y:(h.y+155)*VIEW.k};});
    await p.mouse.click(pos.x,pos.y); await p.waitForTimeout(100);
    const pos2=await p.evaluate(()=>{const L=boardLayout();const h=playerHandLayout(L).find(e=>e.i===G.sel);return {x:(h.x+95)*VIEW.k,y:(h.y+125)*VIEW.k};});
    await p.mouse.click(pos2.x,pos2.y); await p.waitForTimeout(200);
    console.log('turn',turn,'hand',n0,'->',await p.evaluate(()=>G.pHand.length), await p.evaluate(()=>G.phase));
  }
  console.log(errs.length?'ERR '+errs.join('|'):'no errors'); await b.close();
})();
