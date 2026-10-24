'use client';
import { Crown, Shield, Hand, Footprints, Gem } from 'lucide-react';
export const SLOT_META: Record<string, any> = {
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


export function slotLabel(slot: string) {
  return SLOT_META[slot]?.label ?? slot.charAt(0) + slot.slice(1).toLowerCase();
}

export function rarityTheme(rarity?: string) {
  return RARITY_THEME[rarity ?? ''] ?? { color: '#8fa0bd', soft: 'rgba(143,160,189,0.12)', glow: 'rgba(143,160,189,0.22)', label: rarity ?? 'Artifact' };
}

function slugify(value?: string) {
  return (value ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

export function artifactImagePath(artifact: any) {
  const setSlug = slugify(artifact?.set?.id || artifact?.set?.name);
  const slotSlug = slugify(artifact?.slotType);
  return setSlug && slotSlug ? `/images/artifacts/${setSlug}/${slotSlug}.webp` : '';
}


export function ArtifactSigil({ artifact, size = 'md' }: { artifact: any; size?: 'sm' | 'md' | 'lg' }) {
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
