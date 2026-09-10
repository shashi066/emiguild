export type Guess36TicketStatus = 'UNUSED' | 'REDEEMED' | 'EXPIRED';
export type Guess36Outcome = 'WIN' | 'LOSS' | 'NOT_ENTERED' | 'PENDING';
export type Guess36Mode = 'NUMBER' | 'PARITY' | 'RANGE';

export type Guess36Selection =
  | { type: 'NUMBER'; value: number }
  | { type: 'EVEN' | 'ODD' }
  | { type: 'RANGE' | 'ROW'; value: number };
export type Guess36Tier = 'EXACT' | 'GROUP' | 'PARITY';
export type Guess36CounterReward = {
  type: 'GAMING_TIME' | 'RACING_TIME' | 'DISCOUNT' | 'PASS';
  name: string;
  value?: number;
};
export type Guess36EmicReward = {
  type: 'EMIC';
  name: string;
  value: number;
};
export type Guess36Reward = Guess36CounterReward | Guess36EmicReward;
export type Guess36Rewards = Record<Guess36Tier, Guess36Reward>;
export type Guess36Config = {
  enabled: boolean;
  enabledModes: Guess36Mode[];
  rewards: Guess36Rewards;
  todayRewards: Guess36Rewards;
  effectiveFrom: string;
};
export type Guess36PublicEntry = {
  selection: Guess36Selection;
  createdAt: string;
};

export type Guess36PublicTicket = {
  id: string;
  expiresAt: string;
  reward: Guess36CounterReward;
};

export type Guess36AdminTicket = Guess36PublicTicket & {
  code: string;
  status: Guess36TicketStatus;
};

export type Guess36HistoryItem = { date: string; winningNumber: number };

export type Guess36PublicState = {
  enabled: boolean;
  enabledModes: Guess36Mode[];
  serverNow: string;
  authenticated: boolean;
  eligible: boolean;
  history: Guess36HistoryItem[];
  rewardTickets: Guess36PublicTicket[];
  today: {
    date: string;
    status: 'OPEN' | 'PAUSED' | 'CLOSED';
    nextRoundAt: string;
    entryClosesAt: string;
    rewards: Guess36Rewards;
    entry: Guess36PublicEntry | null;
  };
  previous: {
    date: string;
    status: 'PENDING' | 'DRAWN';
    winningNumber: number | null;
    myPick: Guess36Selection | null;
    outcome: Guess36Outcome;
    reward: Guess36Reward | null;
  };
};

export type Guess36AdminItem = {
  id: string;
  name: string;
  phone: string;
  selection: Guess36Selection;
  tier: Guess36Tier;
  reward: Guess36Reward;
  enteredAt: string;
  ticket: Guess36AdminTicket | null;
};

export type Guess36AdminData = {
  summary: {
    today: { date: string; participants: number; status: 'OPEN' | 'PAUSED' | 'CLOSED' };
    previous: { date: string; winningNumber: number | null; winnerCount: number; status: 'PENDING' | 'DRAWN' };
  };
  round: {
    date: string;
    status: 'OPEN' | 'PAUSED' | 'CLOSED' | 'DRAWN';
    winningNumber: number | null;
    participantCount: number;
    winnerCount: number;
    generatedAt: string | null;
  };
  view: 'entries' | 'winners';
  items: Guess36AdminItem[];
  nextCursor: string | null;
};
