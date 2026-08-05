const INDIA_UTC_OFFSET_MS = 5.5 * 60 * 60 * 1000;

export interface AnalyticsDateRanges {
  today: Date;
  tomorrow: Date;
  yesterday: Date;
  last7DaysStart: Date;
  last30DaysStart: Date;
  currentMonthStart: Date;
  previousMonthStart: Date;
  currentYearStart: Date;
  retentionStart: Date;
}

/** Returns the India calendar day as a canonical UTC-midnight database key. */
export function getIndiaAnalyticsDay(now: Date = new Date()): Date {
  if (Number.isNaN(now.getTime())) {
    throw new RangeError('A valid date is required.');
  }

  const indiaTime = new Date(now.getTime() + INDIA_UTC_OFFSET_MS);
  return new Date(Date.UTC(
    indiaTime.getUTCFullYear(),
    indiaTime.getUTCMonth(),
    indiaTime.getUTCDate(),
  ));
}

export function addAnalyticsDays(day: Date, amount: number): Date {
  return new Date(Date.UTC(
    day.getUTCFullYear(),
    day.getUTCMonth(),
    day.getUTCDate() + amount,
  ));
}

/** Subtracts one calendar year, clamping leap day to February 28. */
export function getAnalyticsRetentionStart(today: Date): Date {
  const targetYear = today.getUTCFullYear() - 1;
  const month = today.getUTCMonth();
  const lastDayOfTargetMonth = new Date(
    Date.UTC(targetYear, month + 1, 0),
  ).getUTCDate();

  return new Date(Date.UTC(
    targetYear,
    month,
    Math.min(today.getUTCDate(), lastDayOfTargetMonth),
  ));
}

export function getAnalyticsDateRanges(now: Date = new Date()): AnalyticsDateRanges {
  const today = getIndiaAnalyticsDay(now);
  const currentMonthStart = new Date(Date.UTC(
    today.getUTCFullYear(),
    today.getUTCMonth(),
    1,
  ));

  return {
    today,
    tomorrow: addAnalyticsDays(today, 1),
    yesterday: addAnalyticsDays(today, -1),
    last7DaysStart: addAnalyticsDays(today, -6),
    last30DaysStart: addAnalyticsDays(today, -29),
    currentMonthStart,
    previousMonthStart: new Date(Date.UTC(
      today.getUTCFullYear(),
      today.getUTCMonth() - 1,
      1,
    )),
    currentYearStart: new Date(Date.UTC(today.getUTCFullYear(), 0, 1)),
    retentionStart: getAnalyticsRetentionStart(today),
  };
}

export function toAnalyticsDateKey(day: Date): string {
  return [
    day.getUTCFullYear(),
    String(day.getUTCMonth() + 1).padStart(2, '0'),
    String(day.getUTCDate()).padStart(2, '0'),
  ].join('-');
}
