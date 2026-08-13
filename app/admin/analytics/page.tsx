import { auth } from '@/auth';
import { getAdminAnalytics } from '@/lib/analytics';
import {
  Calendar,
  CalendarClock,
  CalendarDays,
  CalendarRange,
  Eye,
  History,
  RefreshCcw,
  Users,
} from 'lucide-react';
import { redirect } from 'next/navigation';
import { VisitorAnalyticsTable } from './VisitorAnalyticsTable';
import styles from './analytics.module.css';

export const dynamic = 'force-dynamic';

const NUMBER_FORMAT = new Intl.NumberFormat('en-IN');

export default async function AdminAnalyticsPage() {
  const session = await auth();
  if (!session || session.user.role !== 'ADMIN') redirect('/');

  const analytics = await getAdminAnalytics();
  const cards = [
    { label: 'Unique Users Today', value: analytics.uniqueUsersToday, icon: Users, tone: styles.green },
    { label: 'Today', value: analytics.summary.today, icon: Eye, tone: styles.violet },
    { label: 'Yesterday', value: analytics.summary.yesterday, icon: History, tone: styles.cyan },
    { label: 'Last 7 Days', value: analytics.summary.last7Days, icon: CalendarDays, tone: styles.green },
    { label: 'Last 30 Days', value: analytics.summary.last30Days, icon: CalendarRange, tone: styles.amber },
    { label: 'This Month', value: analytics.summary.currentMonth, icon: Calendar, tone: styles.violet },
    { label: 'Last Month', value: analytics.summary.previousMonth, icon: CalendarClock, tone: styles.cyan },
    { label: 'This Year', value: analytics.summary.currentYear, icon: CalendarDays, tone: styles.green },
    { label: 'Rolling Year', value: analytics.summary.rollingYear, icon: RefreshCcw, tone: styles.amber },
  ];

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Homepage Analytics</h1>
          <p className="page-subtitle">Visits to the homepage, grouped by India Standard Time.</p>
        </div>
      </div>

      <div className={`stats-grid ${styles.statsGrid}`}>
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <section key={card.label} className={`${styles.statCard} ${card.tone}`} aria-label={card.label}>
              <div className={`stat-icon ${styles.statIcon}`} aria-hidden="true">
                <Icon size={22} />
              </div>
              <div className={`stat-value ${styles.statValue}`}>{NUMBER_FORMAT.format(card.value)}</div>
              <div className="stat-label">{card.label}</div>
            </section>
          );
        })}
      </div>

      <VisitorAnalyticsTable visitors={analytics.visitors} />
    </div>
  );
}
