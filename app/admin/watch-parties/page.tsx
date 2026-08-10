'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Archive,
  BadgeCheck,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Loader2,
  PauseCircle,
  RefreshCw,
  Search,
  ShoppingBag,
  TicketCheck,
  Trash2,
  Tv,
  Undo2,
  UserMinus,
  UserPlus,
  X,
  XCircle,
} from 'lucide-react';
import { readApiResponse } from '@/lib/read-api-response';
import AdminBookingModalShell from '@/components/admin/AdminBookingModalShell';

type WatchControlTab = 'live' | 'needs-result' | 'settled';

type PageInfo = {
  skip: number;
  take: number;
  hasMore: boolean;
  nextSkip: number | null;
};

type AdminParty = {
  id: string;
  createdAt: string;
  updatedAt: string;
  title: string;
  status: string;
  source: string;
  homeTeam: string;
  awayTeam: string;
  kickoffAt: string;
  venue: string | null;
  entryFeeRupees: number;
  entryCoins: number;
  predictionStatus: string;
  predictionLockAt: string;
  settledOption: string | null;
  options: Array<{ key: string; label: string; multiplier: string }>;
  invites: Array<{
    userId: string;
    userName: string;
    userEmail: string;
    checkedInAt: string | null;
    enteredAt: string | null;
    credited: boolean;
  }>;
  predictions: Array<{
    userName: string;
    optionLabel: string;
    stakeCoins: number;
    payoutCoins: number | null;
    status: string;
  }>;
};

type UserOption = {
  id: string;
  name: string;
  email: string;
  phone?: string | null;
};

type AdminShopOrder = {
  id: string;
  itemKey: string;
  itemType: string;
  label: string;
  category: string;
  tokenCost: number;
  status: string;
  requestedAt: string | null;
  userName: string;
  userEmail: string;
};

type ProviderMatch = {
  providerMatchId: string;
  title: string;
  homeTeam: string;
  awayTeam: string;
  kickoffAt: string | null;
  fixtureDate: string;
  kickoffTimeUk: string | null;
  status: string;
  matchday: number;
  venue: string | null;
  source: string;
  providerCompetitionCode: string;
  providerSeason: number;
  providerPayload: string;
};

type AdminPartyResponse = {
  parties?: AdminParty[];
  pageInfo?: PageInfo;
  error?: string;
};

type AdminShopOrderResponse = {
  orders?: AdminShopOrder[];
  pageInfo?: PageInfo;
  error?: string;
};

const ADMIN_PARTY_PAGE_SIZE = 24;
const ADMIN_ORDER_PAGE_SIZE = 24;

const EMPTY_FORM = {
  title: '',
  homeTeam: '',
  awayTeam: '',
  kickoffAt: '',
  venue: '',
  entryFeeRupees: '100',
  entryCoins: '100',
  status: 'ACTIVE',
  source: 'MANUAL',
  providerMatchId: '',
  providerCompetitionCode: '',
  providerSeason: '',
  providerPayload: '',
};

function toIstInput(value: string | null) {
  if (!value) return '';
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date(value));
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}`;
}

function formatTime(value: string | null) {
  if (!value) return 'TBA';
  return new Date(value).toLocaleString('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Kolkata',
  });
}

function readError(data: any, fallback: string) {
  return typeof data?.error === 'string' ? data.error : fallback;
}

function sortLiveControlParties(parties: AdminParty[]) {
  return parties.slice().sort((a, b) => {
    const createdDiff = new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    if (createdDiff !== 0) return createdDiff;
    return new Date(b.kickoffAt).getTime() - new Date(a.kickoffAt).getTime();
  });
}

function mergeParties(current: AdminParty[], incoming: AdminParty[]) {
  const merged = new Map<string, AdminParty>();
  for (const party of current) merged.set(party.id, party);
  for (const party of incoming) merged.set(party.id, party);
  return sortLiveControlParties(Array.from(merged.values()));
}

function mergeShopOrders(current: AdminShopOrder[], incoming: AdminShopOrder[]) {
  const merged = new Map<string, AdminShopOrder>();
  for (const order of current) merged.set(order.id, order);
  for (const order of incoming) merged.set(order.id, order);
  return Array.from(merged.values()).sort((a, b) => {
    const aTime = a.requestedAt ? new Date(a.requestedAt).getTime() : 0;
    const bTime = b.requestedAt ? new Date(b.requestedAt).getTime() : 0;
    return bTime - aTime;
  });
}

function isCompletedParty(party: AdminParty) {
  return ['SETTLED', 'VOID'].includes(party.predictionStatus);
}

function needsResultParty(party: AdminParty, nowMs: number) {
  if (isCompletedParty(party)) return false;
  return party.predictionStatus === 'CLOSED' || new Date(party.kickoffAt).getTime() <= nowMs;
}

type WatchPartyCreateModalProps = {
  onClose: () => void;
  onCreated: (party: AdminParty) => void;
};

function WatchPartyCreateModal({ onClose, onCreated }: WatchPartyCreateModalProps) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [matches, setMatches] = useState<ProviderMatch[]>([]);
  const [fixtureTeams, setFixtureTeams] = useState<string[]>([]);
  const [matchDateFrom, setMatchDateFrom] = useState('');
  const [matchDateTo, setMatchDateTo] = useState('');
  const [matchday, setMatchday] = useState('');
  const [fixtureSearchMode, setFixtureSearchMode] = useState<'date' | 'team'>('date');
  const [teamSearch, setTeamSearch] = useState('');
  const [teamDropdownOpen, setTeamDropdownOpen] = useState(false);
  const [busy, setBusy] = useState<'' | 'matches' | 'create'>('');
  const [loadingTeams, setLoadingTeams] = useState(true);
  const [error, setError] = useState('');
  const [fixtureNotice, setFixtureNotice] = useState('');
  const matchRequestRef = useRef<AbortController | null>(null);
  const teamBlurTimeoutRef = useRef<number | null>(null);

  const canCreateParty = Boolean(form.homeTeam.trim() && form.awayTeam.trim() && form.kickoffAt);
  const isSubmitting = busy === 'create';
  const teamSuggestions = useMemo(() => {
    const query = teamSearch.trim().toLowerCase();
    if (!query) return [];
    return fixtureTeams
      .filter((team) => team.toLowerCase().includes(query))
      .slice(0, 8);
  }, [fixtureTeams, teamSearch]);

  useEffect(() => {
    const controller = new AbortController();

    fetch('/api/admin/watch-parties/matches?teamsOnly=true', {
      cache: 'no-store',
      signal: controller.signal,
    })
      .then(async (response) => {
        const data = await readApiResponse<{ teams?: string[]; error?: string }>(response, 'Failed to load teams.');
        if (!response.ok) throw new Error(readError(data, 'Failed to load teams.'));
        return data;
      })
      .then((data) => setFixtureTeams(Array.isArray(data.teams) ? data.teams : []))
      .catch((cause) => {
        if (!(cause instanceof DOMException && cause.name === 'AbortError')) {
          setError(cause instanceof Error ? cause.message : 'Failed to load teams.');
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoadingTeams(false);
      });

    return () => {
      controller.abort();
      matchRequestRef.current?.abort();
      if (teamBlurTimeoutRef.current != null) window.clearTimeout(teamBlurTimeoutRef.current);
    };
  }, []);

  const requestClose = () => {
    if (!isSubmitting) onClose();
  };

  const fetchMatches = async (teamOverride?: string) => {
    matchRequestRef.current?.abort();
    const controller = new AbortController();
    matchRequestRef.current = controller;
    setBusy('matches');
    setError('');
    setFixtureNotice('');

    try {
      const params = new URLSearchParams();
      if (fixtureSearchMode === 'team') {
        const team = (teamOverride ?? teamSearch).trim();
        if (team) params.set('team', team);
      } else {
        if (matchDateFrom) params.set('dateFrom', matchDateFrom);
        if (matchDateTo) params.set('dateTo', matchDateTo);
        if (matchday) params.set('matchday', matchday);
      }

      const response = await fetch(`/api/admin/watch-parties/matches?${params.toString()}`, {
        cache: 'no-store',
        signal: controller.signal,
      });
      const data = await readApiResponse<{ matches?: ProviderMatch[]; error?: string }>(response, 'Failed to load Premier League fixtures.');
      if (!response.ok) throw new Error(readError(data, 'Failed to load Premier League fixtures.'));
      setMatches(data.matches ?? []);
      setFixtureNotice(`${data.matches?.length ?? 0} Premier League fixtures loaded.`);
    } catch (cause) {
      if (!(cause instanceof DOMException && cause.name === 'AbortError')) {
        setError(cause instanceof Error ? cause.message : 'Failed to load Premier League fixtures.');
      }
    } finally {
      if (matchRequestRef.current === controller) {
        matchRequestRef.current = null;
        setBusy('');
      }
    }
  };

  const selectMatch = (match: ProviderMatch) => {
    setForm((current) => ({
      ...current,
      title: match.title,
      homeTeam: match.homeTeam,
      awayTeam: match.awayTeam,
      kickoffAt: toIstInput(match.kickoffAt),
      venue: match.venue ?? '',
      source: match.source,
      providerMatchId: match.providerMatchId,
      providerCompetitionCode: match.providerCompetitionCode,
      providerSeason: String(match.providerSeason),
      providerPayload: match.providerPayload,
    }));
  };

  const createParty = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canCreateParty || isSubmitting) return;
    setBusy('create');
    setError('');
    setFixtureNotice('');

    try {
      const payload = {
        ...form,
        entryFeeRupees: Number(form.entryFeeRupees),
        entryCoins: Number(form.entryCoins),
        providerSeason: form.providerSeason ? Number(form.providerSeason) : undefined,
      };
      const response = await fetch('/api/admin/watch-parties', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await readApiResponse<{ party: AdminParty; error?: string }>(response, 'Failed to create watch party.');
      if (!response.ok) throw new Error(readError(data, 'Failed to create watch party.'));
      onCreated(data.party);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Failed to create watch party.');
    } finally {
      setBusy('');
    }
  };

  return (
    <>
      <AdminBookingModalShell onClose={requestClose} labelledBy="create-watch-party-title">
        <div className="watch-create-modal-head">
          <div>
            <div className="watch-create-kicker">Premier League 2026-27</div>
            <h2 id="create-watch-party-title"><Tv size={18} /> Create Watch Party</h2>
          </div>
          <button
            className="btn btn-ghost btn-sm watch-create-close"
            type="button"
            onClick={requestClose}
            disabled={isSubmitting}
            aria-label="Close create watch party"
          >
            <X size={18} />
          </button>
        </div>

        {error && <div className="alert alert-error watch-create-alert">{error}</div>}
        {fixtureNotice && <div className="alert alert-info watch-create-alert">{fixtureNotice}</div>}

        <div className="watch-fixture-tabs" role="tablist" aria-label="Fixture search mode">
          <button type="button" className={fixtureSearchMode === 'date' ? 'active' : ''} onClick={() => setFixtureSearchMode('date')}>
            Date / Matchweek
          </button>
          <button type="button" className={fixtureSearchMode === 'team' ? 'active' : ''} onClick={() => setFixtureSearchMode('team')}>
            Team Search
          </button>
        </div>

        {fixtureSearchMode === 'team' ? (
          <div className="watch-match-tools team">
            <div className="watch-team-search">
              <input
                className="form-input"
                type="search"
                placeholder={loadingTeams ? 'Loading teams...' : 'Search team, e.g. Arsenal'}
                value={teamSearch}
                onBlur={() => {
                  teamBlurTimeoutRef.current = window.setTimeout(() => setTeamDropdownOpen(false), 120);
                }}
                onChange={(event) => {
                  setTeamSearch(event.target.value);
                  setTeamDropdownOpen(true);
                }}
                onFocus={() => setTeamDropdownOpen(true)}
                aria-label="Search Premier League team"
              />
              {teamDropdownOpen && teamSuggestions.length > 0 && (
                <div className="watch-team-dropdown">
                  {teamSuggestions.map((team) => (
                    <button
                      key={team}
                      type="button"
                      onMouseDown={(event) => {
                        event.preventDefault();
                        setTeamSearch(team);
                        setTeamDropdownOpen(false);
                        void fetchMatches(team);
                      }}
                    >
                      {team}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button className="btn btn-ghost btn-sm" type="button" onClick={() => void fetchMatches()} disabled={busy === 'matches'}>
              <Search size={15} />
              {busy === 'matches' ? 'Loading' : 'Find Team'}
            </button>
          </div>
        ) : (
          <div className="watch-match-tools">
            <input className="form-input" type="date" value={matchDateFrom} onChange={(event) => setMatchDateFrom(event.target.value)} aria-label="Fixture date from" />
            <input className="form-input" type="date" value={matchDateTo} onChange={(event) => setMatchDateTo(event.target.value)} aria-label="Fixture date to" />
            <input className="form-input" type="number" min={1} max={38} placeholder="Matchweek" value={matchday} onChange={(event) => setMatchday(event.target.value)} aria-label="Matchweek number" />
            <button className="btn btn-ghost btn-sm" type="button" onClick={() => void fetchMatches()} disabled={busy === 'matches'}>
              <Search size={15} />
              {busy === 'matches' ? 'Loading' : 'Fixtures'}
            </button>
          </div>
        )}

        {matches.length > 0 && (
          <div className="watch-match-list">
            {matches.slice(0, 12).map((match) => (
              <button key={match.providerMatchId} type="button" onClick={() => selectMatch(match)}>
                <strong>{match.title}</strong>
                <span>MW {match.matchday} · {formatTime(match.kickoffAt)}</span>
                {!match.kickoffAt && <em>TBA - set kickoff before creating</em>}
              </button>
            ))}
          </div>
        )}

        <form onSubmit={createParty}>
          <div className="watch-form-grid">
            <input className="form-input" placeholder="Title" value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} aria-label="Watch party title" />
            <input className="form-input" placeholder="Team A" value={form.homeTeam} onChange={(event) => setForm({ ...form, homeTeam: event.target.value })} aria-label="Home team" />
            <input className="form-input" placeholder="Team B" value={form.awayTeam} onChange={(event) => setForm({ ...form, awayTeam: event.target.value })} aria-label="Away team" />
            <input className="form-input" type="datetime-local" value={form.kickoffAt} onChange={(event) => setForm({ ...form, kickoffAt: event.target.value })} aria-label="Kickoff time" />
            <input className="form-input" placeholder="Guild TV area" value={form.venue} onChange={(event) => setForm({ ...form, venue: event.target.value })} aria-label="Venue" />
            <input className="form-input" type="number" placeholder="Entry fee" value={form.entryFeeRupees} onChange={(event) => setForm({ ...form, entryFeeRupees: event.target.value })} aria-label="Entry fee in rupees" />
            <input className="form-input" type="number" placeholder="Arena Tokens" value={form.entryCoins} onChange={(event) => setForm({ ...form, entryCoins: event.target.value })} aria-label="Arena token credit" />
          </div>
          <div className="watch-create-actions">
            <button className="btn btn-ghost" type="button" onClick={requestClose} disabled={isSubmitting}>
              Cancel
            </button>
            <button className="btn btn-primary" type="submit" disabled={isSubmitting || !canCreateParty}>
              {isSubmitting ? <Loader2 size={15} className="watch-spin" /> : <TicketCheck size={15} />}
              {isSubmitting ? 'Creating...' : 'Create Watch Party'}
            </button>
          </div>
        </form>
      </AdminBookingModalShell>

      <style jsx>{`
        .watch-create-modal-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; margin-bottom: var(--space-md); }
        .watch-create-modal-head h2 { display: flex; align-items: center; gap: 8px; margin: 2px 0 0; font-size: 1.08rem; }
        .watch-create-kicker { color: #22d3ee; font-size: 0.68rem; font-weight: 800; text-transform: uppercase; }
        .watch-create-close { flex: 0 0 auto; padding-inline: 9px; }
        .watch-create-alert { margin-bottom: 10px; }
        .watch-fixture-tabs { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; margin-bottom: 10px; padding: 3px; border: 1px solid rgba(255,255,255,0.1); border-radius: 8px; background: rgba(0,0,0,0.18); }
        .watch-fixture-tabs button { min-height: 34px; padding: 0 8px; border: 0; border-radius: 6px; color: var(--color-text-muted); background: transparent; font-size: 0.75rem; font-weight: 800; }
        .watch-fixture-tabs button.active { color: #061016; background: #22d3ee; }
        .watch-match-tools { display: grid; grid-template-columns: minmax(0,1fr) minmax(0,1fr); gap: 8px; margin-bottom: 10px; }
        .watch-match-tools.team { grid-template-columns: minmax(0,1fr) auto; }
        .watch-match-tools .form-input { min-width: 0; width: 100%; }
        .watch-match-tools button { width: 100%; justify-content: center; }
        .watch-team-search { position: relative; min-width: 0; }
        .watch-team-dropdown { position: absolute; top: calc(100% + 4px); left: 0; right: 0; z-index: 20; display: grid; max-height: 220px; overflow: auto; border: 1px solid rgba(34,211,238,0.28); border-radius: 8px; background: #07111d; box-shadow: 0 16px 32px rgba(0,0,0,0.35); }
        .watch-team-dropdown button { min-height: 36px; justify-content: flex-start; padding: 0 10px; border: 0; border-radius: 0; border-bottom: 1px solid rgba(255,255,255,0.07); color: var(--color-text-primary); background: transparent; text-align: left; font-size: 0.82rem; }
        .watch-team-dropdown button:hover { color: #061016; background: #22d3ee; }
        .watch-match-list { display: grid; gap: 6px; max-height: 210px; overflow: auto; margin-bottom: 12px; }
        .watch-match-list button { display: grid; gap: 2px; padding: 9px 10px; text-align: left; border: 1px solid rgba(34,211,238,0.18); border-radius: 8px; color: var(--color-text-primary); background: rgba(34,211,238,0.06); }
        .watch-match-list span { color: var(--color-text-muted); font-size: 0.76rem; }
        .watch-match-list em { color: #fbbf24; font-size: 0.72rem; font-style: normal; font-weight: 800; }
        .watch-form-grid { display: grid; gap: 8px; }
        .watch-create-actions { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 12px; }
        .watch-create-actions .btn { width: 100%; justify-content: center; }
        @keyframes watchSpin { to { transform: rotate(360deg); } }
        @media (max-width: 560px) {
          .watch-match-tools, .watch-match-tools.team { grid-template-columns: 1fr; }
          .watch-create-actions { grid-template-columns: 1fr; }
        }
      `}</style>
    </>
  );
}

export default function AdminWatchPartiesPage() {
  const [parties, setParties] = useState<AdminParty[]>([]);
  const [shopOrders, setShopOrders] = useState<AdminShopOrder[]>([]);
  const [partyPageInfo, setPartyPageInfo] = useState<PageInfo | null>(null);
  const [orderPageInfo, setOrderPageInfo] = useState<PageInfo | null>(null);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [inviteUserByParty, setInviteUserByParty] = useState<Record<string, string>>({});
  const [inviteUserSearchByParty, setInviteUserSearchByParty] = useState<Record<string, string>>({});
  const [inviteUserDropdownByParty, setInviteUserDropdownByParty] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [watchControlTab, setWatchControlTab] = useState<WatchControlTab>('live');
  const [expandedPartyIds, setExpandedPartyIds] = useState<Record<string, boolean>>({});

  const sortedUsers = useMemo(() => users.slice().sort((a, b) => a.name.localeCompare(b.name)), [users]);
  const controlBuckets = useMemo(() => {
    const nowMs = Date.now();
    const live: AdminParty[] = [];
    const needsResult: AdminParty[] = [];
    const settled: AdminParty[] = [];

    for (const party of parties) {
      if (isCompletedParty(party)) {
        settled.push(party);
      } else if (needsResultParty(party, nowMs)) {
        needsResult.push(party);
      } else {
        live.push(party);
      }
    }

    return {
      live,
      needsResult,
      settled,
    };
  }, [parties]);
  const visibleParties = watchControlTab === 'live'
    ? controlBuckets.live
    : watchControlTab === 'needs-result'
      ? controlBuckets.needsResult
      : controlBuckets.settled;
  const emptyControlCopy = watchControlTab === 'live'
    ? 'No live watch parties needing check-in right now.'
    : watchControlTab === 'needs-result'
      ? 'No watch parties waiting for a result.'
      : 'No settled or void watch parties.';
  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const partyParams = new URLSearchParams({ take: String(ADMIN_PARTY_PAGE_SIZE) });
      const orderParams = new URLSearchParams({ take: String(ADMIN_ORDER_PAGE_SIZE) });
      const [partyRes, userRes, orderRes] = await Promise.all([
        fetch(`/api/admin/watch-parties?${partyParams.toString()}`, { cache: 'no-store' }),
        fetch('/api/admin/passes/users', { cache: 'no-store' }),
        fetch(`/api/admin/watch-parties/orders?${orderParams.toString()}`, { cache: 'no-store' }),
      ]);
      const [partyData, userData, orderData] = await Promise.all([
        readApiResponse<AdminPartyResponse>(partyRes, 'Failed to load watch parties.'),
        readApiResponse<{ users?: UserOption[]; error?: string }>(userRes, 'Failed to load users.'),
        readApiResponse<AdminShopOrderResponse>(orderRes, 'Failed to load shop orders.'),
      ]);
      if (!partyRes.ok) throw new Error(readError(partyData, 'Failed to load watch parties.'));
      if (!userRes.ok) throw new Error(readError(userData, 'Failed to load users.'));
      if (!orderRes.ok) throw new Error(readError(orderData, 'Failed to load shop orders.'));
      setParties(sortLiveControlParties(partyData.parties ?? []));
      setPartyPageInfo(partyData.pageInfo ?? null);
      setUsers(userData.users ?? []);
      setShopOrders(orderData.orders ?? []);
      setOrderPageInfo(orderData.pageInfo ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load watch parties.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const loadMoreParties = async () => {
    if (!partyPageInfo?.hasMore || partyPageInfo.nextSkip == null) return;
    setBusy('load-more-parties');
    setError('');
    try {
      const params = new URLSearchParams({
        skip: String(partyPageInfo.nextSkip),
        take: String(partyPageInfo.take || ADMIN_PARTY_PAGE_SIZE),
      });
      const res = await fetch(`/api/admin/watch-parties?${params.toString()}`, { cache: 'no-store' });
      const data = await readApiResponse<AdminPartyResponse>(res, 'Failed to load more watch parties.');
      if (!res.ok) throw new Error(readError(data, 'Failed to load more watch parties.'));
      setParties((current) => mergeParties(current, data.parties ?? []));
      setPartyPageInfo(data.pageInfo ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load more watch parties.');
    } finally {
      setBusy('');
    }
  };

  const loadMoreOrders = async () => {
    if (!orderPageInfo?.hasMore || orderPageInfo.nextSkip == null) return;
    setBusy('load-more-orders');
    setError('');
    try {
      const params = new URLSearchParams({
        skip: String(orderPageInfo.nextSkip),
        take: String(orderPageInfo.take || ADMIN_ORDER_PAGE_SIZE),
      });
      const res = await fetch(`/api/admin/watch-parties/orders?${params.toString()}`, { cache: 'no-store' });
      const data = await readApiResponse<AdminShopOrderResponse>(res, 'Failed to load more shop orders.');
      if (!res.ok) throw new Error(readError(data, 'Failed to load more shop orders.'));
      setShopOrders((current) => mergeShopOrders(current, data.orders ?? []));
      setOrderPageInfo(data.pageInfo ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load more shop orders.');
    } finally {
      setBusy('');
    }
  };

  const replaceParty = (party: AdminParty) => {
    setParties((current) => {
      const exists = current.some((item) => item.id === party.id);
      const next = exists
        ? current.map((item) => item.id === party.id ? party : item)
        : [party, ...current];
      return sortLiveControlParties(next);
    });
  };

  const invite = async (partyId: string) => {
    const userId = inviteUserByParty[partyId];
    if (!userId) return;
    setBusy(`invite-${partyId}`);
    setError('');
    try {
      const res = await fetch(`/api/admin/watch-parties/${partyId}/invites`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userIds: [userId] }),
      });
      const data = await readApiResponse<{ party: AdminParty; error?: string }>(res, 'Invite failed.');
      if (!res.ok) throw new Error(readError(data, 'Invite failed.'));
      replaceParty(data.party);
      setInviteUserByParty((current) => ({ ...current, [partyId]: '' }));
      setInviteUserSearchByParty((current) => ({ ...current, [partyId]: '' }));
      setInviteUserDropdownByParty((current) => ({ ...current, [partyId]: false }));
      setNotice('Invite added.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invite failed.');
    } finally {
      setBusy('');
    }
  };

  const cancelInvite = async (partyId: string, userId: string) => {
    setBusy(`cancel-invite-${partyId}-${userId}`);
    setError('');
    try {
      const res = await fetch(`/api/admin/watch-parties/${partyId}/invites`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      });
      const data = await readApiResponse<{ party: AdminParty; error?: string }>(res, 'Cancel invite failed.');
      if (!res.ok) throw new Error(readError(data, 'Cancel invite failed.'));
      replaceParty(data.party);
      setNotice('Invite cancelled.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Cancel invite failed.');
    } finally {
      setBusy('');
    }
  };

  const checkIn = async (partyId: string, userId: string) => {
    setBusy(`checkin-${partyId}-${userId}`);
    setError('');
    try {
      const res = await fetch(`/api/admin/watch-parties/${partyId}/checkin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      });
      const data = await readApiResponse<{ party: AdminParty; error?: string }>(res, 'Check-in failed.');
      if (!res.ok) throw new Error(readError(data, 'Check-in failed.'));
      replaceParty(data.party);
      setNotice('Checked in and credited.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Check-in failed.');
    } finally {
      setBusy('');
    }
  };

  const stopPredictions = async (partyId: string) => {
    setBusy(`lock-${partyId}`);
    setError('');
    try {
      const res = await fetch(`/api/admin/watch-parties/${partyId}/lock`, { method: 'POST' });
      const data = await readApiResponse<{ party: AdminParty; error?: string }>(res, 'Stop predictions failed.');
      if (!res.ok) throw new Error(readError(data, 'Stop predictions failed.'));
      replaceParty(data.party);
      setNotice('Predictions stopped.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Stop predictions failed.');
    } finally {
      setBusy('');
    }
  };

  const settle = async (partyId: string, optionKey: string) => {
    setBusy(`settle-${partyId}-${optionKey}`);
    setError('');
    try {
      const res = await fetch(`/api/admin/watch-parties/${partyId}/settle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ optionKey }),
      });
      const data = await readApiResponse<{ party: AdminParty; error?: string }>(res, 'Settlement failed.');
      if (!res.ok) throw new Error(readError(data, 'Settlement failed.'));
      replaceParty(data.party);
      setNotice('Predictions settled.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Settlement failed.');
    } finally {
      setBusy('');
    }
  };

  const voidParty = async (partyId: string) => {
    setBusy(`void-${partyId}`);
    setError('');
    try {
      const res = await fetch(`/api/admin/watch-parties/${partyId}/settle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'VOID' }),
      });
      const data = await readApiResponse<{ party: AdminParty; error?: string }>(res, 'Void failed.');
      if (!res.ok) throw new Error(readError(data, 'Void failed.'));
      replaceParty(data.party);
      setNotice('Predictions voided and refunded.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Void failed.');
    } finally {
      setBusy('');
    }
  };

  const markShopOrderGiven = async (orderId: string) => {
    setBusy(`given-order-${orderId}`);
    setError('');
    try {
      const res = await fetch(`/api/admin/watch-parties/orders/${orderId}/given`, { method: 'POST' });
      const data = await readApiResponse<{ error?: string }>(res, 'Mark given failed.');
      if (!res.ok) throw new Error(readError(data, 'Mark given failed.'));
      setShopOrders((current) => current.filter((order) => order.id !== orderId));
      setNotice('Shop order marked given.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Mark given failed.');
    } finally {
      setBusy('');
    }
  };

  const cancelShopOrder = async (orderId: string) => {
    setBusy(`cancel-order-${orderId}`);
    setError('');
    try {
      const res = await fetch(`/api/admin/watch-parties/orders/${orderId}/cancel`, { method: 'POST' });
      const data = await readApiResponse<{ error?: string }>(res, 'Cancel order failed.');
      if (!res.ok) throw new Error(readError(data, 'Cancel order failed.'));
      setShopOrders((current) => current.filter((order) => order.id !== orderId));
      setNotice('Shop order cancelled and refunded.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Cancel order failed.');
    } finally {
      setBusy('');
    }
  };

  const archive = async (partyId: string) => {
    setBusy(`archive-${partyId}`);
    setError('');
    try {
      const res = await fetch(`/api/admin/watch-parties/${partyId}`, { method: 'DELETE' });
      const data = await readApiResponse<{ error?: string }>(res, 'Archive failed.');
      if (!res.ok) throw new Error(readError(data, 'Archive failed.'));
      setParties((current) => current.filter((party) => party.id !== partyId));
      setNotice('Watch party archived.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Archive failed.');
    } finally {
      setBusy('');
    }
  };

  const archiveSettled = async () => {
    if (controlBuckets.settled.length === 0) return;
    const confirmed = window.confirm(
      `Archive ${controlBuckets.settled.length} settled/void watch parties? They will be hidden from Live Control but kept in history.`,
    );
    if (!confirmed) return;
    setBusy('archive-settled');
    setError('');
    setNotice('');
    try {
      const res = await fetch('/api/admin/watch-parties/archive-settled', { method: 'POST' });
      const data = await readApiResponse<{ archivedCount?: number; error?: string }>(res, 'Archive settled failed.');
      if (!res.ok) throw new Error(readError(data, 'Archive settled failed.'));
      setParties((current) => current.filter((party) => !isCompletedParty(party)));
      setWatchControlTab('live');
      setNotice(`${data.archivedCount ?? 0} completed watch parties archived.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Archive settled failed.');
    } finally {
      setBusy('');
    }
  };

  return (
    <div>
      <div className="watch-admin-header">
        <div>
          <h1 className="font-orbitron">PL Watch Party</h1>
          <p>Premier League 2026-27</p>
        </div>
        <div className="watch-admin-header-actions">
          <button
            className="btn btn-primary btn-sm"
            type="button"
            onClick={() => {
              setError('');
              setNotice('');
              setShowCreateModal(true);
            }}
          >
            <TicketCheck size={15} />
            Create Watch Party
          </button>
          <button className="btn btn-ghost btn-sm" type="button" onClick={load} disabled={loading}>
            <RefreshCw size={15} />
            Refresh
          </button>
        </div>
      </div>

      {error && <div className="alert alert-error watch-admin-alert">{error}</div>}
      {notice && <div className="alert alert-info watch-admin-alert">{notice}</div>}

      {showCreateModal && (
        <WatchPartyCreateModal
          onClose={() => setShowCreateModal(false)}
          onCreated={(party) => {
            replaceParty(party);
            setShowCreateModal(false);
            setError('');
            setNotice('Watch party created.');
          }}
        />
      )}

      <section className="watch-admin-grid">
        <div className="watch-admin-panel">
          <div className="watch-control-head">
            <h2><UserPlus size={17} /> Live Control</h2>
            {controlBuckets.settled.length > 0 && (
              <button
                className="btn btn-ghost btn-sm"
                type="button"
                onClick={archiveSettled}
                disabled={busy === 'archive-settled'}
              >
                {busy === 'archive-settled' ? <Loader2 size={14} className="watch-spin" /> : <Archive size={14} />}
                Archive Settled
              </button>
            )}
          </div>
          <div className="watch-control-tabs" role="tablist" aria-label="Watch party live control filters">
            <button type="button" className={watchControlTab === 'live' ? 'active' : ''} onClick={() => setWatchControlTab('live')}>
              Live <span>{controlBuckets.live.length}</span>
            </button>
            <button type="button" className={watchControlTab === 'needs-result' ? 'active' : ''} onClick={() => setWatchControlTab('needs-result')}>
              Needs Result <span>{controlBuckets.needsResult.length}</span>
            </button>
            <button type="button" className={watchControlTab === 'settled' ? 'active' : ''} onClick={() => setWatchControlTab('settled')}>
              Settled <span>{controlBuckets.settled.length}</span>
            </button>
          </div>
          {loading ? (
            <div className="loading-state"><div className="spinner" />Loading watch parties...</div>
          ) : visibleParties.length === 0 ? (
            <>
              <div className="empty-state">
                {emptyControlCopy}
                {partyPageInfo?.hasMore ? ' Load more to check older watch parties.' : ''}
              </div>
              {partyPageInfo?.hasMore && (
                <button className="btn btn-ghost btn-sm watch-load-more" type="button" onClick={loadMoreParties} disabled={busy === 'load-more-parties'}>
                  {busy === 'load-more-parties' ? <Loader2 size={14} className="watch-spin" /> : <ChevronDown size={14} />}
                  Load More
                </button>
              )}
            </>
          ) : (
            <>
              <div className="watch-party-admin-list">
                {visibleParties.map((party) => {
                  const expanded = Boolean(expandedPartyIds[party.id]);
                  return (
                  <article key={party.id} className={`watch-admin-card ${expanded ? 'open' : ''}`}>
                  <div className="watch-admin-card-head">
                    <div>
                      <strong>{party.homeTeam} vs {party.awayTeam}</strong>
                      <span>{formatTime(party.kickoffAt)}</span>
                    </div>
                    <div className="watch-admin-card-state">
                      <span className="watch-status">{party.predictionStatus}</span>
                      <button
                        className="btn btn-ghost btn-sm watch-card-toggle"
                        type="button"
                        aria-expanded={expanded}
                        onClick={() => setExpandedPartyIds((current) => ({
                          ...current,
                          [party.id]: !current[party.id],
                        }))}
                      >
                        {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                        {expanded ? 'Hide' : 'Manage'}
                      </button>
                    </div>
                  </div>

                  <div className="watch-admin-token-row">
                    <span>Counter fee Rs {party.entryFeeRupees}</span>
                    <strong>Check-in ◈ {party.entryCoins}</strong>
                    <span>{party.predictions.length} predictions</span>
                  </div>

                  <div className="watch-card-details">
                  {(() => {
                    const query = (inviteUserSearchByParty[party.id] ?? '').trim().toLowerCase();
                    const invitedIds = new Set(party.invites.map((item) => item.userId));
                    const selectedUserId = inviteUserByParty[party.id] ?? '';
                    const suggestions = query
                      ? sortedUsers
                        .filter((user) => {
                          if (invitedIds.has(user.id)) return false;
                          const userCode = user.id.slice(-6).toLowerCase();
                          return user.name.toLowerCase().includes(query)
                            || user.email.toLowerCase().includes(query)
                            || userCode.includes(query.replace(/^#/, ''));
                        })
                        .slice(0, 8)
                      : [];

                    return (
                      <div className="watch-admin-actions">
                        <div className="watch-user-search">
                          <Search size={15} className="watch-user-search-icon" />
                          <input
                            className="form-input search-input"
                            type="search"
                            placeholder="Search user name, email or ID"
                            value={inviteUserSearchByParty[party.id] ?? ''}
                            onBlur={() => window.setTimeout(() => setInviteUserDropdownByParty((current) => ({ ...current, [party.id]: false })), 120)}
                            onChange={(event) => {
                              setInviteUserSearchByParty((current) => ({ ...current, [party.id]: event.target.value }));
                              setInviteUserByParty((current) => ({ ...current, [party.id]: '' }));
                              setInviteUserDropdownByParty((current) => ({ ...current, [party.id]: true }));
                            }}
                            onFocus={() => setInviteUserDropdownByParty((current) => ({ ...current, [party.id]: true }))}
                          />
                          {inviteUserDropdownByParty[party.id] && suggestions.length > 0 && (
                            <div className="watch-user-dropdown">
                              {suggestions.map((user) => (
                                <button
                                  key={user.id}
                                  type="button"
                                  onMouseDown={(event) => {
                                    event.preventDefault();
                                    setInviteUserByParty((current) => ({ ...current, [party.id]: user.id }));
                                    setInviteUserSearchByParty((current) => ({ ...current, [party.id]: `${user.name} · ${user.email}` }));
                                    setInviteUserDropdownByParty((current) => ({ ...current, [party.id]: false }));
                                  }}
                                >
                                  <strong>{user.name}</strong>
                                  <span>{user.email}</span>
                                  <em>#{user.id.slice(-6).toUpperCase()}</em>
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                        <button className="btn btn-ghost btn-sm" type="button" onClick={() => invite(party.id)} disabled={!selectedUserId || busy === `invite-${party.id}`}>
                          <UserPlus size={15} />
                          Invite
                        </button>
                      </div>
                    );
                  })()}

                  {party.invites.length > 0 && (
                    <div className="watch-invite-list">
                      {party.invites.map((invite) => (
                        <div key={invite.userId}>
                          <span>{invite.userName}</span>
                          {invite.checkedInAt ? (
                            <em><CheckCircle2 size={13} /> Checked in</em>
                          ) : (
                            <div className="watch-invite-actions">
                              <button className="btn btn-primary btn-sm" type="button" onClick={() => checkIn(party.id, invite.userId)} disabled={busy === `checkin-${party.id}-${invite.userId}`}>
                                Check-in
                              </button>
                              <button className="btn btn-ghost btn-sm watch-danger" type="button" onClick={() => cancelInvite(party.id, invite.userId)} disabled={busy === `cancel-invite-${party.id}-${invite.userId}`}>
                                <UserMinus size={14} />
                                Cancel
                              </button>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="watch-settle-row">
                    {party.predictionStatus === 'OPEN' && (
                      <button className="btn btn-ghost btn-sm" type="button" onClick={() => stopPredictions(party.id)} disabled={busy === `lock-${party.id}`}>
                        <PauseCircle size={14} />
                        Stop Predictions
                      </button>
                    )}
                    {party.options.map((option) => (
                      <button
                        key={option.key}
                        className="btn btn-ghost btn-sm"
                        type="button"
                        onClick={() => settle(party.id, option.key)}
                        disabled={['SETTLED', 'VOID'].includes(party.predictionStatus) || busy === `settle-${party.id}-${option.key}`}
                      >
                        {option.label}
                      </button>
                    ))}
                    <button className="btn btn-ghost btn-sm watch-danger" type="button" onClick={() => voidParty(party.id)} disabled={['SETTLED', 'VOID'].includes(party.predictionStatus) || busy === `void-${party.id}`}>
                      <XCircle size={14} />
                      Void
                    </button>
                    <button className="btn btn-ghost btn-sm watch-danger" type="button" onClick={() => archive(party.id)} disabled={Boolean(busy)}>
                      <Trash2 size={14} />
                    </button>
                  </div>
                  </div>
                  </article>
                  );
                })}
              </div>
              {partyPageInfo?.hasMore && (
                <button className="btn btn-ghost btn-sm watch-load-more" type="button" onClick={loadMoreParties} disabled={busy === 'load-more-parties'}>
                  {busy === 'load-more-parties' ? <Loader2 size={14} className="watch-spin" /> : <ChevronDown size={14} />}
                  Load More
                </button>
              )}
            </>
          )}
        </div>
      </section>

      <section className="watch-admin-panel watch-ticket-panel">
        <div className="watch-ticket-panel-head">
          <h2><ShoppingBag size={17} /> Shop Orders</h2>
          <span>{shopOrders.length} pending</span>
        </div>
        <p className="watch-ticket-panel-note">For passes or Guild memberships, assign from Admin Passes first. Drinks can be handed over at counter.</p>
        {loading ? (
          <div className="loading-state"><div className="spinner" />Loading shop orders...</div>
        ) : shopOrders.length === 0 ? (
          <>
            <div className="empty-state">
              No pending shop orders.
              {orderPageInfo?.hasMore ? ' Load more to check older tickets.' : ''}
            </div>
            {orderPageInfo?.hasMore && (
              <button className="btn btn-ghost btn-sm watch-load-more" type="button" onClick={loadMoreOrders} disabled={busy === 'load-more-orders'}>
                {busy === 'load-more-orders' ? <Loader2 size={14} className="watch-spin" /> : <ChevronDown size={14} />}
                Load More Orders
              </button>
            )}
          </>
        ) : (
          <>
            <div className="watch-ticket-admin-list">
              {shopOrders.map((order) => (
                <article key={order.id} className="watch-ticket-admin-card">
                  <div>
                    <strong>{order.label}</strong>
                    <span>{order.category} · {order.itemType.replace('_', ' ')} · ◈ {order.tokenCost}</span>
                  </div>
                  <div>
                    <strong>{order.userName}</strong>
                    <span>{order.userEmail}</span>
                  </div>
                  <div>
                    <span>{order.requestedAt ? formatTime(order.requestedAt) : 'Just now'}</span>
                  </div>
                  <div className="watch-ticket-admin-actions">
                    <button className="btn btn-primary btn-sm" type="button" onClick={() => markShopOrderGiven(order.id)} disabled={busy === `given-order-${order.id}`}>
                      <BadgeCheck size={14} />
                      Mark Given
                    </button>
                    <button className="btn btn-ghost btn-sm watch-danger" type="button" onClick={() => cancelShopOrder(order.id)} disabled={busy === `cancel-order-${order.id}`}>
                      <Undo2 size={14} />
                      Cancel + Refund
                    </button>
                  </div>
                </article>
              ))}
            </div>
            {orderPageInfo?.hasMore && (
              <button className="btn btn-ghost btn-sm watch-load-more" type="button" onClick={loadMoreOrders} disabled={busy === 'load-more-orders'}>
                {busy === 'load-more-orders' ? <Loader2 size={14} className="watch-spin" /> : <ChevronDown size={14} />}
                Load More Orders
              </button>
            )}
          </>
        )}
      </section>

      <style jsx>{`
        .watch-admin-header { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: var(--space-xl); }
        .watch-admin-header h1 { margin: 0 0 4px; font-size: 1.45rem; }
        .watch-admin-header p { margin: 0; color: var(--color-text-muted); font-size: 0.86rem; }
        .watch-admin-header-actions { display: flex; align-items: center; justify-content: flex-end; gap: 8px; }
        .watch-admin-alert { margin-bottom: var(--space-md); }
        .watch-admin-grid { display: grid; grid-template-columns: minmax(0, 1fr); gap: var(--space-lg); align-items: start; min-width: 0; }
        .watch-admin-panel { min-width: 0; padding: var(--space-lg); border: 1px solid var(--color-border); border-radius: 8px; background: var(--color-bg-card); }
        .watch-admin-panel h2 { display: flex; align-items: center; gap: 8px; margin: 0 0 var(--space-md); font-size: 1rem; }
        .watch-spin { animation: watchSpin 0.8s linear infinite; }
        .watch-control-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 10px; }
        .watch-control-head h2 { margin: 0; }
        .watch-control-head .btn { flex: 0 0 auto; }
        .watch-control-tabs { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 5px; margin-bottom: 12px; padding: 3px; border: 1px solid rgba(255,255,255,0.1); border-radius: 8px; background: rgba(0,0,0,0.16); }
        .watch-control-tabs button { min-height: 36px; display: inline-flex; align-items: center; justify-content: center; gap: 6px; min-width: 0; border: 0; border-radius: 6px; color: var(--color-text-muted); background: transparent; font-size: 0.73rem; font-weight: 900; line-height: 1.05; }
        .watch-control-tabs button.active { color: #061016; background: #22d3ee; }
        .watch-control-tabs span { min-width: 20px; min-height: 20px; display: inline-flex; align-items: center; justify-content: center; padding: 0 6px; border-radius: 999px; color: inherit; background: rgba(255,255,255,0.14); font-size: 0.68rem; }
        .watch-party-admin-list { display: grid; gap: 12px; }
        .watch-admin-card { min-width: 0; padding: 12px; border: 1px solid rgba(255,255,255,0.1); border-radius: 8px; background: rgba(255,255,255,0.035); }
        .watch-admin-card-head, .watch-admin-token-row, .watch-admin-actions, .watch-settle-row, .watch-invite-list div { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
        .watch-admin-card-head div { display: grid; gap: 4px; }
        .watch-admin-card-head span, .watch-admin-token-row span { color: var(--color-text-muted); font-size: 0.78rem; }
        .watch-admin-card-state { display: flex !important; align-items: center !important; justify-content: flex-end !important; gap: 8px !important; }
        .watch-card-toggle { display: none; }
        .watch-card-details { display: grid; gap: 10px; }
        .watch-status { padding: 5px 8px; border-radius: 999px; color: #22d3ee !important; background: rgba(34,211,238,0.12); font-weight: 800; }
        .watch-admin-token-row { min-height: 36px; margin: 10px 0; padding: 8px 0; border-top: 1px solid rgba(255,255,255,0.07); border-bottom: 1px solid rgba(255,255,255,0.07); }
        .watch-admin-token-row strong { color: #22d3ee; font-family: Orbitron, sans-serif; }
        .watch-admin-actions { align-items: stretch; }
        .watch-user-search { position: relative; min-width: 0; flex: 1; }
        .watch-user-search-icon { position: absolute; left: 10px; top: 50%; z-index: 1; transform: translateY(-50%); color: var(--color-text-muted); pointer-events: none; }
        .watch-user-search .search-input { width: 100%; min-width: 0; padding-left: 34px; }
        .watch-user-dropdown { position: absolute; top: calc(100% + 4px); left: 0; right: 0; z-index: 30; display: grid; max-height: 260px; overflow: auto; border: 1px solid rgba(34,211,238,0.28); border-radius: 8px; background: #07111d; box-shadow: 0 16px 32px rgba(0,0,0,0.35); }
        .watch-user-dropdown button { display: grid; grid-template-columns: minmax(0,1fr) auto; gap: 2px 8px; min-height: 48px; padding: 8px 10px; border: 0; border-bottom: 1px solid rgba(255,255,255,0.07); color: var(--color-text-primary); background: transparent; text-align: left; }
        .watch-user-dropdown button:hover { background: rgba(34,211,238,0.12); }
        .watch-user-dropdown strong, .watch-user-dropdown span { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .watch-user-dropdown span { color: var(--color-text-muted); font-size: 0.73rem; }
        .watch-user-dropdown em { grid-column: 2; grid-row: 1 / span 2; align-self: center; color: #22d3ee; font-size: 0.68rem; font-style: normal; font-weight: 800; }
        .watch-invite-list { display: grid; gap: 6px; margin-top: 10px; }
        .watch-invite-list div { min-height: 38px; padding: 7px 8px; border-radius: 8px; background: rgba(0,0,0,0.16); }
        .watch-invite-list em { display: inline-flex; align-items: center; gap: 5px; color: #b9ffd0; font-size: 0.76rem; font-style: normal; }
        .watch-invite-actions { display: inline-flex !important; align-items: center !important; justify-content: flex-end !important; gap: 6px !important; min-height: auto !important; padding: 0 !important; background: transparent !important; }
        .watch-settle-row { justify-content: flex-start; flex-wrap: wrap; margin-top: 10px; }
        .watch-ticket-panel { margin-top: var(--space-lg); }
        .watch-ticket-panel-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: var(--space-md); }
        .watch-ticket-panel-head h2 { margin: 0; }
        .watch-ticket-panel-head span { color: #22d3ee; font-size: 0.78rem; font-weight: 800; }
        .watch-ticket-panel-note { margin: -6px 0 12px; color: var(--color-text-muted); font-size: 0.8rem; }
        .watch-ticket-admin-list { display: grid; gap: 8px; }
        .watch-ticket-admin-card { display: grid; grid-template-columns: minmax(150px, 1fr) minmax(160px, 1fr) minmax(120px, auto) auto; align-items: center; gap: 10px; min-height: 62px; padding: 10px 12px; border: 1px solid rgba(255,255,255,0.1); border-radius: 8px; background: rgba(255,255,255,0.035); }
        .watch-ticket-admin-card > div { display: grid; gap: 3px; min-width: 0; }
        .watch-ticket-admin-card strong, .watch-ticket-admin-card span { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .watch-ticket-admin-card span { color: var(--color-text-muted); font-size: 0.76rem; }
        .watch-ticket-admin-actions { display: flex !important; flex-direction: row !important; justify-content: flex-end !important; gap: 6px !important; }
        .watch-load-more { width: 100%; justify-content: center; margin-top: 12px; }
        .watch-danger { color: #ff9b9b !important; border-color: rgba(255,107,107,0.32) !important; }
        @keyframes watchSpin { to { transform: rotate(360deg); } }
        @media (max-width: 1180px) {
          .watch-admin-grid { grid-template-columns: 1fr; }
          .watch-admin-panel { padding: var(--space-md); }
          .watch-control-head, .watch-admin-card-head, .watch-admin-token-row, .watch-admin-actions, .watch-invite-list div { align-items: stretch; flex-direction: column; }
          .watch-control-head .btn { width: 100%; justify-content: center; }
          .watch-admin-card-state { flex-direction: row !important; justify-content: space-between !important; }
          .watch-card-toggle { display: inline-flex; justify-content: center; }
          .watch-card-details { display: none; }
          .watch-admin-card.open .watch-card-details { display: grid; }
          .watch-control-tabs button { flex-direction: column; gap: 2px; min-height: 44px; font-size: 0.68rem; }
          .watch-ticket-admin-card { grid-template-columns: 1fr; }
          .watch-invite-actions, .watch-ticket-admin-actions { flex-direction: column !important; justify-content: stretch !important; }
          .watch-invite-actions .btn, .watch-ticket-admin-actions .btn { width: 100%; justify-content: center; }
        }
        @media (max-width: 560px) {
          .watch-admin-header { align-items: stretch; flex-direction: column; }
          .watch-admin-header-actions { align-items: stretch; flex-direction: column; }
          .watch-admin-header-actions .btn { width: 100%; justify-content: center; }
          .watch-admin-panel { padding: 12px; }
          .watch-control-tabs { grid-template-columns: 1fr; }
          .watch-control-tabs button { flex-direction: row; justify-content: space-between; padding: 0 10px; }
          .watch-admin-token-row { gap: 6px; }
          .watch-settle-row .btn { width: 100%; justify-content: center; }
        }
      `}</style>
    </div>
  );
}
