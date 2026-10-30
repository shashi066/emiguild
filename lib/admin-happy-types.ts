import type { HappyConfig } from "./happy-ticket-rules";
export type AdminSection = "tickets" | "members" | "resets";
export type AdminTicket = {
  id: string;
  claimedAt: string;
  expiresAt: string;
  status: string;
  user: { id: string; name: string; email: string };
  redemptions: { id: string; bookingId: string; status: string }[];
};
export type AdminMember = {
  id: string;
  name: string;
  email: string;
  happyAvailable: number;
  happyLastClaimedAt: string | null;
  _count: { happyResets: number };
};
export type AdminReset = {
  id: string;
  reason: string;
  status: string;
  expiresAt: string | null;
  createdAt: string;
};
export type AdminGrant = {
  grantId: string;
  reason: string;
  kind: string;
  createdAt: string;
  expiresAt: string | null;
  expired: boolean;
  counts: Record<string, number>;
};
export type AdminHappyData = {
  section: AdminSection;
  page: number;
  hasNext: boolean;
  pool: { version: number; config: HappyConfig };
  counts: {
    accounts: number;
    available: number;
    banked: number;
    issued: number;
    redeemed: number;
    expired: number;
  };
  stations: { id: string; name: string }[];
  tickets: AdminTicket[];
  members: AdminMember[];
  resets: AdminGrant[];
  events: {
    id: string;
    action: string;
    referenceId: string;
    createdAt: string;
  }[];
  member: {
    user: { id: string; name: string; email: string };
    available: number;
    nextClaimAt: string | null;
    resets: AdminReset[];
  } | null;
};
