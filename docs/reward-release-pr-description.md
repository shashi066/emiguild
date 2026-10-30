> Personal-account update (29 October 2026): shared balances/resets below are superseded by [personal Happy Tickets](personal-happy-tickets.md) and [current ticket rules](happy-ticket-rules.md). The original reward migration is followed by a separate personal-balance migration. Earlier verification is historical, not proof of the revised UI.

# Add Happy Tickets, Guild Resets and protected daily rewards

Adds a five-ticket shared PS5 pool with claim cooldowns, same-day IST expiry, booking benefits and member-activated banked resets. Daily Spin gains a thirty-day consecutive Legendary guarantee with immutable results and recovery receipts; Tower losses on protected new runs award one last-cleared-floor reward.

Booking edits support applying/removing/replacing tickets while preserving pass accounting and redemption history. Booking mutations revalidate current admin roles and origin; payment verification binds signatures to stored booking orders. Vault keeps its production layout with compact cyan Legendary/Epic progress, while Spin rules collapse into a disclosure. The wheel is unchanged.

## Validation

- SQLite and PostgreSQL baseline-plus-migration preservation and schema-drift checks passed.
- Reward/booking suites: 18 tests plus 2 handler tests on each provider.
- Existing database regressions: 45 passed; pure/client checks: 87 passed; mocked API validation: 4 passed. Counts overlap.
- TypeScript, changed-source ESLint, whitespace and direct production compilation passed without running migrations.
- See reward-release-pr-preparation.md and november-test-results.md for evidence and limits.

## Before merge

Final signed-in browser verification is blocked by stale localhost assets: Chrome renders a removed Vault section while the current server bundle contains the approved trackers and no Happy Tickets panel. Complete 320/375/430px and desktop checks after resolving cached assets. Physical Android performance is not established.

## Rollout

Apply the single additive six-table migration before dependent application code. Verify positive-weight reward pools and explicit active PS5 station eligibility; enable the approved release together using the documented process. No calendar access gates or scheduled activation. Keep pause switches and receipt recovery; preserve legitimate rewards during rollback. Production deployment and activation have not occurred.

Tower loss protection increases reward issuance; the documented local always-climb simulation is not a production forecast. No approved odds or payouts were changed.
