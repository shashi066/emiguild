import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { redirect } from 'next/navigation';
import { User, Mail, Phone, Calendar, BookOpen, Shield } from 'lucide-react';
import { ChangePasswordForm } from '@/components/profile/ChangePasswordForm';

export default async function ProfilePage() {
  const session = await auth();
  if (!session) redirect('/login');

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, name: true, email: true, phone: true, role: true, createdAt: true },
  });

  if (!user) redirect('/login');

  const stats = await prisma.booking.groupBy({
    by: ['status'],
    where: { userId: user.id },
    _count: true,
  });

  const totalBookings = stats.reduce((sum, s) => sum + s._count, 0);
  const confirmed = stats.find((s) => s.status === 'CONFIRMED')?._count ?? 0;
  const completed = stats.find((s) => s.status === 'COMPLETED')?._count ?? 0;

  return (
    <div className="page-wrapper">
      <div className="container-sm">
        <h1 className="page-title" style={{ marginBottom: 'var(--space-2xl)' }}>
          <User size={28} style={{ display: 'inline', marginRight: 10, color: 'var(--color-accent-primary)' }} />
          My <span className="text-gradient">Profile</span>
        </h1>

        {/* Profile Card */}
        <div className="card" style={{ marginBottom: 'var(--space-lg)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-lg)', marginBottom: 'var(--space-xl)' }}>
            <div style={{
              width: 72, height: 72, borderRadius: '50%',
              background: 'var(--gradient-primary)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '1.8rem', fontWeight: 700, color: 'white', flexShrink: 0,
            }}>
              {user.name.charAt(0).toUpperCase()}
            </div>
            <div>
              <div style={{ fontSize: '1.3rem', fontWeight: 700 }}>{user.name}</div>
              <div style={{ color: 'var(--color-text-secondary)', fontSize: '0.875rem' }}>{user.email}</div>
              {user.role === 'ADMIN' && (
                <span className="badge badge-confirmed" style={{ marginTop: 6 }}>
                  <Shield size={11} /> Admin
                </span>
              )}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-md)' }}>
            <div className="booking-detail-item">
              <div className="booking-detail-label"><Mail size={12} style={{ display: 'inline', marginRight: 4 }} />Email</div>
              <div className="booking-detail-value" style={{ fontSize: '0.875rem' }}>{user.email}</div>
            </div>
            <div className="booking-detail-item">
              <div className="booking-detail-label"><Phone size={12} style={{ display: 'inline', marginRight: 4 }} />Phone</div>
              <div className="booking-detail-value" style={{ fontSize: '0.875rem' }}>{user.phone ?? 'Not provided'}</div>
            </div>
            <div className="booking-detail-item">
              <div className="booking-detail-label"><Calendar size={12} style={{ display: 'inline', marginRight: 4 }} />Member Since</div>
              <div className="booking-detail-value" style={{ fontSize: '0.875rem' }}>
                {new Date(user.createdAt).toLocaleDateString('en-IN', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'Asia/Kolkata' })}
              </div>
            </div>
            <div className="booking-detail-item">
              <div className="booking-detail-label"><Shield size={12} style={{ display: 'inline', marginRight: 4 }} />Account Type</div>
              <div className="booking-detail-value" style={{ fontSize: '0.875rem' }}>{user.role}</div>
            </div>
          </div>

          {/* Change password button */}
          <div style={{ marginTop: 'var(--space-xl)', paddingTop: 'var(--space-lg)', borderTop: '1px solid var(--color-border)' }}>
            <ChangePasswordForm />
          </div>
        </div>

        {/* Stats */}
        <h2 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: 'var(--space-lg)' }}>
          <BookOpen size={18} style={{ display: 'inline', marginRight: 8, color: 'var(--color-accent-primary)' }} />
          Your Gaming Stats
        </h2>

        <div className="stats-grid">
          {[
            { label: 'Total Bookings',    value: totalBookings,           color: '#6c63ff', bg: 'rgba(108,99,255,0.1)' },
            { label: 'Confirmed',         value: confirmed,               color: '#10b981', bg: 'rgba(16,185,129,0.1)' },
            { label: 'Completed Sessions',value: completed,               color: '#818cf8', bg: 'rgba(99,102,241,0.1)' },
          ].map((stat, i) => (
            <div key={i} className="stat-card">
              <div className="stat-icon" style={{ background: stat.bg, color: stat.color }}>
                <BookOpen size={22} />
              </div>
              <div className="stat-value" style={{ color: stat.color, fontSize: '1.6rem' }}>
                {stat.value}
              </div>
              <div className="stat-label">{stat.label}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
