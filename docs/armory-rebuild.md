# Lucky Fusion

Adds a visual Lucky Fusion popup beside Info while preserving the existing Artifacts page, inventory cards, Reward Preview, forge animations and guaranteed upgrades. Includes the separately approved EMIILY avatar update. No collection album or set tracking is shipped.

## Release order

1. Apply the additive production migration `20261023000000_armory_fusion` with the production Prisma schema using the existing deployment process. Do not point SQLite tooling at production.
2. Generate the production Prisma client and deploy the application. Daily forge, guaranteed crafting, exchange and reward rules remain unchanged.
3. Review the economic simulation below. Enable Lucky Fusion in **Admin → Artifacts → Forge Settings → Lucky Fusion Enabled** when ready. Missing settings default to disabled. Disable this switch to stop new fusions while retaining receipt recovery and all other Artifacts features.

No production database migration or deployment was performed during implementation. Verification uses a separate SQLite test database.

## Economic model

Run `npx tsx scripts/simulate-armory-fusion.ts` to reproduce the seeded model: 5,000 simulated users, 180 daily forges each, default rarity/slot weights, immediate set redemption, one retained copy per slot, guaranteed upgrades first, then fusion of remaining spares. Excludes trading, check-in/admin grants, attendance variation and monetary valuation. These are policy scenarios, not a forecast of actual user behavior.

| Tickets per simulated user | Existing crafting | With optional fusion |
|---|---:|---:|
| Bronze | 6.623 | 7.323 |
| Silver | 5.180 | 6.292 |
| Gold | 3.432 | 4.550 |
| Platinum | 1.717 | 3.361 |
| Total | 16.953 | 21.525 |

Total issuance rises about 27% in this model; Platinum issuance rises about 96%. Approved odds were not changed. This makes the separate rollout switch material, especially because Platinum rewards carry more value.

## Interfaces and operations

- `POST /api/armory/fusion`: `{requestId, ingredients:[{artifactId,quantity}], chosenOutputId?}`. Exactly three same-tier unequipped copies. Platinum requires a chosen active output. Response includes the stored public output and odds version.
- `GET /api/armory/fusion?requestId=...`: current user's receipt, or null. It remains available when fusion is disabled.
- Existing Artifacts state now contains the fusion flag, eligible quantities and versioned odds. UI derives available counts from inventory minus equipped copies; listings are already escrowed.
- Fusion requests are saved in browser storage before sending. A lost response offers receipt recovery or retry of the same request; it never automatically dispatches a new transaction.
- Fusion errors log a user identifier and error code, not ingredients or private account details. Receipts retain input/output tiers and timestamps for distribution and recovery auditing. Reward tickets retain existing history.

Operational distribution query (PostgreSQL):

```sql
SELECT "inputTier", "outputTier", COUNT(*)
FROM armory_fusion_receipts
WHERE "createdAt" >= CURRENT_TIMESTAMP - INTERVAL '7 days'
GROUP BY "inputTier", "outputTier";
```

Compare this with reward-ticket issuance by set and date, and application fusion errors before expanding use. Rollback disables fusion first; retain additive tables and receipts.

## Verification

- Isolated SQLite integration checks cover receipt replay, ownership, chosen Platinum, invalid mixtures, output pool indexing, disabled pools, equipment reservations, concurrent fusion/craft/equip/exchange, existing reward behavior.
- Browser tests use actual components with fixture data and mocked requests. They cover 320/375/430px and desktop layouts, keyboard interaction, confirmation, response-loss recovery through reload, reduced motion and a 4× CPU-throttled interaction.
- These browser checks are not a real low-end Android benchmark. Production PostgreSQL contention and real device performance still require deployment-environment validation.
- Production compilation uses `npx next build`, not the migration-running npm build script.

The optional browser harness `test/armory/fusion-browser.cjs` requires locally installed Playwright and esbuild; it is not part of production dependencies.
