'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { MessageCircle, X, ArrowLeft, RotateCcw, Send } from 'lucide-react';
import type { AssistantCard, AssistantMessage, BookingQuote, GuidedState, GuidedView } from '@/types/assistant';
import { changeSelection, dateLabel, timeLabel, priceLabel, guidedStateSchema } from '@/lib/assistant/flow-state';
import { AssistantEventParser } from '@/lib/assistant/stream';

const TASKS = [ ['Book a Slot', 'BOOK'], ['Next Available', 'NEXT'], ['My Bookings', 'BOOKINGS'], ['Daily Spin', 'SPIN'], ['Games', 'GAMES'], ['Prices', 'PRICES'] ] as const;
const HOME: GuidedView = { state: { task: 'HOME' }, title: 'What would you like to do?', options: TASKS.map(([label, task]) => ({ label, state: { task } })) };
const PENDING = 'emi-assistant-pending';

function Confirmation({ card, busy, confirm }: { card: AssistantCard; busy: boolean; confirm: () => void }) {
  const quote = card.data?.quote as BookingQuote | undefined;
  const booking = card.data?.booking as { stationName?: string; date: string; startTime: string; endTime: string; totalPrice: number } | undefined;
  return <div className={`emi-card emi-card-${card.kind}`}>
    <strong>{card.title}</strong>
    {card.description && <p>{card.description}</p>}
    {quote && <dl className="emi-details">
      <div><dt>Station</dt><dd>{quote.stationName}</dd></div>
      <div><dt>When</dt><dd>{dateLabel(quote.date)} · {timeLabel(quote.startTime)}–{timeLabel(quote.endTime)} IST</dd></div>
      <div><dt>Duration</dt><dd>{quote.duration} hr</dd></div>
      <div><dt>Extra controllers</dt><dd>{quote.extraControllers} · {priceLabel(quote.controllerCharge)}</dd></div>
      <div><dt>Benefit</dt><dd>{quote.benefitLabel}</dd></div>
      {quote.notes && <div><dt>Game request</dt><dd>{quote.notes}</dd></div>}
      <div><dt>Normal price</dt><dd>{priceLabel(quote.normalPrice)}</dd></div>
      {quote.discount > 0 && <div><dt>Discount</dt><dd>{quote.discount}% · −{priceLabel(quote.normalPrice - quote.totalPrice)}</dd></div>}
      {quote.benefitMode === 'HOUR_PASS' && <div><dt>Pass usage</dt><dd>{quote.duration} hr · {quote.passHoursRemaining} hr left</dd></div>}
      <div className="emi-total"><dt>Total</dt><dd>{priceLabel(quote.totalPrice)}</dd></div>
    </dl>}
    {booking && card.kind === 'cancellation_confirmation' && <dl className="emi-details">
      <div><dt>Station</dt><dd>{booking.stationName}</dd></div>
      <div><dt>When</dt><dd>{dateLabel(booking.date)} · {timeLabel(booking.startTime)}–{timeLabel(booking.endTime)} IST</dd></div>
      <div><dt>Amount</dt><dd>{priceLabel(booking.totalPrice)}</dd></div>
    </dl>}
    {card.actionToken && <button type="button" className="btn btn-primary" disabled={busy} onClick={confirm}>{busy ? 'Confirming…' : card.actionLabel ?? 'Confirm'}</button>}
  </div>;
}

function NextFilters({ view, busy, navigate }: { view: GuidedView; busy: boolean; navigate: (state: GuidedState) => void }) {
  const initial = view.state;
  const [filter, setFilter] = useState(initial.stationId ?? initial.stationQuery ?? '');
  const [date, setDate] = useState(initial.date ?? view.nextFilters!.dates[0]);
  const [duration, setDuration] = useState(initial.duration ?? 1);
  const [quantity, setQuantity] = useState(initial.quantity ?? 1);
  const [afterTime, setAfterTime] = useState(initial.afterTime ?? '');
  return <form className="emi-fields" onSubmit={(event) => {
    event.preventDefault();
    const stationId = view.nextFilters!.stations.some((s) => s.id === filter) ? filter : undefined;
    navigate({ task: 'NEXT', search: true, stationId, stationQuery: stationId ? undefined : filter || undefined, date, duration, quantity, afterTime: afterTime || undefined });
  }}>
    <label>Station<select value={filter} onChange={(e) => setFilter(e.target.value)}><option value="">Any station</option><option value="ps5">PS5 stations</option><option value="racing">Racing stations</option>{view.nextFilters!.stations.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
    <label>From date<select value={date} onChange={(e) => setDate(e.target.value)}>{view.nextFilters!.dates.map((d) => <option key={d} value={d}>{dateLabel(d, view.nextFilters!.dates[0])}</option>)}</select></label>
    <label>After time<select value={afterTime} onChange={(e) => setAfterTime(e.target.value)}><option value="">Any time</option>{Array.from({ length: 48 }, (_, i) => `${String(Math.floor(i / 2)).padStart(2, '0')}:${i % 2 ? '30' : '00'}`).map((time) => <option key={time} value={time}>{timeLabel(time)}</option>)}</select></label>
    <label>Duration<select value={duration} onChange={(e) => setDuration(Number(e.target.value))}>{Array.from({ length: 24 }, (_, i) => (i + 1) / 2).map((d) => <option key={d} value={d}>{d} hr</option>)}</select></label>
    <label>Stations needed<select value={quantity} onChange={(e) => setQuantity(Number(e.target.value))}>{[1, 2, 3, 4, 5, 6].map((q) => <option key={q} value={q}>{q}</option>)}</select></label>
    <button className="btn btn-primary" disabled={busy}>Find slots</button>
  </form>;
}

export function EmiAssistant() {
  const pathname = usePathname();
  const router = useRouter();
  const { data: session, status: sessionStatus } = useSession();
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<GuidedView>(HOME);
  const [busy, setBusy] = useState(false);
  const [mutating, setMutating] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [typing, setTyping] = useState(false);
  const [input, setInput] = useState('');
  const [query, setQuery] = useState('');
  const [customGame, setCustomGame] = useState('');
  const [retry, setRetry] = useState<GuidedState | null>(null);
  const [retryText, setRetryText] = useState('');
  const history = useRef<GuidedState[]>([]);
  const transcript = useRef<AssistantMessage[]>([]);
  const viewRef = useRef(view);
  viewRef.current = view;
  const abort = useRef<AbortController | null>(null);
  const sequence = useRef(0);
  const actionLock = useRef(false);
  const panel = useRef<HTMLDivElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const launcher = useRef<HTMLButtonElement>(null);
  const chatInput = useRef<HTMLInputElement>(null);
  const hidden = ['/login', '/register', '/forgot-password'].includes(pathname);

  const close = useCallback(() => { setOpen(false); requestAnimationFrame(() => launcher.current?.focus()); }, []);
  useEffect(() => {
    if (!open || hidden) return;
    heading.current?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); close(); return; }
      if (event.key !== 'Tab') return;
      const elements = Array.from(panel.current?.querySelectorAll<HTMLElement>('button:not(:disabled),a,input:not(:disabled),select:not(:disabled),[tabindex="0"]') ?? []).filter((e) => e.getClientRects().length);
      const first = elements[0], last = elements.at(-1);
      if (!first || !last) return;
      if (!panel.current?.contains(document.activeElement) || document.activeElement === heading.current) { event.preventDefault(); (event.shiftKey ? last : first).focus(); }
      else if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', keydown);
    return () => document.removeEventListener('keydown', keydown);
  }, [open, hidden, close]);
  useEffect(() => { if (open) heading.current?.focus(); }, [view, open]);
  useEffect(() => () => abort.current?.abort(), []);

  const navigate = useCallback(async (state: GuidedState, remember = true) => {
    if (actionLock.current) return;
    abort.current?.abort();
    const id = ++sequence.current;
    const controller = new AbortController(); abort.current = controller;
    const previous = viewRef.current.state;
    setBusy(true); setError(''); setNotice('Loading options…'); setRetry(null); setRetryText('');
    setView((v) => ({ ...v, card: undefined }));
    try {
      const response = await fetch('/api/assistant/guided', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(state), signal: controller.signal });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? 'Unable to load options.');
      if (sequence.current !== id) return;
      if (remember) history.current = [...history.current, previous].slice(-24);
      setView(data); setQuery(state.query ?? ''); setCustomGame(''); setNotice('Options ready.');
    } catch (failure) {
      if (sequence.current !== id || controller.signal.aborted) return;
      setRetry(state); setError(`${state.completed?.length ? `${state.completed.length} booking(s) succeeded. The next booking was not made. ` : ''}${failure instanceof Error ? failure.message : 'Unable to load options.'}`);
    } finally { if (sequence.current === id) { setBusy(false); setNotice(''); abort.current = null; } }
  }, []);

  const account = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    if (sessionStatus === 'loading') return;
    const id = session?.user?.id ?? null;
    if (account.current !== undefined && account.current !== id) {
      abort.current?.abort(); sequence.current++; history.current = []; transcript.current = []; setView(HOME); setError(''); setBusy(false);
    }
    account.current = id;
    if (!id) return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('assistant') !== 'resume') return;
    try {
      const raw = sessionStorage.getItem(PENDING); sessionStorage.removeItem(PENDING);
      params.delete('assistant'); window.history.replaceState({}, '', `${window.location.pathname}${params.size ? `?${params}` : ''}${window.location.hash}`);
      if (!raw) return;
      const state = guidedStateSchema.parse(JSON.parse(raw));
      // Login always returns to fresh eligibility and explicit benefit selection.
      delete state.benefitMode; delete state.hourPassId; delete state.appliedBenefitType;
      setOpen(true); void navigate(state, false);
    } catch { setError('Your saved selections expired. Please start again.'); }
  }, [session?.user?.id, sessionStatus, navigate]);

  const startOver = () => {
    if (actionLock.current) return;
    abort.current?.abort(); sequence.current++; history.current = []; transcript.current = [];
    setView(HOME); setError(''); setNotice(''); setBusy(false); setRetry(null); setRetryText(''); setInput('');
  };
  const login = () => {
    try { sessionStorage.setItem(PENDING, JSON.stringify(view.state)); } catch { setError('Please allow tab storage to keep your selections during sign-in.'); return; }
    const url = new URL(window.location.href); url.searchParams.set('assistant', 'resume');
    router.push(`/login?callbackUrl=${encodeURIComponent(url.pathname + url.search + url.hash)}`);
  };
  const confirm = async () => {
    if (!view.card?.actionToken || actionLock.current) return;
    const current = view; actionLock.current = true; setMutating(true); setError('');
    try {
      const response = await fetch('/api/assistant/actions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: current.card!.actionToken }) });
      const data = await response.json();
      if (response.status === 409 && data.code === 'QUOTE_STALE' && data.card) { setView({ ...current, card: data.card }); return; }
      if (!response.ok) throw new Error(data.error ?? 'The action could not be completed.');
      history.current = []; transcript.current = [];
      const remaining = current.state.queue ?? [];
      const completed = [...(current.state.completed ?? []), ...(current.state.stationId ? [current.state.stationId] : [])];
      let options = remaining.length ? [{ label: 'Continue to next station', state: {
        task: 'BOOK' as const, stationId: remaining[0], date: current.state.date, startTime: current.state.startTime,
        duration: current.state.duration, notes: current.state.notes, gameChosen: current.state.gameChosen,
        queue: remaining.slice(1), completed,
      } }] : HOME.options;
      let description: string | undefined;
      if (remaining.length) {
        try {
          const check = await fetch('/api/assistant/guided', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(options[0].state) });
          const checked = await check.json();
          if (!check.ok) {
            description = `${completed.length} booking(s) confirmed. The next station was not booked: ${checked.error ?? 'please check availability again.'}`;
            options = [{ label: 'Find another slot', state: { task: 'NEXT', date: current.state.date, duration: current.state.duration, search: false } }, ...HOME.options];
          }
        } catch {
          description = `${completed.length} booking(s) confirmed. Continue to recheck the next station when your connection returns.`;
        }
      }
      setView({ state: { task: 'HOME' }, title: 'Done', description, options, card: data.card });
      setNotice(remaining.length ? 'Booking confirmed. The next station still needs confirmation.' : 'Action completed.');
    } catch (failure) {
      setView({ ...current, card: undefined }); setRetry(current.state);
      setError(`${current.state.completed?.length ? `${current.state.completed.length} booking(s) succeeded. ` : ''}${failure instanceof Error ? failure.message : 'Unable to confirm.'}`);
    } finally { actionLock.current = false; setMutating(false); }
  };

  const send = async (text: string) => {
    if (!text.trim() || busy || mutating) return;
    const id = ++sequence.current;
    const controller = new AbortController(); abort.current = controller;
    setBusy(true); setError(''); setRetryText(''); setNotice('Finding your options…'); setInput('');
    let next: GuidedState | undefined;
    try {
      const response = await fetch('/api/assistant/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: controller.signal,
        body: JSON.stringify({ message: text, history: transcript.current.slice(-12), state: view.state }) });
      if (!response.ok || !response.body) { const data = await response.json().catch(() => ({})); throw new Error(data.error ?? 'Chat is unavailable. Please use the buttons.'); }
      const reader = response.body.getReader(), decoder = new TextDecoder(), parser = new AssistantEventParser();
      while (true) {
        const { value, done } = await reader.read();
        if (sequence.current !== id) break;
        for (const event of parser.push(decoder.decode(value, { stream: !done }))) {
          if (event.type === 'flow') next = guidedStateSchema.parse(event.state);
          if (event.type === 'status') setNotice(event.message);
          if (event.type === 'text_delta') setNotice(event.delta);
          if (event.type === 'error') throw new Error(event.message);
        }
        if (done) break;
      }
      transcript.current = [...transcript.current, { role: 'user' as const, content: text }, { role: 'assistant' as const, content: next ? `Opened ${next.task} options.` : 'Unsupported request.' }].slice(-12);
    } catch (failure) {
      if (!controller.signal.aborted) { setError(failure instanceof Error ? failure.message : 'Please use the buttons.'); setRetryText(text); }
    } finally {
      if (sequence.current === id) { setBusy(false); abort.current = null; }
    }
    if (next && sequence.current === id && !controller.signal.aborted) { setTyping(false); await navigate(next); }
  };
  if (hidden) return null;
  const disabled = busy || mutating;
  return <div className={`emi-assistant ${open ? 'is-open' : ''}`}>
    {open && <button className="emi-backdrop" tabIndex={-1} aria-label="Close Emiily assistant" onClick={close} />}
    {open && <div ref={panel} className="emi-panel" role="dialog" aria-modal="true" aria-label="Emiily, the EmiGuild assistant">
      <header className="emi-header"><div className="emi-avatar"><Image src="/images/emiily-avatar.png" alt="Emiily" width={36} height={36} unoptimized loading="eager" /></div><div><strong>Emiily</strong><span>Choose an option. Typing is optional.</span></div><button className="emi-icon-button" aria-label="Close Emiily assistant" onClick={close}><X size={19} /></button></header>
      <nav className="emi-flow-nav" aria-label="Assistant navigation">
        <button disabled={disabled || !history.current.length} onClick={() => { const previous = history.current.pop(); if (previous) void navigate(previous, false); }}><ArrowLeft size={14} />Back</button>
        <button disabled={mutating} onClick={startOver}><RotateCcw size={14} />Start over</button>
      </nav>
      <div className="emi-messages emi-flow" aria-busy={disabled}>
        {view.state.task === 'HOME' && <div className="emi-home-welcome"><p>Hi, I’m Emiily!</p><p>Welcome to EmiGuild!!</p></div>}
        <h2 ref={heading} tabIndex={-1}>{view.card?.actionToken ? 'Review your selection' : view.title}</h2>
        {view.description && <p>{view.description}</p>}
        <p className={notice ? 'emi-status' : 'emi-sr-only'} role="status">{notice}</p>
        {error && <div className="emi-error" role="alert"><p>{error}</p>{retry && <button disabled={disabled} onClick={() => void navigate(retry, false)}>Refresh options</button>}{retryText && <button disabled={disabled} onClick={() => void send(retryText)}>Retry request</button>}</div>}
        {view.state.task === 'BOOK' && view.state.stationId && <details className="emi-change"><summary>Change selections</summary>{(['stationId', 'date', 'startTime', 'duration', 'extraControllers', 'notes'] as const).filter((field) => view.state[field] !== undefined).map((field) => <button key={field} disabled={disabled} onClick={() => void navigate(changeSelection(view.state, field))}>Change {({ stationId: 'station', date: 'date', startTime: 'time', duration: 'duration', extraControllers: 'controllers', notes: 'game' })[field]}</button>)}</details>}
        {view.login && <button className="btn btn-primary" disabled={disabled} onClick={login}>Sign in</button>}
        {view.nextFilters && <NextFilters key={JSON.stringify(view.state)} view={view} busy={disabled} navigate={(state) => void navigate(state)} />}
        {view.search && <form className="emi-inline-form" onSubmit={(event: FormEvent) => { event.preventDefault(); void navigate({ ...view.state, query }, false); }}><input aria-label="Search games" placeholder="Search games" maxLength={80} value={query} onChange={(e) => setQuery(e.target.value)} /><button disabled={disabled}>Search</button></form>}
        {view.card && <Confirmation card={view.card} busy={disabled} confirm={() => void confirm()} />}
        <div className={`emi-options ${view.state.task === 'HOME' ? 'emi-options-home' : ''}`}>{view.options.map((option, i) => <button key={`${option.label}-${i}`} disabled={disabled} onClick={() => void navigate(option.state)}><strong>{option.label}</strong>{option.detail && <span>{option.detail}</span>}</button>)}</div>
        {view.customGame && <form className="emi-fields" onSubmit={(event) => { event.preventDefault(); void navigate({ ...view.state, notes: customGame.trim(), gameChosen: true, query: undefined }); }}><label>Other game request<input value={customGame} maxLength={160} onChange={(e) => setCustomGame(e.target.value)} placeholder="Optional" /></label><button disabled={disabled || !customGame.trim()}>Use this request</button></form>}
      </div>
      <button className="emi-type-toggle" disabled={mutating} onClick={() => { setTyping((v) => !v); requestAnimationFrame(() => chatInput.current?.focus()); }}>{typing ? 'Hide typing' : 'Type a request'}</button>
      {typing && <form className="emi-composer" onSubmit={(event) => { event.preventDefault(); void send(input); }}><input ref={chatInput} aria-label="Message Emiily" value={input} onChange={(e) => setInput(e.target.value)} maxLength={1000} placeholder="e.g. two PS5s after 8 PM" disabled={disabled} />{busy ? <button type="button" aria-label="Stop response" onClick={() => { abort.current?.abort(); sequence.current++; setBusy(false); setNotice('Request stopped.'); }}><X size={17} /></button> : <button aria-label="Send request" disabled={!input.trim() || mutating}><Send size={17} /></button>}</form>}
      <div className="emi-direct-links"><Link href="/book">Book</Link><Link href="/#live-station-availability">Availability</Link><Link href="/my-bookings">My bookings</Link><Link href="/games">Games</Link><Link href="/daily-spin">Daily Spin</Link></div>
    </div>}
    <button ref={launcher} className="emi-launcher" tabIndex={open ? -1 : 0} aria-label={open ? 'Close Emiily assistant' : 'Open Emiily assistant'} aria-expanded={open} onClick={() => open ? close() : setOpen(true)}>{open ? <X size={23} /> : <MessageCircle size={24} />}{!open && <span>Ask Emiily</span>}</button>
  </div>;
}
