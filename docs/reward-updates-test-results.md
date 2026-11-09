# Reward updates verification — 9 November 2026

This document records local verification. Repository commits and pushes are separate from deployment. No production migration, deployment or activation was performed. Earlier sections retain prior verification evidence; the final review below supersedes the earlier UI description.

## Automated checks

| Check | Result |
|---|---|
| Disposable SQLite migration/service/handler/render suite | 91 passed at the full recorded run |
| Disposable PostgreSQL migration/service/handler/render suite | 89 passed; real serializable contention |
| Final focused reward, stock and client checks | 22 passed, including the two later-added client cases and active-run bonus-expiry presentation |
| Existing November booking/reward regressions, SQLite | 26 passed |
| Existing November booking/reward regressions, PostgreSQL | 23 passed |
| Lifecycle, Vault actions and assistant regressions | 105 passed, 5 existing optional database checks skipped |
| TypeScript and direct production build | Passed; final build process exit 0 |
| ESLint across changed/new TypeScript source and whitespace checks | Passed |

Full suites include legacy Guess entries/draws, reward redemption, Fusion, forge, grants, marketplace, Tower tickets, Spin boundaries/missed days, pass restoration, paid/started booking restrictions, cancellation history, origin/role checks and receipt recovery. Expected contention/rollback errors are intentionally exercised; they are not unhandled test failures.

Fresh migration checks used independent temporary SQLite databases and disposable embedded PostgreSQL. Both providers preserved legacy entries/tickets, introduced no tables and matched their Prisma schema without drift. The older reward migration chain also preserved booking prices, cooldowns, eligibility and redemption history.

New coverage verifies daily bonus deduplication and account isolation; free-first/oldest-bonus ordering; three-run carryover; expired bonuses; one active run across devices; first-pick-red request recovery; midnight; legacy FREE entries; paused grants; immediate timeout-ticket inclusion in Vault; selected reward precedence and immutable snapshots; invalid pools; demoted admins; stale edits; item-disable/selection races; offline stock expiry; claim/refill contention; and cancellation without stock refunds.

## Actual Chrome

The compiled application was served on an isolated loopback test port against a disposable SQLite database, with real Auth.js sign-in and reward endpoints. All test accounts and selected-reward changes in these browser scenarios were confined to that database.

- Full browser regression: **33 checks passed**, no captured runtime errors.
- Final focused browser run: **8 checks passed**, no captured runtime errors. Seven use actual account/API flows; the final client-state case deliberately mocks a recovered first-pick red with a spare bonus. Deterministic red settlement and duplicate consumption are separately covered by real SQLite/PostgreSQL service tests.
- Actual review-link bonus granting, separate Tower wallet, interrupted first reveal, page reload recovery, server-record count and bonus consumption were verified. The external Google destination was stubbed; no review was posted.
- Actual Admin Spin selection/confirmation was followed by a Spin from Vault. The final check waits for **Back to Vault**, verifies both the winning cell and committed result card, and confirms they match the selected item after the existing animation ends.
- Guild Expedition and Vault were checked at 320, 375, 430 and 1280px. Screenshots were inspected for new controls, expiry details, number tiles and overflow. Existing page/popup styling and wheel behavior were preserved.
- Keyboard Info behavior, focus, reduced motion, duplicate taps, slow/interrupted responses, navigation during committed requests, no unexpected game-action document navigation, no result-triggered loader replay and no duplicate tickets were checked.
- The existing simulated visibility and mocked midnight/early-expiry cases remain explicitly labeled. They are not proof of physical Android background scheduling. A 4x browser CPU throttle was exercised on Vault refresh; no physical low-end Android measurements are claimed.

Browser artifacts:

- Full run: `%TEMP%/guild-expedition-ui-y4JFMO`
- Final focused run: `%TEMP%/guild-expedition-ui-kH3sRg`
- Logs: `%TEMP%/reward-updates-browser.log` and `%TEMP%/reward-updates-browser-final.log`

## Limits and existing UI finding

The user's original normal Chrome profile was not attached; fresh automated Chrome contexts were used. No cookies, service workers or application storage in that profile were cleared.

Visual inspection also found an existing narrow-phone wrapping problem in the preserved Spin popup's **How to claim** label. The new reward and tracker values render correctly, but that old helper can wrap into a narrow column. Its shared markup/style was left unchanged under the explicit preserve-existing-popups requirement; this is a remaining presentation issue, not a new reward/transaction failure.

The build retains existing Next middleware-convention and metadataBase warnings. No migration-running npm build command was invoked.

## Local preview and release evidence

The normal local SQLite database was backed up before applying only the forward reward-updates migration. All counts were preserved: 23 users, 15 bookings, 6 Guess entries, 21 existing reward tickets, 8 Happy Tickets, 23 receipts and 122 reset records. Personal balances/cooldowns were compared before/after and remained identical; foreign-key checks were unchanged. Existing entries became FREE attempts. No local ticket/reset history was fabricated or cleared.

Backup: `prisma/dev.before-reward-updates-20261109-121236.db`. Local SQLite has no Prisma migration-history table; the SQLite companion was applied explicitly. This is not production migration evidence.

Production still requires the coordinated schema/application rollout and smoke tests described in [release notes](reward-updates-release.md). The selected ordinary reward remains off by default until explicitly activated by an admin.


## Guess 36 UI polish follow-up

- Preserved raised numbered tiles, with a steady board during the first pending reveal and one request spinner on the selected tile.
- Replaced numbered reward nodes with five readable segments; the first green fills the first segment. Removed HUD/rail framing and extra reward/CTA/ticket animations.
- Kept Collect within a 375px/430px phone viewport by compacting spacing and capping the mobile board width while retaining 44px targets. The mobile EMIILY launcher docks beside Back to Home on Guess 36 only; its existing floating placement remains elsewhere and on desktop.
- Terminal states remove the countdown and its bar, retain one secured message, and preserve the board position. Feedback is scoped to the confirmed run/version, expires within 450ms and clears before an explicit restart.
- Nine focused Chrome UI checks passed at 320, 375, 430 and 1280px, including chat focus, slow first reveal, milestone advance, Info during collection, quick bonus restart, reduced motion and unchanged homepage assistant placement. These use mocked game responses; no real runs or rewards were spent. One interaction was exercised under 4x CPU throttling, not on a physical Android device.
- Three render checks passed; existing client/assistant/homepage regressions passed 73 checks with one optional check skipped. TypeScript, targeted ESLint, whitespace checks and direct production compilation passed (build exit 0). No APIs, game rules, schema or reward calculations changed in this follow-up.
- Browser artifacts: `%TEMP%/g36-ui-polish-SIS6tS`. Browser log: `%TEMP%/g36-ui-polish-browser.log`. Compilation log: `%TEMP%/g36-ui-polish-build.log`.

## Final push review — 9 November 2026

- Removed the development-only test-credit eligibility hook. Unrelated/test receipts cannot create playable bonuses; its local helper and the design prompt remain outside the release.
- Protected the Expedition enable setting from generic Settings writes, removed a duplicate internal-setting entry, and corrected the obsolete public game name and broken Vault apostrophe.
- Preserved existing finished-run recovery behavior. Depleted accounts skip the fresh-board intro; explicit owned recovery retains terminal results and their ticket status.
- The latest sealed-tile design, ring timer and reward-node ladder replace the earlier numbered-face/segment preview. Motion never delays transactions. Decorative loops are bounded, flying effects clean up on unmount/backgrounding, narrow-phone tile labels stay visible, and reward count-up announces the committed number rather than every animation frame. No animation library or new production dependency was added.
- Corrected browser fixtures to use owned terminal recovery, wait for both devices before asserting stale versions, accept a legitimate first-pick loss, and deliberately drop responses only after a real committed transaction. PostgreSQL runners use isolated ports and bounded Windows process/pipe cleanup.
- Fresh disposable SQLite: **95 passed** across service, handler, render and affected artifact/reward checks. Fresh disposable PostgreSQL: **93 passed**, including actual serializable contention. Both preserved legacy records, added no game tables and matched their Prisma schemas without drift.
- Existing booking/reward regressions: **26 passed on SQLite; 23 on PostgreSQL**. Lifecycle, assistant, Vault and loading/client checks: **124 passed, 5 existing optional database checks skipped**.
- TypeScript, targeted ESLint, whitespace checks and direct production compilation passed. Compilation used `next build --webpack`, never the migration-running npm build script. Logs: `%TEMP%/review-{sqlite,postgres,bookings-sqlite,bookings-postgres,pure,lint,build}.log`.
- Compiled-app Chrome: **34 checks passed, no runtime errors**, on disposable SQLite with actual Auth.js login, reward transactions, admin selection and Vault. Midnight/early-expiry/first-red UI fixtures and visibility events remain explicitly simulated; the other server transactions use the actual endpoints. Artifacts: `%TEMP%/guild-expedition-ui-sPi8Bp`; log: `%TEMP%/review-browser.log`.
- Final presentation-only Chrome: **9 checks passed, no runtime errors**, at 320/375/430/1280px. These mock every game mutation and verify the mobile EMIILY dock, reliable focus restoration after Escape, one pending pick, Info stability, fast restarts, 44px tiles, Collect inside the 812px phone viewport, reduced motion and unchanged floating chat on other pages. The phone board/spacing were compacted without reducing touch targets. One interaction uses 4x CPU throttling. Artifacts: `%TEMP%/g36-ui-polish-ia3cms`; log: `%TEMP%/review-ui.log`. Three final server-render checks also passed.

No production migration or deployment is part of this push. The original normal Chrome profile and physical low-end Android remain outside automated verification; fresh Chrome and CPU throttling do not certify either.

## Admin-only Spin override follow-up

- Reused the existing versioned admin selection, now labeled **Reward override**. Its selected item, Active/Off status, confirmation and Disable action remain restricted to database-confirmed admins. No outcome precedence, persistence, weights or guarantee rules changed.
- Removed the player announcement and `featuredReward` from Spin/Vault state and types. Shared public contracts allow only awarded rewards, availability, progress and recovery fields; both fresh responses and older receipts omit internal reasons/snapshots. Stored receipts, reward snapshots and admin `ADMIN_SELECTED` history remain intact. Configuration failures return a generic player availability error while server/admin diagnostics remain available.
- Fresh disposable verification: **104 SQLite checks and 102 PostgreSQL checks passed**, including the six new public-contract checks and three handler checks. Existing duplicate-request, guarantee precedence, selected-item validation, stale-admin and concurrency checks passed. No normal-account override was activated.
- Client/lifecycle/assistant/loading regressions: **124 passed, 5 existing optional checks skipped**. TypeScript, targeted ESLint, whitespace checks and direct production compilation passed without running the migration-running build script.
- Compiled Chrome: **8 focused scenarios passed with no runtime errors**, covering real admin activation/change/disable, player Spin/Vault responses, internal admin history, actual committed rewards and the preserved five-second page loader/Spin animation. Vault layouts were checked at 320/375/430/1280px; the main Spin result at 375px was visually inspected. Existing reward-popup styling remains unchanged. The final first-pick-red UI fixture remains explicitly mocked.
- Artifacts: `%TEMP%/guild-expedition-ui-PdN49L`. Logs: `%TEMP%/spin-private-{sqlite,postgres,client,build,browser}.log`. No schema, migration, new endpoint, production deployment or real-account activation was introduced. Physical Android and the original Chrome profile remain unverified.

## Post-merge review - 10 November 2026

PR [#52](https://github.com/shashi066/emiguild/pull/52) was already merged into `main` at `a14857b`. The follow-up fixes are based on that merge. GitHub reports a successful Vercel deployment for the merged commit; that status does not establish production transaction or migration correctness.

Confirmed findings and fixes:

- **Competing first-pick recovery:** a new request returning an existing run lacked a recovery receipt. If its response was lost and the run subsequently ended, retrying could spend another owned bonus. Explicit request IDs now bind to the returned run; conflicting payloads reject, saved receipts replay, and new IDs share the run's existing rate limit. Legacy day-derived IDs retain their cross-midnight free-attempt behavior.
- **Account changes:** the mounted Expedition could retain the previous account's board/tickets and keep requesting its old run. Session changes now invalidate old responses, abort pending UI work, clear personal state and fetch the new account's state. Each account retains its own interrupted-start recovery. Corrupt saved-start retries show an error rather than throwing or sending another pick.
- **Vault review bonus:** an enabled but exhausted Expedition was marked disabled, hiding its review-bonus action. It now shows Used today and offers the unclaimed bonus; actual pauses remain disabled.
- **Stalled review grants:** bonus requests had no deadline or unmount cleanup. They now abort after 20 seconds or navigation, retain recovery information and reconcile the single committed grant.

Fresh verification:

- Disposable SQLite: **109 checks passed**. Disposable PostgreSQL: **107 passed**, including actual serializable contention. Fresh migrations preserved legacy entries/tickets, added no game tables and matched both schemas without drift.
- Booking/reward regressions: **26 passed on SQLite; 23 on PostgreSQL**. Lifecycle, assistant, Vault and client checks: **124 passed, 5 existing optional checks skipped**.
- TypeScript, targeted ESLint, whitespace checks and direct production compilation passed. Compilation used `next build --webpack`; the migration-running npm build script was not used.
- Compiled-app Chrome: **40 full-flow scenarios passed, no runtime errors**, including real Auth.js login, account changes, lost responses, grant recovery, concurrent devices, all reward levels, Vault and private admin override presentation. Seven focused scenarios also passed independently. Early-expiry, midnight, forbidden-response and first-pick-red UI fixtures are explicitly mocked; visibility events are simulated. Actual transaction paths use the disposable database.
- Inspected the rendered Expedition and Vault screenshots at phone widths; layout assertions cover 320/375/430px and desktop. Keyboard Info, focus, touch targets, reduced motion and one 4x CPU-throttled Vault refresh were exercised. Full browser artifacts: `%TEMP%/guild-expedition-ui-gMT5ld`.

Logs: `%TEMP%/reward-review-{sqlite,postgres,booking-sqlite,booking-postgres,client,build,browser-focused,browser-full}.log`. Focused browser traces: `%TEMP%/guild-expedition-ui-qmCZSt`. Server and browser reproductions failed before the corresponding fixes.

No new schema, migration, reward value, probability, guarantee, artwork, CSS or production operation is included in this follow-up. Separate local request-timing and reveal-performance edits that appeared during review are excluded and are not covered by these results. Physical Android and the affected original Chrome profile remain unverified.
