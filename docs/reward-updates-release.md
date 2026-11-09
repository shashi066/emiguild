# Reward updates — 9 November 2026

Implementation extends the existing reward services and Vault. No homepage banner, notification inbox, Happy Ticket Vault card or production deployment is included. The wheel layout is unchanged. The existing highlight sequence is restored to its original five seconds, and approved initial page loaders use five seconds.

## Rules and storage

- Guild Expedition retains one free run per IST day, with one independent daily Google-review-link bonus. Clicking the link grants it; no posted review or rating is verified. Tower tokens are unaffected.
- Bonuses last through the following IST day. Free goes first, then the oldest bonus. Two daily grants can produce a three-run carryover day, not a sustained three new runs daily. Play consumes nothing; the first accepted reveal consumes eligibility.
- Existing entries occupy `FREE`. Entries add an attempt key and unique optional review-receipt reference. Daily grants and first-reveal recovery use existing RewardReceipt records; there are no new tables. Active boards remain private.
- First reveals persist account-scoped request IDs before transmission. Recovery finds the canonical run even after a first-pick red, reload or midnight. Definite failed requests do not consume eligibility; uncertain requests must be checked/retried with the same ID.
- Admin → Daily Spin has a confirmed, versioned selected reward control, off by default. Due Legendary, then Epic, take priority. Actual rarity controls streak resets. All ordinary spins use the selected item until disabled, including Vault and authorized assistant actions. Invalid configuration rejects without spending the spin.
- Selection is stored in internal Settings and blocked from generic edits. Item mutations cannot disable, delete or zero-weight an active selection. Spin history uses immutable reward snapshots and records `ADMIN_SELECTED` as the award source.
- Happy stock loses one unit per IST day through claiming or expiry, not both. Offline/weekend days count. Balances clamp at zero. Claim cooldown remains 24 hours; claimed tickets still expire the same IST day. Restoring a booking ticket does not restore stock.
- User adds one stock-day checkpoint. Player/admin reads share a pure projection; claims/refills materialize it transactionally. A claim before a same-day refill still counts for that day. Reads create no expiry rows, jobs or fabricated tickets.
- Vault keeps its layout, cyan streaks and reward popups. Expedition shows free/bonus availability, earliest bonus expiry and Resume/Play actions, with a compact review link. Newly settled timeout rewards appear in the same response. One game contributes at most one actionable destination. Happy Tickets remains excluded.

## Rollout

Apply `20261106000000_guess36_mines` before the forward `20261109000000_reward_updates` migration, using PostgreSQL migration.sql in production and the SQLite companion locally. Existing entries, balances, tickets, redemptions and receipts are preserved. The checkpoint starts at the migration’s IST date; existing balances are not retroactively depleted.

Do not serve old Guess code after the uniqueness change: coordinate application/schema deployment. For safe production rollout, pause traffic using the old reward code, back up, migrate, deploy the matching application, verify and reopen. This document is not deployment evidence. Never run the migration-running npm build script for compilation checks.

Keep the selected reward override off until an admin explicitly activates it. Preserve existing game pause switches and committed-result recovery. Add no calendar gate or scheduled activation. Rollback must retain issued rewards and support the new schema.

## Economy and operations

Run `npx tsx scripts/simulate-reward-updates.ts` for exact no-timer Expedition exposure and illustrative 90-day Spin-selection scenarios. The existing `simulate-guess36-mines.ts` also models picking speeds and the timer.

At one-green collection, expected issuance is 7,500 gaming minutes per 1,000 runs before timer effects: 15,000 with free plus daily bonus, or 22,500 on a three-run carryover day. At five-green collection, the no-timer probability is 1/252: 3.968 Bronze passes per 1,000 runs, or 7.937 per 1,000 accounts using two runs. Pass face value is not measured redemption cost.

Over 90 consecutive spins, a COMMON ordinary selection yields six Epic guarantees and three Legendary guarantees. Selecting EPIC yields 87 Epic awards and three guaranteed Legendaries; selecting LEGENDARY yields 90 Legendaries. High-tier selections can substantially increase issuance; no odds, caps or rewards are silently adjusted.

Monitor grant/start conflicts, receipt recovery, selected-reward failures, tier issuance, Happy claim/refill contention and bulk-refill duration. Claim expiry and stock expiry are separate; neither refills a balance. Duplicate-account abuse remains possible without adding identity collection.

Verification evidence is recorded separately in `reward-updates-test-results.md`. Browser throttling is not physical Android testing.
