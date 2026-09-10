'use client';

import { Activity, Check, Loader2, Pencil, Search, Tv, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import AdminBookingModalShell from '@/components/admin/AdminBookingModalShell';
import { readApiResponse } from '@/lib/read-api-response';
import { predictionOddsBasisPoints } from '@/lib/watch-party-odds';

type AdminParty = { id:string; createdAt:string; updatedAt:string; title:string; status:string; source:string; homeTeam:string; awayTeam:string; kickoffAt:string; venue:string|null; entryFeeRupees:number; entryCoins:number; predictionStatus:string; predictionLockAt:string; settledOption:string|null; options:Array<{key:string;label:string;multiplier:string}>; invites:any[]; predictionCount:number };
type Key='HOME'|'DRAW'|'AWAY';
type F1Race={id:string;name:string;shortName:string;venue:string;kickoffAt:string};
type F1Driver={key:string;name:string;team:string};
type F1Catalog={races:F1Race[];drivers:F1Driver[]};

function formatIst(value:string) {
  return new Date(value).toLocaleString('en-IN',{dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Kolkata'});
}

export function WatchPartyCreateModal({onClose,onCreated,onImported}:{onClose:()=>void;onCreated:(party:AdminParty)=>void;onImported:(result:{createdCount:number;skippedCount:number})=>void}) {
  const [form,setForm]=useState({title:'',homeTeam:'',awayTeam:'',kickoffAt:'',venue:'',entryFeeRupees:'100',entryCoins:'500'});
  const [format,setFormat]=useState<'TEAM'|'F1'>('TEAM');
  const [includeDraw,setIncludeDraw]=useState(true);
  const [multipliers,setMultipliers]=useState<Record<Key,string>>({HOME:'2.00',DRAW:'3.00',AWAY:'2.00'});
  const [catalog,setCatalog]=useState<F1Catalog|null>(null);
  const [selectedRaces,setSelectedRaces]=useState<string[]>([]);
  const [driverMultipliers,setDriverMultipliers]=useState<Record<string,string>>({});
  const [driverNames,setDriverNames]=useState<Record<string,string>>({});
  const [editingDriverName,setEditingDriverName]=useState<string|null>(null);
  const [driverSearch,setDriverSearch]=useState('');
  const [reviewing,setReviewing]=useState(false);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const keys:Key[]=includeDraw?['HOME','DRAW','AWAY']:['HOME','AWAY'];
  const odds=Object.fromEntries(keys.map(key=>[key,predictionOddsBasisPoints(multipliers[key])])) as Partial<Record<Key,number|null>>;
  const fee=Number(form.entryFeeRupees), reward=Number(form.entryCoins);
  const numericOk=Number.isInteger(fee)&&fee>=0&&fee<=100000&&Number.isInteger(reward)&&reward>=1&&reward<=100000;
  const teamCanCreate=Boolean(form.homeTeam.trim()&&form.awayTeam.trim()&&form.homeTeam.trim().toLowerCase()!==form.awayTeam.trim().toLowerCase()&&form.kickoffAt&&numericOk&&keys.every(key=>odds[key]!=null));
  const f1MultipliersValid=Boolean(catalog&&catalog.drivers.every(driver=>predictionOddsBasisPoints(driverMultipliers[driver.key]??'')!=null));
  const f1CanImport=Boolean(catalog&&selectedRaces.length>0&&numericOk&&f1MultipliersValid);
  const visibleDrivers=useMemo(()=>{
    const query=driverSearch.trim().toLowerCase();
    return catalog?.drivers.filter(driver=>!query||driver.name.toLowerCase().includes(query)||driver.team.toLowerCase().includes(query))??[];
  },[catalog,driverSearch]);

  const chooseFormat=async(next:'TEAM'|'F1')=>{
    setFormat(next);setReviewing(false);setError('');
    if(next==='TEAM'||catalog||busy)return;
    setBusy(true);
    try{
      const response=await fetch('/api/admin/watch-parties/f1-calendar',{cache:'no-store'});
      const data=await readApiResponse<F1Catalog&{error?:string}>(response,'Failed to load the F1 calendar.');
      if(!response.ok)throw new Error(data.error||'Failed to load the F1 calendar.');
      setCatalog(data);
      setDriverMultipliers(Object.fromEntries(data.drivers.map(driver=>[driver.key,'10.00'])));
      setDriverNames(Object.fromEntries(data.drivers.map(driver=>[driver.key,driver.name])));
    }catch(cause){setError(cause instanceof Error?cause.message:'Failed to load the F1 calendar.');}
    finally{setBusy(false);}
  };

  const submitTeam=async(event:React.FormEvent)=>{
    event.preventDefault();
    if(busy)return;
    if(!teamCanCreate){setError('Add two different teams, a valid event time, whole-number fees and rewards, and multipliers from 1.00x to 10.00x.');return;}
    setBusy(true);setError('');
    try{
      const response=await fetch('/api/admin/watch-parties',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({
        ...form,title:form.title.trim()||`${form.homeTeam.trim()} vs ${form.awayTeam.trim()}`,entryFeeRupees:fee,entryCoins:reward,status:'ACTIVE',source:'MANUAL',
        predictionOptions:keys.map(key=>({key,label:key==='HOME'?form.homeTeam.trim():key==='AWAY'?form.awayTeam.trim():'Draw / Tie',multiplierBasisPoints:odds[key]})),
      })});
      const data=await readApiResponse<{party:AdminParty;error?:string}>(response,'Failed to create watch party.');
      if(!response.ok)throw new Error(data.error||'Failed to create watch party.');
      onCreated(data.party);
    }catch(cause){setError(cause instanceof Error?cause.message:'Failed to create watch party.');}
    finally{setBusy(false);}
  };

  const importF1=async()=>{
    if(!catalog||!f1CanImport||busy)return;
    setBusy(true);setError('');
    try{
      const driverMultiplierBasisPoints=Object.fromEntries(catalog.drivers.map(driver=>[driver.key,predictionOddsBasisPoints(driverMultipliers[driver.key]??'')]));
      const driverNameOverrides=Object.fromEntries(catalog.drivers.map(driver=>[driver.key,driverNames[driver.key]??driver.name]));
      const response=await fetch('/api/admin/watch-parties/f1-calendar',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({raceIds:selectedRaces,entryFeeRupees:fee,entryCoins:reward,driverMultipliers:driverMultiplierBasisPoints,driverNames:driverNameOverrides})});
      const data=await readApiResponse<{createdCount:number;skippedCount:number;error?:string}>(response,'Failed to import F1 races.');
      if(!response.ok)throw new Error(data.error||'Failed to import F1 races.');
      onImported(data);
    }catch(cause){setError(cause instanceof Error?cause.message:'Failed to import F1 races.');setReviewing(false);}
    finally{setBusy(false);}
  };

  return <AdminBookingModalShell onClose={()=>!busy&&onClose()} labelledBy="create-watch-party-title">
    <div className="watch-create-modal-head"><div><div className="watch-create-kicker">EmiGuild Watch Parties</div><h2 id="create-watch-party-title"><Tv size={18}/> {reviewing?'Confirm F1 Import':'Create Watch Party'}</h2></div><button className="watch-create-close" type="button" onClick={onClose} disabled={busy} aria-label="Close"><X size={18}/></button></div>
    {reviewing&&catalog?<div className="wp-review">
      <Activity size={30}/><h3>Import {selectedRaces.length} F1 {selectedRaces.length===1?'race':'races'}?</h3>
      <p>Each event will include all {catalog.drivers.length} drivers. Existing imported races will be skipped.</p>
      <div><span>Event Entry Fee</span><strong>Rs {fee.toLocaleString('en-IN')}</strong></div>
      <div><span>Check-in EMIC Reward</span><strong>{reward.toLocaleString('en-IN')} EMIC</strong></div>
      {error&&<div className="wp-create-error" role="alert">{error}</div>}
      <div className="wp-create-actions"><button className="btn btn-ghost" type="button" onClick={()=>setReviewing(false)} disabled={busy}>Back</button><button className="btn btn-primary" type="button" onClick={importF1} disabled={busy}>{busy?<><Loader2 size={16} className="wp-spin"/>Importing...</>:<><Activity size={16}/>Confirm Import</>}</button></div>
    </div>:<form className="wp-create" onSubmit={format==='TEAM'?submitTeam:(event)=>{event.preventDefault();if(f1CanImport)setReviewing(true);}}>
      <fieldset><legend>Event Format</legend><div className="wp-formats">
        <button type="button" className={format==='TEAM'?'selected':''} aria-pressed={format==='TEAM'} onClick={()=>chooseFormat('TEAM')}><Tv size={18}/><span><strong>Team Match</strong><small>Two teams, optional draw</small></span></button>
        <button type="button" className={format==='F1'?'selected':''} aria-pressed={format==='F1'} onClick={()=>chooseFormat('F1')}><Activity size={18}/><span><strong>Import 2026 F1 Races</strong><small>Select one or more races</small></span></button>
      </div></fieldset>
      {format==='TEAM'?<>
        <div className="wp-create-grid"><label><span>Team A</span><input className="form-input" value={form.homeTeam} onChange={event=>setForm(current=>({...current,homeTeam:event.target.value}))} maxLength={120} required/></label><label><span>Team B</span><input className="form-input" value={form.awayTeam} onChange={event=>setForm(current=>({...current,awayTeam:event.target.value}))} maxLength={120} required/></label></div>
        <label className="wp-draw"><input type="checkbox" checked={includeDraw} onChange={event=>setIncludeDraw(event.target.checked)}/><span><strong>Include Draw / Tie</strong><small>Add a third Fan Pick choice.</small></span></label>
        <div className="wp-create-grid"><label><span>Event Title <small>(optional)</small></span><input className="form-input" value={form.title} onChange={event=>setForm(current=>({...current,title:event.target.value}))} maxLength={140}/></label><label><span>Event Start (IST)</span><input className="form-input" type="datetime-local" value={form.kickoffAt} onChange={event=>setForm(current=>({...current,kickoffAt:event.target.value}))} required/></label><label><span>Venue <small>(optional)</small></span><input className="form-input" value={form.venue} onChange={event=>setForm(current=>({...current,venue:event.target.value}))} maxLength={180}/></label></div>
        <fieldset><legend>Fan Pick Reward Multipliers</legend><div className="wp-odds">{keys.map(key=><label key={key}><span>{key==='HOME'?form.homeTeam||'Team A':key==='AWAY'?form.awayTeam||'Team B':'Draw / Tie'}</span><div><input className="form-input" inputMode="decimal" value={multipliers[key]} onChange={event=>setMultipliers(current=>({...current,[key]:event.target.value}))} aria-invalid={odds[key]==null}/><b>x</b></div></label>)}</div></fieldset>
      </>:busy&&!catalog?<div className="loading-state"><div className="spinner"/>Loading F1 calendar...</div>:catalog&&<>
        <fieldset><div className="wp-section-head"><legend>2026 Grand Prix Races</legend><div><button type="button" onClick={()=>setSelectedRaces(catalog.races.map(race=>race.id))}>Select All</button><button type="button" onClick={()=>setSelectedRaces([])}>Clear</button></div></div><div className="wp-races">{catalog.races.map(race=>{const selected=selectedRaces.includes(race.id);return <button type="button" key={race.id} className={selected?'selected':''} aria-pressed={selected} onClick={()=>setSelectedRaces(current=>selected?current.filter(id=>id!==race.id):[...current,race.id])}><span className="wp-check">{selected&&<Check size={14}/>}</span><span><strong>{race.shortName}</strong><small>{race.venue}</small></span><time>{formatIst(race.kickoffAt)}</time></button>;})}</div></fieldset>
        <fieldset><legend>Driver Reward Multipliers</legend><div className="wp-driver-search"><Search size={15}/><input className="form-input" type="search" placeholder="Search driver or team" value={driverSearch} onChange={event=>setDriverSearch(event.target.value)}/></div><div className="wp-drivers">{visibleDrivers.map(driver=><label key={driver.key}><span>{editingDriverName===driver.key?<span className="wp-driver-name-edit"><input className="form-input" value={driverNames[driver.key]??driver.name} onChange={event=>setDriverNames(current=>({...current,[driver.key]:event.target.value}))} onBlur={()=>setEditingDriverName(null)} onKeyDown={event=>{if(event.key==='Enter'||event.key==='Escape')setEditingDriverName(null);}} aria-label={`Edit name for ${driver.name}`} autoFocus maxLength={80}/></span>:<span className="wp-driver-name-row"><strong>{driverNames[driver.key]??driver.name}</strong><button type="button" className="wp-edit-name-btn" onClick={(event)=>{event.preventDefault();setEditingDriverName(driver.key);}} aria-label={`Edit ${driver.name}'s display name`}><Pencil size={12}/></button></span>}<small>{driver.team}</small></span><span className="wp-multiplier"><input className="form-input" inputMode="decimal" value={driverMultipliers[driver.key]??''} onChange={event=>setDriverMultipliers(current=>({...current,[driver.key]:event.target.value}))} aria-label={`${driverNames[driver.key]??driver.name} reward multiplier`} aria-invalid={predictionOddsBasisPoints(driverMultipliers[driver.key]??'')==null}/><b>x</b></span></label>)}</div></fieldset>
      </>}
      <div className="wp-create-grid wp-money"><label><span>Event Entry Fee (₹)</span><input className="form-input" type="number" min="0" max="100000" step="1" value={form.entryFeeRupees} onChange={event=>setForm(current=>({...current,entryFeeRupees:event.target.value}))} required/><small>Amount collected at the counter.</small></label><label><span>Check-in EMIC Reward</span><input className="form-input" type="number" min="1" max="100000" step="1" value={form.entryCoins} onChange={event=>setForm(current=>({...current,entryCoins:event.target.value}))} required/><small>Added once when staff checks in the guest.</small></label></div>
      {error&&<div className="wp-create-error" role="alert">{error}</div>}
      <div className="wp-create-actions"><button className="btn btn-ghost" type="button" onClick={onClose} disabled={busy}>Cancel</button><button className="btn btn-primary" type="submit" disabled={format==='TEAM'?!teamCanCreate||busy:!f1CanImport||busy}>{busy?<><Loader2 size={16} className="wp-spin"/>Loading...</>:format==='TEAM'?<><Tv size={16}/>Create Watch Party</>:<><Activity size={16}/>Review {selectedRaces.length} {selectedRaces.length===1?'Race':'Races'}</>}</button></div>
    </form>}
    <style jsx>{`
      .watch-create-modal-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:16px}.watch-create-modal-head h2{display:flex;align-items:center;gap:8px;margin:3px 0 0}.watch-create-kicker{color:#67e8f9;font-size:.7rem;font-weight:900;text-transform:uppercase}.watch-create-close{width:44px;height:44px;display:grid;place-items:center;border:1px solid rgba(148,163,184,.22);border-radius:8px;color:#cbd5e1;background:#0b1321}.wp-create,.wp-review{display:grid;gap:16px}.wp-create fieldset{min-width:0;margin:0;padding:0;border:0}.wp-create legend,.wp-create label>span{display:block;margin-bottom:6px;color:#cbd5e1;font-size:.76rem;font-weight:800}.wp-formats{display:grid;grid-template-columns:1fr 1fr;gap:8px}.wp-formats button{min-height:64px;display:flex;align-items:center;gap:10px;padding:10px;border:1px solid rgba(148,163,184,.25);border-radius:8px;color:#cbd5e1;background:#0b1321;text-align:left}.wp-formats button.selected{border-color:#22d3ee;color:#67e8f9;background:#0d2530}.wp-formats span{display:grid;gap:2px}.wp-formats small,.wp-create label>small,.wp-draw small{color:#94a3b8;font-size:.7rem}.wp-create-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}.wp-draw{min-height:52px;display:flex;align-items:center;gap:10px;padding:10px;border:1px solid rgba(148,163,184,.22);border-radius:8px;background:#0b1321}.wp-draw input{width:20px;height:20px}.wp-draw span{display:grid!important;gap:2px;margin:0!important}.wp-odds{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}.wp-odds label>div,.wp-multiplier{display:flex;align-items:center;gap:5px}.wp-odds b,.wp-multiplier b{color:#67e8f9}.wp-section-head{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:7px}.wp-section-head legend{margin:0}.wp-section-head div{display:flex;gap:5px}.wp-section-head button{min-height:36px;padding:0 9px;border:1px solid rgba(34,211,238,.25);border-radius:6px;color:#67e8f9;background:#0b1321;font-size:.7rem;font-weight:800}.wp-races{display:grid;max-height:290px;overflow:auto;gap:5px}.wp-races>button{min-height:56px;display:grid;grid-template-columns:24px minmax(0,1fr) auto;align-items:center;gap:8px;padding:7px 9px;border:1px solid rgba(148,163,184,.2);border-radius:7px;color:#cbd5e1;background:#0b1321;text-align:left}.wp-races>button.selected{border-color:#22d3ee;background:#0d2530}.wp-races span:nth-child(2){display:grid;gap:2px}.wp-races small,.wp-drivers small{color:#94a3b8;font-size:.67rem}.wp-races time{max-width:128px;color:#94a3b8;font-size:.68rem;text-align:right}.wp-check{width:22px;height:22px;display:grid!important;place-items:center;border:1px solid rgba(34,211,238,.35);border-radius:5px;color:#061016;background:transparent}.selected .wp-check{background:#22d3ee}.wp-driver-search{position:relative;margin-bottom:7px}.wp-driver-search svg{position:absolute;left:10px;top:50%;transform:translateY(-50%);color:#94a3b8}.wp-driver-search input{padding-left:34px}.wp-drivers{display:grid;max-height:310px;overflow:auto;border:1px solid rgba(148,163,184,.18);border-radius:7px}.wp-drivers label{min-height:52px;display:grid;grid-template-columns:minmax(0,1fr) 92px;align-items:center;gap:8px;padding:6px 9px;border-bottom:1px solid rgba(148,163,184,.12)}.wp-drivers label:last-child{border-bottom:0}.wp-drivers label>span:first-child{display:grid;gap:1px;margin:0}.wp-driver-name-row{display:flex;align-items:center;gap:5px}.wp-driver-name-row strong{min-width:0;overflow-wrap:anywhere}.wp-edit-name-btn{display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;flex:0 0 22px;padding:0;border:1px solid rgba(34,211,238,.3);border-radius:4px;color:#67e8f9;background:transparent;cursor:pointer;transition:background .15s,border-color .15s}.wp-edit-name-btn:hover{background:rgba(34,211,238,.12);border-color:#22d3ee}.wp-driver-name-edit{display:block}.wp-driver-name-edit input{width:100%;min-height:30px;padding:3px 7px;border:1px solid #22d3ee;border-radius:5px;color:#f8fafc;background:#0b1321;font:inherit;font-size:.78rem;font-weight:700}.wp-multiplier{margin:0!important}.wp-multiplier input{min-width:0;padding:7px}.wp-create-error{padding:10px;border-left:3px solid #fb7185;color:#fecdd3;background:#24131b;font-size:.78rem}.wp-create-actions{display:flex;justify-content:flex-end;gap:8px}.wp-review{place-items:center;text-align:center}.wp-review h3,.wp-review p{margin:0}.wp-review p{color:#94a3b8;font-size:.8rem}.wp-review>div:not(.wp-create-actions):not(.wp-create-error){width:100%;display:flex;justify-content:space-between;gap:10px;padding:10px;border:1px solid rgba(148,163,184,.18);border-radius:7px}.wp-review strong{color:#67e8f9}.wp-spin{animation:wpCreateSpin .8s linear infinite}@keyframes wpCreateSpin{to{transform:rotate(360deg)}}@media(max-width:560px){.wp-formats,.wp-create-grid,.wp-odds{grid-template-columns:1fr}.wp-create-actions{position:sticky;bottom:0;padding-top:10px;background:#080d16}.wp-create-actions .btn{flex:1;min-height:46px;justify-content:center}.wp-races>button{grid-template-columns:24px minmax(0,1fr)}.wp-races time{grid-column:2;text-align:left}.wp-money{grid-template-columns:1fr 1fr}.wp-money label>small{display:none}}@media(max-width:360px){.wp-money{grid-template-columns:1fr}.wp-formats button{padding:8px}.wp-drivers label{grid-template-columns:minmax(0,1fr) 84px}}@media(prefers-reduced-motion:reduce){.wp-spin{animation:none}}
    `}</style>
  </AdminBookingModalShell>;
}
