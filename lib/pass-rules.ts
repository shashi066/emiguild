export const PASS_WEEKDAY_ONLY_ERROR = 'Passes can only be used Monday through Friday.';

export function isPassDateEligible(dateStr: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return false;

  const date = new Date(`${dateStr}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== dateStr) {
    return false;
  }

  const day = date.getUTCDay();
  return day >= 1 && day <= 5;
}
