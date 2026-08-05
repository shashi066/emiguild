'use client';

import { useState } from 'react';
import { Search, Users, X } from 'lucide-react';
import type { AnalyticsVisitor } from '@/lib/analytics';
import styles from './analytics.module.css';

const NUMBER_FORMAT = new Intl.NumberFormat('en-IN');

function matchesSearch(visitor: AnalyticsVisitor, search: string) {
  const query = search.trim().toLowerCase();
  if (!query) return true;

  const idQuery = query.replace(/^#/, '');
  const userId = visitor.userId?.toLowerCase() ?? '';

  return visitor.name.toLowerCase().includes(query)
    || (visitor.email?.toLowerCase().includes(query) ?? false)
    || (visitor.role?.toLowerCase().includes(query) ?? false)
    || visitor.type.toLowerCase().includes(query)
    || (idQuery.length > 0 && (
      userId.includes(idQuery) || userId.slice(-6).includes(idQuery)
    ));
}

export function VisitorAnalyticsTable({ visitors }: { visitors: AnalyticsVisitor[] }) {
  const [search, setSearch] = useState('');
  const searchQuery = search.trim();
  const filteredVisitors = visitors.filter((visitor) => matchesSearch(visitor, search));

  return (
    <section aria-labelledby="visitor-visits-heading">
      <div className={styles.tableHeading}>
        <Users size={18} aria-hidden="true" />
        <h2 id="visitor-visits-heading">Visitors</h2>
      </div>

      <div className={styles.searchBar}>
        <div className="search-input-wrapper" style={{ width: '100%', maxWidth: 420 }}>
          <Search size={16} className="search-icon" aria-hidden="true" />
          <input
            id="analytics-visitor-search"
            type="search"
            className="form-input search-input"
            aria-label="Search visitors"
            aria-controls="analytics-visitors-table"
            placeholder="Search name, email, role or user ID..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        {search && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setSearch('')}>
            <X size={14} aria-hidden="true" /> Clear
          </button>
        )}
        {searchQuery && (
          <span className={styles.resultCount} aria-live="polite">
            {filteredVisitors.length} {filteredVisitors.length === 1 ? 'result' : 'results'}
          </span>
        )}
      </div>

      <div
        className={`table-wrapper ${styles.tableRegion}`}
        role="region"
        aria-labelledby="visitor-visits-heading"
        tabIndex={0}
      >
        <table id="analytics-visitors-table" className={`data-table ${styles.table} ${styles.visitorTable}`}>
          <thead>
            <tr>
              <th className={styles.userColumn}>User</th>
              <th>Role</th>
              <th className={styles.numberColumn}>Today</th>
              <th className={styles.numberColumn}>Yesterday</th>
              <th className={styles.numberColumn}>7 Days</th>
              <th className={styles.numberColumn}>30 Days</th>
              <th className={styles.numberColumn}>This Month</th>
              <th className={styles.numberColumn}>Last Month</th>
              <th className={styles.numberColumn}>This Year</th>
              <th className={styles.numberColumn}>Rolling Year</th>
            </tr>
          </thead>
          <tbody>
            {filteredVisitors.map((visitor) => {
              const roleLabel = visitor.type === 'ANONYMOUS'
                ? 'Anonymous'
                : visitor.type === 'DELETED'
                  ? 'Deleted'
                  : visitor.role === 'ADMIN' ? 'Admin' : 'User';
              const roleClass = visitor.type === 'ANONYMOUS'
                ? styles.anonymousRole
                : visitor.type === 'DELETED'
                  ? styles.deletedRole
                  : visitor.role === 'ADMIN' ? styles.adminRole : styles.userRole;
              const identityDetail = visitor.email
                ?? (visitor.type === 'ANONYMOUS'
                  ? 'Not signed in'
                  : visitor.type === 'DELETED' ? 'Account no longer exists' : 'No email');

              return (
                <tr key={`${visitor.type}:${visitor.userId ?? 'anonymous'}`}>
                  <td>
                    <strong>{visitor.name}</strong>
                    <div className={styles.identityDetail}>{identityDetail}</div>
                  </td>
                  <td><span className={`${styles.roleBadge} ${roleClass}`}>{roleLabel}</span></td>
                  <td className={styles.numberValue}>{NUMBER_FORMAT.format(visitor.visits.today)}</td>
                  <td className={styles.numberValue}>{NUMBER_FORMAT.format(visitor.visits.yesterday)}</td>
                  <td className={styles.numberValue}>{NUMBER_FORMAT.format(visitor.visits.last7Days)}</td>
                  <td className={styles.numberValue}>{NUMBER_FORMAT.format(visitor.visits.last30Days)}</td>
                  <td className={styles.numberValue}>{NUMBER_FORMAT.format(visitor.visits.currentMonth)}</td>
                  <td className={styles.numberValue}>{NUMBER_FORMAT.format(visitor.visits.previousMonth)}</td>
                  <td className={styles.numberValue}>{NUMBER_FORMAT.format(visitor.visits.currentYear)}</td>
                  <td className={styles.numberValue}>{NUMBER_FORMAT.format(visitor.visits.rollingYear)}</td>
                </tr>
              );
            })}
            {filteredVisitors.length === 0 && (
              <tr>
                <td colSpan={10} className={styles.emptyRow}>
                  {searchQuery ? 'No visitors match your search.' : 'No homepage visits recorded yet.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
