# Reward release guide

Current source of truth: 30 October 2026. See [ticket rules](happy-ticket-rules.md), [artwork](happy-ticket-artwork.md), and [verification](november-test-results.md). No production deployment or activation is claimed by this document.

## Approved behavior

- Happy Tickets: five claimable tickets per account, one claim every 24 hours, same-day IST expiry. Banked resets belong to each existing recipient; later signups do not inherit old grants. Members activate their own reset, even with stock remaining. Resets preserve cooldowns and issued tickets.
- Spin: independent Epic/Legendary counters; missing a daily spin resets both. Epic awards preserve Legendary progress. Legendary takes precedence and resets progress. Preserve ordinary weights, immutable results and receipt recovery.
- Tower: valid protected losses award only the last cleared floor's reward; floor-one losses award nothing. Legacy runs/timeouts retain their policy. No new reward caps.
- Vault retains its compact cyan Epic/Legendary trackers and existing reward popups. No Happy Tickets in Vault. Keep the wheel unchanged.
- All approved features launch together after verification. Announcements stay in Excel; there is no website campaign/calendar, automatic activation schedule or restored Artifact collection showcase.

## Storage and rollout order

Five feature tables remain: HappyTicket, HappyRedemption, GuildReset, RewardReceipt, RewardAudit. Personal stock/cooldown fields stay on User. Internal Settings key `happy_ticket_config` holds eligibility and its stale-edit version; generic Settings cannot edit it.

The migration chain is **not entirely additive**:
1. `20261028000000_reward_features`: initial reward fields/tables.
2. `20261029000000_personal_happy_tickets`: personal balances and reset ownership; archives ownerless legacy resets.
3. `20261029010000_happy_settings`: preserves eligibility/version in Settings and removes HappyPool.

Do not rewrite applied migration history. Verify the full chain on disposable SQLite/PostgreSQL and a non-production copy of the actual deployed schema. For production, use PostgreSQL migration.sql files; SQLite companions are verification/local tooling.

Use a coordinated maintenance rollout: stop traffic and jobs using old reward code, back up the database, apply all pending migrations, deploy the matching application, smoke-test, then reopen traffic. Never leave old code serving while its referenced columns/table are removed. A pause flag alone does not make old reads schema-compatible. Application rollback must support the new schema and retain legitimate tickets, receipts and history.

## Launch checklist

- Run affected service/handler/client regressions, TypeScript, targeted lint, whitespace and `npx next build --webpack`. **Never use `npm run build` for a local compile check:** it includes production migration deployment.
- Configure positive-weight Legendary rewards and explicit active PS5 stations. Review per-account ticket exposure and configured Tower/Spin economics.
- Against the explicitly selected deployment database, run `tsx scripts/prepare-november-launch.ts --admin=EXISTING_ADMIN_ID --stations=COMMA_SEPARATED_PS5_IDS --check-only`.
- During the verified rollout, run without `--check-only` to configure missing eligibility and enable the four approved switches together. Existing balances, schedules, cooldowns and tickets remain unchanged.
- Flags: `legendary_pity_30_enabled`, `tower_loss_rewards_enabled`, `happy_tickets_enabled`, `guild_resets_enabled`; absent flags default enabled. No claims can issue before station configuration. Preserve launch timestamp across pauses.
- Record deployed commit, database migration results, build, station/reward configuration and actual production smoke tests. Local screenshots are not deployment evidence.

## Recovery and economy

Pause unsafe generation through existing server flags; already-issued ticket redemption and receipt recovery remain available. Recover ambiguous requests using their saved IDs. Do not clear balances/history to roll back a release. Monitor failures, retries, receipt conflicts, reset grants/activation and reward issuance.

Prior local simulation (seed 20261027, 10,000 players x 90 consecutive spins; weights 40/35/10/5/1) estimated Legendary awards rising from 10.106 to 35.686 per 1,000 spins and Epic from 119.261 to 106.129. This is not a production forecast. Tower's configured always-climb policy estimated 1.084 versus 666.667 rewarded runs per 1,000 with protection; reward values differ. Rerun `tsx scripts/simulate-november-economy.ts` with explicitly supplied actual configuration before launch; it does not write rewards.

Ticket exposure is five claimable hours **per account**, limited by cooldown/expiry. Bulk reset grants create one entitlement per existing account; issuance and transaction duration should be monitored as membership grows. Expiry/cancellation never refill personal stock.

## Local development

Release configuration uses standard `next dev`. For this workstation's preview, run `npm run dev -- --webpack --hostname 127.0.0.1 --port 3000`. Temporary origin/asset-prefix workarounds and obsolete mock previews are archived under ignored `output/pr-cleanup-backup-20261030/`, not shipped. Never use browser mock results as real transaction evidence.
