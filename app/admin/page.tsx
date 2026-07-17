import { prisma } from '@/lib/prisma';
import Link from 'next/link';
import {
  BookOpen, Monitor, Users, IndianRupee,
  TrendingUp, Clock, CheckCircle, XCircle,
  ChevronRight,
} from 'lucide-react';
import { formatCurrency, formatDate, formatTime, getTodayString } from '@/lib/utils';
import { AdminRevenueRange } from '@/components/admin/AdminRevenueRange';

async function getDashboardData() {
  const today = getTodayString();
  const monthStart = `${today.slice(0, 8)}01`;

  const [
    totalBookings, todayBookings, pendingBookings,
    confirmedBookings, cancelledBookings, completedBookings,
    totalUsers, activeStations, recentBookings,
    totalRevenue, todayRevenue, monthRevenue, monthBookingCount,
  ] = await Promise.all([
    prisma.booking.count(),
    prisma.booking.count({ where: { date: today } }),
    prisma.booking.count({ where: { status: 'PENDING' } }),
    prisma.booking.count({ where: { status: 'CONFIRMED' } }),
    prisma.booking.count({ where: { status: 'CANCELLED' } }),
    prisma.booking.count({ where: { status: 'COMPLETED' } }),
    prisma.user.count({ where: { role: 'USER' } }),
    prisma.station.count({ where: { isActive: true } }),
    prisma.booking.findMany({
      orderBy: { createdAt: 'desc' },
      take: 8,
      include: {
        user: { select: { name: true, email: true } },
        station: { select: { name: true } },
      },
    }),
    prisma.booking.aggregate({
      where: { status: { not: 'CANCELLED' } },
      _sum: { totalPrice: true },
    }),
    prisma.booking.aggregate({
      where: { date: today, status: { not: 'CANCELLED' } },
      _sum: { totalPrice: true },
    }),
    prisma.booking.aggregate({
      where: {
        date: { gte: monthStart, lte: today },
        status: { not: 'CANCELLED' },
      },
      _sum: { totalPrice: true },
    }),
    prisma.booking.count({
      where: {
        date: { gte: monthStart, lte: today },
        status: { not: 'CANCELLED' },
      },
    }),
  ]);

  return {
    totalBookings, todayBookings, pendingBookings,
    confirmedBookings, cancelledBookings, completedBookings,
    totalUsers, activeStations, recentBookings,
    totalRevenue: totalRevenue._sum.totalPrice ?? 0,
    todayRevenue: todayRevenue._sum.totalPrice ?? 0,
    monthRevenue: monthRevenue._sum.totalPrice ?? 0,
    monthBookingCount,
    monthStart,
    today,
  };
}

const STATUS_CONFIG = {
  PENDING:    { cls: 'badge-pending',    label: 'Pending' },
  CONFIRMED:  { cls: 'badge-confirmed',  label: 'Confirmed' },
  CANCELLED:  { cls: 'badge-cancelled',  label: 'Cancelled' },
  COMPLETED:  { cls: 'badge-completed',  label: 'Completed' },
  CHECKED_IN: { cls: 'badge-checkedin',  label: 'Checked In' },
};

export default async function AdminDashboard() {
  const data = await getDashboardData();

  const statsCards = [
    {
      label: "Today's Bookings",
      value: data.todayBookings,
      icon: BookOpen,
      color: '#6c63ff',
      bg: 'rgba(108,99,255,0.12)',
      sub: `${data.totalBookings} total`,
    },
    {
      label: "Today's Revenue",
      value: formatCurrency(data.todayRevenue),
      icon: IndianRupee,
      color: '#00e676',
      bg: 'rgba(0,230,118,0.1)',
      sub: `${formatCurrency(data.totalRevenue)} all time`,
    },
    {
      label: 'Pending Approval',
      value: data.pendingBookings,
      icon: Clock,
      color: '#f59e0b',
      bg: 'rgba(245,158,11,0.1)',
      sub: `${data.confirmedBookings} confirmed`,
    },
    {
      label: 'Active Stations',
      value: data.activeStations,
      icon: Monitor,
      color: '#00d4ff',
      bg: 'rgba(0,212,255,0.08)',
      sub: 'All operational',
    },
    {
      label: 'Total Users',
      value: data.totalUsers,
      icon: Users,
      color: '#ff2d55',
      bg: 'rgba(255,45,85,0.08)',
      sub: 'Registered accounts',
    },
    {
      label: 'Completed Sessions',
      value: data.completedBookings,
      icon: CheckCircle,
      color: '#818cf8',
      bg: 'rgba(99,102,241,0.1)',
      sub: `${data.cancelledBookings} cancelled`,
    },
  ];

  return (
    <div>
      {/* Page header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">
            Dashboard
          </h1>
          <p className="page-subtitle">
            {new Date().toLocaleDateString('en-IN', {
              weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
              timeZone: 'Asia/Kolkata',
            })}
          </p>
        </div>
        <Link href="/admin/bookings" className="btn btn-primary" id="admin-view-all-btn">
          View All Bookings
          <ChevronRight size={16} />
        </Link>
      </div>

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

      {/* Booking status summary */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-lg)', marginBottom: 'var(--space-xl)' }}>
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

        <div className="card" style={{ padding: 'var(--space-lg)' }}>
          <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: 'var(--space-lg)' }}>
            <IndianRupee size={18} style={{ display: 'inline', marginRight: 8, color: 'var(--color-accent-success)' }} />
            Revenue Overview
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
            {[
              { label: "Today's Revenue", value: data.todayRevenue, color: '#00e676' },
              { label: 'Total Revenue', value: data.totalRevenue, color: '#6c63ff' },
            ].map((item) => (
              <div key={item.label} className="booking-detail-item">
                <div className="booking-detail-label">{item.label}</div>
                <div style={{ fontSize: '1.2rem', fontWeight: 700, color: item.color, fontFamily: 'Orbitron, sans-serif' }}>
                  {formatCurrency(item.value)}
                </div>
              </div>
            ))}
            <AdminRevenueRange
              initialFrom={data.monthStart}
              initialTo={data.today}
              initialRevenue={data.monthRevenue}
              initialBookingCount={data.monthBookingCount}
            />
          </div>
        </div>
      </div>

      {/* Recent bookings */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-lg)' }}>
          <h3 style={{ fontSize: '1rem', fontWeight: 700 }}>
            <BookOpen size={18} style={{ display: 'inline', marginRight: 8, color: 'var(--color-accent-primary)' }} />
            Recent Bookings
          </h3>
          <Link href="/admin/bookings" className="btn btn-ghost btn-sm">
            View All <ChevronRight size={14} />
          </Link>
        </div>

        <div className="table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th>Customer</th>
                <th>Station</th>
                <th>Date & Time</th>
                <th>Price</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {data.recentBookings.map((b) => {
                const cfg = STATUS_CONFIG[b.status as keyof typeof STATUS_CONFIG] ?? { cls: 'badge-pending', label: b.status };
                return (
                  <tr key={b.id}>
                    <td>
                      <strong>
                        {(b as {customerName?: string | null}).customerName ?? b.user?.name ?? '—'}
                      </strong>
                      <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                        {b.user?.email ?? 'Walk-in'}
                      </div>
                    </td>
                    <td>{b.station.name}</td>
                    <td>
                      <div>{formatDate(b.date)}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                        {formatTime(b.startTime)} – {formatTime(b.endTime)}
                      </div>
                    </td>
                    <td style={{ fontWeight: 700, color: 'var(--color-accent-primary)' }}>
                      {formatCurrency(b.totalPrice)}
                    </td>
                    <td>
                      <span className={`badge ${cfg.cls}`}>{cfg.label}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
