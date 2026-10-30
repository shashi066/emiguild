> Latest cleanup: see [compact Happy Tickets admin](compact-happy-admin.md). The configuration-only HappyPool table has been removed; five feature tables remain. Earlier six-table descriptions below are historical.

# Personal Happy Tickets implementation

Implemented locally on 29 October 2026. This replaces the shared-balance behavior in the earlier reward release. No production migration or deployment is included.

## Storage and interfaces

No new table. User now stores happyAvailable (default five), happyVersion and the latest personal refill ID/time. HappyPool retains only central eligibility configuration and its edit version. GuildReset gains an optional owner for retained legacy rows, plus a grant reference and a unique grant/account pair. All newly issued copies have an owner.

The new `20261029000000_personal_happy_tickets` migration follows the existing reward migration without rewriting it. It starts personal balances at five, preserves existing user fields/tickets/redemptions/receipts, and cancels ownerless pending shared resets with an archival reason. PostgreSQL and SQLite enforce personal stock bounds.

Existing Happy Ticket state and claim/reset endpoints now return the signed-in account's balance/version and owned reset copies. Anonymous state reveals no private stock, reset IDs or counts. The compact stock endpoint returns only capacity to anonymous visitors.

Admin state provides aggregate counts, grant summaries, member search and selected-member details. BANK and FORCE accept an expectedAccounts confirmation; CANCEL accepts a grantId. Bulk operations return grantId, affectedCount, status and expiry, with durable request recovery. A grant snapshots accounts inside the transaction; subsequent signups never inherit it. User reset activation still accepts resetId and the personal balance version, and validates ownership inside the transaction.

## User and admin UI

The existing ticket artwork, five-second loader, claim feedback and centered reset confirmation remain. Copy reads Your tickets and Reset My Tickets. Resetting another account is impossible through the member endpoint. Admin shows total claimable balances, issued/used/expired tickets, unused reset copies, per-grant counts, member search and private history. Successful and recovered admin responses share the same rendering path.

## Rollout

Back up the target database first. Coordinate this migration and its matching application code: the shared available column is removed, so old Happy Ticket code is not compatible with the new storage. Pause ticket claims/resets during that deployment transition; preserve issued-ticket redemption and receipt history. No scheduled activation or automatic reset is introduced. Never use a schema rollback that removes valid personal claims or reset activations.

The local development database was backed up and migrated only after testing on a staged copy. Existing columns on users matched exactly; 42 other tables matched; foreign-key validation passed. No new reset grants or claimed tickets were fabricated in the normal local database.

## Verification

Provider migration tests cover a baseline user/booking, existing cooldown, a claimed ticket and redemption, legacy shared-reset archival, constraints and no Prisma drift. Service/handler tests cover independent account claims, owned reset copies, future-signup exclusion, request replay/conflicts, cancellation of unused copies, expiry and claim/reset races.

Fresh automated results: 19 service/rule tests plus two real-handler tests passed on each of SQLite and disposable PostgreSQL; 45 existing game/database regressions, 87 pure/client regressions and four mocked API checks passed. Counts overlap between invocations. TypeScript, changed-source lint and whitespace checks passed. Direct production compilation was run without the migration-running npm build script.

The stale admin bundle was resolved locally with an optional development-only asset prefix (LOCAL_ASSET_PREFIX); normal page URLs and login storage were unchanged. Chrome now renders Account totals, personal member balances and the new bulk controls. Admin and user pages were visually inspected; overflow checks passed at 320/375/430px and desktop. The user page shows Your tickets: 5/5 and Reset My Tickets, and the admin page shows 22 accounts and 110 total claimable units with member balances of five. Ticket expiry display uses the last usable minute of the claim day. No claim/reset was issued during this read-only browser review. Full transaction and real-device Android performance checks remain separate from these layout checks.


## Admin initial-load correction

The old browser bundle exposed incompatible shared-pool controls. Development-only asset versioning separated it from current code. A subsequent client-only loading gate still left the initial page waiting for its refresh request; the admin page now server-renders an authorized snapshot through the same report service as the API. The client preserves that snapshot during refresh, times out stalled reads after 20 seconds, and offers Retry on read failure. No reward transaction is cancelled by this read timeout.

Two render regressions verify the server snapshot contains account totals without the loading gate and that a server read failure renders Retry. The existing real booking/claim/reset handler tests also pass after extracting the shared report. Final browser evidence below supersedes the earlier cache-blocker note for the reviewed views.

Final admin verification: the authorized page renders Account totals immediately on full reload, with no Loading tickets gate. Refresh keeps the report visible. The empty personal-grant message is present. The final direct production compilation and lint passed; the updated npm reward suite passed 21 checks (19 service/rule checks plus two render checks), and both handler checks passed. No claims, grants or resets were submitted during the browser review.
