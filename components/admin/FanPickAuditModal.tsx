'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { CheckCircle2, ListFilter, Loader2, Search, X, XCircle } from 'lucide-react';
import { AdminModalShell } from '@/components/admin/AdminModalShell';
import { EmicoinAmount } from '@/components/watch-party/EmicoinAmount';
import { readApiResponse } from '@/lib/read-api-response';

type AuditStatus = 'ALL' | 'ACTIVE' | 'WON' | 'LOST' | 'VOID';

type FanPickAuditRow = {
  id: string;
  userName: string;
  userEmail: string;
  optionLabel: string;
  multiplier: string;
  emicUsed: number;
  emicReturned: number | null;
  status: Exclude<AuditStatus, 'ALL'>;
  pickedAt: string;
};

type FanPickAuditResponse = {
  event?: {
    id: string;
    name: string;
    kickoffAt: string;
    predictionStatus: string;
  };
  summary?: {
    totalPicks: number;
    emicUsed: number;
    emicReturned: number;
    matchedPicks: number;
    unmatchedPicks: number;
  };
  picks?: FanPickAuditRow[];
  pageInfo?: {
    hasMore: boolean;
    nextSkip: number | null;
  };
  error?: string;
};

const STATUS_OPTIONS: Array<{ value: AuditStatus; label: string }> = [
  { value: 'ALL', label: 'All' },
  { value: 'ACTIVE', label: 'Pending' },
  { value: 'WON', label: 'Matched' },
  { value: 'LOST', label: 'Not Matched' },
  { value: 'VOID', label: 'Restored' },
];

function statusLabel(status: FanPickAuditRow['status']) {
  if (status === 'WON') return 'Correct Pick';
  if (status === 'LOST') return 'Did Not Match';
  if (status === 'VOID') return 'EMIC Restored';
  return 'Pending';
}

function formatIst(value: string) {
  return new Date(value).toLocaleString('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Kolkata',
  });
}

export function FanPickAuditModal({
  partyId,
  partyName,
  onClose,
}: {
  partyId: string;
  partyName: string;
  onClose: () => void;
}) {
  const [response, setResponse] = useState<FanPickAuditResponse | null>(null);
  const [queryDraft, setQueryDraft] = useState('');
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<AuditStatus>('ALL');
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async (
    nextQuery: string,
    nextStatus: AuditStatus,
    skip = 0,
    append = false,
  ) => {
    append ? setLoadingMore(true) : setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({
        q: nextQuery,
        status: nextStatus,
        skip: String(skip),
        take: '25',
      });
      const res = await fetch(`/api/admin/watch-parties/${encodeURIComponent(partyId)}/fan-picks?${params}`, {
        cache: 'no-store',
      });
      const data = await readApiResponse<FanPickAuditResponse>(res, 'Failed to load Fan Pick audit.');
      if (!res.ok) throw new Error(data.error || 'Failed to load Fan Pick audit.');
      setResponse((current) => append
        ? { ...data, picks: [...(current?.picks ?? []), ...(data.picks ?? [])] }
        : data);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Failed to load Fan Pick audit.');
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [partyId]);

  useEffect(() => {
    void load('', 'ALL');
  }, [load]);

  const submitSearch = (event: FormEvent) => {
    event.preventDefault();
    const nextQuery = queryDraft.trim();
    setQuery(nextQuery);
    void load(nextQuery, status);
  };

  const chooseStatus = (nextStatus: AuditStatus) => {
    setStatus(nextStatus);
    void load(query, nextStatus);
  };

  const summary = response?.summary;
  const picks = response?.picks ?? [];

  return (
    <AdminModalShell onClose={onClose} labelledBy="fan-pick-audit-title" size="wide" lightweight>
      <section className="fan-audit">
        <header className="fan-audit-head">
          <div>
            <span>Watch Party</span>
            <h2 id="fan-pick-audit-title">Fan Pick Audit</h2>
            <p>{response?.event?.name ?? partyName}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close Fan Pick Audit"><X size={18} /></button>
        </header>

        {summary && (
          <div className="fan-audit-summary" aria-label="Fan Pick totals">
            <div><span>Total Picks</span><strong>{summary.totalPicks}</strong></div>
            <div><span>EMIC Used</span><strong><EmicoinAmount value={summary.emicUsed} /></strong></div>
            <div><span>EMIC Returned</span><strong><EmicoinAmount value={summary.emicReturned} /></strong></div>
            <div><span>Matched</span><strong>{summary.matchedPicks}</strong></div>
            <div><span>Not Matched</span><strong>{summary.unmatchedPicks}</strong></div>
          </div>
        )}

        <form className="fan-audit-search" onSubmit={submitSearch}>
          <label>
            <Search size={15} />
            <span className="sr-only">Search player or pick</span>
            <input
              className="form-input"
              type="search"
              value={queryDraft}
              onChange={(event) => setQueryDraft(event.target.value)}
              placeholder="Search player, email or pick"
            />
          </label>
          <button className="btn btn-ghost btn-sm" type="submit" disabled={loading}>Search</button>
        </form>

        <div className="fan-audit-filters" aria-label="Filter Fan Picks by status">
          <ListFilter size={15} aria-hidden="true" />
          {STATUS_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              aria-pressed={status === option.value}
              className={status === option.value ? 'selected' : ''}
              onClick={() => chooseStatus(option.value)}
              disabled={loading}
            >
              {option.label}
            </button>
          ))}
        </div>

        {error && (
          <div className="fan-audit-error" role="alert">
            <span>{error}</span>
            <button className="btn btn-ghost btn-sm" type="button" onClick={() => void load(query, status)}>Retry</button>
          </div>
        )}

        <div className="fan-audit-list" aria-busy={loading}>
          {loading ? (
            <div className="fan-audit-loading"><Loader2 size={20} /> Loading audit...</div>
          ) : picks.length === 0 && !error ? (
            <div className="fan-audit-empty">No Fan Picks match this view.</div>
          ) : picks.map((pick) => (
            <article key={pick.id} className={`fan-audit-row status-${pick.status.toLowerCase()}`}>
              <div className="fan-audit-player">
                <strong>{pick.userName}</strong>
                <span>{pick.userEmail}</span>
                <time dateTime={pick.pickedAt}>{formatIst(pick.pickedAt)} IST</time>
              </div>
              <div className="fan-audit-choice">
                <span>Pick</span>
                <strong>{pick.optionLabel}</strong>
                <em>{pick.multiplier} reward</em>
              </div>
              <div className="fan-audit-emic"><span>EMIC Used</span><strong><EmicoinAmount value={pick.emicUsed} /></strong></div>
              <div className="fan-audit-emic"><span>EMIC Returned</span><strong>{pick.emicReturned == null ? 'Pending' : <EmicoinAmount value={pick.emicReturned} />}</strong></div>
              <div className="fan-audit-status">
                {pick.status === 'WON' ? <CheckCircle2 size={15} /> : pick.status === 'LOST' ? <XCircle size={15} /> : null}
                {statusLabel(pick.status)}
              </div>
            </article>
          ))}
        </div>

        {response?.pageInfo?.hasMore && (
          <button
            className="btn btn-ghost btn-sm fan-audit-more"
            type="button"
            disabled={loadingMore}
            onClick={() => void load(query, status, response.pageInfo?.nextSkip ?? picks.length, true)}
          >
            {loadingMore ? <><Loader2 size={15} /> Loading...</> : 'Load More'}
          </button>
        )}
      </section>

      <style jsx>{`
        .fan-audit{min-width:0;display:grid;gap:12px}.fan-audit-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}.fan-audit-head span{color:#67e8f9;font-size:.68rem;font-weight:900;text-transform:uppercase}.fan-audit-head h2,.fan-audit-head p{margin:0}.fan-audit-head h2{margin-top:2px;font-size:1.15rem}.fan-audit-head p{max-width:560px;margin-top:3px;color:#94a3b8;font-size:.76rem}.fan-audit-head>button{width:44px;height:44px;display:grid;flex:0 0 auto;place-items:center;border:1px solid rgba(148,163,184,.2);border-radius:7px;background:#0b1321;color:#cbd5e1}.fan-audit-summary{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));border:1px solid rgba(103,232,249,.2);border-radius:7px;background:#0b1321}.fan-audit-summary>div{min-width:0;display:grid;gap:3px;padding:10px;border-right:1px solid rgba(148,163,184,.12)}.fan-audit-summary>div:last-child{border-right:0}.fan-audit-summary span,.fan-audit-choice>span,.fan-audit-emic>span{color:#8291a8;font-size:.65rem}.fan-audit-summary strong{font-size:.86rem}.fan-audit-search{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px}.fan-audit-search label{position:relative;min-width:0}.fan-audit-search label>svg{position:absolute;top:50%;left:11px;transform:translateY(-50%);color:#8291a8}.fan-audit-search input{width:100%;padding-left:34px}.fan-audit-filters{display:flex;align-items:center;gap:6px;overflow-x:auto;padding-bottom:2px}.fan-audit-filters>svg{flex:0 0 auto;color:#8291a8}.fan-audit-filters button{min-height:38px;flex:0 0 auto;padding:7px 10px;border:1px solid rgba(148,163,184,.18);border-radius:6px;background:#0b1321;color:#a9b6c9;font-size:.7rem;font-weight:800}.fan-audit-filters button.selected{border-color:rgba(103,232,249,.58);background:#0d2530;color:#cffafe}.fan-audit-list{min-height:120px;max-height:min(52vh,480px);overflow-y:auto;overscroll-behavior:contain;border:1px solid rgba(148,163,184,.16);border-radius:7px}.fan-audit-row{display:grid;grid-template-columns:minmax(150px,1.3fr) minmax(130px,1fr) minmax(90px,.65fr) minmax(105px,.7fr) minmax(115px,.75fr);align-items:center;gap:10px;padding:10px;border-bottom:1px solid rgba(148,163,184,.12);background:#0b1321}.fan-audit-row:last-child{border-bottom:0}.fan-audit-row.status-won{box-shadow:inset 3px 0 #34d399}.fan-audit-row.status-lost{box-shadow:inset 3px 0 #fb7185}.fan-audit-row.status-void{box-shadow:inset 3px 0 #fbbf24}.fan-audit-player,.fan-audit-choice,.fan-audit-emic{min-width:0;display:grid;gap:2px}.fan-audit-player strong,.fan-audit-choice strong{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:.78rem}.fan-audit-player span,.fan-audit-player time,.fan-audit-choice em{overflow:hidden;color:#8291a8;font-size:.65rem;font-style:normal;text-overflow:ellipsis;white-space:nowrap}.fan-audit-emic strong{font-size:.76rem}.fan-audit-status{display:flex;align-items:center;gap:5px;color:#b7c2d3;font-size:.69rem;font-weight:800}.status-won .fan-audit-status{color:#6ee7b7}.status-lost .fan-audit-status{color:#fda4af}.status-void .fan-audit-status{color:#fcd34d}.fan-audit-loading,.fan-audit-empty{min-height:120px;display:flex;align-items:center;justify-content:center;gap:8px;padding:20px;color:#94a3b8;text-align:center}.fan-audit-loading svg,.fan-audit-more svg{animation:fanAuditSpin .8s linear infinite}.fan-audit-error{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:9px 10px;border-left:3px solid #fb7185;background:#28131b;color:#fecdd3;font-size:.74rem}.fan-audit-more{justify-self:center}@keyframes fanAuditSpin{to{transform:rotate(360deg)}}
        @media(max-width:700px){.fan-audit-summary{grid-template-columns:repeat(2,minmax(0,1fr))}.fan-audit-summary>div{border-right:1px solid rgba(148,163,184,.12);border-bottom:1px solid rgba(148,163,184,.12)}.fan-audit-summary>div:nth-child(2n){border-right:0}.fan-audit-summary>div:last-child{border-bottom:0}.fan-audit-row{grid-template-columns:minmax(0,1fr) auto;gap:8px 12px}.fan-audit-player{grid-column:1/-1}.fan-audit-choice{grid-column:1}.fan-audit-status{grid-column:2;grid-row:2;justify-self:end}.fan-audit-emic{padding-top:7px;border-top:1px solid rgba(148,163,184,.1)}.fan-audit-list{max-height:48vh}}
        @media(max-width:420px){.fan-audit-search{grid-template-columns:1fr}.fan-audit-search button{width:100%;justify-content:center}.fan-audit-row{padding:10px 9px}.fan-audit-summary>div{padding:9px}.fan-audit-filters button{min-height:44px}}
        @media(prefers-reduced-motion:reduce){.fan-audit-loading svg,.fan-audit-more svg{animation:none}}
      `}</style>
    </AdminModalShell>
  );
}
