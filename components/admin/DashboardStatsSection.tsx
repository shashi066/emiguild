'use client';

import { useState, useEffect } from 'react';
import { BookOpen, IndianRupee, Clock, Monitor, Users, CheckCircle, TrendingUp } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';

type DashboardData = {
  totalBookings: number;
  todayBookings: number;
  pendingBookings: number;
  confirmedBookings: number;
  completedBookings: number;
  cancelledBookings: number;
  totalUsers: number;
  activeStations: number;
  totalRevenue: number;
  todayRevenue: number;
};

export function DashboardStatsSection({ data }: { data: DashboardData }) {
  const [hideRevenue, setHideRevenue] = useState(true);

  useEffect(() => {
    const handleSync = () => {
      // Sync state from the global window state variable or toggle
      const isHidden = (window as any).__hideDashboardRevenue !== false;
      setHideRevenue(isHidden);
    };
    window.addEventListener('dashboard_revenue_visibility_changed', handleSync);
    handleSync();
    return () => window.removeEventListener('dashboard_revenue_visibility_changed', handleSync);
  }, []);

  const renderValue = (val: number | string) => {

    if (hideRevenue) return '••••';
    return typeof val === 'number' ? formatCurrency(val) : val;
  };

  const statsCards = [
    {
      label: "Today's Bookings",
      value: String(data.todayBookings),
      icon: BookOpen,
      color: '#6c63ff',
      bg: 'rgba(108,99,255,0.12)',
      sub: `${data.totalBookings} total`,
    },
    {
      label: "Today's Revenue",
      value: renderValue(data.todayRevenue),
      icon: IndianRupee,
      color: '#00e676',
      bg: 'rgba(0,230,118,0.1)',
      sub: `${renderValue(data.totalRevenue)} all time`,
    },
    {
      label: 'Pending Approval',
      value: String(data.pendingBookings),
      icon: Clock,
      color: '#f59e0b',
      bg: 'rgba(245,158,11,0.1)',
      sub: `${data.confirmedBookings} confirmed`,
    },
    {
      label: 'Active Stations',
      value: String(data.activeStations),
      icon: Monitor,
      color: '#00d4ff',
      bg: 'rgba(0,212,255,0.08)',
      sub: 'All operational',
    },
    {
      label: 'Total Users',
      value: String(data.totalUsers),
      icon: Users,
      color: '#ff2d55',
      bg: 'rgba(255,45,85,0.08)',
      sub: 'Registered accounts',
    },
    {
      label: 'Completed Sessions',
      value: String(data.completedBookings),
      icon: CheckCircle,
      color: '#818cf8',
      bg: 'rgba(99,102,241,0.1)',
      sub: `${data.cancelledBookings} cancelled`,
    },
  ];

  return (
    <>
      {/* Stats grid */}
      <div className="stats-grid">
        {statsCards.map((card, i) => {
          const Icon = card.icon;
          return (
            <div key={i} className="stat-card animate-fade-in-up" style={{ animationDelay: `${i * 60}ms` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div className="stat-icon" style={{ background: card.bg, color: card.color }}>
                  <Icon size={22} />
                </div>
              </div>
              <div className="stat-value" style={{ color: card.color, fontSize: '1.8rem' }}>
                {card.value}
              </div>
              <div className="stat-label">{card.label}</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>{card.sub}</div>
            </div>
          );
        })}
      </div>

      <div className="admin-dashboard-summary">
        {/* Booking breakdown card */}
        <div className="card" style={{ padding: 'var(--space-lg)' }}>
          <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: 'var(--space-lg)' }}>
            <TrendingUp size={18} style={{ display: 'inline', marginRight: 8, color: 'var(--color-accent-primary)' }} />
            Booking Breakdown
          </h3>
          {[
            { label: 'Pending', value: data.pendingBookings, color: '#f59e0b', pct: data.totalBookings ? Math.round((data.pendingBookings / data.totalBookings) * 100) : 0 },
            { label: 'Confirmed', value: data.confirmedBookings, color: '#10b981', pct: data.totalBookings ? Math.round((data.confirmedBookings / data.totalBookings) * 100) : 0 },
            { label: 'Completed', value: data.completedBookings, color: '#818cf8', pct: data.totalBookings ? Math.round((data.completedBookings / data.totalBookings) * 100) : 0 },
            { label: 'Cancelled', value: data.cancelledBookings, color: '#ef4444', pct: data.totalBookings ? Math.round((data.cancelledBookings / data.totalBookings) * 100) : 0 },
          ].map((row) => (
            <div key={row.label} style={{ marginBottom: 'var(--space-md)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', marginBottom: 6 }}>
                <span style={{ color: 'var(--color-text-secondary)' }}>{row.label}</span>
                <span style={{ fontWeight: 700 }}>{row.value} <span style={{ color: 'var(--color-text-muted)', fontWeight: 400 }}>({row.pct}%)</span></span>
              </div>
              <div style={{ height: 6, background: 'rgba(255,255,255,0.05)', borderRadius: 3 }}>
                <div style={{
                  height: '100%', width: `${row.pct}%`,
                  background: row.color, borderRadius: 3,
                  transition: 'width 1s ease',
                }} />
              </div>
            </div>
          ))}
        </div>

        {/* Revenue Overview card */}
        <div className="card" style={{ padding: 'var(--space-lg)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-lg)' }}>
            <h3 style={{ fontSize: '1rem', fontWeight: 700, margin: 0 }}>
              <IndianRupee size={18} style={{ display: 'inline', marginRight: 8, color: 'var(--color-accent-success)' }} />
              Revenue Overview
            </h3>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
            {[
              { label: "Today's Revenue", value: data.todayRevenue, color: '#00e676' },
              { label: 'Total Revenue', value: data.totalRevenue, color: '#6c63ff' },
            ].map((item) => (
              <div key={item.label} className="booking-detail-item">
                <div className="booking-detail-label">{item.label}</div>
                <div style={{ fontSize: '1.2rem', fontWeight: 700, color: item.color, fontFamily: 'Orbitron, sans-serif' }}>
                  {renderValue(item.value)}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
