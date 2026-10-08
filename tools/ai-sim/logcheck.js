const fs=require('fs'),vm=require('vm');
const html=fs.readFileSync((process.argv[2]||__dirname+'/../../index.html'),'utf8');
let code=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m=>m[1]).pop();
code=code.replace(/^let G=/m,'var G=').replace(/^let DIFF=/m,'var DIFF=');
const sink=new Proxy(function(){},{get:(t,k)=>k===Symbol.toPrimitive?()=>0:sink,apply:()=>sink,set:()=>true});
const store={};const q=[];
const ctx={console,Math,JSON,Date,Object,Array,Set,Map,Number,String,Promise,parseInt,parseFloat,isFinite,Infinity,NaN,Blob:function(){},URL:{createObjectURL(){},revokeObjectURL(){}},
 setTimeout:(f)=>{q.push(f);return q.length},clearTimeout(){},Image:function(){return sink},
 localStorage:{getItem:k=>store[k]??null,setItem:(k,v)=>{store[k]=String(v)},removeItem:k=>{delete store[k]}},
 document:{getElementById:()=>sink,addEventListener(){},createElement:()=>sink,documentElement:sink,body:sink},navigator:{},fetch:()=>new Promise(()=>{})};
ctx.window=ctx;vm.createContext(ctx);vm.runInContext(code,ctx);
ctx.DIFF=4;
vm.runInContext('newGame()',ctx);
let steps=0;
while(steps++<20000){
  if(q.length){q.shift()();continue;}
  const G=ctx.G;
  if(G.phase==='select'&&G.turn==='player'){vm.runInContext('playerPlay(0)',ctx);continue;}
  if(G.phase==='captureSelect'){vm.runInContext('playerResolveCapture(G.pendingCapture.options[0][0])',ctx);continue;}
  if(G.phase==='choose'){vm.runInContext('playerChoose(true)',ctx);continue;}
  if(G.phase==='roundover'){if(G.round>=3)break;vm.runInContext('G.round++;newRound()',ctx);continue;}
  if(G.phase==='gameover')break;
  break;
}
const ev=JSON.parse(store.kittyfooda_event_log).events;
const byType={};ev.forEach(e=>byType[e.type]=(byType[e.type]||0)+1);
console.log('phase',ctx.G.phase,'round',ctx.G.round,'scores',ctx.G.scores);
console.log(byType);
const show=t=>{const e=ev.find(x=>x.type===t);if(e)console.log(t,JSON.stringify(e).slice(0,420));};
['ai_move_decision','ai_capture_choice','ai_koikoi_decision','ai_move','ai_draw','round_end'].forEach(show);
const ms=ev.filter(e=>e.engine==='pimc').map(e=>e.ms);
console.log('pimc decisions',ms.length,'max ms',Math.max(...ms),'avg worlds',(ev.filter(e=>e.worlds).reduce((s,e)=>s+e.worlds,0)/ms.length).toFixed(0));
