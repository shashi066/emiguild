# November joint launch checklist

## Before release

- Confirm final rules: same-day IST expiry for new claims, normal 24-hour claim cooldown, member-activated banked resets even with remaining stock, and both Spin counters resetting after a missed daily spin. Keep Happy Tickets out of Vault.
- Do not mark merge-ready until the final updated browser pages have been verified; see november-test-results.md for the current cache blocker.

- Review the single unreleased `20261028000000_reward_features` migration. Use migration.sql for PostgreSQL and migration.sqlite.sql for SQLite verification. Preserve existing application data; there is no reward-history backfill. Test baseline-plus-migration on both disposable providers before production.
- Run focused reward tests, real HTTP/browser checks, affected existing suites, TypeScript, targeted lint and direct production compilation. Do not use `npm run build` as a local compilation check: it runs production migrations.
- Reconfirm production reward weights and at least one positive-weight Legendary. No invented reward amounts or changed odds.
- Select explicit active PS5 station IDs and review the weekday 16:00–23:00 starting eligibility. Admin may configure a different approved schedule.
- Review the economy report below. Keep existing Lucky Fusion setting independent.

## Deploy and enable together

1. Deploy additive schema changes before dependent application code. Existing active Tower runs keep their old policy; historical Spin progress is not reconstructed.
2. Deploy the reviewed application build through the existing project deployment process.
3. Against the explicitly selected production database, run `tsx scripts/prepare-november-launch.ts --admin=EXISTING_ADMIN_ID --stations=COMMA_SEPARATED_PS5_IDS --check-only`.
4. Run the same command without `--check-only` to configure an empty pool and enable all four new switches together. It preserves an existing pool balance, configured schedule, tickets and cooldowns. It never refills an existing pool as a launch side effect.
5. Verify production customer and admin flows and record deployment URL, commit, migration result and actual enable timestamp.

The switches use the existing Setting convention and default enabled when absent: legendary_pity_30_enabled, tower_loss_rewards_enabled, happy_tickets_enabled, guild_resets_enabled. No calendar-based access gate or activation cron exists. An unconfigured ticket pool cannot issue claims. No website challenge calendar or campaign editor is implemented; Excel is the planning source.

## Recovery

- The Happy Tickets page no longer exposes Emergency controls. Existing server-side Setting switches remain available through authorized recovery tooling/API; valid issued-ticket booking and receipt recovery remain available.
- If Spin generation is unsafe, use the existing overall daily_spin_enabled switch. Legendary counters and launch timestamp persist; do not reset users during rollback.
- Tower policy is snapshotted per run. Turn protection off for future runs without rewriting legitimate finished payouts.
- Keep a history-compatible application when rolling back. Preserve the new active-redemption fields and all historical rows. Never delete legitimate tickets, receipts or reward history to undo a release.
- For an ambiguous reset/claim/booking response, recover the saved request ID. Do not start another request blindly.

## Monitoring

Review the compact RewardAudit reset/admin history, claim success/failure and rate-limit patterns, receipt replay/conflicts, tier distributions, issued/redeemed/expired hours and Tower issuance. Inspect expected transaction retries separately from failed operations. New failure logging emits safe codes rather than request bodies or secrets.

## Economy review (local configured pool, not a production forecast)

Read-only simulation used the local configured Spin weights COMMON 40, UNCOMMON 35, RARE 10, EPIC 5, LEGENDARY 1. Seed 20261027, 10,000 players × 90 consecutive daily spins:

| Model | Legendary / 1,000 spins | Epic / 1,000 spins |
|---|---:|---:|
| Existing ten-day Epic guarantee | 10.106 | 119.261 |
| With thirty-spin Legendary guarantee | 35.686 | 106.129 |

The guarantee takes precedence over some Epic milestones, explaining the Epic reduction. No weights were changed.

With local Tower risks (one red through floor 6, two thereafter), an always-climb player clears all ten floors with probability 0.1084%. Tickets increase from about 1.084 to 666.667 per 1,000 always-climb runs under loss protection. This compares one specific play policy, not current player behavior, and does not price unlike rewards. Cash-out players already receive rewards under the old game. Token eligibility is unchanged; no arbitrary payout caps were added.

Happy Tickets initially expose five available base hours. A reset adds zero to five available hours. Existing claimed tickets persist, so outstanding unexpired liabilities can exceed five after multiple resets. Expired tickets do not refill the pool.

Reproduce with an explicitly supplied database URL: `tsx scripts/simulate-november-economy.ts`. The script reads reward settings only and never grants items or edits users. Rerun on production configuration before launch.

## Deployment evidence

No production deployment or production migration has been performed in this workspace yet. There is no linked `.vercel` project, Vercel login token or production database connection here. Local verification and code readiness must not be reported as a live launch.
