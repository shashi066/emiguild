export const ADMIN_WALKIN_OPEN_MINUTES = 9 * 60;
export const ADMIN_WALKIN_CLOSE_MINUTES = 23 * 60;
export const ADMIN_WALKIN_SLOT_STEP_MINUTES = 30;

function formatMinutes(totalMinutes: number) {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

function parseTime(time: string) {
  if (!/^\d{2}:\d{2}$/.test(time)) return null;
  const [hours, minutes] = time.split(':').map(Number);
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return hours * 60 + minutes;
}

export const ADMIN_WALKIN_TIME_SLOTS = Object.freeze(
  Array.from(
    {
      length: (
        ADMIN_WALKIN_CLOSE_MINUTES - ADMIN_WALKIN_OPEN_MINUTES
      ) / ADMIN_WALKIN_SLOT_STEP_MINUTES,
    },
    (_, index) => formatMinutes(
      ADMIN_WALKIN_OPEN_MINUTES + index * ADMIN_WALKIN_SLOT_STEP_MINUTES,
    ),
  ),
);

export type AdminWalkinTimeValidation =
  | { valid: true; endMinutes: number }
  | {
      valid: false;
      code:
        | 'INVALID_START_TIME'
        | 'INVALID_SLOT_INTERVAL'
        | 'OUTSIDE_ADMIN_HOURS';
      reason: string;
    };

export function validateAdminWalkinTime(
  startTime: string,
  duration: number,
): AdminWalkinTimeValidation {
  const startMinutes = parseTime(startTime);
  if (startMinutes == null) {
    return {
      valid: false,
      code: 'INVALID_START_TIME',
      reason: 'Select a valid walk-in start time.',
    };
  }
  if (
    !Number.isFinite(duration)
    || duration < 0.5
    || duration > 12
    || startMinutes % ADMIN_WALKIN_SLOT_STEP_MINUTES !== 0
    || !Number.isInteger(duration * 2)
  ) {
    return {
      valid: false,
      code: 'INVALID_SLOT_INTERVAL',
      reason: 'Walk-in bookings must use 30-minute intervals.',
    };
  }

  const endMinutes = startMinutes + Math.round(duration * 60);
  if (
    startMinutes < ADMIN_WALKIN_OPEN_MINUTES
    || startMinutes >= ADMIN_WALKIN_CLOSE_MINUTES
    || endMinutes > ADMIN_WALKIN_CLOSE_MINUTES
  ) {
    return {
      valid: false,
      code: 'OUTSIDE_ADMIN_HOURS',
      reason: 'Admin walk-in bookings must start at or after 9:00 AM and finish by 11:00 PM.',
    };
  }

  return { valid: true, endMinutes };
}
