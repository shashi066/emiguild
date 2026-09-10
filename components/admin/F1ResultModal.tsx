'use client';

import { Activity, Check, Loader2, Search, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import AdminBookingModalShell from '@/components/admin/AdminBookingModalShell';
import { formatRewardLabel } from '@/lib/watch-party-presentation';

type Option = { key:string; label:string; multiplier:string };

export function F1ResultModal({
  raceTitle,
  options,
  pending,
  onClose,
  onConfirm,
}:{
  raceTitle:string;
  options:Option[];
  pending:boolean;
  onClose:()=>void;
  onConfirm:(optionKey:string)=>Promise<boolean>;
}) {
  const [query,setQuery]=useState('');
  const [selectedKey,setSelectedKey]=useState('');
  const visible=useMemo(()=>{
    const normalized=query.trim().toLowerCase();
    return options.filter(option=>!normalized||option.label.toLowerCase().includes(normalized));
  },[options,query]);
  const selected=options.find(option=>option.key===selectedKey);

  return <AdminBookingModalShell onClose={()=>!pending&&onClose()} labelledBy="f1-result-title">
    <div className="f1-result-head"><div><span>Official F1 Result</span><h2 id="f1-result-title"><Activity size={19}/>{raceTitle}</h2></div><button type="button" onClick={onClose} disabled={pending} aria-label="Close"><X size={18}/></button></div>
    <p className="f1-result-help">Choose the winning driver. This settles every Fan Pick and cannot be undone.</p>
    <label className="f1-result-search"><Search size={16}/><input className="form-input" type="search" value={query} onChange={event=>setQuery(event.target.value)} placeholder="Search driver" autoFocus/></label>
    <div className="f1-result-list" role="radiogroup" aria-label="Winning driver">
      {visible.map(option=><button key={option.key} type="button" role="radio" aria-checked={selectedKey===option.key} className={selectedKey===option.key?'selected':''} onClick={()=>setSelectedKey(option.key)} disabled={pending}><span>{option.label}<small>{formatRewardLabel(option.multiplier)}</small></span>{selectedKey===option.key&&<Check size={17}/>}</button>)}
      {visible.length===0&&<div className="f1-result-empty">No drivers match your search.</div>}
    </div>
    <div className="f1-result-actions"><button className="btn btn-ghost" type="button" onClick={onClose} disabled={pending}>Cancel</button><button className="btn btn-primary" type="button" disabled={!selected||pending} onClick={async()=>{if(selected&&await onConfirm(selected.key))onClose();}}>{pending?<><Loader2 size={16} className="f1-result-spin"/>Applying...</>:<>Confirm {selected?.label??'Winner'}</>}</button></div>
    <style jsx>{`
      .f1-result-head{display:flex;align-items:flex-start;justify-content:space-between;gap:10px}.f1-result-head span{color:#67e8f9;font-size:.68rem;font-weight:900;text-transform:uppercase}.f1-result-head h2{display:flex;align-items:center;gap:8px;margin:3px 0 0;font-size:1rem}.f1-result-head button{width:44px;height:44px;display:grid;place-items:center;border:1px solid rgba(148,163,184,.2);border-radius:7px;color:#cbd5e1;background:#0b1321}.f1-result-help{margin:10px 0;color:#94a3b8;font-size:.78rem;line-height:1.45}.f1-result-search{position:relative;display:block}.f1-result-search svg{position:absolute;top:50%;left:10px;transform:translateY(-50%);color:#94a3b8}.f1-result-search input{width:100%;padding-left:34px}.f1-result-list{display:grid;max-height:340px;overflow:auto;margin-top:8px;border:1px solid rgba(148,163,184,.18);border-radius:7px}.f1-result-list button{min-height:52px;display:flex;align-items:center;justify-content:space-between;gap:8px;padding:7px 10px;border:0;border-bottom:1px solid rgba(148,163,184,.12);color:#e2e8f0;background:#0b1321;text-align:left}.f1-result-list button:last-child{border-bottom:0}.f1-result-list button.selected{color:#cffafe;background:#0d2530}.f1-result-list span{display:grid;gap:2px}.f1-result-list small{color:#94a3b8;font-size:.68rem}.f1-result-empty{padding:18px;color:#94a3b8;text-align:center}.f1-result-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:12px}.f1-result-spin{animation:f1ResultSpin .8s linear infinite}@keyframes f1ResultSpin{to{transform:rotate(360deg)}}@media(max-width:420px){.f1-result-actions .btn{min-width:0;flex:1;justify-content:center}}@media(prefers-reduced-motion:reduce){.f1-result-spin{animation:none}}
    `}</style>
  </AdminBookingModalShell>;
}
