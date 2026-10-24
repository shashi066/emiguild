'use client';
import { useEffect, useState } from 'react';
import { Sparkles } from 'lucide-react';
import { rarityTheme, slotLabel, artifactImagePath, ArtifactSigil } from './armory-visuals';
import './forge-reveal.css';
export function ForgeReveal({ artifact, saving, onEquip, onKeep, embedded = false }: { artifact: any; saving: boolean; onEquip?: () => void; onKeep?: () => void; embedded?: boolean }) {
  const theme = rarityTheme(artifact?.set?.rarity);
  const [revealReady, setRevealReady] = useState(false);
  const artifactId = artifact?.id;

  useEffect(() => {
    if (!artifactId) {
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
  }, [artifactId]);

  return (
    <div className={`forge-reveal-layer ${revealReady ? 'reveal-ready' : ''} ${embedded ? 'forge-embedded' : ''}`} role={embedded ? undefined : 'dialog'} aria-modal={embedded ? undefined : true} aria-label={embedded ? undefined : 'Artifact acquired'} style={{ ['--reveal-color' as any]: theme.color, ['--reveal-soft' as any]: theme.soft }}>
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
            {!embedded && <div className="reveal-actions">
              <button className="armory-primary" type="button" disabled={saving} onClick={onEquip}>Equip Now</button>
              <button className="armory-secondary" type="button" disabled={saving} onClick={onKeep}>Keep in Inventory</button>
            </div>}
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
