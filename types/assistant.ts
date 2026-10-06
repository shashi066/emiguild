export type AssistantLink = { label: string; href: string; kind?: 'internal' | 'external' | 'phone' };

export type AssistantMessage = {
  role: 'user' | 'assistant';
  content: string;
  links?: AssistantLink[];
};

export type AssistantAllowance = { date: string; limit: number; remaining: number; resetsAt: string };
export type AssistantAnswer = { content: string; links: AssistantLink[] };

export type BookingBenefitMode = 'STANDARD' | 'HOUR_PASS' | 'GUILD';

export type BookingDraft = {
  stationId: string;
  date: string;
  startTime: string;
  duration: number;
  extraControllers: number;
  notes: string | null;
  benefitMode: BookingBenefitMode;
  hourPassId: string | null;
  appliedBenefitType: string | null;
};

export type BookingQuote = BookingDraft & {
  stationName: string;
  endTime: string;
  hourlyRate: number;
  controllerUnitPrice: number;
  controllerCharge: number;
  normalPrice: number;
  discount: number;
  totalPrice: number;
  benefitLabel: string;
  passHoursRemaining: number | null;
};

export type AssistantCard = {
  id: string;
  kind:
    | 'availability'
    | 'stations'
    | 'games'
    | 'bookings'
    | 'booking_confirmation'
    | 'cancellation_confirmation'
    | 'spin_confirmation'
    | 'login'
    | 'result'
    | 'fallback';
  title: string;
  description?: string;
  data?: Record<string, unknown>;
  actionToken?: string;
  actionLabel?: string;
  href?: string;
};

export type AssistantStreamEvent =
  | { type: 'answer'; answer: AssistantAnswer }
  | { type: 'usage'; usage: AssistantAllowance }
  | { type: 'flow'; state: GuidedState }
  | { type: 'status'; message: string }
  | { type: 'text_delta'; delta: string }
  | { type: 'card'; card: AssistantCard }
  | { type: 'error'; message: string; code?: string }
  | { type: 'done'; usage?: { inputTokens: number; outputTokens: number } };

export type SignedAssistantAction =
  | { action: 'BOOKING'; userId: string; draft: BookingDraft; quoteHash: string; exp: number; jti: string }
  | { action: 'CANCELLATION'; userId: string; bookingId: string; exp: number; jti: string }
  | { action: 'DAILY_SPIN'; userId: string; spinDate: string; exp: number; jti: string };

export type GuidedTask = 'HOME' | 'BOOK' | 'NEXT' | 'BOOKINGS' | 'SPIN' | 'GAMES' | 'PRICES';
export type GuidedState = {
  task: GuidedTask;
  stationId?: string;
  stationQuery?: string;
  date?: string;
  startTime?: string;
  duration?: number;
  extraControllers?: number;
  notes?: string;
  gameChosen?: boolean;
  benefitMode?: BookingBenefitMode;
  hourPassId?: string;
  appliedBenefitType?: string;
  quantity?: number;
  afterTime?: string;
  query?: string;
  offset?: number;
  search?: boolean;
  bookingId?: string;
  cancel?: boolean;
  queue?: string[];
  completed?: string[];
};
export type GuidedOption = { label: string; detail?: string; state: GuidedState };
export type GuidedView = {
  state: GuidedState;
  title: string;
  description?: string;
  options: GuidedOption[];
  card?: AssistantCard;
  login?: boolean;
  search?: boolean;
  customGame?: boolean;
  nextFilters?: { stations: Array<{ id: string; name: string }>; dates: string[] };
};
