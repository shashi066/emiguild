'use client';

import { LuckyFusion } from './LuckyFusion';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { ForgeReveal } from './rewards/ForgeReveal';
import { SLOT_META, rarityTheme, slotLabel, artifactImagePath, ArtifactSigil } from './rewards/armory-visuals';
import { executeDailyReward, waitForRewardReveal } from '@/lib/daily-reward-client';
import { useSession } from 'next-auth/react';
import { ArmoryRouteLoader } from './ArmoryLoadingBoundary';
import authStyles from './armory-auth.module.css';
import { InfoGuideModal } from '@/components/InfoGuideModal';
import InfoGuideButton from '@/components/InfoGuideButton';
import { RewardTicketCard } from '@/components/RewardTicketCard';
import { getArtifactRewardTicketDisplay } from '@/lib/reward-ticket';
import {
  canRetryForgeRefresh,
  createForgeClockAnchor,
  formatForgeCountdown,
  getForgeRefreshRetryAt,
  getForgeRemainingMs,
  type ForgeClockAnchor,
} from '@/lib/armory-clock';
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  ChevronRight,
  Circle,
  Clock,
  Crown,
  Footprints,
  Gamepad2,
  Gem,
  Hand,
  IndianRupee,
  Package,
  Percent,
  Store,
  Shield,
  Sparkles,
  Ticket,
  X,
  Zap,
} from 'lucide-react';

const SLOTS = ['HEADGEAR', 'ARMOR', 'GLOVES', 'BOOTS'] as const;
const RARITIES = ['ALL', 'BRONZE', 'SILVER', 'GOLD', 'PLATINUM'] as const;
const RARITY_DISPLAY_ORDER = ['PLATINUM', 'GOLD', 'SILVER', 'BRONZE'] as const;
const FORGE_ANIMATION_MS = 3000;
const EQUIP_ANIMATION_MS = 900;

type ArmoryActionOverlayType = 'equip' | 'unequip';
type ArmoryLoadOptions = {
  force?: boolean;
  background?: boolean;
};
type ArmoryLoadResult = {
  ok: boolean;
  applied: boolean;
  error?: string;
};

const RARITY_UPGRADE: Record<string, string> = {
  BRONZE: 'SILVER',
  SILVER: 'GOLD',
  GOLD: 'PLATINUM',
};

async function readJson(res: Response) {
  const text = await res.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}

function wait(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function ticketMeta(snapshot: any) {
  const type = snapshot?.rewardType ?? '';
  if (type === 'PERCENT_DISCOUNT') {
    return { label: 'Booking Discount', value: `${snapshot?.discountPercentage ?? 0}%`, Icon: Percent, accent: '#ffd66e' };
  }
  if (type === 'FIXED_DISCOUNT') {
    return { label: 'Booking Discount', value: `₹${snapshot?.discountAmount ?? 0}`, Icon: IndianRupee, accent: '#61e8ff' };
  }
  if (type === 'GAMING_MINUTES') {
    return { label: 'Gaming Minutes', value: `${snapshot?.gamingMinutes ?? 0} min`, Icon: Gamepad2, accent: '#b884ff' };
  }
  if (type === 'RACING_MINUTES') {
    return { label: 'Racing Minutes', value: `${snapshot?.racingMinutes ?? 0} min`, Icon: Zap, accent: '#8ee8ff' };
  }
  if (type === 'SQUAD_NIGHT') {
    return { label: 'Squad Night', value: '1 hr', Icon: Gamepad2, accent: '#b884ff' };
  }
  if (type === 'BRONZE_PASS') {
    return { label: 'Bronze Pass', value: '10 hr', Icon: Shield, accent: '#ffaa3d' };
  }
  return { label: 'Armory Reward', value: 'Reward', Icon: Ticket, accent: '#ffd66e' };
}

function getEquippedSlot(loadout: any, artifactId?: string) {
  if (!artifactId) return null;
  return SLOTS.find((slot) => loadout?.[slot]?.id === artifactId) ?? null;
}

function buildSetProgress(state: any) {
  const loadout = state?.loadout ?? {};
  const equipped = SLOTS.map((slot) => loadout[slot]).filter(Boolean);
  const completeSet = state?.progress?.completeSet ?? null;
  const sameSetId = equipped.length ? equipped[0]?.setId : null;
  const isMixed = equipped.some((artifact: any) => artifact.setId !== sameSetId);
  const activeSet = completeSet ?? (!isMixed && sameSetId ? state?.sets?.find((set: any) => set.id === sameSetId) : null);

  return {
    activeSet,
    completeSet,
    isMixed: equipped.length > 1 && isMixed,
    count: activeSet ? SLOTS.filter((slot) => loadout[slot]?.setId === activeSet.id).length : equipped.length,
  };
}

function progressSnapshot(loadout: any, sets: any[]) {
  const equipped = SLOTS.map((slot) => loadout?.[slot]).filter(Boolean);
  if (equipped.length !== SLOTS.length) return { completeSet: null, reward: null };

  const setId = equipped[0]?.setId;
  const completeSet = equipped.every((artifact: any) => artifact.setId === setId)
    ? sets.find((set: any) => set.id === setId) ?? null
    : null;

  return {
    completeSet,
    reward: completeSet?.rewards?.[0] ?? null,
  };
}

function updateInventory(inventory: any[], artifact: any, delta: number) {
  const existing = inventory.find((row) => row.artifactId === artifact.id || row.artifact?.id === artifact.id);
  if (!existing && delta <= 0) return inventory;

  if (!existing) {
    return [{ id: `local-${artifact.id}`, artifactId: artifact.id, quantity: delta, artifact }, ...inventory];
  }

  const nextQuantity = (existing.quantity ?? 0) + delta;
  if (nextQuantity <= 0) return inventory.filter((row) => row !== existing);
  return inventory.map((row) => row === existing ? { ...row, quantity: nextQuantity } : row);
}

export function ArmoryClient({ initialState, initialError = '' }: { initialState?: any; initialError?: string }) {
  const { data: session, status } = useSession();
  const [state, setState] = useState<any>(initialState ?? null);
  const [loading, setLoading] = useState(!initialState && !initialError);
  const [saving, setSaving] = useState(false);
  const [forging, setForging] = useState(false);
  const [error, setError] = useState(initialError);
  const [notice, setNotice] = useState('');
  const [forgeResult, setForgeResult] = useState<any>(null);
  const [forgeCharging, setForgeCharging] = useState(false);
  const forgeAnimationRef = useRef<AbortController | null>(null);
  const actionInFlightRef = useRef(false);
  useEffect(() => () => { forgeAnimationRef.current?.abort(); }, []);
  const [actionOverlay, setActionOverlay] = useState<ArmoryActionOverlayType | null>(null);
  const [claimConfirmation, setClaimConfirmation] = useState<any>(null);
  const [guideOpen, setGuideOpen] = useState(false);
  const [rarityFilter, setRarityFilter] = useState('ALL');
  const [slotFilter, setSlotFilter] = useState('ALL');
  const [nextForgeTimer, setNextForgeTimer] = useState('--:--:--');
  const [resetError, setResetError] = useState('');
  const ticketsSectionRef = useRef<HTMLElement>(null);
  const claimConfirmButtonRef = useRef<HTMLButtonElement>(null);
  const previousClaimFocusRef = useRef<HTMLElement | null>(null);
  const stateRef = useRef<any>(initialState ?? null);
  const forgeClockAnchorRef = useRef<ForgeClockAnchor | null>(null);
  const forgeClockSignatureRef = useRef('');
  const stateMutationRevisionRef = useRef(0);
  const activeStateMutationsRef = useRef(0);
  const stateRequestRef = useRef<Promise<{ data: any; applied: boolean }> | null>(null);
  const clockRefreshRef = useRef<Promise<boolean> | null>(null);
  const forgeRefreshRetryAtRef = useRef(0);

  const calibrateForgeClock = useCallback((authoritativeState: any) => {
    const serverNow = authoritativeState?.serverNow;
    const nextResetAt = authoritativeState?.forge?.nextResetAt;
    const signature = `${serverNow ?? ''}|${nextResetAt ?? ''}`;
    if (signature === forgeClockSignatureRef.current) return;

    forgeClockSignatureRef.current = signature;
    const anchor = createForgeClockAnchor(serverNow, nextResetAt, performance.now());
    forgeClockAnchorRef.current = anchor;
    setNextForgeTimer(formatForgeCountdown(getForgeRemainingMs(anchor, performance.now())));
  }, []);

  const requestArmoryState = useCallback(async () => {
    if (stateRequestRef.current) return stateRequestRef.current;

    const requestRevision = stateMutationRevisionRef.current;
    const request = (async () => {
      const res = await fetch('/api/armory', { cache: 'no-store' });
      const data = await readJson(res);
      if (!res.ok) throw new Error(data.error || 'Failed to load Artifacts.');

      const applied = (
        requestRevision === stateMutationRevisionRef.current
        && activeStateMutationsRef.current === 0
      );
      if (applied) {
        calibrateForgeClock(data);
        stateRef.current = data;
        setState(data);
      }
      return { data, applied };
    })();

    stateRequestRef.current = request;
    try {
      return await request;
    } finally {
      if (stateRequestRef.current === request) stateRequestRef.current = null;
    }
  }, [calibrateForgeClock]);

  const load = useCallback(async ({ force = false, background = false }: ArmoryLoadOptions = {}): Promise<ArmoryLoadResult> => {
    if (!force && initialState && stateRef.current) {
      if (!background) setLoading(false);
      return { ok: true, applied: true };
    }
    if (status !== 'authenticated') {
      if (!background) setLoading(false);
      return { ok: false, applied: false };
    }

    if (!background) setLoading(true);
    try {
      const result = await requestArmoryState();
      if (!background) setError('');
      return { ok: true, applied: result.applied };
    } catch (err: any) {
      const message = err.message || 'Failed to load Artifacts.';
      if (!background) setError(message);
      return { ok: false, applied: false, error: message };
    } finally {
      if (!background) setLoading(false);
    }
  }, [initialState, requestArmoryState, status]);

  const refreshAuthoritativeClock = useCallback(async () => {
    if (status !== 'authenticated') return false;
    if (clockRefreshRef.current) return clockRefreshRef.current;
    if (activeStateMutationsRef.current > 0) return false;

    const monotonicNow = performance.now();
    if (!canRetryForgeRefresh(monotonicNow, forgeRefreshRetryAtRef.current)) return false;

    const refresh = (async () => {
      const result = await load({ force: true, background: true });
      if (result.ok && result.applied) {
        if (!forgeClockAnchorRef.current) {
          forgeRefreshRetryAtRef.current = getForgeRefreshRetryAt(performance.now());
          setResetError('Daily Forge timing could not be verified. It will retry automatically.');
          return false;
        }
        forgeRefreshRetryAtRef.current = 0;
        setResetError('');
        return true;
      }
      if (result.ok) return false;

      if (result.error) {
        forgeRefreshRetryAtRef.current = getForgeRefreshRetryAt(performance.now());
        setResetError('Daily Forge status could not be refreshed. It will retry automatically.');
      }
      return false;
    })();

    clockRefreshRef.current = refresh;
    try {
      return await refresh;
    } finally {
      if (clockRefreshRef.current === refresh) clockRefreshRef.current = null;
    }
  }, [load, status]);

  useEffect(() => {
    stateRef.current = state;
    calibrateForgeClock(state);
  }, [calibrateForgeClock, state]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (status !== 'authenticated') return;

    const tick = () => {
      const remainingMs = getForgeRemainingMs(forgeClockAnchorRef.current, performance.now());
      setNextForgeTimer(formatForgeCountdown(remainingMs));
      if (
        stateRef.current
        && (remainingMs === null || remainingMs <= 0)
      ) {
        void refreshAuthoritativeClock();
      }
    };

    tick();
    const id = window.setInterval(tick, 500);
    return () => window.clearInterval(id);
  }, [refreshAuthoritativeClock, status]);

  useEffect(() => {
    if (status !== 'authenticated') return;
    let wasHidden = document.visibilityState === 'hidden';

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        wasHidden = true;
        return;
      }
      if (wasHidden) {
        wasHidden = false;
        void refreshAuthoritativeClock();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [refreshAuthoritativeClock, status]);

  useEffect(() => {
    if (!claimConfirmation) return;
    claimConfirmButtonRef.current?.focus();
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !saving) {
        setClaimConfirmation(null);
        window.setTimeout(() => {
          if (previousClaimFocusRef.current?.isConnected) {
            previousClaimFocusRef.current.focus();
          }
        }, 0);
      }
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [claimConfirmation, saving]);

  const inventoryTotal = useMemo(() => {
    return (state?.inventory ?? []).reduce((sum: number, row: any) => sum + (row.quantity ?? 0), 0);
  }, [state]);

  const inventory = useMemo(() => {
    const rows = state?.inventory ?? [];
    return rows.filter((row: any) => {
      const artifact = row.artifact;
      const rarityOk = rarityFilter === 'ALL' || artifact.set.rarity === rarityFilter;
      const slotOk = slotFilter === 'ALL' || artifact.slotType === slotFilter;
      return rarityOk && slotOk;
    });
  }, [rarityFilter, slotFilter, state]);

  const allArtifacts = state?.artifacts ?? [];
  const revealArtifact = forgeResult
    ? allArtifacts.find((artifact: any) => artifact.id === forgeResult.id) ?? forgeResult
    : null;
  const setProgress = buildSetProgress(state);
  const hasBlockingArmoryOverlay = Boolean(forgeCharging || revealArtifact || actionOverlay);

  useEffect(() => {
    if (!hasBlockingArmoryOverlay) return;

    const body = document.body;
    const root = document.documentElement;
    const previousBodyOverflow = body.style.overflow;
    const previousRootOverflow = root.style.overflow;

    body.style.overflow = 'hidden';
    root.style.overflow = 'hidden';

    return () => {
      body.style.overflow = previousBodyOverflow;
      root.style.overflow = previousRootOverflow;
    };
  }, [hasBlockingArmoryOverlay]);

  const act = async (url: string, body?: any, overlayType?: ArmoryActionOverlayType) => {
    if (actionInFlightRef.current) return false;
    actionInFlightRef.current = true;
    const isForge = url.endsWith('/forge');
    const forgeAnimation = new AbortController();
    if (isForge) forgeAnimationRef.current = forgeAnimation;
    const forgeStartedAt = performance.now();
    const actionStartedAt = performance.now();
    stateMutationRevisionRef.current += 1;
    activeStateMutationsRef.current += 1;
    setSaving(true);
    if (isForge) {
      setForging(true);
      setForgeCharging(true);
      setForgeResult(null);
    }
    if (overlayType) setActionOverlay(overlayType);
    setError('');
    setNotice('');
    try {
      const data = isForge
        ? await executeDailyReward('forge', session?.user?.id ?? '')
        : await (async () => {
          const res = await fetch(url, {
            method: 'POST', headers: body ? { 'Content-Type': 'application/json' } : undefined,
            body: body ? JSON.stringify(body) : undefined,
          });
          const response = await readJson(res);
          if (!res.ok) throw new Error(response.error || 'Artifacts action failed.');
          return response;
        })();
      if (isForge && forgeAnimation.signal.aborted) return false;
      stateMutationRevisionRef.current += 1;
      if (data.state) {
        calibrateForgeClock(data.state);
        stateRef.current = data.state;
        setState(data.state);
      } else {
        setState((current: any) => {
          if (!current) return current;
          const artifacts = current.artifacts ?? [];

          if (data.selected) {
            const artifact = artifacts.find((item: any) => item.id === data.selected.id) ?? data.selected;
            return {
              ...current,
              forge: {
                ...current.forge,
                canForge: false,
                claimedToday: true,
                todayClaim: { ...(data.todayClaim ?? {}), artifact },
                reason: 'claimed',
              },
              inventory: updateInventory(current.inventory ?? [], artifact, 1),
            };
          }

          if (data.slotType) {
            const artifact = data.artifactId
              ? artifacts.find((item: any) => item.id === data.artifactId) ?? null
              : null;
            const loadout = { ...(current.loadout ?? {}), [data.slotType]: artifact };
            return {
              ...current,
              loadout,
              progress: progressSnapshot(loadout, current.sets ?? []),
            };
          }

          if (data.crafted) {
            const crafted = artifacts.find((item: any) => item.id === data.crafted.id) ?? data.crafted;
            const afterConsumed = updateInventory(current.inventory ?? [], { id: data.consumedArtifactId }, -(data.consumedQuantity ?? 3));
            return {
              ...current,
              inventory: updateInventory(afterConsumed, crafted, 1),
            };
          }

          if (data.ticket) {
            const inventory = (data.consumedArtifactIds ?? []).reduce(
              (rows: any[], artifactId: string) => updateInventory(rows, { id: artifactId }, -1),
              current.inventory ?? [],
            );
            const loadout = SLOTS.reduce((next, slot) => ({ ...next, [slot]: null }), {} as Record<string, null>);
            return {
              ...current,
              inventory,
              loadout,
              progress: { completeSet: null, reward: null },
              tickets: [data.ticket, ...(current.tickets ?? [])],
              guildGems: data.guildGems ?? current.guildGems ?? 0,
            };
          }

          return current;
        });
      }
      if (data.selected && isForge) {
        const remainingAnimationMs = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : Math.max(0, FORGE_ANIMATION_MS - (performance.now() - forgeStartedAt));
        if (remainingAnimationMs > 0) await waitForRewardReveal(remainingAnimationMs, forgeAnimation.signal);
        setForgeResult(data.selected);
      }
      if (data.crafted) {
        setForgeResult(data.crafted);
      }
      if (data.ticket) {
        setNotice(`Set consumed. +${data.gemsEarned ?? 1} Guild Gem earned.`);
        window.requestAnimationFrame(() => {
          window.requestAnimationFrame(() => {
            ticketsSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
          });
        });
      }
      return true;
    } catch (err: any) {
      if (!forgeAnimation.signal.aborted) setError(err.message || 'Artifacts action failed.');
      return false;
    } finally {
      actionInFlightRef.current = false;
      activeStateMutationsRef.current = Math.max(0, activeStateMutationsRef.current - 1);
      if (overlayType) {
        const remainingAnimationMs = Math.max(0, EQUIP_ANIMATION_MS - (performance.now() - actionStartedAt));
        if (remainingAnimationMs > 0) await wait(remainingAnimationMs);
      }
      setSaving(false);
      if (isForge) {
        setForging(false);
        setForgeCharging(false);
      }
      if (overlayType) setActionOverlay(null);
    }
  };

  const equipArtifact = (artifact: any) => act('/api/armory/equip', { slotType: artifact.slotType, artifactId: artifact.id }, 'equip');
  const unequipSlot = (slot: string) => act('/api/armory/equip', { slotType: slot, artifactId: null }, 'unequip');
  const craftArtifact = (artifact: any) => act('/api/armory/craft', { artifactId: artifact.id });
  const openClaimConfirmation = () => {
    if (!setProgress.completeSet) return;
    previousClaimFocusRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    setClaimConfirmation({
      set: setProgress.completeSet,
      reward: state?.progress?.reward,
    });
  };
  const closeClaimConfirmation = () => {
    if (saving) return;
    setClaimConfirmation(null);
    window.setTimeout(() => {
      if (previousClaimFocusRef.current?.isConnected) {
        previousClaimFocusRef.current.focus();
      }
    }, 0);
  };
  const confirmSetClaim = async () => {
    await act('/api/armory/claim-set');
    setClaimConfirmation(null);
    window.setTimeout(() => {
      if (previousClaimFocusRef.current?.isConnected) {
        previousClaimFocusRef.current.focus();
      }
    }, 0);
  };

  if (loading || status === 'loading') {
    return <ArmoryRouteLoader />;
  }

  if (status !== 'authenticated') {
    return (
      <main className={authStyles.page}>
        <div className={authStyles.shell}>
          <Link href="/" className={authStyles.back}><ArrowLeft size={16} aria-hidden="true" /> Back to Home</Link>
          <section className={authStyles.panel} aria-labelledby="armory-login-title">
            <span className={authStyles.icon}><Package size={40} aria-hidden="true" /></span>
            <p className={authStyles.eyebrow}>Artifacts</p>
            <h1 id="armory-login-title">EmiGuild Armory</h1>
            <p className={authStyles.description}>Log in to forge artifacts, build sets, and unlock reward tickets.</p>
            <Link href="/login?callbackUrl=/armory" className={authStyles.primary}>Log in to enter <ArrowRight size={18} aria-hidden="true" /></Link>
          </section>
        </div>
      </main>
    );
  }

  return (
    <main className="armory-rpg">
      <div className="armory-shell">
        <ArmoryHeader inventoryTotal={inventoryTotal} guildGems={state?.guildGems ?? 0} />
        <DailyForgePanel
          state={state}
          saving={saving}
          forging={forging}
          nextForgeTimer={nextForgeTimer}
          onForge={() => act('/api/armory/forge')}
          onGuide={() => setGuideOpen(true)}
          fusion={state && (
            <LuckyFusion
              state={state}
              userId={session?.user?.id ?? ''}
              busy={saving}
              onBusy={(value) => { stateMutationRevisionRef.current += 1; setSaving(value); }}
              refresh={async () => {
                await stateRequestRef.current?.catch(() => undefined);
                stateMutationRevisionRef.current += 1;
                await requestArmoryState();
              }}
            />
          )}
        />
        {error && <div className="armory-error" role="alert">{error}{!state && <button type="button" className="armory-secondary" onClick={() => void load({ force: true })}>Try again</button>}</div>}
        {resetError && <div className="armory-error">{resetError}</div>}
        {notice && <div className="armory-notice"><Gem size={16} />{notice}</div>}

        <RewardPreviewPanel sets={state?.sets ?? []} />

        <div className="armory-main-grid">
          <section className="armory-center">
            <LoadoutGrid loadout={state?.loadout ?? {}} saving={saving} onUnequip={unequipSlot} />
            <SetProgressPanel
              state={state}
              progress={setProgress}
              saving={saving}
              onClaim={openClaimConfirmation}
            />
          </section>
        </div>

        <section id="artifact-vault" className="armory-panel inventory-panel">
          <div className="section-heading">
            <div>
              <span>Inventory</span>
              <h2 className="font-orbitron">Artifact Vault</h2>
            </div>
            <small>{inventory.length} shown / {inventoryTotal} owned</small>
          </div>
          <ArtifactFilters rarityFilter={rarityFilter} slotFilter={slotFilter} setRarityFilter={setRarityFilter} setSlotFilter={setSlotFilter} />
          <ArtifactGrid
            inventory={inventory}
            rarityFilter={rarityFilter}
            loadout={state?.loadout ?? {}}
            saving={saving}
            onEquip={equipArtifact}
            onCraft={craftArtifact}
          />
        </section>

        <section ref={ticketsSectionRef} className="armory-panel tickets-panel">
          <div className="section-heading">
            <div>
              <span>Rewards</span>
              <h2 className="font-orbitron">Reward Tickets</h2>
            </div>
            <Ticket size={22} />
          </div>
          {state?.tickets?.length ? (
            <div className="ticket-grid">
              {state.tickets.map((ticket: any) => (
                <RewardTicketCard key={ticket.id} ticket={getArtifactRewardTicketDisplay(ticket)} />
              ))}
            </div>
          ) : (
            <p className="muted">Complete a matching set to create your first counter-redeemable ticket.</p>
          )}
        </section>
      </div>
      {claimConfirmation && (
        <div
          className="claim-confirm-layer"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeClaimConfirmation();
          }}
        >
          <section
            className="claim-confirm-card"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="claim-confirm-title"
            aria-describedby="claim-confirm-warning"
            style={{
              ['--claim-accent' as any]: rarityTheme(claimConfirmation.set.rarity).color,
            }}
          >
            <button
              type="button"
              className="claim-confirm-close"
              aria-label="Close reward confirmation"
              onClick={closeClaimConfirmation}
              disabled={saving}
            >
              <X size={18} />
            </button>
            <span className="claim-confirm-icon"><Gem size={24} /></span>
            <div className="claim-confirm-copy">
              <span>Set Completion</span>
              <h2 id="claim-confirm-title">Consume {claimConfirmation.set.name}?</h2>
              <p>Exchange the complete equipped set for its reward ticket and a Guild Gem.</p>
            </div>
            <div className="claim-confirm-summary">
              <div>
                <span>Artifacts consumed</span>
                <strong>4 equipped pieces</strong>
              </div>
              <div>
                <span>Reward ticket</span>
                <strong>{claimConfirmation.reward?.description ?? 'Set completion reward'}</strong>
              </div>
              <div>
                <span>Guild Gems</span>
                <strong className="claim-gem-reward"><Gem size={15} /> +1</strong>
              </div>
            </div>
            <p id="claim-confirm-warning" className="claim-confirm-warning">
              This permanently removes all four equipped artifacts and cannot be undone.
            </p>
            <div className="claim-confirm-actions">
              <button
                type="button"
                className="armory-secondary"
                onClick={closeClaimConfirmation}
                disabled={saving}
              >
                Keep Set
              </button>
              <button
                ref={claimConfirmButtonRef}
                type="button"
                className="armory-primary"
                onClick={confirmSetClaim}
                disabled={saving}
              >
                {saving ? 'Claiming...' : 'Consume & Claim'}
              </button>
            </div>
          </section>
        </div>
      )}
      {guideOpen && <ArtifactGuideModal onClose={() => setGuideOpen(false)} />}
      {(forgeCharging || revealArtifact) && (
        <ForgeReveal
          artifact={revealArtifact}
          saving={saving}
          onEquip={async () => {
            const equipped = await equipArtifact(revealArtifact);
            if (equipped) setForgeResult(null);
          }}
          onKeep={() => setForgeResult(null)}
        />
      )}
      {actionOverlay && <ArmoryActionOverlay type={actionOverlay} />}
      <ArmoryStyles />
    </main>
  );
}

function ArtifactGuideModal({ onClose }: { onClose: () => void }) {
  const steps = [
    {
      title: 'Forge one artifact each day',
      description: 'Tap Forge Artifact to receive one random artifact.',
      visual: { kind: 'icon', icon: Sparkles, label: 'Forge artifact' },
    },
    {
      title: 'Build one matching set',
      description: 'Collect Headgear, Armor, Gloves, and Boots from the same set.',
      visual: { kind: 'icon', icon: Package, label: 'Matching artifact set' },
    },
    {
      title: 'Equip all four pieces',
      description: 'Open Artifact Vault and equip one matching artifact in each slot.',
      visual: { kind: 'icon', icon: Shield, label: 'Equipped artifact set' },
    },
    {
      title: 'Claim your reward',
      description: 'Claiming permanently consumes all four equipped pieces and gives you a counter-redeemable reward ticket plus 1 Guild Gem.',
      visual: { kind: 'icon', icon: Ticket, label: 'Artifact Reward Ticket' },
    },
    {
      title: 'Use duplicate artifacts',
      description: 'Craft 3 unequipped copies of the same artifact into its next rarity, or use extras in Artifact Exchange.',
      visual: { kind: 'icon', icon: Store, label: 'Artifact crafting and exchange' },
    },
  ] as const;

  return (
    <InfoGuideModal
      eyebrow="Artifacts Guide"
      title="How Artifacts Work"
      subtitle="Forge. Match. Equip. Claim."
      titleId="artifact-guide-title"
      steps={steps}
      onClose={onClose}
      closeLabel="Close Artifacts guide"
    />
  );
}

function ArmoryActionOverlay({ type }: { type: ArmoryActionOverlayType }) {
  const isEquip = type === 'equip';
  const Icon = isEquip ? Shield : Package;

  return (
    <div className={isEquip ? 'armory-action-layer equip-action' : 'armory-action-layer unequip-action'} role="status" aria-live="polite">
      <div className="armory-action-orb">
        <Icon size={34} strokeWidth={1.8} />
      </div>
      <strong>{isEquip ? 'Equipping Artifact' : 'Returning Artifact'}</strong>
      <span>{isEquip ? 'Locking it into your loadout' : 'Moving it back to the vault'}</span>
    </div>
  );
}

function RewardPreviewPanel({ sets }: { sets: any[] }) {
  const rewardSets = sets
    .slice()
    .sort((a: any, b: any) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0));

  if (!rewardSets.length) return null;

  return (
    <section className="armory-panel reward-preview-panel">
      <div className="section-heading">
        <div>
          <span>Reward Preview</span>
          <h2 className="font-orbitron">Set Completion Rewards</h2>
        </div>
        <Ticket size={22} />
      </div>
      <div className="reward-preview-grid">
        {rewardSets.map((set: any) => {
          const reward = set.rewards?.[0];
          const theme = rarityTheme(set.rarity);
          const meta = reward ? ticketMeta(reward) : null;
          const Icon = meta?.Icon ?? Ticket;

          return (
            <article key={set.id} className="reward-preview-card" style={{ ['--preview-accent' as any]: theme.color, ['--preview-soft' as any]: theme.soft }}>
              <div className="preview-set-line">
                <span>{theme.label}</span>
                <strong>{set.name}</strong>
              </div>
              <div className="preview-reward-line">
                <Icon size={18} />
                <div>
                  <strong>{reward?.active === false ? 'Reward Paused' : meta?.value ?? 'Reward'}</strong>
                  <span>{reward?.description ?? 'Complete all four matching artifacts to unlock this reward.'}</span>
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function ArmoryHeader({ inventoryTotal, guildGems }: { inventoryTotal: number; guildGems: number }) {
  return (
    <header className="armory-topbar">
      <Link href="/" className="armory-back"><ArrowLeft size={16} /> Back</Link>
      <div className="topbar-stats">
        <a href="#artifact-vault" className="inventory-shortcut" aria-label="Go to inventory">
          <Package size={14} /> {inventoryTotal}
        </a>
        <Link href="/armory/marketplace" className="marketplace-shortcut">
          <Store size={14} /> Artifact Exchange
        </Link>
        <span className="gem-balance" aria-label={`${guildGems} Guild Gems`}>
          <Gem size={14} aria-hidden="true" /> {guildGems}
        </span>
      </div>
    </header>
  );
}

function DailyForgePanel({ state, saving, forging, nextForgeTimer, onForge, onGuide, fusion }: {
  state: any;
  saving: boolean;
  forging: boolean;
  nextForgeTimer: string;
  onForge: () => void;
  onGuide: () => void;
  fusion?: ReactNode;
}) {
  if (state?.forge?.reason === 'disabled') {
    return (
      <section className="armory-panel forge-disabled-card">
        <div className="forge-guide-control">{fusion}<InfoGuideButton onClick={onGuide} ariaLabel="Open How Artifacts Work guide" /></div>
        <Sparkles size={48} />
        <h2>Daily Forge Disabled</h2>
        <p>The Daily Forge feature is currently disabled by the administrator.</p>
      </section>
    );
  }

  const copy = state?.forge?.canForge
    ? 'A new artifact waits inside today\'s forge.'
    : state?.forge?.claimedToday
      ? 'Today\'s artifact is already in your vault.'
      : 'The forge is quiet for this season.';
  const claimedToday = state?.forge?.claimedToday;
  const buttonText = forging ? 'FORGING...' : claimedToday ? nextForgeTimer : 'FORGE ARTIFACT';

  return (
    <section className={forging ? 'forge-panel forging' : 'forge-panel'}>
      <div className="forge-guide-control">{fusion}<InfoGuideButton onClick={onGuide} ariaLabel="Open How Artifacts Work guide" /></div>
      <div className="forge-ring"><Sparkles size={34} /></div>
      <div className="forge-copy">
        <span className="eyebrow">Daily Forge</span>
        <h1 className="font-orbitron">Summon an Artifact</h1>
        <p>{copy}</p>
        <div className="rarity-row">
          {RARITIES.filter((rarity) => rarity !== 'ALL').map((rarity) => {
            const theme = rarityTheme(rarity);
            return <span key={rarity} style={{ color: theme.color, borderColor: `${theme.color}55`, background: theme.soft }}>{theme.label}</span>;
          })}
        </div>
      </div>
      <div className="forge-action">
        <button className={claimedToday ? 'armory-primary forge-locked' : 'armory-primary'} type="button" disabled={!state?.forge?.canForge || saving} onClick={onForge}>
          {claimedToday ? <Clock size={16} /> : <Zap size={16} />} {buttonText}
        </button>
      </div>
    </section>
  );
}

function LoadoutGrid({ loadout, saving, onUnequip }: { loadout: any; saving: boolean; onUnequip: (slot: string) => void }) {
  return (
    <section className="armory-panel loadout-panel">
      <div className="section-heading">
        <div>
          <span>Loadout</span>
          <h2 className="font-orbitron">Equipped Set</h2>
        </div>
      </div>
      <div className="loadout-stage">
        {SLOTS.map((slot) => (
          <EquipmentSlot key={slot} slot={slot} artifact={loadout?.[slot]} saving={saving} onUnequip={onUnequip} />
        ))}
      </div>
    </section>
  );
}

function EquipmentSlot({ slot, artifact, saving, onUnequip }: { slot: string; artifact: any; saving: boolean; onUnequip: (slot: string) => void }) {
  const Icon = SLOT_META[slot]?.Icon ?? Shield;
  const theme = rarityTheme(artifact?.set?.rarity);

  return (
    <div className={`equip-slot equip-${slot.toLowerCase()}`} style={artifact ? { borderColor: `${theme.color}70`, background: `linear-gradient(180deg, ${theme.soft}, rgba(9,13,26,0.94))` } : undefined}>
      <div className="slot-icon" style={artifact ? { color: theme.color } : undefined}>
        {artifact ? <ArtifactSigil artifact={artifact} size="sm" /> : <Icon size={24} />}
      </div>
      <div>
        <span>{slotLabel(slot)}</span>
        {artifact ? (
          <>
            <strong>{artifact.name}</strong>
            <small>{artifact.set.name} / {artifact.set.rarity}</small>
          </>
        ) : (
          <>
            <strong>Empty Slot</strong>
            <small>Choose a {slotLabel(slot).toLowerCase()} artifact</small>
          </>
        )}
      </div>
      {artifact && (
        <button type="button" className="mini-action" disabled={saving} onClick={() => onUnequip(slot)}>Unequip</button>
      )}
    </div>
  );
}

function SetProgressPanel({ state, progress, saving, onClaim }: { state: any; progress: any; saving: boolean; onClaim: () => void }) {
  const set = progress.activeSet;
  const reward = progress.completeSet ? state?.progress?.reward : set?.rewards?.[0];
  const title = progress.completeSet ? progress.completeSet.name : progress.isMixed ? 'Mixed Loadout' : set?.name ?? 'No Set Selected';

  return (
    <section className="armory-panel progress-panel">
      <div className="section-heading">
        <div>
          <span>Set Progress</span>
          <h2 className="font-orbitron">{title}</h2>
        </div>
        <strong>{progress.count} / 4</strong>
      </div>
      <div className="slot-checks">
        {SLOTS.map((slot) => {
          const complete = set ? state?.loadout?.[slot]?.setId === set.id : Boolean(state?.loadout?.[slot]);
          return (
            <div key={slot} className={complete ? 'slot-check done' : 'slot-check'}>
              {complete ? <CheckCircle2 size={16} /> : <Circle size={16} />}
              <span>{slotLabel(slot)}</span>
            </div>
          );
        })}
      </div>
      <div className="reward-strip">
        <Ticket size={18} />
        <span>{reward?.description ?? 'Equip four matching pieces to reveal a set reward.'}</span>
      </div>
      {progress.completeSet && (
        <button className="armory-primary claim-button" type="button" disabled={saving} onClick={onClaim}>
          Claim Set Reward <ChevronRight size={16} />
        </button>
      )}
    </section>
  );
}

function ArtifactFilters({ rarityFilter, slotFilter, setRarityFilter, setSlotFilter }: any) {
  return (
    <div className="filters-wrap">
      <div className="filter-row" aria-label="Rarity filters">
        {RARITIES.map((rarity) => (
          <button key={rarity} className={rarityFilter === rarity ? 'filter active' : 'filter'} type="button" onClick={() => setRarityFilter(rarity)}>
            {rarity === 'ALL' ? 'All Rarity' : rarityTheme(rarity).label}
          </button>
        ))}
      </div>
      <div className="filter-row" aria-label="Slot filters">
        {['ALL', ...SLOTS].map((slot) => (
          <button key={slot} className={slotFilter === slot ? 'filter active' : 'filter'} type="button" onClick={() => setSlotFilter(slot)}>
            {slot === 'ALL' ? 'All Slots' : slotLabel(slot)}
          </button>
        ))}
      </div>
    </div>
  );
}

function ArtifactGrid({ inventory, rarityFilter, loadout, saving, onEquip, onCraft }: any) {
  if (!inventory.length) {
    return <p className="muted">No artifacts in this filter yet.</p>;
  }

  if (rarityFilter === 'ALL') {
    return (
      <div className="rarity-groups">
        {RARITY_DISPLAY_ORDER.map((rarity) => {
          const rows = inventory.filter((item: any) => item.artifact.set.rarity === rarity);
          if (!rows.length) return null;
          return (
            <section key={rarity} className="rarity-group">
              <div className="rarity-heading" style={{ color: rarityTheme(rarity).color }}>
                <span>{rarityTheme(rarity).label}</span>
                <small>{rows.length}</small>
              </div>
              <div className="artifact-grid">
                {rows.map((item: any) => (
                  <ArtifactCard
                    key={item.id}
                    item={item}
                    equippedSlot={getEquippedSlot(loadout, item.artifact.id)}
                    saving={saving}
                    onEquip={() => onEquip(item.artifact)}
                    onCraft={() => onCraft(item.artifact)}
                  />
                ))}
              </div>
            </section>
          );
        })}
      </div>
    );
  }

  return (
    <div className="artifact-grid">
      {inventory.map((item: any) => (
        <ArtifactCard
          key={item.id}
          item={item}
          equippedSlot={getEquippedSlot(loadout, item.artifact.id)}
          saving={saving}
          onEquip={() => onEquip(item.artifact)}
          onCraft={() => onCraft(item.artifact)}
        />
      ))}
    </div>
  );
}

function ArtifactCard({ item, equippedSlot, saving, onEquip, onCraft }: any) {
  const artifact = item.artifact;
  const theme = rarityTheme(artifact.set.rarity);
  const nextRarity = RARITY_UPGRADE[artifact.set.rarity];
  const canCraft = nextRarity && (item.quantity ?? 0) >= 3;

  return (
    <button
      type="button"
      className="artifact-card"
      style={{ borderColor: `${theme.color}50`, background: `linear-gradient(180deg, ${theme.soft}, rgba(7,10,20,0.96))` }}
    >
      <div className="artifact-card-top">
        <ArtifactSigil artifact={artifact} />
        <span className="quantity">x{item.quantity ?? 1}</span>
      </div>
      <strong>{artifact.name}</strong>
      <small>{artifact.set.name}</small>
      <div className="artifact-meta">
        <span style={{ color: theme.color }}>{artifact.set.rarity}</span>
        <span>{slotLabel(artifact.slotType)}</span>
      </div>
      <span className={equippedSlot ? 'equipped-pill' : 'equip-pill'} onClick={(event) => {
        event.stopPropagation();
        if (!equippedSlot && !saving) onEquip();
      }}>
        {equippedSlot ? `Equipped: ${slotLabel(equippedSlot)}` : saving ? 'Saving...' : 'Equip'}
      </span>
      {nextRarity && (
        <span className={canCraft ? 'craft-pill' : 'craft-pill locked'} onClick={(event) => {
          event.stopPropagation();
          if (canCraft && !saving) onCraft();
        }}>
          Craft x3 to {rarityTheme(nextRarity).label}
        </span>
      )}
    </button>
  );
}

function ArmoryStyles() {
  return (
    <style>{`
      .armory-rpg { min-height: 100vh; padding: var(--space-lg) var(--space-md) var(--space-2xl); background: #070b14; color: var(--color-text-primary); }
      .armory-shell { width: min(1140px, 100%); margin: 0 auto; display: grid; gap: var(--space-md); }
      .armory-panel, .forge-panel { border: 1px solid rgba(231,206,137,0.18); border-radius: 8px; background: #0c1220; }
      .armory-topbar { display: flex; align-items: center; justify-content: space-between; gap: 10px; min-height: 48px; }
      .armory-back, .topbar-stats span, .inventory-shortcut, .marketplace-shortcut, .filter, .mini-action, .armory-secondary, .armory-primary { min-height: 44px; border-radius: 8px; display: inline-flex; align-items: center; justify-content: center; gap: 7px; text-decoration: none; border: 1px solid rgba(255,255,255,0.14); color: var(--color-text-primary); background: rgba(255,255,255,0.04); padding: 0 12px; font-weight: 800; letter-spacing: 0; }
      .armory-back { justify-self: start; }
      .topbar-stats { display: flex; gap: 8px; overflow: hidden; }
      .topbar-stats span, .inventory-shortcut, .marketplace-shortcut { min-height: 38px; white-space: nowrap; font-size: 0.82rem; }
      .marketplace-shortcut { color: #8ee8ff; border-color: rgba(142,232,255,0.24); }
      .gem-balance { color: #c7b7ff; }
      .inventory-panel { scroll-margin-top: 12px; }
      .armory-primary { background: #ffd66e; color: #171008; border-color: rgba(255,214,110,0.5); }
      .armory-secondary { background: rgba(97,232,255,0.08); border-color: rgba(97,232,255,0.24); color: #dff8ff; }
      .armory-primary:disabled, .armory-secondary:disabled, .mini-action:disabled { opacity: 0.55; }
      .forge-panel { position: relative; display: grid; grid-template-columns: auto 1fr auto; gap: var(--space-md); align-items: center; padding: var(--space-lg); overflow: hidden; }
      .forge-ring { width: 82px; aspect-ratio: 1; border-radius: 50%; border: 1px solid rgba(97,232,255,0.45); display: grid; place-items: center; color: #61e8ff; background: rgba(97,232,255,0.08); }
      .forge-panel.forging .forge-ring { animation: forgePulse 700ms ease-in-out infinite; }
      .forge-panel.forging { border-color: rgba(97,232,255,0.34); }
      .forge-disabled-card { position: relative; text-align: center; padding: var(--space-2xl); }
      .forge-disabled-card > svg { color: var(--color-text-muted); margin: 0 auto var(--space-md); }
      .forge-disabled-card p { color: var(--color-text-secondary); }
      .forge-copy h1 { margin-top: 4px; font-size: clamp(1.85rem, 7vw, 3.4rem); }
      .forge-copy p, .muted, .auth-panel p { color: var(--color-text-secondary); }
      .eyebrow, .section-heading span { color: #61e8ff; font-size: 0.72rem; font-weight: 900; text-transform: uppercase; letter-spacing: 0.08em; }
      .rarity-row, .filters-wrap, .slot-checks, .reveal-actions { display: flex; gap: 8px; flex-wrap: wrap; }
      .rarity-row span { border: 1px solid; border-radius: 999px; padding: 5px 9px; font-size: 0.76rem; font-weight: 900; }
      .forge-action { display: grid; gap: 8px; justify-items: stretch; min-width: 180px; }
      .forge-locked { background: rgba(255,255,255,0.04); color: var(--color-text-secondary); border-color: rgba(255,255,255,0.14); }
      .forge-locked svg { color: var(--color-accent-warning); }
      .forge-guide-control { position: absolute; top: 12px; right: 12px; z-index: 2; display: flex; align-items: center; gap: 8px; }
      .armory-rpg .admin-modal-overlay { backdrop-filter: none; -webkit-backdrop-filter: none; }
      .armory-rpg > .admin-modal-overlay > .admin-modal-dialog { padding: var(--space-lg); border-color: rgba(231,206,137,0.18); border-radius: 8px; background: #0c1220; transition: none; }
      .armory-action-layer { position: fixed; inset: 0; z-index: 1001; display: grid; place-content: center; justify-items: center; gap: 12px; padding: 18px; text-align: center; background: rgba(2,5,12,0.84); animation: revealFade 120ms ease; }
      .armory-action-layer strong { color: #f8fbff; font-family: var(--font-orbitron); font-size: clamp(1.25rem, 5vw, 1.8rem); line-height: 1.1; }
      .armory-action-layer span { color: var(--color-text-secondary); font-size: 0.86rem; }
      .armory-action-orb { width: 96px; aspect-ratio: 1; border-radius: 50%; display: grid; place-items: center; position: relative; overflow: hidden; border: 1px solid rgba(255,255,255,0.18); }
      .armory-action-orb::before { content: ""; position: absolute; inset: 9px; border-radius: inherit; border: 2px solid currentColor; border-right-color: transparent; animation: forgeSpin 760ms linear infinite; opacity: 0.9; }
      .armory-action-orb svg { position: relative; z-index: 1; }
      .equip-action .armory-action-orb { color: #61e8ff; background: rgba(97,232,255,0.1); }
      .unequip-action .armory-action-orb { color: #ffd66e; background: rgba(255,214,110,0.1); }
      .claim-confirm-layer { position: fixed; inset: 0; z-index: 1002; display: grid; place-items: center; padding: 16px; background: rgba(2,5,12,0.84); }
      .claim-confirm-card { position: relative; width: min(460px, 100%); display: grid; gap: 14px; padding: 20px; border: 1px solid color-mix(in srgb, var(--claim-accent) 48%, rgba(255,255,255,0.12)); border-radius: 8px; background: #0c1220; box-shadow: 0 20px 52px rgba(0,0,0,0.46); }
      .claim-confirm-close { position: absolute; top: 9px; right: 9px; width: 40px; height: 40px; display: grid; place-items: center; border: 0; background: transparent; color: var(--color-text-muted); }
      .claim-confirm-close:disabled { opacity: 0.5; }
      .claim-confirm-icon { width: 46px; height: 46px; display: grid; place-items: center; color: var(--claim-accent); border: 1px solid color-mix(in srgb, var(--claim-accent) 45%, transparent); border-radius: 8px; background: color-mix(in srgb, var(--claim-accent) 10%, transparent); }
      .claim-confirm-copy { display: grid; gap: 4px; padding-right: 34px; }
      .claim-confirm-copy > span { color: var(--claim-accent); font-size: 0.7rem; font-weight: 900; text-transform: uppercase; letter-spacing: 0.08em; }
      .claim-confirm-copy h2 { margin: 0; font-family: var(--font-orbitron); font-size: 1.18rem; letter-spacing: 0; }
      .claim-confirm-copy p, .claim-confirm-warning { margin: 0; color: var(--color-text-secondary); font-size: 0.84rem; line-height: 1.5; }
      .claim-confirm-summary { display: grid; border-top: 1px solid rgba(255,255,255,0.1); border-bottom: 1px solid rgba(255,255,255,0.1); }
      .claim-confirm-summary > div { min-height: 48px; display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.45fr); align-items: center; gap: 10px; border-bottom: 1px solid rgba(255,255,255,0.08); }
      .claim-confirm-summary > div:last-child { border-bottom: 0; }
      .claim-confirm-summary span { color: var(--color-text-muted); font-size: 0.75rem; }
      .claim-confirm-summary strong { min-width: 0; color: var(--color-text-primary); font-size: 0.78rem; text-align: right; }
      .claim-gem-reward { display: inline-flex; align-items: center; justify-content: flex-end; gap: 5px; color: #d8c4ff !important; }
      .claim-confirm-warning { padding: 10px; border-left: 3px solid #ffb86c; background: rgba(255,184,108,0.07); color: #f0d4b5; }
      .claim-confirm-actions { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
      .armory-error { border: 1px solid rgba(255,92,92,0.32); background: rgba(255,92,92,0.1); border-radius: 8px; padding: var(--space-md); color: #ffb4b4; }
      .armory-notice { display: flex; align-items: center; gap: 8px; border: 1px solid rgba(184,132,255,0.28); background: rgba(184,132,255,0.09); border-radius: 8px; padding: 12px var(--space-md); color: #e6d8ff; font-weight: 800; }
      .armory-main-grid { display: grid; gap: var(--space-md); }
      .armory-center { display: grid; gap: var(--space-md); }
      .section-heading { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
      .section-heading h2 { margin-top: 2px; font-size: 1.15rem; }
      .section-heading small { color: var(--color-text-muted); }
      .loadout-panel, .progress-panel, .inventory-panel, .tickets-panel, .reward-preview-panel { padding: var(--space-md); display: grid; gap: var(--space-md); }
      .reward-preview-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; }
      .reward-preview-card { min-height: 148px; border: 1px solid color-mix(in srgb, var(--preview-accent) 42%, transparent); border-radius: 8px; padding: 12px; display: grid; gap: 14px; align-content: start; background: linear-gradient(180deg, var(--preview-soft), rgba(7,10,20,0.96)); }
      .preview-set-line { display: grid; gap: 3px; }
      .preview-set-line span { color: var(--preview-accent); font-size: 0.7rem; font-weight: 900; text-transform: uppercase; letter-spacing: 0.08em; }
      .preview-set-line strong { font-size: 0.98rem; line-height: 1.18; }
      .preview-reward-line { display: grid; grid-template-columns: auto 1fr; gap: 9px; align-items: start; color: var(--preview-accent); }
      .preview-reward-line div { display: grid; gap: 4px; }
      .preview-reward-line strong { font-family: var(--font-orbitron); font-size: 1rem; line-height: 1.1; }
      .preview-reward-line span { color: var(--color-text-secondary); font-size: 0.78rem; line-height: 1.35; }
      .loadout-stage { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
      .equip-slot { min-height: 136px; border: 1px solid rgba(255,255,255,0.12); border-radius: 8px; padding: 12px; background: rgba(255,255,255,0.035); display: grid; gap: 8px; align-content: start; }
      .slot-icon { color: var(--color-text-muted); }
      .equip-slot span, .equip-slot small { color: var(--color-text-muted); font-size: 0.78rem; }
      .equip-slot strong { display: block; margin-top: 2px; }
      .mini-action { min-height: 36px; padding: 0 10px; justify-self: start; font-size: 0.78rem; }
      .slot-check { min-height: 36px; display: inline-flex; align-items: center; gap: 6px; padding: 0 10px; border-radius: 999px; border: 1px solid rgba(255,255,255,0.12); color: var(--color-text-muted); }
      .slot-check.done { color: #61e8ff; border-color: rgba(97,232,255,0.28); background: rgba(97,232,255,0.08); }
      .reward-strip { min-height: 48px; border: 1px dashed rgba(255,214,110,0.28); border-radius: 8px; padding: 10px; display: flex; align-items: center; gap: 9px; color: #ffe7a3; background: rgba(255,214,110,0.07); }
      .claim-button { justify-self: start; }
      .filters-wrap { display: grid; gap: 8px; }
      .filter-row { display: flex; gap: 8px; overflow-x: auto; padding-bottom: 2px; scrollbar-width: thin; }
      .filter { flex: 0 0 auto; min-height: 38px; font-size: 0.8rem; color: var(--color-text-secondary); }
      .filter.active { color: #061018; background: #61e8ff; border-color: rgba(97,232,255,0.55); }
      .rarity-groups { display: grid; gap: var(--space-md); }
      .rarity-group { display: grid; gap: 9px; }
      .rarity-heading { min-height: 32px; display: flex; align-items: center; justify-content: space-between; gap: 10px; font-weight: 900; }
      .rarity-heading span { text-transform: uppercase; font-size: 0.82rem; }
      .rarity-heading small { color: var(--color-text-muted); }
      .artifact-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; }
      .artifact-card { min-height: 222px; border: 1px solid; border-radius: 8px; padding: 12px; display: grid; gap: 8px; text-align: left; color: var(--color-text-primary); }
      .artifact-card-top, .artifact-meta, .ticket-foot { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
      .artifact-card small, .artifact-meta span { color: var(--color-text-muted); font-size: 0.78rem; }
      .quantity { min-width: 34px; min-height: 26px; display: inline-flex; align-items: center; justify-content: center; border: 1px solid rgba(255,255,255,0.22); border-radius: 999px; padding: 2px 8px; background: rgba(2,5,12,0.84); color: #f8fbff; font-size: 0.78rem; font-weight: 900; }
      .equip-pill, .equipped-pill, .craft-pill { min-height: 36px; border-radius: 8px; display: inline-flex; justify-content: center; align-items: center; padding: 0 8px; font-weight: 900; font-size: 0.78rem; border: 1px solid rgba(255,255,255,0.14); }
      .equip-pill { color: #061018; background: #ffd66e; }
      .equipped-pill { color: #61e8ff; background: rgba(97,232,255,0.08); }
      .craft-pill { color: #e9dcff; background: rgba(184,132,255,0.12); border-color: rgba(184,132,255,0.28); }
      .craft-pill.locked { color: var(--color-text-muted); background: rgba(255,255,255,0.035); }
      .ticket-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(230px, 1fr)); gap: 10px; }
      .auth-shell { min-height: 72vh; align-content: center; }
      .auth-panel { max-width: 560px; margin: 0 auto; padding: var(--space-lg); text-align: center; justify-items: center; }
      @keyframes forgePulse { 0%, 100% { transform: scale(1); opacity: 1; } 50% { transform: scale(1.05); opacity: 0.72; } }
      @media (max-width: 980px) { .artifact-grid, .reward-preview-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
      @media (max-width: 720px) { .armory-rpg { padding-left: 10px; padding-right: 10px; } .armory-topbar { align-items: flex-start; } .topbar-stats { flex-wrap: wrap; justify-content: flex-end; } .forge-panel { grid-template-columns: 1fr; } .forge-action { min-width: 0; } .artifact-grid, .reward-preview-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } .reveal-actions { grid-template-columns: 1fr; } .forge-reveal-scene { min-height: calc(100vh - 36px); } }
      @media (max-width: 380px) { .artifact-grid, .reward-preview-grid { grid-template-columns: 1fr; } .loadout-stage { grid-template-columns: 1fr; } .topbar-stats { display: grid; grid-template-columns: 1fr 1fr; } .marketplace-shortcut { padding: 0 8px; white-space: normal; text-align: center; line-height: 1.05; } .claim-confirm-card { padding: 16px 12px 12px; } .claim-confirm-actions { grid-template-columns: 1fr; } }
      @media (prefers-reduced-motion: reduce) { .forge-reveal-layer, .forge-charge, .reveal-rarity, .reveal-art-wrap, .reveal-copy, .reveal-actions, .forge-panel.forging .forge-ring, .armory-action-layer, .armory-action-orb::before { animation: none; } }
    `}</style>
  );
}
