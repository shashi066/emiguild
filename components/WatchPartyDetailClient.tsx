'use client';

import Link from 'next/link';
import { useState } from 'react';
import { ArrowLeft, CheckCircle2, Clock, Info, Lock, Phone, Trophy, Tv } from 'lucide-react';
import { EmicoinAmount } from '@/components/watch-party/EmicoinAmount';
import InfoGuideModal from '@/components/InfoGuideModal';
import { readApiResponse } from '@/lib/read-api-response';
import { possibleEmicReturn } from '@/lib/watch-party-odds';
import {
  fanPickStatusLabel,
  fanPickWindowStatusLabel,
  formatRewardLabel,
  resolvedRewardLabel,
} from '@/lib/watch-party-presentation';

const FAN_PICK_GUIDE_STEPS = [
  {
    title: 'Open Fan Picks',
    description: 'You must be invited, checked in at the counter, and entered into this watch party before you can make a Fan Pick.',
  },
  {
    title: 'Select an EMIC Amount',
    description: 'Choose how much of your EMIC Rewards balance to use. You cannot select more than your current balance.',
  },
  {
    title: 'Understand the Potential Reward',
    description: 'Each outcome shows a reward label, such as 2× Reward, and a Potential Reward. For a correct pick, the reward equals the selected EMIC multiplied by the displayed factor and includes the selected EMIC.',
  },
  {
    title: 'Confirm once',
    description: 'Choose one outcome and confirm it before the displayed closing time. The selected EMIC is deducted immediately, and your Fan Pick cannot be changed.',
  },
  {
    title: 'Check the official result',
    description: 'A correct pick receives the displayed reward. If your pick does not match, no reward is credited. If Fan Picks are cancelled, your selected EMIC is restored.',
  },
  {
    title: 'EMIC stays in EmiGuild',
    description: 'EMIC is an in-app EmiGuild reward currency. It has no cash value and cannot be withdrawn or exchanged for cash.',
  },
] as const;

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

const QUICK_TOKEN_AMOUNTS = [25, 50, 100, 250];
const MAX_EMIC_STAKE = 100_000;

function possibleReturn(stakeCoins: number, multiplier: string) {
  return possibleEmicReturn(stakeCoins, multiplier);
}

export function WatchPartyDetailClient({
  initialParty,
  signedIn,
}: {
  initialParty: WatchPartyDetail;
  signedIn: boolean;
}) {
  const [party, setParty] = useState(initialParty);
  const [stakeInput, setStakeInput] = useState(
    String(initialParty.prediction?.stakeCoins ?? 25),
  );
  const [selectedOptionKey, setSelectedOptionKey] = useState(initialParty.prediction?.optionKey ?? '');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [guideOpen, setGuideOpen] = useState(false);
  const parsedStake = /^\d+$/.test(stakeInput) ? Number(stakeInput) : Number.NaN;
  const stakeCoins = Number.isSafeInteger(parsedStake) && parsedStake >= 1 && parsedStake <= MAX_EMIC_STAKE
    ? parsedStake
    : null;

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
    if (stakeCoins == null) {
      setError('Enter an EMIC amount from 1 to 1,00,000.');
      return;
    }
    setBusy(optionKey);
    setError('');
    setNotice('');
    try {
      const res = await fetch(`/api/watch-parties/${party.id}/predictions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ optionKey, stakeCoins }),
      });
      const data = await readApiResponse<{ party: WatchPartyDetail; error?: string }>(res, 'Could not confirm your Fan Pick. Please try again.');
      if (!res.ok) throw new Error(data.error || 'Could not confirm your Fan Pick. Please try again.');
      setParty(data.party);
      setSelectedOptionKey(data.party.prediction?.optionKey ?? optionKey);
      setNotice('Fan Pick confirmed.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not confirm your Fan Pick. Please try again.');
    } finally {
      setBusy('');
    }
  };

  const hasPrediction = Boolean(party.prediction);
  const walletCoins = party.walletCoins;
  const selectedOption = party.options.find((option) => option.key === selectedOptionKey) ?? null;
  const balanceAfter = walletCoins == null || stakeCoins == null ? null : walletCoins - stakeCoins;
  const amountInvalid = stakeCoins == null;
  const amountTooHigh = walletCoins != null && stakeCoins != null && stakeCoins > walletCoins;
  const amountError = amountInvalid
    ? 'Enter an EMIC amount from 1 to 1,00,000.'
    : amountTooHigh
      ? 'Your EMIC balance is lower than the selected amount.'
      : '';
  const predictionLockedCopy = !signedIn
    ? 'Login to enter this watch party.'
    : !party.invite.invited
      ? 'An EmiGuild invite is required before Fan Picks.'
      : !party.invite.checkedIn
        ? 'Counter check-in is required before Fan Picks.'
        : !party.invite.entered
          ? 'Enter this watch party to open Fan Picks.'
          : party.predictionStatus !== 'OPEN'
            ? `${fanPickWindowStatusLabel(party.predictionStatus)}.`
            : !party.invite.canPredict && !hasPrediction
              ? 'Fan Picks are unavailable for this event.'
              : '';
  const controlsDisabled = hasPrediction || !party.invite.canPredict || Boolean(busy);
  const canChooseOption = !controlsDisabled && !amountInvalid && !amountTooHigh && walletCoins != null;
  const canLockPrediction = Boolean(selectedOption) && canChooseOption;

  return (
    <section className="watch-room">
      <div className="watch-back-row">
        <Link href="/watch-party" className="btn btn-ghost btn-sm">
          <ArrowLeft size={16} />
          Watch Parties
        </Link>
      </div>

      <div className="watch-room-head">
        <div className="watch-live-icon"><Tv size={21} /></div>
        <div>
          <div className="watch-kicker">EmiGuild Watch Parties</div>
          <h1>{party.homeTeam} vs {party.awayTeam}</h1>
        </div>
        <button
          className="watch-guide-button"
          type="button"
          onClick={() => setGuideOpen(true)}
          aria-label="Open How Fan Picks Work guide"
          aria-haspopup="dialog"
          title="How Fan Picks Work"
        >
          <Info size={18} aria-hidden="true" />
          <span>Info</span>
        </button>
      </div>

      <div className="watch-room-meta">
        <span><Clock size={14} />{formatTime(party.kickoffAt)}</span>
        <strong>EMIC Balance <EmicoinAmount value={walletCoins} /></strong>
      </div>

      {error && <div className="watch-alert" role="alert">{error}</div>}
      {notice && <div className="watch-ok" role="status"><CheckCircle2 size={15} />{notice}</div>}

      {!signedIn ? (
        <Link href="/login" className="btn btn-primary watch-full">Login to Enter</Link>
      ) : party.invite.canEnter && !party.invite.entered ? (
        <>
          <button className="btn btn-primary watch-full" type="button" onClick={enter} disabled={busy === 'enter'}>
            {busy === 'enter' ? 'Entering...' : 'Enter Watch Party'}
          </button>
          <div className="watch-entry-credit">
            <span>Watch Party Reward added:</span>
            <EmicoinAmount value={party.entryCoins} />
            <span>Entering opens Fan Picks.</span>
          </div>
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

      {!hasPrediction && <div
        className={`watch-token-panel ${controlsDisabled ? 'locked' : ''}`}
        role="group"
        aria-labelledby="fan-pick-emic-title"
      >
        <div className="watch-token-head">
          <div className="watch-token-heading">
            <span id="fan-pick-emic-title">Choose EMIC Amount</span>
            <p id="fan-pick-emic-help">Select a preset or enter a custom amount.</p>
          </div>
          <div className="watch-lock-time">Closes {formatTime(party.predictionLockAt)}</div>
        </div>

        <div className="watch-token-controls">
          {QUICK_TOKEN_AMOUNTS.map((amount) => (
            <button
              key={amount}
              type="button"
              className={stakeCoins === amount ? 'active' : ''}
              onClick={() => setStakeInput(String(amount))}
              disabled={controlsDisabled || (walletCoins != null && amount > walletCoins)}
              aria-pressed={stakeCoins === amount}
            >
              <EmicoinAmount value={amount} />
            </button>
          ))}
        </div>

        <label className="watch-custom-amount" htmlFor="fan-pick-emic-amount">
          <span>Custom EMIC Amount</span>
          <span className="watch-custom-input-wrap">
            <input
              id="fan-pick-emic-amount"
              type="number"
              min={1}
              max={MAX_EMIC_STAKE}
              step={1}
              inputMode="numeric"
              value={stakeInput}
              onChange={(event) => setStakeInput(event.target.value)}
              disabled={controlsDisabled}
              aria-invalid={Boolean(amountError)}
              aria-describedby={amountError ? 'fan-pick-emic-help fan-pick-emic-error' : 'fan-pick-emic-help'}
            />
            <b aria-hidden="true">EMIC</b>
          </span>
        </label>

        {balanceAfter != null && !amountTooHigh && (
          <div className="watch-balance-preview">
            <span>Remaining after confirmation</span>
            <strong><EmicoinAmount value={balanceAfter} /></strong>
          </div>
        )}

        {amountError && (
          <div id="fan-pick-emic-error" className="watch-token-warning" role="alert">{amountError}</div>
        )}
        {predictionLockedCopy && (
          <div className="watch-control-note"><Lock size={14} />{predictionLockedCopy}</div>
        )}
      </div>}

      <div className="watch-options">
        {party.options.map((option) => {
          const selected = (party.prediction?.optionKey ?? selectedOptionKey) === option.key;
          const optionReturn = stakeCoins == null ? null : possibleReturn(stakeCoins, option.multiplier);
          return (
            <button
              key={option.key}
              type="button"
              className={`watch-option ${selected ? 'selected' : ''}`}
              onClick={() => setSelectedOptionKey(option.key)}
              disabled={!canChooseOption}
            >
              <span className="watch-option-copy">
                <strong>{option.label}</strong>
                <em className="watch-option-reward">
                  <span>Potential Reward</span>
                  {optionReturn == null
                    ? <span>Enter a valid amount</span>
                    : <EmicoinAmount value={optionReturn} />}
                </em>
              </span>
              <b>{formatRewardLabel(option.multiplier)}</b>
            </button>
          );
        })}
      </div>

      {!hasPrediction && (
        <div className="watch-confirm">
          <div className="watch-confirm-copy">
            <span className="watch-confirm-choice">{selectedOption ? selectedOption.label : 'Choose Your Fan Pick'}</span>
            <p>{selectedOption ? 'Review your outcome, then confirm once.' : 'Select an outcome above to continue.'}</p>
          </div>
          <button
            className="btn btn-primary btn-sm"
            type="button"
            onClick={() => selectedOption && predict(selectedOption.key)}
            disabled={!canLockPrediction}
          >
            {busy && selectedOption ? 'Confirming...' : 'Confirm Fan Pick'}
          </button>
        </div>
      )}

      {party.prediction && (
        <div className="watch-ticket">
          <div className="watch-ticket-head">
            <Trophy size={17} />
            <span>{party.prediction.optionLabel}</span>
            <em>{fanPickStatusLabel(party.prediction.status)}</em>
          </div>
          <div className="watch-ticket-grid">
            <div className="watch-ticket-row">
              <span>EMIC Selected</span>
              <strong><EmicoinAmount value={party.prediction.stakeCoins} /></strong>
            </div>
            <div className="watch-ticket-row">
              <span>{resolvedRewardLabel(party.prediction.status)}</span>
              <strong>
              <EmicoinAmount
                value={
                  party.prediction.payoutCoins
                    ?? possibleReturn(
                      party.prediction.stakeCoins,
                      party.prediction.multiplier,
                    )
                }
              />
              </strong>
            </div>
          </div>
        </div>
      )}

      {party.leaderboard.length > 0 && (
        <div className="watch-leaderboard">
          <h2>Top Correct Picks</h2>
          {party.leaderboard.map((row, index) => (
            <div key={row.id}>
              <span>{index + 1}. {row.userName}</span>
              <strong><EmicoinAmount value={row.payoutCoins} /></strong>
            </div>
          ))}
        </div>
      )}

      {guideOpen && (
        <InfoGuideModal
          eyebrow="Fan Pick Guide"
          title="How Fan Picks Work"
          subtitle="Choose. Confirm. Check the result."
          titleId="fan-pick-guide-title"
          steps={FAN_PICK_GUIDE_STEPS}
          onClose={() => setGuideOpen(false)}
        />
      )}

      <style jsx>{`
        .watch-room { max-width: 620px; margin: 0 auto; }
        .watch-back-row { display: flex; margin-bottom: 20px; }
        .watch-room-head { display: flex; align-items: center; gap: 12px; margin-bottom: 14px; }
        .watch-room-head > div:nth-child(2) { min-width: 0; }
        .watch-guide-button { min-width: 72px; height: 48px; display: inline-flex; align-items: center; justify-content: center; gap: 6px; margin-left: auto; padding: 0 12px; border: 1px solid rgba(97,232,255,0.3); border-radius: 999px; background: #111b2a; color: #61e8ff; font: inherit; font-size: 0.78rem; font-weight: 900; cursor: pointer; }
        .watch-guide-button:focus-visible { outline: 2px solid #61e8ff; outline-offset: 3px; }
        .watch-live-icon { width: 44px; height: 44px; display: grid; place-items: center; flex: 0 0 44px; border: 1px solid rgba(34,211,238,0.35); border-radius: 8px; color: #22d3ee; background: rgba(34,211,238,0.1); }
        .watch-kicker { color: #22d3ee; font-size: 0.72rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0; }
        h1 { margin: 2px 0 0; font-size: 1.45rem; line-height: 1.12; }
        .watch-room-meta, .watch-token-head, .watch-ticket-head, .watch-leaderboard div { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
        .watch-room-meta { min-height: 56px; padding: 10px 12px; margin-bottom: 12px; border: 1px solid rgba(255,255,255,0.1); border-radius: 8px; background: rgba(255,255,255,0.04); }
        .watch-room-meta span { display: inline-flex; align-items: center; gap: 6px; color: var(--color-text-secondary); font-size: 0.82rem; }
        .watch-room-meta strong, .watch-token-head strong, .watch-token-summary strong, .watch-confirm strong, .watch-ticket strong, .watch-leaderboard strong { display: inline-flex; align-items: center; flex-wrap: wrap; gap: 4px; color: #22d3ee; font-family: Orbitron, sans-serif; }
        .watch-full { width: 100%; justify-content: center; margin-bottom: 12px; }
        .watch-entry-credit { min-height: 48px; display: flex; align-items: center; justify-content: center; flex-wrap: wrap; gap: 4px 7px; margin: -4px 0 12px; padding: 8px 10px; border: 1px solid rgba(34,211,238,0.22); border-radius: 8px; color: #bff7ff; background: rgba(34,211,238,0.08); font-size: 0.78rem; text-align: center; }
        .watch-locked { min-height: 48px; display: flex; align-items: center; justify-content: center; gap: 8px; margin-bottom: 12px; border: 1px dashed rgba(251,191,36,0.36); border-radius: 8px; color: #fbbf24; background: rgba(251,191,36,0.08); }
        .watch-invite-locked { padding: 8px 10px; text-decoration: none; transition: background var(--transition-fast), border-color var(--transition-fast); }
        .watch-invite-locked:hover { border-color: rgba(251,191,36,0.62); background: rgba(251,191,36,0.13); }
        .watch-alert, .watch-ok { display: flex; align-items: center; gap: 8px; padding: 10px 12px; margin-bottom: 12px; border-radius: 8px; font-size: 0.83rem; }
        .watch-alert { border: 1px solid rgba(255,107,107,0.4); color: #ffb4b4; background: rgba(255,107,107,0.1); }
        .watch-ok { border: 1px solid rgba(0,230,118,0.34); color: #b9ffd0; background: rgba(0,230,118,0.09); }
        .watch-token-panel { display: grid; gap: 10px; margin: 14px 0 10px; padding: 12px; border: 1px solid rgba(34,211,238,0.22); border-radius: 8px; background: rgba(2,8,16,0.68); }
        .watch-token-panel.locked { opacity: 0.86; }
        .watch-token-head { min-height: 48px; align-items: flex-start; flex-wrap: wrap; }
        .watch-token-heading { min-width: 0; display: grid; gap: 3px; }
        .watch-token-heading > span, .watch-confirm-choice { display: block; color: var(--color-text-primary); font-size: 0.82rem; font-weight: 900; text-transform: uppercase; }
        .watch-token-heading p { margin: 0; color: var(--color-text-muted); font-size: 0.74rem; line-height: 1.4; }
        .watch-token-controls { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; }
        .watch-token-controls button { min-width: 0; min-height: 56px; display: grid; place-items: center; padding: 6px 4px; border: 1px solid rgba(34,211,238,0.26); border-radius: 8px; color: var(--color-text-primary); background: rgba(15,23,42,0.84); font-size: 0.78rem; font-weight: 800; }
        .watch-token-controls button.active { border-color: #61e8ff; color: var(--color-text-primary); background: rgba(34,211,238,0.14); box-shadow: inset 0 0 0 1px rgba(124,58,237,0.16), 0 0 10px rgba(34,211,238,0.12); }
        .watch-token-controls button:focus-visible, .watch-custom-input-wrap input:focus-visible { outline: 2px solid #61e8ff; outline-offset: 2px; }
        .watch-token-controls button:disabled, .watch-custom-amount input:disabled { opacity: 0.55; }
        .watch-custom-amount { display: grid; gap: 6px; color: var(--color-text-muted); font-size: 0.72rem; font-weight: 800; text-transform: uppercase; }
        .watch-custom-input-wrap { position: relative; display: block; }
        .watch-custom-input-wrap input { width: 100%; min-height: 48px; padding: 0 62px 0 12px; border: 1px solid rgba(34,211,238,0.26); border-radius: 8px; color: var(--color-text-primary); background: rgba(15,23,42,0.84); font: inherit; font-size: 0.9rem; font-weight: 800; }
        .watch-custom-input-wrap b { position: absolute; top: 50%; right: 12px; transform: translateY(-50%); color: #22d3ee; font-size: 0.72rem; pointer-events: none; }
        .watch-balance-preview { min-height: 58px; display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 10px 12px; border: 1px solid rgba(255,255,255,0.08); border-radius: 8px; background: rgba(255,255,255,0.04); }
        .watch-balance-preview > span { color: var(--color-text-muted); font-size: 0.76rem; font-weight: 800; }
        .watch-balance-preview strong { display: inline-flex; color: #22d3ee; font-family: Orbitron, sans-serif; }
        .watch-token-warning, .watch-control-note { min-height: 34px; display: flex; align-items: center; gap: 7px; padding: 8px 10px; border-radius: 8px; font-size: 0.78rem; font-weight: 800; }
        .watch-token-warning { color: #ffb4b4; background: rgba(255,107,107,0.12); }
        .watch-control-note { color: #fbbf24; background: rgba(251,191,36,0.08); }
        .watch-lock-time { color: var(--color-text-muted); font-size: 0.76rem; text-align: right; }
        .watch-options { display: grid; gap: 10px; }
        .watch-option { min-height: 86px; display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: 10px; padding: 10px 12px; border: 1px solid rgba(255,255,255,0.1); border-radius: 8px; color: var(--color-text-primary); background: rgba(15,23,42,0.9); }
        .watch-option-copy { min-width: 0; display: grid; gap: 5px; text-align: left; }
        .watch-option strong { min-width: 0; color: var(--color-text-primary); overflow-wrap: anywhere; }
        .watch-option-reward { min-width: 0; display: flex; align-items: center; flex-wrap: wrap; gap: 6px 8px; color: var(--color-text-muted); font-size: 0.74rem; font-style: normal; }
        .watch-option b { white-space: nowrap; color: #22d3ee; font-family: Orbitron, sans-serif; font-size: 0.96rem; }
        .watch-option.selected { border-color: #22d3ee; background: rgba(34,211,238,0.12); }
        .watch-option:disabled { opacity: 0.72; }
        .watch-confirm { min-height: 72px; display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: 10px; margin-top: 10px; padding: 10px 12px; border: 1px solid rgba(34,211,238,0.22); border-radius: 8px; background: rgba(34,211,238,0.07); }
        .watch-confirm-copy { min-width: 0; display: grid; gap: 5px; }
        .watch-confirm-copy p { margin: 0; color: var(--color-text-muted); font-size: 0.76rem; line-height: 1.4; }
        .watch-confirm button { min-height: 48px; flex: 0 0 auto; }
        .watch-ticket { display: grid; gap: 10px; margin-top: 12px; padding: 12px; border: 1px solid rgba(34,211,238,0.28); border-radius: 8px; background: rgba(34,211,238,0.08); }
        .watch-ticket-head { min-height: 48px; justify-content: flex-start; flex-wrap: wrap; }
        .watch-ticket-head span { flex: 1 1 140px; min-width: 0; color: var(--color-text-primary); overflow-wrap: anywhere; }
        .watch-ticket-head em { color: var(--color-text-muted); font-size: 0.72rem; font-style: normal; font-weight: 800; }
        .watch-ticket-grid { display: grid; gap: 6px; }
        .watch-ticket-row { min-height: 48px; display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: 8px 12px; padding: 4px 0; }
        .watch-ticket-row span { min-width: 0; color: var(--color-text-muted); font-size: 0.78rem; overflow-wrap: anywhere; }
        .watch-ticket-row strong { min-width: 0; max-width: 100%; }
        .watch-leaderboard { margin-top: 14px; padding: 12px; border: 1px solid rgba(255,255,255,0.1); border-radius: 8px; background: rgba(255,255,255,0.04); }
        .watch-leaderboard h2 { margin: 0 0 8px; font-size: 0.92rem; }
        .watch-leaderboard div { min-height: 48px; display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: 8px 12px; color: var(--color-text-secondary); font-size: 0.84rem; }
        .watch-leaderboard div > span { min-width: 0; overflow-wrap: anywhere; }
        .watch-leaderboard div > strong { min-width: 0; max-width: 100%; justify-self: end; }
        @media (max-width: 460px) {
          .watch-room-head { display: grid; grid-template-columns: 44px minmax(0, 1fr); align-items: start; gap: 8px; }
          .watch-guide-button { grid-column: 1 / -1; width: 100%; min-width: 0; margin-left: 0; }
          .watch-room-meta { align-items: flex-start; flex-direction: column; }
          .watch-token-controls { grid-template-columns: repeat(2, minmax(0, 1fr)); }
          .watch-balance-preview { align-items: flex-start; flex-direction: column; }
          .watch-confirm { grid-template-columns: minmax(0, 1fr); align-items: stretch; }
          .watch-confirm button { width: 100%; justify-content: center; }
        }
        @media (max-width: 360px) {
          .watch-room { min-width: 0; }
          .watch-room-meta strong { flex-wrap: wrap; }
          .watch-token-panel, .watch-ticket, .watch-leaderboard { padding: 10px; }
          .watch-token-head { align-items: flex-start; flex-direction: column; }
          .watch-lock-time { text-align: left; }
          .watch-option { grid-template-columns: minmax(0, 1fr); }
          .watch-option b { justify-self: start; }
          .watch-ticket-row { grid-template-columns: minmax(0, 1fr); }
          .watch-ticket-row strong { justify-self: start; }
        }
      `}</style>
    </section>
  );
}
