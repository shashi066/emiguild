'use client';

import Link from 'next/link';
import { useState } from 'react';
import { ArrowLeft, CheckCircle2, Clock, Lock, Phone, Trophy, Tv } from 'lucide-react';
import { readApiResponse } from '@/lib/read-api-response';

type WatchPartyDetail = {
  id: string;
  title: string;
  homeTeam: string;
  awayTeam: string;
  kickoffAt: string;
  venue: string | null;
  entryCoins: number;
  walletCoins: number | null;
  predictionStatus: string;
  predictionLockAt: string;
  settledOption: string | null;
  invite: {
    invited: boolean;
    checkedIn: boolean;
    entered: boolean;
    canEnter: boolean;
    canPredict: boolean;
  };
  prediction: {
    optionKey: string;
    optionLabel: string;
    multiplier: string;
    stakeCoins: number;
    payoutCoins: number | null;
    status: string;
  } | null;
  options: Array<{
    key: string;
    label: string;
    multiplier: string;
  }>;
  leaderboard: Array<{ id: string; userName: string; payoutCoins: number }>;
};

function formatTime(value: string) {
  return new Date(value).toLocaleString('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Kolkata',
  });
}

const QUICK_TOKEN_AMOUNTS = [10, 25, 50, 100];

function parseMultiplier(value: string) {
  const parsed = Number(value.replace(/x$/i, ''));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

function formatTokenAmount(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1).replace(/\.0$/, '');
}

function possibleReturn(stakeCoins: number, multiplier: string) {
  const internalUnits = Math.floor(stakeCoins * 10 * parseMultiplier(multiplier));
  return internalUnits / 10;
}

function normalizeTokenAmount(value: number) {
  if (!Number.isFinite(value)) return 1;
  return Math.max(1, Math.floor(value));
}

export function WatchPartyDetailClient({
  initialParty,
  signedIn,
}: {
  initialParty: WatchPartyDetail;
  signedIn: boolean;
}) {
  const [party, setParty] = useState(initialParty);
  const [stakeCoins, setStakeCoins] = useState(
    initialParty.prediction?.stakeCoins
      ?? normalizeTokenAmount(Math.min(10, initialParty.walletCoins ?? 10)),
  );
  const [selectedOptionKey, setSelectedOptionKey] = useState(initialParty.prediction?.optionKey ?? '');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const enter = async () => {
    setBusy('enter');
    setError('');
    try {
      const res = await fetch(`/api/watch-parties/${party.id}/enter`, { method: 'POST' });
      const data = await readApiResponse<{ party: WatchPartyDetail; error?: string }>(res, 'Entry failed.');
      if (!res.ok) throw new Error(data.error || 'Entry failed.');
      setParty(data.party);
      setNotice('Entry confirmed.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Entry failed.');
    } finally {
      setBusy('');
    }
  };

  const predict = async (optionKey: string) => {
    setBusy(optionKey);
    setError('');
    setNotice('');
    try {
      const res = await fetch(`/api/watch-parties/${party.id}/predictions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ optionKey, stakeCoins }),
      });
      const data = await readApiResponse<{ party: WatchPartyDetail; error?: string }>(res, 'Prediction failed.');
      if (!res.ok) throw new Error(data.error || 'Prediction failed.');
      setParty(data.party);
      setSelectedOptionKey(data.party.prediction?.optionKey ?? optionKey);
      setNotice('Prediction locked in.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Prediction failed.');
    } finally {
      setBusy('');
    }
  };

  const hasPrediction = Boolean(party.prediction);
  const walletCoins = party.walletCoins;
  const selectedOption = party.options.find((option) => option.key === selectedOptionKey) ?? null;
  const balanceAfter = walletCoins == null ? null : walletCoins - stakeCoins;
  const amountTooHigh = walletCoins != null && stakeCoins > walletCoins;
  const predictionLockedCopy = !signedIn
    ? 'Login to enter this watch party.'
    : !party.invite.invited
      ? 'An EmiGuild invite is required before predictions.'
      : !party.invite.checkedIn
        ? 'Counter check-in required before predictions.'
        : !party.invite.entered
          ? 'Enter this watch party to unlock predictions.'
          : party.predictionStatus !== 'OPEN'
            ? 'Predictions are closed for this match.'
            : !party.invite.canPredict && !hasPrediction
              ? 'Predictions are locked for this match.'
              : '';
  const controlsDisabled = hasPrediction || !party.invite.canPredict || Boolean(busy);
  const canChooseOption = !controlsDisabled && !amountTooHigh;
  const canLockPrediction = Boolean(selectedOption) && canChooseOption;

  return (
    <section className="watch-room">
      <Link href="/watch-party" className="btn btn-ghost btn-sm watch-back">
        <ArrowLeft size={16} />
        Watch Parties
      </Link>

      <div className="watch-room-head">
        <div className="watch-live-icon"><Tv size={21} /></div>
        <div>
          <div className="watch-kicker">Premier League</div>
          <h1>{party.homeTeam} vs {party.awayTeam}</h1>
        </div>
      </div>

      <div className="watch-room-meta">
        <span><Clock size={14} />{formatTime(party.kickoffAt)}</span>
        <strong>Balance ◈ {walletCoins ?? '--'}</strong>
      </div>

      {error && <div className="watch-alert">{error}</div>}
      {notice && <div className="watch-ok"><CheckCircle2 size={15} />{notice}</div>}

      {!signedIn ? (
        <Link href="/login" className="btn btn-primary watch-full">Login to Enter</Link>
      ) : party.invite.canEnter && !party.invite.entered ? (
        <>
          <button className="btn btn-primary watch-full" type="button" onClick={enter} disabled={busy === 'enter'}>
            {busy === 'enter' ? 'Entering...' : 'Enter Watch Party'}
          </button>
          <div className="watch-entry-credit">Counter check-in credited ◈ {party.entryCoins}. Entering unlocks predictions.</div>
        </>
      ) : !party.invite.invited ? (
        <a
          className="watch-locked watch-invite-locked"
          href="tel:+919989562474"
          aria-label="Call EmiGuild to request a watch party invite"
        >
          <Phone size={15} />
          Contact EmiGuild for invite
        </a>
      ) : !party.invite.checkedIn ? (
        <div className="watch-locked"><Lock size={17} /> Counter check-in required</div>
      ) : null}

      <div className={`watch-token-panel ${controlsDisabled ? 'locked' : ''}`}>
        <div className="watch-token-head">
          <div>
            <span>Token Amount</span>
            <strong>◈ {formatTokenAmount(stakeCoins)}</strong>
          </div>
          <div className="watch-lock-time">Locks {formatTime(party.predictionLockAt)}</div>
        </div>

        <div className="watch-token-summary">
          <span>Balance <strong>◈ {walletCoins ?? '--'}</strong></span>
          <span>Using <strong>◈ {formatTokenAmount(stakeCoins)}</strong></span>
          <span>After prediction <strong>◈ {balanceAfter == null ? '--' : formatTokenAmount(Math.max(0, balanceAfter))}</strong></span>
        </div>

        <div className="watch-token-controls">
          {QUICK_TOKEN_AMOUNTS.map((amount) => (
            <button
              key={amount}
              type="button"
              className={stakeCoins === amount ? 'active' : ''}
              onClick={() => setStakeCoins(amount)}
              disabled={controlsDisabled}
            >
              ◈ {amount}
            </button>
          ))}
          <input
            type="number"
            min={1}
            step={1}
            aria-label="Manual token amount"
            value={stakeCoins}
            onChange={(event) => setStakeCoins(normalizeTokenAmount(Number(event.target.value)))}
            disabled={controlsDisabled}
          />
        </div>

        {amountTooHigh && !hasPrediction && (
          <div className="watch-token-warning">Not enough Arena Tokens</div>
        )}
        {predictionLockedCopy && !hasPrediction && (
          <div className="watch-control-note"><Lock size={14} />{predictionLockedCopy}</div>
        )}
      </div>

      <div className="watch-options">
        {party.options.map((option) => {
          const selected = (party.prediction?.optionKey ?? selectedOptionKey) === option.key;
          const optionReturn = possibleReturn(stakeCoins, option.multiplier);
          return (
            <button
              key={option.key}
              type="button"
              className={`watch-option ${selected ? 'selected' : ''}`}
              onClick={() => setSelectedOptionKey(option.key)}
              disabled={!canChooseOption}
            >
              <span>
                <strong>{option.label}</strong>
                <em>Possible return ◈ {formatTokenAmount(optionReturn)}</em>
              </span>
              <b>{option.multiplier}</b>
            </button>
          );
        })}
      </div>

      {!hasPrediction && (
        <div className="watch-confirm">
          <div>
            <span>{selectedOption ? selectedOption.label : 'Choose a prediction'}</span>
            <strong>
              Using ◈ {formatTokenAmount(stakeCoins)}
              {selectedOption ? ` · Possible return ◈ ${formatTokenAmount(possibleReturn(stakeCoins, selectedOption.multiplier))}` : ''}
            </strong>
          </div>
          <button
            className="btn btn-primary btn-sm"
            type="button"
            onClick={() => selectedOption && predict(selectedOption.key)}
            disabled={!canLockPrediction}
          >
            {busy && selectedOption ? 'Locking...' : 'Lock Prediction'}
          </button>
        </div>
      )}

      {party.prediction && (
        <div className="watch-ticket">
          <div className="watch-ticket-head">
            <Trophy size={17} />
            <span>{party.prediction.optionLabel}</span>
            <em>{party.prediction.status}</em>
          </div>
          <div className="watch-ticket-grid">
            <span>Tokens used</span>
            <strong>◈ {party.prediction.stakeCoins}</strong>
            <span>{party.prediction.payoutCoins == null ? 'Possible return' : 'Return'}</span>
            <strong>
              ◈ {formatTokenAmount(
                party.prediction.payoutCoins
                  ?? possibleReturn(
                    party.prediction.stakeCoins,
                    party.prediction.multiplier,
                  ),
              )}
            </strong>
          </div>
        </div>
      )}

      {party.leaderboard.length > 0 && (
        <div className="watch-leaderboard">
          <h2>Top wins</h2>
          {party.leaderboard.map((row, index) => (
            <div key={row.id}>
              <span>{index + 1}. {row.userName}</span>
              <strong>◈ {row.payoutCoins}</strong>
            </div>
          ))}
        </div>
      )}

      <style jsx>{`
        .watch-room { max-width: 620px; margin: 0 auto; }
        .watch-back { margin-bottom: 14px; }
        .watch-room-head { display: flex; align-items: center; gap: 12px; margin-bottom: 14px; }
        .watch-live-icon { width: 44px; height: 44px; display: grid; place-items: center; flex: 0 0 44px; border: 1px solid rgba(34,211,238,0.35); border-radius: 8px; color: #22d3ee; background: rgba(34,211,238,0.1); }
        .watch-kicker { color: #22d3ee; font-size: 0.72rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0; }
        h1 { margin: 2px 0 0; font-size: 1.45rem; line-height: 1.12; }
        .watch-room-meta, .watch-token-head, .watch-confirm, .watch-ticket-head, .watch-leaderboard div { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
        .watch-room-meta { min-height: 48px; padding: 10px 12px; margin-bottom: 12px; border: 1px solid rgba(255,255,255,0.1); border-radius: 8px; background: rgba(255,255,255,0.04); }
        .watch-room-meta span { display: inline-flex; align-items: center; gap: 6px; color: var(--color-text-secondary); font-size: 0.82rem; }
        .watch-room-meta strong, .watch-token-head strong, .watch-token-summary strong, .watch-confirm strong, .watch-ticket strong, .watch-leaderboard strong { color: #22d3ee; font-family: Orbitron, sans-serif; }
        .watch-full { width: 100%; justify-content: center; margin-bottom: 12px; }
        .watch-entry-credit { margin: -4px 0 12px; padding: 9px 10px; border: 1px solid rgba(34,211,238,0.22); border-radius: 8px; color: #bff7ff; background: rgba(34,211,238,0.08); font-size: 0.78rem; text-align: center; }
        .watch-locked { min-height: 46px; display: flex; align-items: center; justify-content: center; gap: 8px; margin-bottom: 12px; border: 1px dashed rgba(251,191,36,0.36); border-radius: 8px; color: #fbbf24; background: rgba(251,191,36,0.08); }
        .watch-invite-locked { padding: 8px 10px; text-decoration: none; transition: background var(--transition-fast), border-color var(--transition-fast); }
        .watch-invite-locked:hover { border-color: rgba(251,191,36,0.62); background: rgba(251,191,36,0.13); }
        .watch-alert, .watch-ok { display: flex; align-items: center; gap: 8px; padding: 10px 12px; margin-bottom: 12px; border-radius: 8px; font-size: 0.83rem; }
        .watch-alert { border: 1px solid rgba(255,107,107,0.4); color: #ffb4b4; background: rgba(255,107,107,0.1); }
        .watch-ok { border: 1px solid rgba(0,230,118,0.34); color: #b9ffd0; background: rgba(0,230,118,0.09); }
        .watch-token-panel { display: grid; gap: 10px; margin: 14px 0 10px; padding: 12px; border: 1px solid rgba(34,211,238,0.22); border-radius: 8px; background: rgba(2,8,16,0.68); }
        .watch-token-panel.locked { opacity: 0.86; }
        .watch-token-head span, .watch-confirm span { display: block; color: var(--color-text-muted); font-size: 0.76rem; font-weight: 700; text-transform: uppercase; }
        .watch-token-head strong { display: block; margin-top: 2px; font-size: 1.35rem; }
        .watch-token-summary { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 6px; }
        .watch-token-summary span { display: grid; gap: 2px; min-height: 44px; padding: 7px 8px; border-radius: 8px; color: var(--color-text-muted); background: rgba(255,255,255,0.045); font-size: 0.68rem; }
        .watch-token-summary strong { font-size: 0.82rem; }
        .watch-token-controls { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)) 78px; gap: 6px; }
        .watch-token-controls button, .watch-token-controls input { height: 38px; min-width: 0; border: 1px solid rgba(34,211,238,0.26); border-radius: 8px; color: var(--color-text-primary); background: rgba(15,23,42,0.84); font-size: 0.78rem; font-weight: 800; }
        .watch-token-controls button.active { color: #061016; background: #22d3ee; }
        .watch-token-controls button:disabled, .watch-token-controls input:disabled { opacity: 0.55; }
        .watch-token-controls input { padding: 0 9px; }
        .watch-token-warning, .watch-control-note { min-height: 34px; display: flex; align-items: center; gap: 7px; padding: 8px 10px; border-radius: 8px; font-size: 0.78rem; font-weight: 800; }
        .watch-token-warning { color: #ffb4b4; background: rgba(255,107,107,0.12); }
        .watch-control-note { color: #fbbf24; background: rgba(251,191,36,0.08); }
        .watch-lock-time { color: var(--color-text-muted); font-size: 0.76rem; text-align: right; }
        .watch-options { display: grid; gap: 10px; }
        .watch-option { min-height: 62px; display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 12px; border: 1px solid rgba(255,255,255,0.1); border-radius: 8px; color: var(--color-text-primary); background: rgba(15,23,42,0.9); }
        .watch-option span { display: grid; gap: 4px; min-width: 0; text-align: left; }
        .watch-option strong { min-width: 0; overflow: hidden; color: var(--color-text-primary); text-overflow: ellipsis; white-space: nowrap; }
        .watch-option em { color: var(--color-text-muted); font-size: 0.74rem; font-style: normal; }
        .watch-option b { color: #22d3ee; font-family: Orbitron, sans-serif; font-size: 0.96rem; }
        .watch-option.selected { border-color: #22d3ee; background: rgba(34,211,238,0.12); }
        .watch-option:disabled { opacity: 0.72; }
        .watch-confirm { min-height: 56px; margin-top: 10px; padding: 10px 12px; border: 1px solid rgba(34,211,238,0.22); border-radius: 8px; background: rgba(34,211,238,0.07); }
        .watch-confirm div { display: grid; gap: 3px; min-width: 0; }
        .watch-confirm strong { min-width: 0; overflow: hidden; font-size: 0.76rem; text-overflow: ellipsis; white-space: nowrap; }
        .watch-confirm button { flex: 0 0 auto; }
        .watch-ticket { display: grid; gap: 10px; margin-top: 12px; padding: 12px; border: 1px solid rgba(34,211,238,0.28); border-radius: 8px; background: rgba(34,211,238,0.08); }
        .watch-ticket-head { min-height: 28px; justify-content: flex-start; }
        .watch-ticket-head span { flex: 1; min-width: 0; overflow: hidden; color: var(--color-text-primary); text-overflow: ellipsis; white-space: nowrap; }
        .watch-ticket-head em { color: var(--color-text-muted); font-size: 0.72rem; font-style: normal; font-weight: 800; }
        .watch-ticket-grid { display: grid; grid-template-columns: 1fr auto; gap: 6px 12px; }
        .watch-ticket-grid span { color: var(--color-text-muted); font-size: 0.78rem; }
        .watch-leaderboard { margin-top: 14px; padding: 12px; border: 1px solid rgba(255,255,255,0.1); border-radius: 8px; background: rgba(255,255,255,0.04); }
        .watch-leaderboard h2 { margin: 0 0 8px; font-size: 0.92rem; }
        .watch-leaderboard div { min-height: 34px; color: var(--color-text-secondary); font-size: 0.84rem; }
        @media (max-width: 460px) {
          .watch-token-summary { grid-template-columns: 1fr; }
          .watch-token-controls { grid-template-columns: repeat(4, minmax(0, 1fr)); }
          .watch-token-controls input { grid-column: 1 / -1; }
          .watch-confirm { align-items: stretch; flex-direction: column; }
          .watch-confirm button { width: 100%; justify-content: center; }
        }
      `}</style>
    </section>
  );
}
