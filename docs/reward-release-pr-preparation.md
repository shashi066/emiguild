# Reward release PR preparation

Prepared 29 October 2026 on `release/rewards-pr-prep`, based on Development `4f71e06`. No push, remote PR, production migration, deployment or activation was performed.

## Fixes from review

- Booking PATCH and DELETE now enforce same origin. Admin roles are checked against the database before status changes and within cancellation/deletion transactions; check-in writes also revalidate the actor in their transaction.
- Demoted-admin cancellation, deletion and check-in are rejected without restoring or consuming tickets. Valid owner cancellation still restores the original ticket exactly once.
- Shared admin booking edits preserve existing pass/membership benefits when the client omits benefit controls. Regression coverage includes metadata changes and moved sessions.
- Release documents match same-day ticket expiry, 24-hour cooldown, user banked resets, missed-day Spin resets and the final compact cyan Vault trackers. Happy Tickets remain outside Vault; the wheel is unchanged.

## Fresh verification

| Invocation | Passed |
|---|---:|
| SQLite reward and booking-edit suites | 18 |
| SQLite booking/claim/reset handlers | 2 |
| PostgreSQL reward and booking-edit suites | 18 |
| PostgreSQL booking/claim/reset handlers | 2 |
| Existing database regressions | 45 |
| Pure/client regressions | 87 |
| Mocked API validation harness | 4 |

Counts overlap between invocations. Both provider baseline upgrades preserve existing fixtures, create only the six feature tables, and show no Prisma drift. TypeScript, lint across changed source files, direct production compilation (`next build --webpack`) and whitespace checks passed. Production compilation did not execute migrations. Existing middleware/metadataBase warnings remain.

Read-only economy simulation was rerun using local configuration. Results retain the reported Tower exposure of roughly 666.7 final tickets per 1,000 always-climb runs versus 1.084 under the old model; this is a specific policy simulation, not a production forecast. Approved odds and reward values were not changed.

## Remaining merge blocker

Final real-browser verification is not complete. Chrome on localhost renders a stale Vault bundle even in a fresh tab. Direct inspection of the current server asset confirms Legendary and Epic trackers and no HappyTicketPanel; the browser still shows the removed panel. Normal reloads did not reconcile it. No browser-internal security restriction was bypassed to clear it.

After clearing the stale localhost cached assets through the user's browser, verify actual signed-in pages at 320/375/430px and desktop, including popups, focus, reduced motion, duplicate taps and interrupted requests. Historical/mock screenshots are not final proof. Real-device Android performance remains unmeasured. Do not mark merge-ready until this check passes.

## Commit boundaries and exclusions

The branch separates backend/schema/security, UI/integration and release-documentation changes. Generated `output/`, local databases/logs, `app/dev/`, obsolete UI/design review documents and local webpack/origin settings are excluded from the commits and retained locally. The inactive red ticket artwork remains included for future use. Secrets were checked by pattern without printing credential values; no matches were found in staged source.

Before rollout, verify production reward pools and active PS5 station selection, apply the additive migration before dependent code, and use the documented launch process. Existing receipts, tickets and balances must survive rollback.
