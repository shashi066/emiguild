// Local, mocked UI states. No database, authentication, rewards or external requests.
// Run `node test/november/ui-preview.cjs`, then review http://127.0.0.1:3010.
const { build } = require('esbuild');
const { readFileSync } = require('node:fs');
const http = require('node:http');
(async () => {
  const result = await build({ stdin: { contents: `
    import React,{useState} from 'react';import {createRoot} from 'react-dom/client';
    import {HappyTicketPanel} from './components/HappyTicketPanel';
    import {AdminHappyTickets} from './components/admin/AdminHappyTickets';
    import {TowerClient} from './components/TowerClient';
    import {DailySpinWidget} from './components/DailySpinWidget';
    function Preview(){const [view,setView]=useState('happy');window.previewView=view;
      return <><nav aria-label="Preview states">{['happy','empty','error','slow','admin','tower1','tower5','spin','spin-ready'].map(v=><button key={v} onClick={()=>{window.previewRefill=0;setView(v)}}>{v}</button>)}<button onClick={()=>{window.previewRefill++;window.dispatchEvent(new Event('focus'))}}>Mock refill</button></nav><main key={view}>{view==='admin'?<AdminHappyTickets/>:view.startsWith('tower')?<TowerClient initialState={window.towerFixture(view)}/>:view.startsWith('spin')?<DailySpinWidget/>:<HappyTicketPanel/>}</main></>;
    }createRoot(document.getElementById('root')).render(<Preview/>);`, resolveDir: process.cwd(), sourcefile: 'reward-preview.tsx', loader: 'tsx' }, outfile: 'preview.js', bundle: true, write: false, jsx: 'automatic', define: { 'process.env.NODE_ENV': '"production"' }, plugins: [{ name: 'preview-only', setup(b) {
      b.onResolve({ filter: /^(next-auth\/react|next\/link|.*TowerLoadingBoundary|.*GuildSpinLoadingBoundary)$/ }, args => ({ path: args.path, namespace: 'mock' }));
      b.onLoad({ filter: /.*/, namespace: 'mock' }, args => ({ contents: args.path === 'next-auth/react' ? `export const useSession=()=>({data:{user:{id:'preview-admin',role:'ADMIN'}},status:'authenticated'});` : args.path === 'next/link' ? `import React from 'react';export default function Link(props){return React.createElement('a',props)}` : args.path.includes('Tower') ? `export const useTowerLoadingComplete=()=>true;export const TowerRouteLoader=()=>null;` : `export const GuildSpinRouteLoader=()=>null;`, loader: 'js', resolveDir: process.cwd() }));
    } }] });
  const js = result.outputFiles.find(f => f.path.endsWith('.js')).text;
  const css = readFileSync('app/globals.css', 'utf8') + (result.outputFiles.find(f => f.path.endsWith('.css'))?.text ?? '');
  const fixtures = `
    window.previewView='happy';window.previewRefill=0;
    const config={stationIds:['ps5'],days:[1,2,3,4,5],startTime:'16:00',endTime:'23:00'};
    const expiry=new Date(Date.now()+86400000).toISOString();
    const reward={id:'floor4',name:'30 Minutes Gaming',type:'GAMING_TIME',value:30};
    window.towerFixture=view=>({enabled:true,availableTokens:1,runDurationSeconds:120,nextTokenExpiresAt:expiry,rewardTickets:[],attempt:{attemptId:'preview-run',level:view==='tower5'?5:1,totalLevels:10,status:'LOST',securedReward:view==='tower5'?reward:null,lossProtection:true,rewardAddedToVault:view==='tower5',canClaim:false,expiresAt:expiry,runExpiresAt:expiry,climbDurationSeconds:120,serverNow:new Date().toISOString(),cards:[],history:[{level:1,selectedPosition:1,result:view==='tower5'?'SAFE':'LOSS'}],reveal:[{level:1,redPositions:[1]}],floors:Array.from({length:10},(_,i)=>({level:i+1,reward,redCount:1}))}});
    let claimed=false;const ticket=()=>({id:'mock-ticket',status:'CLAIMED',expiresAt:expiry,redemptions:[]});
    window.fetch=async(url,options={})=>{const path=String(url);if(window.previewView==='slow')await new Promise(r=>setTimeout(r,1800));
      if(window.previewView==='error'&&path==='/api/happy-tickets')return Response.json({error:'Could not load tickets. Try again.'},{status:503});
      if(path.includes('api/tower/current'))return Response.json(window.towerFixture(window.previewView));
      if(path==='/api/daily-spin')return Response.json({enabled:true,canSpin:true,spin:null,nextReset:expiry,lootItems:[{id:'spin1',name:'10 Minutes Gaming',rarity:'COMMON'},{id:'spin2',name:'Epic Reward',rarity:'EPIC'},{id:'spin3',name:'Legendary Reward',rarity:'LEGENDARY'}],streak:{current:window.previewView==='spin-ready'?9:1,target:10,guaranteedToday:window.previewView==='spin-ready',spinsRemaining:window.previewView==='spin-ready'?1:9},legendary:{enabled:true,current:window.previewView==='spin-ready'?29:23,target:30,spinsRemaining:window.previewView==='spin-ready'?1:7}});
      if(path.includes('api/admin/happy-tickets')){if(options.method==='POST'){const input=JSON.parse(options.body).input;return Response.json({reset:{id:'reset-'+Date.now(),status:input.action==='BANK'?'PENDING':input.action==='CANCEL'?'CANCELLED':'ACTIVATED'}})}return Response.json({pool:{available:3,version:1,config},counts:{issued:8,redeemed:3,expired:2},flags:{},stations:[{id:'ps5',name:'PS5 Station 1'}],tickets:[{...ticket(),user:{name:'Preview member',email:'preview@example.test'},claimedAt:new Date().toISOString()}],resets:[{id:'banked',kind:'BANKED',status:'PENDING',reason:'Stored reset',expiresAt:expiry}],events:[],nextCursor:null});}
      if(path==='/api/happy-tickets/claim'){claimed=true;await new Promise(r=>setTimeout(r,500));return Response.json({ticket:ticket()});}
      return Response.json({pool:{available:window.previewView==='empty'?0:claimed?2:3,capacity:5,enabled:true,noEligibleWindow:false,lastRefill:window.previewRefill?{id:'refill-'+window.previewRefill,createdAt:new Date().toISOString()}:null,serverNow:new Date().toISOString(),rules:config},wallet:{nextClaimAt:claimed?expiry:null,tickets:claimed?[ticket()]:[]}});
    };`;
  const html = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}\nbody{margin:0;padding:16px;background:#080c15;color:#f4f5fc}main{max-width:820px;margin:24px auto}nav{display:flex;gap:6px;flex-wrap:wrap}nav button{padding:10px;min-height:44px;border:1px solid #536180;border-radius:6px;background:#19253a;color:white}.spinner{width:16px;height:16px}*{box-sizing:border-box}</style><div id="root"></div><script>${fixtures}</script><script src="/preview.js"></script>`;
  http.createServer((req, res) => { res.setHeader('Content-Type', req.url === '/preview.js' ? 'text/javascript' : 'text/html'); res.end(req.url === '/preview.js' ? js : html); }).listen(3010, '127.0.0.1', () => console.log('Mocked rewards preview: http://127.0.0.1:3010 (no database)'));
})().catch(e => { console.error(e); process.exitCode = 1; });
