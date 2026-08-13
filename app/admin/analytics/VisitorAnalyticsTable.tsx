'use client';

import { useMemo, useState } from 'react';
import { ArrowDownWideNarrow, ArrowUpNarrowWide, Search, Users, X } from 'lucide-react';
import type { AnalyticsSummary, AnalyticsVisitor } from '@/lib/analytics';
import styles from './analytics.module.css';

const NUMBER_FORMAT = new Intl.NumberFormat('en-IN');
const DEFAULT_METRIC: AnalyticsMetric = 'rollingYear';
const DEFAULT_DIRECTION: SortDirection = 'desc';

type AnalyticsMetric = keyof AnalyticsSummary;
type SortDirection = 'asc' | 'desc';
type VisitorTypeFilter = 'ALL' | 'USERS' | 'ADMINS' | 'ANONYMOUS' | 'DELETED';

const METRIC_OPTIONS: Array<{ value: AnalyticsMetric; label: string }> = [
  { value: 'today', label: 'Today' },
  { value: 'yesterday', label: 'Yesterday' },
  { value: 'last7Days', label: '7 Days' },
  { value: 'last30Days', label: '30 Days' },
  { value: 'currentMonth', label: 'This Month' },
  { value: 'previousMonth', label: 'Last Month' },
  { value: 'currentYear', label: 'This Year' },
  { value: 'rollingYear', label: 'Rolling Year' },
];

const TYPE_FILTER_OPTIONS: Array<{ value: VisitorTypeFilter; label: string }> = [
  { value: 'ALL', label: 'All Visitors' },
  { value: 'USERS', label: 'Users' },
  { value: 'ADMINS', label: 'Admins' },
  { value: 'ANONYMOUS', label: 'Anonymous' },
  { value: 'DELETED', label: 'Deleted' },
];

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

function matchesTypeFilter(visitor: AnalyticsVisitor, typeFilter: VisitorTypeFilter) {
  if (typeFilter === 'ALL') return true;
  if (typeFilter === 'ANONYMOUS') return visitor.type === 'ANONYMOUS';
  if (typeFilter === 'DELETED') return visitor.type === 'DELETED';
  if (typeFilter === 'ADMINS') return visitor.type === 'USER' && visitor.role === 'ADMIN';
  return visitor.type === 'USER' && visitor.role !== 'ADMIN';
}

function getVisitorStableKey(visitor: AnalyticsVisitor) {
  return visitor.email ?? visitor.userId ?? visitor.type;
}

function compareVisitors(
  left: AnalyticsVisitor,
  right: AnalyticsVisitor,
  metric: AnalyticsMetric,
  direction: SortDirection,
) {
  const multiplier = direction === 'desc' ? -1 : 1;
  const visitDelta = left.visits[metric] - right.visits[metric];

  return visitDelta * multiplier
    || left.name.localeCompare(right.name, 'en')
    || getVisitorStableKey(left).localeCompare(getVisitorStableKey(right), 'en');
}

export function VisitorAnalyticsTable({ visitors }: { visitors: AnalyticsVisitor[] }) {
  const [search, setSearch] = useState('');
  const [metric, setMetric] = useState<AnalyticsMetric>(DEFAULT_METRIC);
  const [direction, setDirection] = useState<SortDirection>(DEFAULT_DIRECTION);
  const [typeFilter, setTypeFilter] = useState<VisitorTypeFilter>('ALL');
  const searchQuery = search.trim();
  const selectedMetricLabel = METRIC_OPTIONS.find((option) => option.value === metric)?.label ?? 'Rolling Year';
  const sortDirectionLabel = direction === 'desc' ? 'Highest first' : 'Lowest first';
  const hasControls = searchQuery
    || metric !== DEFAULT_METRIC
    || direction !== DEFAULT_DIRECTION
    || typeFilter !== 'ALL';
  const filteredVisitors = useMemo(
    () => visitors
      .filter((visitor) => matchesSearch(visitor, search))
      .filter((visitor) => matchesTypeFilter(visitor, typeFilter))
      .sort((left, right) => compareVisitors(left, right, metric, direction)),
    [direction, metric, search, typeFilter, visitors],
  );

  function clearControls() {
    setSearch('');
    setMetric(DEFAULT_METRIC);
    setDirection(DEFAULT_DIRECTION);
    setTypeFilter('ALL');
  }

  return (
    <section aria-labelledby="visitor-visits-heading">
      <div className={styles.tableHeading}>
        <Users size={18} aria-hidden="true" />
        <h2 id="visitor-visits-heading">Visitors</h2>
      </div>

      <div className={styles.controlBar}>
        <div className={`search-input-wrapper ${styles.searchControl}`}>
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

        <select
          id="analytics-metric-sort"
          className={`form-input ${styles.selectControl}`}
          aria-label="Sort visitors by analytics window"
          value={metric}
          onChange={(event) => setMetric(event.target.value as AnalyticsMetric)}
        >
          {METRIC_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              Sort: {option.label}
            </option>
          ))}
        </select>

        <button
          type="button"
          className={`btn btn-ghost btn-sm ${styles.sortButton}`}
          aria-label={`Sort ${direction === 'desc' ? 'lowest first' : 'highest first'}`}
          onClick={() => setDirection((current) => (current === 'desc' ? 'asc' : 'desc'))}
        >
          {direction === 'desc'
            ? <ArrowDownWideNarrow size={15} aria-hidden="true" />
            : <ArrowUpNarrowWide size={15} aria-hidden="true" />}
          {sortDirectionLabel}
        </button>

        <select
          id="analytics-type-filter"
          className={`form-input ${styles.typeControl}`}
          aria-label="Filter visitors by type"
          value={typeFilter}
          onChange={(event) => setTypeFilter(event.target.value as VisitorTypeFilter)}
        >
          {TYPE_FILTER_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>

        {hasControls && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={clearControls}>
            <X size={14} aria-hidden="true" /> Clear
          </button>
        )}

        <span className={styles.resultCount} aria-live="polite">
          {filteredVisitors.length} {filteredVisitors.length === 1 ? 'result' : 'results'}
          {' '}sorted by {selectedMetricLabel.toLowerCase()}
        </span>
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
                  {hasControls ? 'No visitors match these controls.' : 'No homepage visits recorded yet.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
