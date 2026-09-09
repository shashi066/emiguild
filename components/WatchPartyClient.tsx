'use client';

import Link from 'next/link';
import { Award, Clock, Lock, LogIn, Phone, RefreshCw, ShoppingBag, Sparkles, TicketCheck, Tv, X } from 'lucide-react';
import { useState } from 'react';
import InfoGuideModal from '@/components/InfoGuideModal';
import InfoGuideButton from '@/components/InfoGuideButton';
import EmicRewardsButton from '@/components/EmicRewardsButton';
import { EmicoinAmount } from '@/components/watch-party/EmicoinAmount';
import { readApiResponse } from '@/lib/read-api-response';
import { fanPickStatusLabel } from '@/lib/watch-party-presentation';

const WATCH_PARTY_GUIDE_STEPS = [
  { title: 'Sign in and get invited', description: 'Watch parties are invite-only. Sign in and contact EmiGuild if you need an invite.', visual: { kind: 'icon', icon: LogIn, label: 'Watch Party invitation' } },
  { title: 'Check in at the counter', description: 'Staff check-in confirms your entry and adds the displayed Check-in EMIC Reward to your balance.', visual: { kind: 'icon', icon: TicketCheck, label: 'Counter check-in' } },
  { title: 'Enter the watch party', description: 'After check-in, tap Enter to open the event and its optional Fan Pick.', visual: { kind: 'icon', icon: Tv, label: 'Watch Party event' } },
  { title: 'Understand EMIC Rewards', description: 'EMIC is an in-app EmiGuild reward currency. It has no cash value.', visual: { kind: 'icon', icon: Award, label: 'EMIC Rewards' } },
  { title: 'Redeem EMIC Rewards', description: 'Open EMIC Rewards from Home to choose a reward or show a collection ticket to staff.', visual: { kind: 'icon', icon: ShoppingBag, label: 'EMIC Reward redemption' } },
] as const;

type Party = {
  id:string; title:string; source:string; homeTeam:string; awayTeam:string; kickoffAt:string; venue:string|null; entryCoins:number;
  invite:{ invited:boolean; checkedIn:boolean; entered:boolean; canEnter:boolean };
  prediction:{ status:string }|null;
};
type State = { walletCoins:number|null; parties:Party[] };

function eventTime(value:string) {
  return new Date(value).toLocaleString('en-IN',{dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Kolkata'});
}
function statusFor(party:Party,signedIn:boolean) {
  if(!signedIn)return ['Login','muted'];
  if(!party.invite.invited)return ['Invite Only','muted'];
  if(!party.invite.checkedIn)return ['Invited','warn'];
  if(!party.invite.entered)return ['Ready','cyan'];
  return [party.prediction?fanPickStatusLabel(party.prediction.status):'Entered','success'];
}

export function WatchPartyClient({initialState,signedIn}:{initialState:State;signedIn:boolean}) {
  const [state,setState]=useState(initialState);
  const [entering,setEntering]=useState<Party|null>(null);
  const [busy,setBusy]=useState(false);
  const [guideOpen,setGuideOpen]=useState(false);
  const [error,setError]=useState('');

  const refresh=async()=>{
    setBusy(true);setError('');
    try{
      const response=await fetch('/api/watch-parties',{cache:'no-store'});
      const data=await readApiResponse<State&{error?:string}>(response,'Refresh failed.');
      if(!response.ok)throw new Error(data.error||'Refresh failed.');
      setState(data);
    }catch(cause){setError(cause instanceof Error?cause.message:'Refresh failed.');}
    finally{setBusy(false);}
  };
  const enter=async()=>{
    if(!entering||busy)return;
    setBusy(true);setError('');
    try{
      const response=await fetch(`/api/watch-parties/${entering.id}/enter`,{method:'POST'});
      const data=await readApiResponse<{error?:string}>(response,'Entry failed.');
      if(!response.ok)throw new Error(data.error||'Entry failed.');
      window.location.href=`/watch-party/${entering.id}`;
    }catch(cause){setError(cause instanceof Error?cause.message:'Entry failed.');setBusy(false);}
  };

  return <>
    <section className="wp-shell">
      <header className="wp-head">
        <div><span>Live Events</span><h1 className="font-orbitron">EmiGuild Watch Parties</h1></div>
        <div className="wp-head-actions">
          <EmicRewardsButton />
          <InfoGuideButton onClick={()=>setGuideOpen(true)} ariaLabel="Open How Watch Parties Work guide" />
          <button className="wp-icon" type="button" onClick={refresh} disabled={busy} aria-label="Refresh Watch Parties"><RefreshCw size={18} className={busy?'spin':''}/></button>
        </div>
      </header>
      <div className="watch-wallet"><span>EMIC Balance</span><strong><EmicoinAmount value={state.walletCoins}/></strong></div>
      {error&&<div className="wp-alert" role="alert">{error}</div>}
      <div className="wp-list">
        {state.parties.length===0?<div className="wp-empty"><Tv size={30}/><strong>No watch parties live</strong><span>Check back when the next event opens.</span></div>:
          state.parties.map(party=>{
            const [label,tone]=statusFor(party,signedIn);
            return <article className="wp-card" key={party.id}>
              <div className="wp-card-head"><span className={`wp-chip ${tone}`}>{signedIn&&!party.invite.invited&&<Lock size={12}/>} {label}</span><span className="wp-time"><Clock size={13}/>{eventTime(party.kickoffAt)}</span></div>
              {party.source==='F1_2026'?<div className="wp-matchup f1"><span className="wp-vs">Formula 1</span><h2>{party.title}</h2></div>:<div className="wp-matchup"><h2>{party.homeTeam}</h2><span className="wp-vs">vs</span><h2>{party.awayTeam}</h2></div>}
              {party.venue&&<p>{party.venue}</p>}
              <div className="wp-reward"><span>Check-in EMIC Reward</span><strong><EmicoinAmount value={party.entryCoins}/></strong></div>
              {signedIn&&!party.invite.invited&&<a className="wp-contact" href="tel:+919989562474"><Phone size={14}/>Contact EmiGuild for invite</a>}
              {(!signedIn||party.invite.invited)&&<div className="wp-actions">
                {signedIn&&party.invite.invited&&<Link className="btn btn-ghost btn-sm" href={`/watch-party/${party.id}`}><Sparkles size={15}/>Open Event</Link>}
                {!signedIn?<Link className="btn btn-primary btn-sm" href="/login"><LogIn size={15}/>Login</Link>:
                  party.invite.canEnter&&!party.invite.entered?<button className="btn btn-primary btn-sm" type="button" onClick={()=>setEntering(party)}><TicketCheck size={15}/>Enter</button>:
                  party.invite.invited&&!party.invite.checkedIn?<button className="btn btn-ghost btn-sm" type="button" disabled><Lock size={15}/>Check-in</button>:null}
              </div>}
            </article>;
          })}
      </div>
    </section>
    {entering&&<div className="wp-backdrop" role="dialog" aria-modal="true" aria-labelledby="wp-enter-title" onClick={()=>!busy&&setEntering(null)}>
      <section className="wp-enter" onClick={event=>event.stopPropagation()}>
        <button className="wp-close" type="button" onClick={()=>setEntering(null)} disabled={busy} aria-label="Close"><X size={18}/></button>
        <TicketCheck size={28}/><h2 id="wp-enter-title">Enter Watch Party?</h2><p>{entering.source==='F1_2026'?entering.title:`${entering.homeTeam} vs ${entering.awayTeam}`}</p>
        <span>Your check-in reward</span><strong><EmicoinAmount value={entering.entryCoins}/></strong>
        <button className="btn btn-primary" type="button" onClick={enter} disabled={busy}>{busy?'Entering...':'Enter Event'}</button>
      </section>
    </div>}
    {guideOpen&&<InfoGuideModal eyebrow="Watch Party Guide" title="How Watch Parties Work" subtitle="Invite. Check in. Join the event." titleId="watch-party-guide-title" steps={WATCH_PARTY_GUIDE_STEPS} onClose={()=>setGuideOpen(false)} closeLabel="Close Watch Party guide" lightweight/>}
    <style jsx>{`
      .wp-shell{width:min(100%,780px);margin:0 auto}.wp-head,.wp-head-actions,.watch-wallet,.wp-card-head,.wp-reward,.wp-actions,.wp-chip,.wp-time,.wp-contact{display:flex;align-items:center;gap:8px}
      .wp-head{justify-content:space-between;margin-bottom:12px}.wp-head>div:first-child{min-width:0}.wp-head>div>span{color:#67e8f9;font-size:.7rem;font-weight:900;text-transform:uppercase}.wp-head h1{margin:3px 0 0;font-size:clamp(1.25rem,5vw,2rem);line-height:1.2}
      .wp-icon{width:36px;height:36px;display:flex;align-items:center;justify-content:center;border:1px solid rgba(148,163,184,.22);border-radius:6px;color:#cbd5e1;background:#0b1220}.wp-icon:focus-visible{outline:2px solid #67e8f9;outline-offset:2px}
      .watch-wallet { justify-content:space-between; padding:8px 0; color:#94a3b8; }
      .watch-wallet > span { color:#94a3b8; }
      .watch-wallet strong{color:#f8fafc}.wp-alert{margin:10px 0;padding:10px;border-left:3px solid #fb7185;color:#fecdd3;background:#24131b}
      .wp-list{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin-top:12px}.wp-card{min-width:0;padding:14px;border:1px solid rgba(148,163,184,.22);border-radius:8px;background:#0d1524}
      .wp-card-head,.wp-reward{min-width:0;justify-content:space-between}.wp-chip{flex:0 0 auto;min-height:25px;padding:3px 8px;border:1px solid rgba(148,163,184,.16);border-radius:7px;color:#aebbd0;background:#172033;font-size:.68rem;font-weight:800;text-transform:uppercase}.wp-chip.warn{color:#fbbf24}.wp-chip.cyan{color:#67e8f9}.wp-chip.success{color:#86efac}
      .wp-time{min-width:0;flex:1;justify-content:flex-end;color:#718198;font-size:.68rem;line-height:1.3;text-align:right}.wp-matchup{display:grid;grid-template-columns:minmax(0,1fr);gap:2px;margin-top:10px}.wp-matchup h2{min-width:0;margin:0;font-size:1rem;line-height:1.35;text-align:left;overflow-wrap:anywhere}.wp-matchup.f1{gap:4px}.wp-vs{color:#22d3ee;font-size:.68rem;font-weight:900;text-align:left}.wp-card>p{margin:6px 0;color:#94a3b8;font-size:.76rem;text-align:left}
      .wp-reward{margin-top:11px;padding-top:9px;border-top:1px solid rgba(148,163,184,.17);color:#9aabc2;font-size:.75rem}.wp-reward strong{min-width:0;color:#67e8f9}.wp-contact{min-height:48px;justify-content:center;margin-top:12px;padding:8px;border:1px dashed rgba(245,158,11,.5);border-radius:7px;color:#fbbf24;background:#151513;font-size:.75rem;font-weight:800;text-align:center;text-decoration:none}.wp-actions{width:100%;flex-wrap:wrap;justify-content:flex-end;margin-top:10px}
      .wp-empty{grid-column:1/-1;min-height:210px;display:grid;place-items:center;align-content:center;gap:7px;color:#94a3b8;text-align:center}.wp-empty strong{color:#f8fafc}
      .wp-backdrop{position:fixed;inset:0;z-index:1100;display:grid;place-items:center;padding:12px;background:rgba(0,0,0,.76)}.wp-enter{position:relative;width:min(100%,340px);display:grid;place-items:center;gap:9px;padding:22px;border:1px solid rgba(34,211,238,.35);border-radius:8px;background:#0b1220;text-align:center}.wp-enter h2,.wp-enter p{margin:0}.wp-enter>span{color:#94a3b8;font-size:.75rem}.wp-enter>strong{color:#67e8f9}.wp-close{position:absolute;top:8px;right:8px;width:40px;height:40px;display:grid;place-items:center;border:0;color:#94a3b8;background:transparent}
      .spin{animation:wpSpin .8s linear infinite}@keyframes wpSpin{to{transform:rotate(360deg)}}@media(max-width:600px){.wp-list{grid-template-columns:1fr}.wp-head{align-items:flex-start}.wp-head>div:first-child{flex:1}.wp-head-actions{flex:0 0 auto}.wp-card-head{align-items:flex-start}.wp-time{max-width:170px}.wp-actions .btn{min-height:44px}}@media(max-width:350px){.wp-matchup h2{font-size:.9rem}}@media(prefers-reduced-motion:reduce){.spin{animation:none}}
    `}</style>
  </>;
}
