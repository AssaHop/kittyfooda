const fs=require('fs');const src=fs.readFileSync(__dirname+'/sim.js','utf8');
const vm=require('vm');const loadEngine=eval('('+src.match(/function loadEngine[\s\S]*?\n}\n/)[0]+')');
const E=loadEngine((process.env.REF_HTML||__dirname+'/../../index.html'),4);const {makePimc}=require('./pimc.js');const P=makePimc(E.buildDeck());
const D=E.buildDeck();let bad=0;
for(let i=0;i<200000;i++){const n=1+(Math.random()*30|0);const s=D.slice().sort(()=>Math.random()-.5).slice(0,n);
 if(E.yakuPts(E.getYaku(s))!==P._yakuPts(s.map(c=>c.id))){bad++; if(bad<3)console.log(s.map(c=>c.t+c.m+(c.sub||'')).join(' '));}}
console.log('mismatches',bad);
