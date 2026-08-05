import { prisma } from '@/lib/prisma';
import Link from 'next/link';
import {
  BookOpen, Monitor, Users, IndianRupee,
  TrendingUp, Clock, CheckCircle, XCircle,
  ChevronRight, Gamepad2,
} from 'lucide-react';
import { formatCurrency, formatDate, formatTime, getTodayString } from '@/lib/utils';
import { AdminRevenueRange } from '@/components/admin/AdminRevenueRange';
import { StationAvailabilityBoard } from '@/components/StationAvailabilityBoard';
import { DashboardStatsSection } from '@/components/admin/DashboardStatsSection';
import { DashboardHeaderActions } from '@/components/admin/DashboardHeaderActions';


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
        <DashboardHeaderActions />
      </div>


      <StationAvailabilityBoard mode="admin" />

      <AdminRevenueRange
        initialFrom={data.monthStart}
        initialTo={data.today}
        initialRevenue={data.monthRevenue}
        initialBookingCount={data.monthBookingCount}
      />

      <DashboardStatsSection data={data} />


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
                      {b.notes && (
                        <div className="game-request-note compact">
                          <Gamepad2 size={12} aria-hidden="true" />
                          <span><strong>Game:</strong> {b.notes}</span>
                        </div>
                      )}
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
