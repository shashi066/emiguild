import { loadEnvConfig } from '@next/env';
import { PrismaClient } from '@prisma/client';

loadEnvConfig(process.cwd());

const databaseUrl = process.env.DATABASE_URL ?? '';
if (!databaseUrl.startsWith('file:')) {
  throw new Error(
    'Refusing to run the local EMIC rebase: DATABASE_URL must be a SQLite file: URL.',
  );
}

const ECONOMY_MARKER_ID = 'watch_party_economy_version';
const ECONOMY_MARKER_KEY = 'watch_party_economy_version';
const ECONOMY_VERSION = '2';
const ECONOMY_MARKER_LABEL = 'Watch-party economy version';
const prisma = new PrismaClient();

type CountRow = { invalidCount: bigint | number };

function hasRows(rows: CountRow[]) {
  return Number(rows[0]?.invalidCount ?? 0) > 0;
}

async function main() {
  const result = await prisma.$transaction(async (tx) => {
    const existingMarkers = await tx.$queryRaw<Array<{ value: string; label: string | null }>>`
      SELECT "value", "label"
      FROM "settings"
      WHERE "key" = ${ECONOMY_MARKER_KEY}
    `;
    if (existingMarkers.length > 0) {
      if (
        existingMarkers[0].value === ECONOMY_VERSION
        && existingMarkers[0].label === ECONOMY_MARKER_LABEL
      ) {
        return 'already-applied' as const;
      }
      throw new Error(
        `EMIC rebase aborted: unexpected economy version ${existingMarkers[0].value}.`,
      );
    }

    // Reserve the marker inside this transaction before inspecting data. This
    // obtains SQLite's write lock and rolls back the marker if any check fails.
    const reserved = await tx.$executeRaw`
      INSERT INTO "settings" ("id", "key", "value", "label", "updatedAt")
      SELECT
        ${ECONOMY_MARKER_ID},
        ${ECONOMY_MARKER_KEY},
        ${ECONOMY_VERSION},
        ${ECONOMY_MARKER_LABEL},
        CURRENT_TIMESTAMP
      WHERE NOT EXISTS (
        SELECT 1
        FROM "settings"
        WHERE "key" = ${ECONOMY_MARKER_KEY}
      )
    `;
    if (reserved === 0) {
      const marker = await tx.$queryRaw<Array<{ value: string; label: string | null }>>`
        SELECT "value", "label"
        FROM "settings"
        WHERE "key" = ${ECONOMY_MARKER_KEY}
      `;
      if (
        marker[0]?.value === ECONOMY_VERSION
        && marker[0]?.label === ECONOMY_MARKER_LABEL
      ) {
        return 'already-applied' as const;
      }
      throw new Error('EMIC rebase aborted: unexpected economy version marker.');
    }

    const overflow = await tx.$queryRawUnsafe<CountRow[]>(`
      SELECT COUNT(*) AS "invalidCount"
      FROM (
        SELECT 1 FROM "users"
        WHERE "watchPartyCoins" > 214748364 OR "watchPartyCoins" < -214748364
        UNION ALL
        SELECT 1 FROM "watch_parties"
        WHERE "entryCoins" > 214748364 OR "entryCoins" < -214748364
           OR "entryCoinUnits" > 214748364 OR "entryCoinUnits" < -214748364
        UNION ALL
        SELECT 1 FROM "watch_party_predictions"
        WHERE "stakeUnits" > 214748364 OR "stakeUnits" < -214748364
           OR "payoutUnits" > 214748364 OR "payoutUnits" < -214748364
        UNION ALL
        SELECT 1 FROM "watch_party_coin_ledger"
        WHERE "amountUnits" > 214748364 OR "amountUnits" < -214748364
           OR "balanceAfterUnits" > 214748364 OR "balanceAfterUnits" < -214748364
        UNION ALL
        SELECT 1 FROM "watch_party_shop_orders"
        WHERE "tokenCost" > 214748364 OR "tokenCost" < -214748364
           OR "tokenCostUnits" > 214748364 OR "tokenCostUnits" < -214748364
      ) AS "overflow_rows"
    `);
    if (hasRows(overflow)) {
      throw new Error(
        'EMIC rebase aborted: multiplying an economy value by 10 would overflow a Prisma Int.',
      );
    }

    const badPartyRatios = await tx.$queryRawUnsafe<CountRow[]>(`
      SELECT COUNT(*) AS "invalidCount"
      FROM "watch_parties"
      WHERE "entryCoinUnits" <> "entryCoins" * 10
    `);
    if (hasRows(badPartyRatios)) {
      throw new Error(
        'EMIC rebase aborted: watch party entry coin/unit ratio is inconsistent.',
      );
    }

    const badShopRatios = await tx.$queryRawUnsafe<CountRow[]>(`
      SELECT COUNT(*) AS "invalidCount"
      FROM "watch_party_shop_orders"
      WHERE "tokenCostUnits" <> "tokenCost" * 10
    `);
    if (hasRows(badShopRatios)) {
      throw new Error(
        'EMIC rebase aborted: shop order coin/unit ratio is inconsistent.',
      );
    }

    await tx.$executeRawUnsafe(`
      UPDATE "users"
      SET "watchPartyCoins" = "watchPartyCoins" * 10
    `);
    await tx.$executeRawUnsafe(`
      UPDATE "watch_parties"
      SET "entryCoins" = "entryCoins" * 10,
          "entryCoinUnits" = "entryCoinUnits" * 10
    `);
    await tx.$executeRawUnsafe(`
      UPDATE "watch_party_predictions"
      SET "stakeUnits" = "stakeUnits" * 10,
          "payoutUnits" = CASE
            WHEN "payoutUnits" IS NULL THEN NULL
            ELSE "payoutUnits" * 10
          END
    `);
    await tx.$executeRawUnsafe(`
      UPDATE "watch_party_coin_ledger"
      SET "amountUnits" = "amountUnits" * 10,
          "balanceAfterUnits" = "balanceAfterUnits" * 10
    `);
    await tx.$executeRawUnsafe(`
      UPDATE "watch_party_shop_orders"
      SET "tokenCost" = "tokenCost" * 10,
          "tokenCostUnits" = "tokenCostUnits" * 10
    `);

    return 'applied' as const;
  }, { maxWait: 10_000, timeout: 30_000 });

  if (result === 'already-applied') {
    console.log(`Local watch-party economy is already at version ${ECONOMY_VERSION}.`);
  } else {
    console.log(`Applied local watch-party economy rebase version ${ECONOMY_VERSION}.`);
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
