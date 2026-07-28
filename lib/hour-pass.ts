import { isPassDateEligible, PASS_WEEKDAY_ONLY_ERROR } from '@/lib/pass-rules';

export const HOUR_PASS_TYPES = ['BRONZE', 'SILVER', 'GOLD', 'BLACK', 'APEX'] as const;
export type HourPassType = (typeof HOUR_PASS_TYPES)[number];

export type HourPassRecord = {
  id: string;
  userId: string;
  passType: string;
  totalHours: number;
  usedHours: number;
  status: string;
  expiresAt: Date | string;
};

export type HourPassValidation =
  | {
      valid: true;
      remainingHours: number;
      passType: HourPassType;
    }
  | {
      valid: false;
      code:
        | 'NO_LINKED_USER'
        | 'PASS_NOT_FOUND'
        | 'PASS_INACTIVE'
        | 'PASS_EXPIRED'
        | 'PASS_WEEKDAY_ONLY'
        | 'PASS_STATION_MISMATCH'
        | 'PASS_HOURS_INSUFFICIENT'
        | 'INVALID_DURATION';
      reason: string;
      remainingHours: number;
    };

function normalizeHours(value: number) {
  return Math.round(value * 100) / 100;
}

export function isHourPassType(value: unknown): value is HourPassType {
  return typeof value === 'string'
    && HOUR_PASS_TYPES.includes(value as HourPassType);
}

export function isHourPassAllowedForStation(
  passType: string,
  hasControllers: boolean,
) {
  if (!isHourPassType(passType)) return false;
  return hasControllers
    ? passType === 'BRONZE' || passType === 'SILVER' || passType === 'GOLD'
    : passType === 'BLACK' || passType === 'APEX';
}

export function getHourPassRemainingForBooking({
  pass,
  currentPassId,
  currentPassHours = 0,
}: {
  pass: Pick<HourPassRecord, 'id' | 'totalHours' | 'usedHours'>;
  currentPassId?: string | null;
  currentPassHours?: number;
}) {
  const restoredHours = pass.id === currentPassId
    ? Math.max(0, currentPassHours)
    : 0;
  return Math.max(
    0,
    normalizeHours(pass.totalHours - pass.usedHours + restoredHours),
  );
}

export function validateHourPassApplication({
  pass,
  userId,
  bookingDate,
  duration,
  hasControllers,
  currentPassId = null,
  currentPassHours = 0,
  now = new Date(),
}: {
  pass: HourPassRecord | null;
  userId: string | null;
  bookingDate: string;
  duration: number;
  hasControllers: boolean;
  currentPassId?: string | null;
  currentPassHours?: number;
  now?: Date;
}): HourPassValidation {
  if (!userId) {
    return {
      valid: false,
      code: 'NO_LINKED_USER',
      reason: 'A registered customer must be linked to use a pass.',
      remainingHours: 0,
    };
  }
  if (!pass || pass.userId !== userId || !isHourPassType(pass.passType)) {
    return {
      valid: false,
      code: 'PASS_NOT_FOUND',
      reason: 'This customer pass was not found.',
      remainingHours: 0,
    };
  }

  const remainingHours = getHourPassRemainingForBooking({
    pass,
    currentPassId,
    currentPassHours,
  });
  const isCurrentReservation = pass.id === currentPassId && currentPassHours > 0;
  const statusAllowed = pass.status === 'ACTIVE'
    || (isCurrentReservation && pass.status === 'EXHAUSTED');

  if (!statusAllowed) {
    return {
      valid: false,
      code: 'PASS_INACTIVE',
      reason: 'This pass is no longer active.',
      remainingHours,
    };
  }
  if (new Date(pass.expiresAt).getTime() < now.getTime()) {
    return {
      valid: false,
      code: 'PASS_EXPIRED',
      reason: 'This pass has expired.',
      remainingHours,
    };
  }
  if (!isPassDateEligible(bookingDate)) {
    return {
      valid: false,
      code: 'PASS_WEEKDAY_ONLY',
      reason: PASS_WEEKDAY_ONLY_ERROR,
      remainingHours,
    };
  }
  if (!isHourPassAllowedForStation(pass.passType, hasControllers)) {
    return {
      valid: false,
      code: 'PASS_STATION_MISMATCH',
      reason: 'This pass cannot be used on the selected station.',
      remainingHours,
    };
  }
  if (
    !Number.isFinite(duration)
    || duration < 0.5
    || duration > 12
    || !Number.isInteger(duration * 2)
  ) {
    return {
      valid: false,
      code: 'INVALID_DURATION',
      reason: 'Duration must be between 30 minutes and 12 hours.',
      remainingHours,
    };
  }
  if (remainingHours + Number.EPSILON < duration) {
    return {
      valid: false,
      code: 'PASS_HOURS_INSUFFICIENT',
      reason: `Not enough pass hours. ${remainingHours} hr(s) available, ${duration} hr(s) needed.`,
      remainingHours,
    };
  }

  return {
    valid: true,
    remainingHours,
    passType: pass.passType,
  };
}

export function getHourPassStatusAfterUsage({
  currentStatus,
  expiresAt,
  totalHours,
  usedHours,
  selected,
  now = new Date(),
}: {
  currentStatus: string;
  expiresAt: Date | string;
  totalHours: number;
  usedHours: number;
  selected: boolean;
  now?: Date;
}) {
  if (!selected && (currentStatus === 'REVOKED' || currentStatus === 'EXPIRED')) {
    return currentStatus;
  }
  if (!selected && new Date(expiresAt).getTime() < now.getTime()) return 'EXPIRED';
  return usedHours + Number.EPSILON >= totalHours ? 'EXHAUSTED' : 'ACTIVE';
}

export function calculateHourPassUsageUpdates({
  currentPass,
  currentPassHours,
  selectedPass,
  selectedHours,
  now = new Date(),
}: {
  currentPass: HourPassRecord | null;
  currentPassHours: number;
  selectedPass: HourPassRecord | null;
  selectedHours: number;
  now?: Date;
}) {
  const updates = new Map<string, {
    pass: HourPassRecord;
    usedHours: number;
    selected: boolean;
  }>();

  if (currentPass && currentPassHours > 0) {
    updates.set(currentPass.id, {
      pass: currentPass,
      usedHours: Math.max(0, normalizeHours(currentPass.usedHours - currentPassHours)),
      selected: false,
    });
  }

  if (selectedPass) {
    const released = updates.get(selectedPass.id);
    const baseUsedHours = released?.usedHours ?? selectedPass.usedHours;
    updates.set(selectedPass.id, {
      pass: selectedPass,
      usedHours: normalizeHours(baseUsedHours + selectedHours),
      selected: true,
    });
  }

  return [...updates.values()].map(({ pass, usedHours, selected }) => ({
    id: pass.id,
    usedHours,
    status: getHourPassStatusAfterUsage({
      currentStatus: pass.status,
      expiresAt: pass.expiresAt,
      totalHours: pass.totalHours,
      usedHours,
      selected,
      now,
    }),
  }));
}
