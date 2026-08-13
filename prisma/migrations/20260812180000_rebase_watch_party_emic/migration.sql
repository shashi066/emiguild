BEGIN;

LOCK TABLE
    "settings",
    "users",
    "watch_parties",
    "watch_party_invites",
    "watch_party_predictions",
    "watch_party_coin_ledger",
    "watch_party_shop_orders"
IN ACCESS EXCLUSIVE MODE;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM "settings"
        WHERE "key" = 'watch_party_economy_version'
          AND "value" = '2'
          AND "label" = 'Watch-party economy version'
    ) THEN
        RETURN;
    END IF;

    IF EXISTS (
        SELECT 1
        FROM "settings"
        WHERE "key" = 'watch_party_economy_version'
    ) THEN
        RAISE EXCEPTION 'EMIC rebase aborted: unexpected watch-party economy version marker';
    END IF;

    -- Prisma Int fields are signed 32-bit integers. Abort before any write if
    -- multiplying one of the nine economy columns would overflow that range.
    IF EXISTS (
        SELECT 1 FROM "users"
        WHERE "watchPartyCoins"::BIGINT * 10 NOT BETWEEN -2147483648 AND 2147483647
        UNION ALL
        SELECT 1 FROM "watch_parties"
        WHERE "entryCoins"::BIGINT * 10 NOT BETWEEN -2147483648 AND 2147483647
           OR "entryCoinUnits"::BIGINT * 10 NOT BETWEEN -2147483648 AND 2147483647
        UNION ALL
        SELECT 1 FROM "watch_party_predictions"
        WHERE "stakeUnits"::BIGINT * 10 NOT BETWEEN -2147483648 AND 2147483647
           OR ("payoutUnits" IS NOT NULL AND "payoutUnits"::BIGINT * 10 NOT BETWEEN -2147483648 AND 2147483647)
        UNION ALL
        SELECT 1 FROM "watch_party_coin_ledger"
        WHERE "amountUnits"::BIGINT * 10 NOT BETWEEN -2147483648 AND 2147483647
           OR "balanceAfterUnits"::BIGINT * 10 NOT BETWEEN -2147483648 AND 2147483647
        UNION ALL
        SELECT 1 FROM "watch_party_shop_orders"
        WHERE "tokenCost"::BIGINT * 10 NOT BETWEEN -2147483648 AND 2147483647
           OR "tokenCostUnits"::BIGINT * 10 NOT BETWEEN -2147483648 AND 2147483647
    ) THEN
        RAISE EXCEPTION 'EMIC rebase aborted: multiplying an economy value by 10 would overflow a Prisma Int';
    END IF;

    -- Display values and unit snapshots must agree before the rebase. Checking
    -- these pairs prevents silently multiplying already inconsistent history.
    IF EXISTS (
        SELECT 1
        FROM "watch_parties"
        WHERE "entryCoinUnits"::BIGINT <> "entryCoins"::BIGINT * 10
    ) THEN
        RAISE EXCEPTION 'EMIC rebase aborted: watch party entry coin/unit ratio is inconsistent';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM "watch_party_shop_orders"
        WHERE "tokenCostUnits"::BIGINT <> "tokenCost"::BIGINT * 10
    ) THEN
        RAISE EXCEPTION 'EMIC rebase aborted: shop order coin/unit ratio is inconsistent';
    END IF;

    UPDATE "users"
    SET "watchPartyCoins" = "watchPartyCoins" * 10;

    UPDATE "watch_parties"
    SET "entryCoins" = "entryCoins" * 10,
        "entryCoinUnits" = "entryCoinUnits" * 10;

    UPDATE "watch_party_predictions"
    SET "stakeUnits" = "stakeUnits" * 10,
        "payoutUnits" = CASE
            WHEN "payoutUnits" IS NULL THEN NULL
            ELSE "payoutUnits" * 10
        END;

    UPDATE "watch_party_coin_ledger"
    SET "amountUnits" = "amountUnits" * 10,
        "balanceAfterUnits" = "balanceAfterUnits" * 10;

    UPDATE "watch_party_shop_orders"
    SET "tokenCost" = "tokenCost" * 10,
        "tokenCostUnits" = "tokenCostUnits" * 10;

    INSERT INTO "settings" ("id", "key", "value", "label", "updatedAt")
    VALUES (
        'watch_party_economy_version',
        'watch_party_economy_version',
        '2',
        'Watch-party economy version',
        CURRENT_TIMESTAMP
    );
END $$;

ALTER TABLE "watch_parties"
    ALTER COLUMN "entryCoins" SET DEFAULT 500,
    ALTER COLUMN "entryCoinUnits" SET DEFAULT 5000;

COMMIT;
