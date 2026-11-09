"use client";
import { useState, useRef } from 'react';
import { Settings, RefreshCw, Ticket } from 'lucide-react';
import { AdminModalShell } from './AdminModalShell';
import { AdminGuess36 } from './AdminGuess36';
import type { MineAdminData } from '@/lib/guess-36-mines';
import styles from './Guess36MinesAdmin.module.css';
export function AdminGuess36Mines({ initialData }: { initialData: MineAdminData }) {
 const [data, setData] = useState(initialData);
 const [busy, setBusy] = useState(false);
 const [error, setError] = useState('');
 const [legacy, setLegacy] = useState(false);
 const [settings, setSettings] = useState(false);
 const [enabled, setEnabled] = useState(data.enabled);
 const gate = useRef(false);
 async function load(page = data.page) {
  if (gate.current) return;
  gate.current = true; setBusy(true); setError('');
  try { const res = await fetch(`/api/admin/guess-36/mines?page=${page}`, { cache: 'no-store' }); const next = await res.json(); if (!res.ok) throw Error(next.error); setData(next); }
  catch (e) { setError(e instanceof Error ? e.message : 'Could not load history. Retry.'); }
  finally { gate.current = false; setBusy(false); }
 }
 async function save() {
  if (gate.current) return;
  gate.current = true; setBusy(true); setError('');
  try { const res = await fetch('/api/admin/guess-36/mines', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ enabled }) }); const next = await res.json(); if (!res.ok) throw Error(next.error); setData(prev => ({ ...prev, enabled: next.enabled })); setSettings(false); }
  catch (e) { setError(e instanceof Error ? e.message : 'Could not save.'); }
  finally { gate.current = false; setBusy(false); }
 }
 return <div className={styles.page}><header className={styles.header}><div><h1>Guess 36</h1><span>Guild Expedition | {data.enabled ? 'Open' : 'Paused'} | {data.total} runs</span></div><div><button className="btn btn-secondary btn-sm" disabled={busy} onClick={() => void load()}><RefreshCw size={15} /> Refresh</button><button className="btn btn-secondary btn-sm" onClick={() => { setEnabled(data.enabled); setSettings(true); }}><Settings size={15} /> Settings</button></div></header>
 <nav className={styles.tabs} aria-label="Guess 36 history"><button aria-pressed={!legacy} onClick={() => setLegacy(false)}>Guild Expedition</button><button aria-pressed={legacy} onClick={() => setLegacy(true)}>Legacy draws & rewards</button></nav>
 {error && <p role="alert" className={styles.error}>{error}</p>}
 {legacy ? <AdminGuess36 legacyOnly /> : <><div className={styles.scroll}><table className={styles.table}><thead><tr><th>Member</th><th>Date / started</th><th>Green</th><th>Result</th><th>Reward / ticket</th><th>Action</th></tr></thead><tbody>{data.rows.map(row => <tr key={row.id}><td>{row.member.name}<small>{row.member.email}</small></td><td>{row.date}<small>{row.startedAt ? new Date(row.startedAt).toLocaleTimeString('en-IN',{timeZone:'Asia/Kolkata',hour:'numeric',minute:'2-digit'}) : ''} IST</small></td><td>{row.greens}/5</td><td>{row.status?.replaceAll('_',' ').toLowerCase()}</td><td>{row.reward?.name ?? '—'}{row.ticket && <small>{row.ticket.code} | {row.ticket.status === 'REDEEMED' ? 'Used' : new Date(row.ticket.expiresAt) <= new Date() ? 'Expired' : 'Available'}</small>}</td><td>{row.ticket?.status === 'UNUSED' && new Date(row.ticket.expiresAt) > new Date() && <Redeem id={row.ticket.id} onDone={() => void load()} />}</td></tr>)}{!data.rows.length && <tr><td colSpan={6}>No Guild Expeditions yet.</td></tr>}</tbody></table></div><div className={styles.pagination}><button className="btn btn-ghost btn-sm" disabled={busy || data.page === 1} onClick={() => void load(data.page - 1)}>Previous</button><span>Page {data.page}</span><button className="btn btn-ghost btn-sm" disabled={busy || data.page * 20 >= data.total} onClick={() => void load(data.page + 1)}>Next</button></div></>}
 {settings && <AdminModalShell labelledBy="mine-admin-settings" onClose={() => { if (!busy) setSettings(false); }}><section className={styles.modal}><h2 id="mine-admin-settings">Guild Expedition settings</h2><label className={styles.checkbox}><input type="checkbox" checked={enabled} disabled={busy} onChange={e => setEnabled(e.target.checked)} /> Allow new runs</label><p>5 green | 5 red | 26 yellow | 90 seconds</p><ol>{data.rules.rewards.map(r => <li key={r.name}>{r.name}</li>)}</ol><p>Counter redemption. Tickets expire at the end of the following IST day. Gaming-time rewards apply to PS5 gaming; extras remain payable. Bronze Pass uses the existing 10-hour entitlement.</p><p>Pausing preserves active runs and rewards.</p><div className={styles.header}><button className="btn btn-secondary" disabled={busy} onClick={() => setSettings(false)}>Back</button><button className="btn btn-primary" disabled={busy} onClick={() => void save()}>{busy ? 'Saving...' : 'Save'}</button></div></section></AdminModalShell>}
 </div>;
}
function Redeem({ id, onDone }: { id: string; onDone: () => void }) {
 const [open,setOpen] = useState(false); const [busy,setBusy] = useState(false); const [error,setError] = useState(''); const gate = useRef(false);
 async function redeem() { if(gate.current)return; gate.current=true;setBusy(true);try { const res=await fetch(`/api/admin/guess-36/rewards/${encodeURIComponent(id)}/redeem`,{method:'POST'});const data=await res.json();if(!res.ok)throw Error(data.error);setOpen(false);onDone(); }catch(e){setError(e instanceof Error?e.message:'Check reward status.');}finally{gate.current=false;setBusy(false);} }
 return <><button className="btn btn-secondary btn-sm" onClick={()=>setOpen(true)}><Ticket size={14}/> Redeem</button>{open&&<AdminModalShell labelledBy={`redeem-${id}`} onClose={()=>{if(!busy)setOpen(false);}}><section className={styles.modal}><h2 id={`redeem-${id}`}>Confirm counter redemption</h2><p>Provide the displayed reward, then mark this ticket used.</p>{error&&<p role="alert">{error}</p>}<div className={styles.header}><button className="btn btn-secondary" disabled={busy} onClick={()=>setOpen(false)}>Back</button><button className="btn btn-primary" disabled={busy} onClick={()=>void redeem()}>{busy?'Confirming...':'Mark used'}</button></div></section></AdminModalShell>}</>;
}
