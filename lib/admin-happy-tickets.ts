import { z } from "zod";
import { prisma } from "./prisma";
import { readHappySettings } from "./happy-config";
import { HAPPY_COOLDOWN_MS } from "./happy-ticket-rules";
import { requireCurrentUser, RewardError } from "./november";
import { caseInsensitiveContains } from "./prisma-search";
import type { AdminHappyData } from "./admin-happy-types";

const querySchema = z
  .object({
    section: z.enum(["tickets", "members", "resets"]).default("tickets"),
    page: z.coerce.number().int().min(1).max(100000).default(1),
    search: z.string().trim().max(150).default(""),
    userId: z.string().min(1).max(200).optional(),
  })
  .strict();

/** One authorized read model for SSR and refresh; only the active list is queried. */
export async function getAdminHappyTicketsReport(
  actorId: string,
  params = new URLSearchParams(),
  now = new Date(),
): Promise<AdminHappyData> {
  await requireCurrentUser(actorId, prisma, true);
  const { section, page, search, userId } = querySchema.parse(
    Object.fromEntries(params),
  );
  const pending = { kind: "BANKED", status: "PENDING", expiresAt: { gt: now } };
  const [pool, stations, accounts, balance, banked, issued, redeemed, expired] =
    await Promise.all([
      readHappySettings(),
      prisma.station.findMany({
        where: { hasControllers: true, isActive: true },
        select: { id: true, name: true },
      }),
      prisma.user.count(),
      prisma.user.aggregate({ _sum: { happyAvailable: true } }),
      prisma.guildReset.count({ where: { ...pending, userId: { not: null } } }),
      prisma.happyTicket.count(),
      prisma.happyTicket.count({ where: { status: "REDEEMED" } }),
      prisma.happyTicket.count({
        where: {
          OR: [
            { status: "EXPIRED" },
            { status: "CLAIMED", expiresAt: { lte: now } },
          ],
        },
      }),
    ]);
  const result: AdminHappyData = {
    section,
    page,
    hasNext: false,
    pool,
    stations,
    counts: {
      accounts,
      available: balance._sum.happyAvailable ?? 0,
      banked,
      issued,
      redeemed,
      expired,
    },
    tickets: [],
    members: [],
    resets: [],
    events: [],
    member: null,
  };
  const pagination = { take: 21, skip: (page - 1) * 20 };
  if (section === "tickets") {
    const rows = await prisma.happyTicket.findMany({
      ...pagination,
      where: userId ? { userId } : {},
      orderBy: [{ claimedAt: "desc" }, { id: "desc" }],
      include: {
        user: { select: { id: true, name: true, email: true } },
        redemptions: { select: { id: true, bookingId: true, status: true } },
      },
    });
    result.hasNext = rows.length > 20;
    result.tickets = rows
      .slice(0, 20)
      .map((row) => ({
        ...row,
        claimedAt: row.claimedAt.toISOString(),
        expiresAt: row.expiresAt.toISOString(),
      }));
  } else if (section === "members") {
    const rows = await prisma.user.findMany({
      ...pagination,
      where: search
        ? {
            OR: [
              { name: caseInsensitiveContains(search) },
              { email: caseInsensitiveContains(search) },
            ],
          }
        : {},
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: {
        id: true,
        name: true,
        email: true,
        happyAvailable: true,
        happyLastClaimedAt: true,
        _count: { select: { happyResets: { where: pending } } },
      },
    });
    result.hasNext = rows.length > 20;
    result.members = rows
      .slice(0, 20)
      .map((row) => ({
        ...row,
        happyLastClaimedAt: row.happyLastClaimedAt?.toISOString() ?? null,
      }));
    if (userId) {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          name: true,
          email: true,
          happyAvailable: true,
          happyLastClaimedAt: true,
        },
      });
      if (!user) throw new RewardError("NOT_FOUND", "Member not found.", 404);
      const resets = await prisma.guildReset.findMany({
        where: { userId },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: 20,
        select: {
          id: true,
          reason: true,
          status: true,
          expiresAt: true,
          createdAt: true,
        },
      });
      result.member = {
        user: { id: user.id, name: user.name, email: user.email },
        available: user.happyAvailable,
        nextClaimAt: user.happyLastClaimedAt
          ? new Date(
              user.happyLastClaimedAt.getTime() + HAPPY_COOLDOWN_MS,
            ).toISOString()
          : null,
        resets: resets.map((row) => ({
          ...row,
          expiresAt: row.expiresAt?.toISOString() ?? null,
          createdAt: row.createdAt.toISOString(),
          status:
            row.status === "PENDING" && row.expiresAt && row.expiresAt <= now
              ? "EXPIRED"
              : row.status,
        })),
      };
    }
  } else {
    const rows = await prisma.guildReset.groupBy({
      ...pagination,
      by: ["grantId", "reason", "kind", "createdAt", "expiresAt"],
      where: { grantId: { not: null } },
      orderBy: [{ createdAt: "desc" }, { grantId: "desc" }],
    });
    result.hasNext = rows.length > 20;
    const grants = rows.slice(0, 20);
    const copies = await prisma.guildReset.groupBy({
      by: ["grantId", "status"],
      where: { grantId: { in: grants.map((g) => g.grantId!) } },
      _count: true,
    });
    result.resets = grants.map((row) => ({
      ...row,
      grantId: row.grantId!,
      createdAt: row.createdAt.toISOString(),
      expiresAt: row.expiresAt?.toISOString() ?? null,
      expired: !!row.expiresAt && row.expiresAt <= now,
      counts: Object.fromEntries(
        copies
          .filter((c) => c.grantId === row.grantId)
          .map((c) => [c.status, c._count]),
      ),
    }));
    const events = await prisma.rewardAudit.findMany({
      where: {
        action: {
          in: ["POOL_ACTIVATE", "RESET_FORCE", "RESET_BANK", "RESET_CANCEL"],
        },
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 20,
      select: { id: true, action: true, referenceId: true, createdAt: true },
    });
    result.events = events.map((row) => ({
      ...row,
      createdAt: row.createdAt.toISOString(),
    }));
  }
  return result;
}
