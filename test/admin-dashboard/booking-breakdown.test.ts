import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { DashboardStatsSection } from '../../components/admin/DashboardStatsSection';

const baseData = {
  totalBookings: 14,
  todayBookings: 0,
  pendingBookings: 0,
  confirmedBookings: 2,
  checkedInBookings: 9,
  completedBookings: 0,
  cancelledBookings: 3,
  totalUsers: 0,
  activeStations: 0,
  totalRevenue: 0,
  todayRevenue: 0,
};

function renderBreakdown(data: typeof baseData) {
  const html = renderToStaticMarkup(createElement(DashboardStatsSection, { data }));
  const section = html.match(/<section[^>]*aria-label="Booking breakdown"[\s\S]*?<\/section>/)?.[0];
  assert.ok(section, 'Booking breakdown is an accessible section');
  return section;
}

test('includes checked-in bookings in the full status breakdown', () => {
  const html = renderBreakdown(baseData);
  assert.match(html, /14 total bookings across all dates/);
  for (const [label, count, percent] of [
    ['Pending', 0, 0], ['Confirmed', 2, 14], ['Checked In', 9, 64],
    ['Completed', 0, 0], ['Cancelled', 3, 21],
  ] as const) {
    assert.match(html, new RegExp(`>${label}</span>[\\s\\S]*?<strong>${count}</strong><span[^>]*>\\(${percent}%\\)</span>`));
  }
  assert.doesNotMatch(html, /&#x20;|\*\*|NaN|Infinity/);
});

test('shows all five statuses safely when there are no bookings', () => {
  const html = renderBreakdown({
    ...baseData, totalBookings: 0, confirmedBookings: 0, checkedInBookings: 0, cancelledBookings: 0,
  });
  assert.match(html, /0 total bookings across all dates/);
  assert.equal((html.match(/<strong>0<\/strong>/g) ?? []).length, 5);
  assert.equal((html.match(/\(0%\)/g) ?? []).length, 5);
  assert.doesNotMatch(html, /NaN|Infinity/);
});
