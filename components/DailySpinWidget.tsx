'use client';

import { useState, useEffect } from 'react';
import { Gift, Zap, Clock, Share2, Copy } from 'lucide-react';
import { useSession } from 'next-auth/react';

type SpinStatus = {
  enabled: boolean;
  canSpin: boolean;
  spin: any;
  remainingRetries: number;
  nextReset: string;
};

export function DailySpinWidget() {
  const { data: session, status: sessionStatus } = useSession();
  const [spinStatus, setSpinStatus] = useState<SpinStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [spinning, setSpinning] = useState(false);
  const [reward, setReward] = useState<any>(null);
  const [error, setError] = useState('');
  const [timeLeft, setTimeLeft] = useState('');

  const loadStatus = async () => {
    if (sessionStatus !== 'authenticated') {
      setLoading(false);
      return;
    }
    try {
      const res = await fetch('/api/daily-spin');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setSpinStatus(data);
      if (data.spin) {
        setReward(data.spin.lootItem);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load status');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (sessionStatus !== 'loading') {
      loadStatus();
    }
  }, [sessionStatus]);

  // Countdown timer
  useEffect(() => {
    if (!spinStatus?.nextReset || !reward) return;
    
    const interval = setInterval(() => {
      const now = new Date().getTime();
      const reset = new Date(spinStatus.nextReset).getTime();
      const distance = reset - now;
      
      if (distance < 0) {
        clearInterval(interval);
        setTimeLeft('EXPIRED');
        // Auto refresh status when expired to reset UI
        loadStatus();
        return;
      }
      
      const hours = Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((distance % (1000 * 60)) / 1000);
      
      setTimeLeft(`${hours}h ${minutes}m ${seconds}s`);
    }, 1000);
    
    return () => clearInterval(interval);
  }, [spinStatus?.nextReset, reward]);

  const handleSpin = async () => {
    if (!spinStatus?.canSpin) return;
    
    setSpinning(true);
    setError('');
    setReward(null); // hide existing reward during animation
    
    try {
      const res = await fetch('/api/daily-spin', { method: 'POST' });
      const data = await res.json();
      
      if (!res.ok) throw new Error(data.error);
      
      // Artificial delay for animation suspense
      setTimeout(() => {
        setReward(data.reward);
        setSpinStatus(prev => prev ? {
          ...prev, 
          canSpin: data.spinRecord.attempts < prev.remainingRetries, // rough approximation for client
          nextReset: data.nextReset
        } : null);
        loadStatus(); // reload exact status from server
        setSpinning(false);
      }, 3000);

    } catch (err: any) {
      setError(err.message || 'Spin failed');
      setSpinning(false);
    }
  };

  const shareReward = async () => {
    if (!reward) return;
    const text = `I just won ${reward.name} in the GameZone Daily Spin! 🎮✨`;
    if (navigator.share) {
      try {
        await navigator.share({ title: 'GameZone Loot', text, url: window.location.href });
      } catch (err) {
        console.log('Share cancelled or failed');
      }
    } else {
      navigator.clipboard.writeText(text);
      alert('Result copied to clipboard!');
    }
  };

  if (loading || sessionStatus === 'loading') {
    return <div className="loading-state"><div className="spinner" />Loading Spin...</div>;
  }

  if (sessionStatus === 'unauthenticated') {
    return (
      <div className="card" style={{ textAlign: 'center', padding: 'var(--space-2xl)' }}>
        <Gift size={48} style={{ color: 'var(--color-accent-primary)', margin: '0 auto var(--space-md)' }} />
        <h2 style={{ fontSize: '1.5rem', marginBottom: 'var(--space-md)' }}>Login Required</h2>
        <p style={{ color: 'var(--color-text-secondary)', marginBottom: 'var(--space-lg)' }}>
          You must be logged in to claim your daily loot spin!
        </p>
        <a href={`/login?callbackUrl=/daily-spin`} className="btn btn-primary">Login to Spin</a>
      </div>
    );
  }

  if (spinStatus && !spinStatus.enabled) {
    return (
      <div className="card" style={{ textAlign: 'center', padding: 'var(--space-2xl)' }}>
        <Gift size={48} style={{ color: 'var(--color-text-muted)', margin: '0 auto var(--space-md)' }} />
        <h2>Daily Spin Disabled</h2>
        <p style={{ color: 'var(--color-text-secondary)' }}>The daily spin feature is currently disabled by the administrator.</p>
      </div>
    );
  }

  return (
    <div className="spin-widget-container" style={{
      maxWidth: 600,
      margin: '0 auto',
      background: 'var(--color-bg-card)',
      borderRadius: 'var(--radius-xl)',
      padding: 'var(--space-2xl)',
      boxShadow: 'var(--shadow-glow)',
      border: '1px solid var(--color-border-accent)',
      position: 'relative',
      overflow: 'hidden',
      textAlign: 'center'
    }}>
      {/* Neon glowing orb background effect */}
      <div style={{
        position: 'absolute',
        top: '50%', left: '50%',
        transform: 'translate(-50%, -50%)',
        width: 300, height: 300,
        background: 'var(--color-accent-primary)',
        filter: 'blur(100px)',
        opacity: spinning ? 0.3 : 0.1,
        transition: 'opacity 3s ease',
        zIndex: 0,
        pointerEvents: 'none'
      }} />

      <div style={{ position: 'relative', zIndex: 1 }}>
        <h2 style={{ 
          fontSize: '2rem', 
          fontWeight: 900, 
          fontFamily: 'Orbitron, sans-serif',
          textTransform: 'uppercase',
          letterSpacing: '2px',
          background: 'var(--gradient-primary)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          marginBottom: 'var(--space-sm)'
        }}>
          Daily Loot Drop
        </h2>
        
        <p style={{ color: 'var(--color-text-secondary)', marginBottom: 'var(--space-xl)' }}>
          {spinStatus?.canSpin ? 'Test your luck and win a free perk for your next session!' : 'Come back tomorrow for another drop!'}
        </p>

        {error && (
          <div className="alert alert-error" style={{ marginBottom: 'var(--space-lg)' }}>
            {error}
          </div>
        )}

        {/* The Spin Target / Animation Area */}
        <div style={{
          width: 200, height: 200,
          margin: '0 auto var(--space-xl)',
          borderRadius: '50%',
          background: 'var(--color-bg-surface)',
          border: `4px solid ${spinning ? 'var(--color-accent-secondary)' : 'var(--color-accent-primary)'}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: spinning ? 'var(--shadow-glow-cyan)' : 'var(--shadow-glow)',
          transition: 'all 0.5s ease',
          animation: spinning ? 'spin 0.5s linear infinite' : 'none'
        }}>
          {spinning ? (
            <Zap size={64} style={{ color: 'var(--color-accent-secondary)', animation: 'pulse 0.5s infinite' }} />
          ) : reward ? (
            <Gift size={64} style={{ color: 'var(--color-accent-success)' }} />
          ) : (
            <Gift size={64} style={{ color: 'var(--color-text-muted)' }} />
          )}
        </div>

        {/* Add minimal CSS keyframes for the spin/pulse directly in the component for simplicity */}
        <style dangerouslySetInnerHTML={{__html: `
          @keyframes spin { 100% { transform: rotate(360deg); } }
          @keyframes pulse { 50% { transform: scale(1.2); opacity: 0.8; } }
          .reward-reveal { animation: popIn 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards; }
          @keyframes popIn { 0% { opacity: 0; transform: scale(0.8) translateY(20px); } 100% { opacity: 1; transform: scale(1) translateY(0); } }
        `}} />

        {/* Action Button */}
        {!reward && !spinning && spinStatus?.canSpin && (
          <button 
            className="btn btn-primary" 
            style={{ padding: '16px 48px', fontSize: '1.2rem', fontFamily: 'Orbitron, sans-serif' }}
            onClick={handleSpin}
          >
            SPIN NOW
          </button>
        )}

        {spinning && (
          <div style={{ fontSize: '1.2rem', color: 'var(--color-accent-secondary)', fontFamily: 'Orbitron, sans-serif' }}>
            Decrypting Loot Container...
          </div>
        )}

        {/* Reward Reveal */}
        {reward && !spinning && (
          <div className="reward-reveal" style={{ 
            background: 'rgba(255,255,255,0.03)', 
            padding: 'var(--space-lg)', 
            borderRadius: 'var(--radius-lg)',
            border: '1px solid var(--color-border)'
          }}>
            <h3 style={{ fontSize: '1.5rem', color: 'var(--color-accent-success)', marginBottom: 'var(--space-xs)' }}>
              🎉 {reward.name}
            </h3>
            {reward.description && (
              <p style={{ color: 'var(--color-text-secondary)', marginBottom: 'var(--space-md)' }}>
                {reward.description}
              </p>
            )}
            
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, color: 'var(--color-accent-warning)', fontSize: '0.9rem', marginBottom: 'var(--space-md)' }}>
              <Clock size={16} /> Expires In: {timeLeft || 'Calculating...'}
            </div>

            <div className="alert alert-info" style={{ fontSize: '0.85rem', marginBottom: 'var(--space-md)', textAlign: 'left' }}>
              <strong>How to claim:</strong> Contact EMI Guild staff at the front desk to redeem this reward. Do not close this page if you are claiming it right now, or check your profile later.
            </div>

            <div style={{ display: 'flex', justifyContent: 'center', gap: 'var(--space-sm)' }}>
              <button className="btn btn-secondary btn-sm" onClick={shareReward}>
                <Share2 size={16} /> Share Result
              </button>
            </div>
          </div>
        )}

        {!spinStatus?.canSpin && !spinning && !reward && spinStatus?.spin && (
           <div style={{ color: 'var(--color-text-secondary)', marginTop: 'var(--space-md)' }}>
             You have already claimed your daily drop. Check back later!
           </div>
        )}

      </div>
    </div>
  );
}
