// Component hook harness: no browser, account, database or network.
const test = require('node:test');
const assert = require('node:assert/strict');
const { build } = require('esbuild');
const Module = require('node:module');
const path = require('node:path');
async function panel() {
  const result = await build({entryPoints:['components/HappyTicketPanel.tsx'],bundle:true,platform:'node',format:'cjs',packages:'external',write:false,jsx:'automatic',plugins:[{name:'hook-fixture',setup(b){
    b.onResolve({filter:/^(react|next-auth\/react|next\/link)$/},a=>({path:a.path,namespace:'fixture'}));
    b.onLoad({filter:/.*/,namespace:'fixture'},a=>({loader:'js',contents:a.path==='react' ? 'export const useState=(...a)=>global.__happyHooks.state(...a);export const useRef=(...a)=>global.__happyHooks.ref(...a);export const useEffect=(...a)=>global.__happyHooks.effect(...a);export const useCallback=(...a)=>global.__happyHooks.callback(...a);export const useId=()=>"test";' : a.path==='next-auth/react' ? 'export const useSession=()=>({data:{user:{id:"owner"}},status:"authenticated"});' : 'export default function Link(){return null;}'}));
    b.onLoad({filter:/\.module\.css$/},()=>({loader:'js',contents:'export default {};'}));
  }}]});
  const filename=path.join(process.cwd(),'happy-hook-fixture.cjs');const mod=new Module(filename,module);mod.filename=filename;mod.paths=module.paths;mod._compile(result.outputFiles[0].text,mod.filename);return mod.exports.HappyTicketPanel;
}
function hooks(){
  const slots=[];let cursor=0;const effects=[];
  const same=(a,b)=>a&&b&&a.length===b.length&&a.every((v,i)=>Object.is(v,b[i]));
  return {slots,render(component){cursor=0;component();while(effects.length)effects.shift()();},
    state(initial){const i=cursor++;if(!slots[i])slots[i]={value:initial};return [slots[i].value,v=>{slots[i].value=typeof v==='function'?v(slots[i].value):v;}];},
    ref(value){const i=cursor++;return slots[i]??(slots[i]={current:value});},
    callback(value,deps){const i=cursor++;if(!slots[i]||!same(slots[i].deps,deps))slots[i]={value,deps};return slots[i].value;},
    effect(value,deps){const i=cursor++;if(!slots[i]||!same(slots[i].deps,deps)){const old=slots[i];slots[i]={deps};effects.push(()=>{old?.cleanup?.();slots[i].cleanup=value();});}},
    cleanup(){for(const s of slots)s?.cleanup?.();}
  };
}
const settle=async()=>{for(let i=0;i<8;i++)await Promise.resolve();};
test('ticket reads deduplicate resume, time out with retry, and abort on unmount',async t=>{
  const component=await panel();const h=hooks();global.__happyHooks=h;
  const events=new Map();const target={hidden:false,addEventListener:(name,fn)=>events.set(name,fn),removeEventListener:name=>events.delete(name)};
  t.mock.method(global,'fetch',()=>{});
  const old={window:global.window,document:global.document,localStorage:global.localStorage};
  global.window=target;global.document=target;global.localStorage={getItem:()=>null};
  t.mock.timers.enable({apis:['setTimeout','setInterval']});
  const requests=[];global.fetch=(url,{signal})=>new Promise((resolve,reject)=>{requests.push({resolve,signal});signal.addEventListener('abort',()=>reject(new Error('aborted')));});
  try {
    h.render(component);assert.equal(requests.length,1);
    events.get('focus')();events.get('visibilitychange')();t.mock.timers.tick(100);assert.equal(requests.length,1);
    const state={pool:{available:5,capacity:5,version:0,enabled:true,noEligibleWindow:false,serverNow:new Date().toISOString(),rules:{days:[1],startTime:'16:00',endTime:'23:00'}},wallet:{tickets:[],nextClaimAt:null}};
    requests[0].resolve({ok:true,json:async()=>state});await settle();h.render(component);
    events.get('focus')();events.get('visibilitychange')();t.mock.timers.tick(100);assert.equal(requests.length,2);
    t.mock.timers.tick(20_000);await settle();h.render(component);
    assert.equal(requests[1].signal.aborted,true);assert.ok(h.slots.some(s=>s.value==='Loading took too long. Please retry.'));assert.ok(h.slots.some(s=>s.value===state));
    events.get('focus')();t.mock.timers.tick(100);assert.equal(requests.length,3);
    h.cleanup();assert.equal(requests[2].signal.aborted,true);await settle();assert.equal(events.size,0);
  } finally {h.cleanup();delete global.__happyHooks;for(const [key,value] of Object.entries(old)){if(value===undefined)delete global[key];else global[key]=value;}}
});
