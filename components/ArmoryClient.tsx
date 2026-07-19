'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import {
  ArrowLeft,
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
  Shield,
  Sparkles,
  Ticket,
  Zap,
} from 'lucide-react';

const SLOTS = ['HEADGEAR', 'ARMOR', 'GLOVES', 'BOOTS'] as const;
const RARITIES = ['ALL', 'BRONZE', 'SILVER', 'GOLD', 'PLATINUM'] as const;
const RARITY_DISPLAY_ORDER = ['PLATINUM', 'GOLD', 'SILVER', 'BRONZE'] as const;
const FORGE_ANIMATION_MS = 3000;
const EQUIP_ANIMATION_MS = 900;

type ArmoryActionOverlayType = 'equip' | 'unequip';

const SLOT_META: Record<string, any> = {
  HEADGEAR: { label: 'Headgear', Icon: Crown },
  ARMOR: { label: 'Armor', Icon: Shield },
  GLOVES: { label: 'Gloves', Icon: Hand },
  BOOTS: { label: 'Boots', Icon: Footprints },
};

const RARITY_THEME: Record<string, { color: string; soft: string; glow: string; label: string }> = {
  BRONZE: { color: '#b66a2d', soft: 'rgba(182,106,45,0.18)', glow: 'rgba(182,106,45,0.34)', label: 'Bronze' },
  SILVER: { color: '#8ee8ff', soft: 'rgba(142,232,255,0.13)', glow: 'rgba(142,232,255,0.26)', label: 'Silver' },
  GOLD: { color: '#ffe04f', soft: 'rgba(255,224,79,0.16)', glow: 'rgba(255,224,79,0.32)', label: 'Gold' },
  PLATINUM: { color: '#b884ff', soft: 'rgba(184,132,255,0.18)', glow: 'rgba(184,132,255,0.32)', label: 'Platinum' },
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

function parseReward(snapshot: string) {
  try {
    return JSON.parse(snapshot);
  } catch {
    return { description: 'Armory reward ticket' };
  }
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

function slotLabel(slot: string) {
  return SLOT_META[slot]?.label ?? slot.charAt(0) + slot.slice(1).toLowerCase();
}

function rarityTheme(rarity?: string) {
  return RARITY_THEME[rarity ?? ''] ?? { color: '#8fa0bd', soft: 'rgba(143,160,189,0.12)', glow: 'rgba(143,160,189,0.22)', label: rarity ?? 'Artifact' };
}

function slugify(value?: string) {
  return (value ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

function artifactImagePath(artifact: any) {
  const setSlug = slugify(artifact?.set?.id || artifact?.set?.name);
  const slotSlug = slugify(artifact?.slotType);
  return setSlug && slotSlug ? `/images/artifacts/${setSlug}/${slotSlug}.webp` : '';
}

function getEquippedSlot(loadout: any, artifactId?: string) {
  if (!artifactId) return null;
  return SLOTS.find((slot) => loadout?.[slot]?.id === artifactId) ?? null;
}

function getNextForgeTimer() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? '00';
  const nextReset = new Date(`${get('year')}-${get('month')}-${get('day')}T00:00:00+05:30`);
  nextReset.setUTCDate(nextReset.getUTCDate() + 1);
  const diff = Math.max(0, nextReset.getTime() - Date.now());
  const hours = Math.floor(diff / 3600000);
  const minutes = Math.floor((diff % 3600000) / 60000);
  const seconds = Math.floor((diff % 60000) / 1000);
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
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

function ArtifactSigil({ artifact, size = 'md' }: { artifact: any; size?: 'sm' | 'md' | 'lg' }) {
  const set = artifact?.set ?? artifact;
  const theme = rarityTheme(set?.rarity);
  const Icon = SLOT_META[artifact?.slotType]?.Icon ?? Gem;
  const letters = artifact?.name?.split(' ').map((part: string) => part[0]).join('').slice(0, 2) || set?.shortLabel?.slice(0, 2) || 'A';

  return (
    <div className={`artifact-sigil artifact-sigil-${size}`} style={{ borderColor: `${theme.color}80`, color: theme.color, background: `radial-gradient(circle, ${theme.glow} 0 18%, rgba(255,255,255,0.06) 19% 35%, transparent 36%), ${theme.soft}` }}>
      <Icon size={size === 'lg' ? 30 : size === 'sm' ? 16 : 22} strokeWidth={1.7} />
      <span>{letters}</span>
    </div>
  );
}

export function ArmoryClient({ initialState, initialError = '' }: { initialState?: any; initialError?: string }) {
  const { status } = useSession();
  const [state, setState] = useState<any>(initialState ?? null);
  const [loading, setLoading] = useState(!initialState && !initialError);
  const [saving, setSaving] = useState(false);
  const [forging, setForging] = useState(false);
  const [error, setError] = useState(initialError);
  const [forgeResult, setForgeResult] = useState<any>(null);
  const [forgeCharging, setForgeCharging] = useState(false);
  const [actionOverlay, setActionOverlay] = useState<ArmoryActionOverlayType | null>(null);
  const [rarityFilter, setRarityFilter] = useState('ALL');
  const [slotFilter, setSlotFilter] = useState('ALL');
  const [nextForgeTimer, setNextForgeTimer] = useState(getNextForgeTimer);
  const ticketsSectionRef = useRef<HTMLElement>(null);

  const load = async () => {
    if (initialState && state) return;
    if (status !== 'authenticated') {
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      const res = await fetch('/api/armory', { cache: 'no-store' });
      const data = await readJson(res);
      if (!res.ok) throw new Error(data.error || 'Failed to load Artifacts.');
      setState(data);
    } catch (err: any) {
      setError(err.message || 'Failed to load Artifacts.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [status]);

  useEffect(() => {
    const tick = () => setNextForgeTimer(getNextForgeTimer());
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, []);

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

  const act = async (url: string, body?: any, overlayType?: ArmoryActionOverlayType) => {
    const isForge = url.endsWith('/forge');
    const forgeStartedAt = Date.now();
    const actionStartedAt = Date.now();
    setSaving(true);
    if (isForge) {
      setForging(true);
      setForgeCharging(true);
      setForgeResult(null);
    }
    if (overlayType) setActionOverlay(overlayType);
    setError('');
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: body ? { 'Content-Type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = await readJson(res);
      if (!res.ok) throw new Error(data.error || 'Artifacts action failed.');
      if (data.state) {
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
            };
          }

          return current;
        });
      }
      if (data.selected && isForge) {
        const remainingAnimationMs = Math.max(0, FORGE_ANIMATION_MS - (Date.now() - forgeStartedAt));
        if (remainingAnimationMs > 0) await wait(remainingAnimationMs);
        setForgeResult(data.selected);
      }
      if (data.crafted) {
        setForgeResult(data.crafted);
      }
      if (data.ticket) {
        window.requestAnimationFrame(() => {
          window.requestAnimationFrame(() => {
            ticketsSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
          });
        });
      }
      return true;
    } catch (err: any) {
      setError(err.message || 'Artifacts action failed.');
      return false;
    } finally {
      if (overlayType) {
        const remainingAnimationMs = Math.max(0, EQUIP_ANIMATION_MS - (Date.now() - actionStartedAt));
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

  if (loading || status === 'loading') {
    return <div className="loading-state"><div className="spinner" />Loading Artifacts...</div>;
  }

  if (status !== 'authenticated') {
    return (
      <main className="armory-rpg">
        <div className="armory-shell auth-shell">
          <Link href="/" className="armory-back"><ArrowLeft size={16} /> Back to Home</Link>
          <section className="armory-panel auth-panel">
            <Package size={46} color="#c7b7ff" />
            <h1 className="font-orbitron">EmiGuild Armory</h1>
            <p>Login to forge artifacts, build sets, and unlock reward tickets.</p>
            <Link href="/login?callbackUrl=/armory" className="armory-primary">Login to Enter</Link>
          </section>
        </div>
        <ArmoryStyles />
      </main>
    );
  }

  return (
    <main className="armory-rpg">
      <div className="armory-shell">
        <ArmoryHeader inventoryTotal={inventoryTotal} />
        <DailyForgePanel state={state} saving={saving} forging={forging} nextForgeTimer={nextForgeTimer} onForge={() => act('/api/armory/forge')} />
        {error && <div className="armory-error">{error}</div>}

        <RewardPreviewPanel sets={state?.sets ?? []} />

        <div className="armory-main-grid">
          <section className="armory-center">
            <LoadoutGrid loadout={state?.loadout ?? {}} saving={saving} onUnequip={unequipSlot} />
            <SetProgressPanel state={state} progress={setProgress} saving={saving} onClaim={() => {
              if (confirm(`Claiming this reward will consume all four equipped ${setProgress.completeSet?.name} artifacts. This cannot be undone.`)) {
                act('/api/armory/claim-set');
              }
            }} />
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
              {state.tickets.map((ticket: any) => <RewardTicketCard key={ticket.id} ticket={ticket} />)}
            </div>
          ) : (
            <p className="muted">Complete a matching set to create your first counter-redeemable ticket.</p>
          )}
        </section>
      </div>
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

function ArmoryHeader({ inventoryTotal }: { inventoryTotal: number }) {
  return (
    <header className="armory-topbar">
      <Link href="/" className="armory-back"><ArrowLeft size={16} /> Back</Link>
      <div className="topbar-stats">
        <a href="#artifact-vault" className="inventory-shortcut" aria-label="Go to inventory">
          <Package size={14} /> {inventoryTotal}
        </a>
      </div>
    </header>
  );
}

function DailyForgePanel({ state, saving, forging, nextForgeTimer, onForge }: { state: any; saving: boolean; forging: boolean; nextForgeTimer: string; onForge: () => void }) {
  if (state?.forge?.reason === 'disabled') {
    return (
      <section className="armory-panel forge-disabled-card">
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

function ForgeReveal({ artifact, saving, onEquip, onKeep }: { artifact: any; saving: boolean; onEquip: () => void; onKeep: () => void }) {
  const theme = rarityTheme(artifact?.set?.rarity);
  const [revealReady, setRevealReady] = useState(false);

  useEffect(() => {
    if (!artifact) {
      setRevealReady(false);
      return;
    }
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduceMotion) {
      setRevealReady(true);
      return;
    }
    const id = window.setTimeout(() => setRevealReady(true), 120);
    return () => window.clearTimeout(id);
  }, [artifact?.id]);

  return (
    <div className={revealReady ? 'forge-reveal-layer reveal-ready' : 'forge-reveal-layer'} role="dialog" aria-modal="true" aria-label="Artifact acquired" style={{ ['--reveal-color' as any]: theme.color, ['--reveal-soft' as any]: theme.soft }}>
      <section className="forge-reveal-scene">
        <div className="forge-charge">
          <span className="forge-spinner"><Sparkles size={30} /></span>
          <span>Forging</span>
        </div>
        {artifact && <div className="reveal-rarity"><span>{theme.label} Artifact</span></div>}
        {revealReady && artifact && (
          <div className="reveal-art-wrap">
            <div className="reveal-lines" />
            <ArtifactArtwork artifact={artifact} />
          </div>
        )}
        {revealReady && artifact && (
          <>
            <div className="reveal-copy">
              <h2 className="font-orbitron">{artifact.name}</h2>
              <p>{artifact.set?.name} Set</p>
              <small>{slotLabel(artifact.slotType)}</small>
              <strong>Added to your inventory</strong>
            </div>
            <div className="reveal-actions">
              <button className="armory-primary" type="button" disabled={saving} onClick={onEquip}>Equip Now</button>
              <button className="armory-secondary" type="button" disabled={saving} onClick={onKeep}>Keep in Inventory</button>
            </div>
          </>
        )}
      </section>
    </div>
  );
}

function ArtifactArtwork({ artifact }: { artifact: any }) {
  const [imageFailed, setImageFailed] = useState(false);
  const path = artifactImagePath(artifact);

  return (
    <div className="reveal-art">
      {path && !imageFailed ? (
        <img src={path} alt="" width="320" height="320" loading="eager" decoding="async" onError={() => setImageFailed(true)} />
      ) : (
        <ArtifactSigil artifact={artifact} size="lg" />
      )}
    </div>
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

function RewardTicketCard({ ticket }: { ticket: any }) {
  const snapshot = parseReward(ticket.rewardSnapshot);
  const meta = ticketMeta(snapshot);
  const Icon = meta.Icon;

  return (
    <article className="ticket-card" style={{ ['--ticket-accent' as any]: meta.accent }}>
      <div className="ticket-type">
        <span><Icon size={16} /> {meta.label}</span>
        <strong>{meta.value}</strong>
      </div>
      <div className="ticket-main">
        <span>{ticket.set?.name ?? snapshot.setName ?? 'Armory Set'}</span>
        <h3>{snapshot.description ?? 'Armory reward ticket'}</h3>
      </div>
      <div className="ticket-foot">
        <span><Clock size={14} /> Expires end of today</span>
      </div>
    </article>
  );
}

function ArmoryStyles() {
  return (
    <style>{`
      .armory-rpg { min-height: 100vh; padding: var(--space-lg) var(--space-md) var(--space-2xl); background: #070b14; color: var(--color-text-primary); }
      .armory-shell { width: min(1140px, 100%); margin: 0 auto; display: grid; gap: var(--space-md); }
      .armory-panel, .forge-panel { border: 1px solid rgba(231,206,137,0.18); border-radius: 8px; background: #0c1220; }
      .armory-topbar { display: flex; align-items: center; justify-content: space-between; gap: 10px; min-height: 48px; }
      .armory-back, .topbar-stats span, .inventory-shortcut, .filter, .mini-action, .armory-secondary, .armory-primary { min-height: 44px; border-radius: 8px; display: inline-flex; align-items: center; justify-content: center; gap: 7px; text-decoration: none; border: 1px solid rgba(255,255,255,0.14); color: var(--color-text-primary); background: rgba(255,255,255,0.04); padding: 0 12px; font-weight: 800; letter-spacing: 0; }
      .armory-back { justify-self: start; }
      .topbar-stats { display: flex; gap: 8px; overflow: hidden; }
      .topbar-stats span, .inventory-shortcut { min-height: 38px; white-space: nowrap; font-size: 0.82rem; }
      .inventory-panel { scroll-margin-top: 12px; }
      .armory-primary { background: #ffd66e; color: #171008; border-color: rgba(255,214,110,0.5); }
      .armory-secondary { background: rgba(97,232,255,0.08); border-color: rgba(97,232,255,0.24); color: #dff8ff; }
      .armory-primary:disabled, .armory-secondary:disabled, .mini-action:disabled { opacity: 0.55; }
      .forge-panel { display: grid; grid-template-columns: auto 1fr auto; gap: var(--space-md); align-items: center; padding: var(--space-lg); overflow: hidden; }
      .forge-ring { width: 82px; aspect-ratio: 1; border-radius: 50%; border: 1px solid rgba(97,232,255,0.45); display: grid; place-items: center; color: #61e8ff; background: rgba(97,232,255,0.08); }
      .forge-panel.forging .forge-ring { animation: forgePulse 700ms ease-in-out infinite; }
      .forge-panel.forging { border-color: rgba(97,232,255,0.34); }
      .forge-disabled-card { text-align: center; padding: var(--space-2xl); }
      .forge-disabled-card svg { color: var(--color-text-muted); margin: 0 auto var(--space-md); }
      .forge-disabled-card p { color: var(--color-text-secondary); }
      .forge-copy h1 { margin-top: 4px; font-size: clamp(1.85rem, 7vw, 3.4rem); }
      .forge-copy p, .muted, .auth-panel p { color: var(--color-text-secondary); }
      .eyebrow, .section-heading span { color: #61e8ff; font-size: 0.72rem; font-weight: 900; text-transform: uppercase; letter-spacing: 0.08em; }
      .rarity-row, .filters-wrap, .slot-checks, .reveal-actions { display: flex; gap: 8px; flex-wrap: wrap; }
      .rarity-row span { border: 1px solid; border-radius: 999px; padding: 5px 9px; font-size: 0.76rem; font-weight: 900; }
      .forge-action { display: grid; gap: 8px; justify-items: stretch; min-width: 180px; }
      .forge-locked { background: rgba(255,255,255,0.04); color: var(--color-text-secondary); border-color: rgba(255,255,255,0.14); }
      .forge-locked svg { color: var(--color-accent-warning); }
      .forge-reveal-layer { position: fixed; inset: 0; z-index: 999; display: flex; align-items: center; justify-content: center; padding: 18px; background: rgba(2,5,12,0.92); animation: revealFade 150ms ease; }
      .forge-reveal-scene { width: min(440px, 100%); min-height: min(640px, calc(100vh - 36px)); display: grid; grid-template-rows: auto 1fr auto auto; align-items: center; justify-items: center; gap: 14px; text-align: center; color: var(--color-text-primary); }
      .forge-reveal-layer:not(.reveal-ready) .forge-reveal-scene { grid-template-rows: 1fr; }
      .forge-charge { align-self: center; min-height: 150px; display: inline-grid; justify-items: center; align-content: center; gap: 14px; color: #dff8ff; font-weight: 900; text-transform: uppercase; letter-spacing: 0.08em; font-size: 0.88rem; animation: revealFade 120ms ease both; }
      .forge-spinner { width: 88px; aspect-ratio: 1; border-radius: 50%; display: grid; place-items: center; position: relative; color: #61e8ff; }
      .forge-spinner::before { content: ""; position: absolute; inset: 0; border-radius: 50%; border: 2px solid rgba(255,255,255,0.18); border-top-color: #61e8ff; animation: forgeSpin 850ms linear infinite; }
      .forge-spinner svg { position: relative; z-index: 1; }
      .reveal-ready .forge-charge { display: none; }
      .armory-action-layer { position: fixed; inset: 0; z-index: 1001; display: grid; place-content: center; justify-items: center; gap: 12px; padding: 18px; text-align: center; background: rgba(2,5,12,0.84); animation: revealFade 120ms ease; }
      .armory-action-layer strong { color: #f8fbff; font-family: var(--font-orbitron); font-size: clamp(1.25rem, 5vw, 1.8rem); line-height: 1.1; }
      .armory-action-layer span { color: var(--color-text-secondary); font-size: 0.86rem; }
      .armory-action-orb { width: 96px; aspect-ratio: 1; border-radius: 50%; display: grid; place-items: center; position: relative; overflow: hidden; border: 1px solid rgba(255,255,255,0.18); }
      .armory-action-orb::before { content: ""; position: absolute; inset: 9px; border-radius: inherit; border: 2px solid currentColor; border-right-color: transparent; animation: forgeSpin 760ms linear infinite; opacity: 0.9; }
      .armory-action-orb svg { position: relative; z-index: 1; }
      .equip-action .armory-action-orb { color: #61e8ff; background: rgba(97,232,255,0.1); }
      .unequip-action .armory-action-orb { color: #ffd66e; background: rgba(255,214,110,0.1); }
      .reveal-rarity { min-height: 38px; display: none; align-items: center; border-top: 1px solid var(--reveal-color); border-bottom: 1px solid var(--reveal-color); padding: 0 18px; color: var(--reveal-color); font-weight: 900; text-transform: uppercase; letter-spacing: 0.08em; font-size: 0.76rem; animation: revealFade 180ms ease both; }
      .reveal-ready .reveal-rarity { display: inline-flex; }
      .reveal-art-wrap { width: min(300px, 78vw); aspect-ratio: 1; display: grid; place-items: center; position: relative; animation: revealPop 280ms ease both; }
      .reveal-art-wrap::before, .reveal-art-wrap::after { content: ""; position: absolute; border-radius: 50%; pointer-events: none; }
      .reveal-art-wrap::before { inset: 12%; border: 1px solid var(--reveal-color); opacity: 0.28; }
      .reveal-art-wrap::after { inset: 5%; border: 1px solid rgba(255,255,255,0.18); }
      .reveal-lines { position: absolute; inset: 0; background: linear-gradient(90deg, transparent 49.5%, rgba(255,255,255,0.18) 50%, transparent 50.5%), linear-gradient(0deg, transparent 49.5%, rgba(255,255,255,0.12) 50%, transparent 50.5%); opacity: 0.65; }
      .reveal-art { position: relative; z-index: 1; width: 82%; aspect-ratio: 1; display: grid; place-items: center; }
      .reveal-art img { width: 100%; height: 100%; object-fit: contain; }
      .reveal-art .artifact-sigil-lg { width: min(176px, 62vw); }
      .reveal-copy { display: grid; gap: 3px; animation: revealFade 180ms ease 430ms both; }
      .reveal-copy h2 { font-size: clamp(1.8rem, 8vw, 2.65rem); line-height: 1.02; }
      .reveal-copy p, .reveal-copy small { color: var(--color-text-secondary); }
      .reveal-copy strong { margin-top: 8px; color: #dff8ff; font-size: 0.82rem; }
      .reveal-actions { width: min(390px, 100%); display: grid; grid-template-columns: 1fr 1fr; gap: 10px; animation: revealFade 180ms ease 520ms both; }
      .armory-error { border: 1px solid rgba(255,92,92,0.32); background: rgba(255,92,92,0.1); border-radius: 8px; padding: var(--space-md); color: #ffb4b4; }
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
      .artifact-sigil { border: 1px solid; border-radius: 50%; display: grid; place-items: center; position: relative; flex: 0 0 auto; }
      .artifact-sigil span { position: absolute; bottom: 11%; font-family: var(--font-orbitron); font-size: 0.72rem; font-weight: 900; }
      .artifact-sigil-sm { width: 44px; aspect-ratio: 1; }
      .artifact-sigil-md { width: 66px; aspect-ratio: 1; }
      .artifact-sigil-lg { width: 112px; aspect-ratio: 1; }
      .ticket-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(230px, 1fr)); gap: 10px; }
      .ticket-card { min-height: 174px; position: relative; overflow: hidden; border: 1px solid rgba(255,255,255,0.12); border-left: 4px solid var(--ticket-accent); border-radius: 8px; padding: var(--space-md); display: grid; gap: 12px; background: linear-gradient(135deg, rgba(255,255,255,0.055), rgba(255,255,255,0.02)); }
      .ticket-card::before, .ticket-card::after { content: ""; position: absolute; right: 22%; width: 18px; aspect-ratio: 1; border-radius: 50%; background: #0c1220; border: 1px solid rgba(255,255,255,0.12); }
      .ticket-card::before { top: -9px; }
      .ticket-card::after { bottom: -9px; }
      .ticket-type { display: flex; justify-content: space-between; align-items: center; gap: 10px; }
      .ticket-type span, .ticket-foot span { display: inline-flex; align-items: center; gap: 6px; color: var(--color-text-secondary); font-size: 0.78rem; font-weight: 800; }
      .ticket-type span { color: var(--ticket-accent); text-transform: uppercase; letter-spacing: 0.06em; }
      .ticket-type strong { color: var(--ticket-accent); font-family: var(--font-orbitron); font-size: 1.45rem; line-height: 1; }
      .ticket-main { display: grid; gap: 4px; align-content: center; }
      .ticket-main span { color: var(--color-text-muted); font-size: 0.82rem; }
      .ticket-main h3 { font-size: 1.05rem; }
      .ticket-foot { align-self: end; padding-top: 10px; border-top: 1px dashed rgba(255,255,255,0.14); }
      .auth-shell { min-height: 72vh; align-content: center; }
      .auth-panel { max-width: 560px; margin: 0 auto; padding: var(--space-lg); text-align: center; justify-items: center; }
      @keyframes revealFade { from { opacity: 0; } to { opacity: 1; } }
      @keyframes revealPop { from { opacity: 0; transform: scale(0.92); } 45% { opacity: 1; transform: scale(0.96); } to { opacity: 1; transform: scale(1); } }
      @keyframes forgeSpin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      @keyframes forgePulse { 0%, 100% { transform: scale(1); opacity: 1; } 50% { transform: scale(1.05); opacity: 0.72; } }
      @media (max-width: 980px) { .artifact-grid, .reward-preview-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
      @media (max-width: 720px) { .armory-rpg { padding-left: 10px; padding-right: 10px; } .armory-topbar { align-items: flex-start; } .topbar-stats { flex-wrap: wrap; justify-content: flex-end; } .forge-panel { grid-template-columns: 1fr; } .forge-action { min-width: 0; } .artifact-grid, .reward-preview-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } .reveal-actions { grid-template-columns: 1fr; } .forge-reveal-scene { min-height: calc(100vh - 36px); } }
      @media (max-width: 380px) { .artifact-grid, .reward-preview-grid { grid-template-columns: 1fr; } .loadout-stage { grid-template-columns: 1fr; } .topbar-stats { display: grid; grid-template-columns: 1fr 1fr; } }
      @media (prefers-reduced-motion: reduce) { .forge-reveal-layer, .forge-charge, .reveal-rarity, .reveal-art-wrap, .reveal-copy, .reveal-actions, .forge-panel.forging .forge-ring, .armory-action-layer, .armory-action-orb::before { animation: none; } }
    `}</style>
  );
}
