# Guess 36 Guild Expedition release

## Rules

One free personal run per account per IST date, plus one daily Google-review-link bonus (separate from Tower). Unused bonuses expire at the end of the following IST day. Free eligibility is consumed first, then the oldest bonus. See [reward updates](reward-updates-release.md) for the forward migration and recovery additions. A fixed, securely shuffled 6 x 6 board contains five green, five red and 26 yellow tiles. First pick may be red. The first accepted reveal starts 90 seconds; Play and page entry consume nothing. Green advances the reward, yellow continues, red loses uncollected progress. Collect secures the current level. Timeout secures progress using the original deadline, and five greens collect automatically.

Rewards replace each other: 15 minutes, 30 minutes, 60 minutes, 120 minutes, Bronze Pass (existing 10-hour entitlement). One final counter-redemption ticket is issued, with a unique GUESS_36/entry reference. Redeem by the end of the following IST calendar day, calculated from logical collection/completion/timeout time. Delayed recovery cannot extend expiry. Staff supplies/activates the existing Bronze Pass; this game does not redefine its activation validity or automatically create a second pass product. Gaming-time rewards are PS5 counter rewards; extras remain payable.

## Implementation

No new game tables. Both schemas extend Guess36Round with an immutable Mines snapshot, and Guess36Entry with a LEGACY/MINES discriminator, nullable legacy selection, private fixed board, revealed indices, run state/deadline/version, reward settlement snapshot and bounded action-rate counters. Account/round/attempt uniqueness and reward-source uniqueness protect daily attempts and ticket issuance. Old records default to LEGACY. Legacy draw processing excludes Mines and does not publish results for Mines-only rounds.

Public current state exposes explicit MineState/MineRun types, revealed tiles only, server time and owned reward details. It does not expose recent runs or legacy draw history, and no longer queries those histories. POST reveal creates or advances a run; POST collect settles it. A terminal owned run can be inspected via current?inspect=ENTRY_ID. No active response includes the hidden layout. Server validates account, same origin, bounds, version, deadline and state. Serializable transactions have bounded retries. Repeated requests recover saved outcomes; competing picks cannot overspend a version or issue a second ticket. A run crossing midnight finishes before the next daily run starts. A legacy pick made on launch day consumes that date's free attempt; a valid review bonus remains usable.

The board uses raised sealed CSS tiles with numbered accessible names. Revealed tiles show Loot / Clear / K.O. icons and labels, alongside five reward milestones. A brief two-dimensional flip and bounded feedback follow committed outcomes; reduced motion keeps results static. Decorative effects finish within five seconds and flying effects clean up on page exit/backgrounding. There is no animation dependency or polling. Countdown uses server time plus monotonic elapsed time. The five-second branded entry is reserved for a fresh available board; recovery, depleted accounts and errors skip it. Tab return/manual refresh reconciles state. Expired runs settle on access, with no new cron. Vault retains its layout and links to Guild Expedition; assistant help can explain/link but cannot play. Existing reward-ticket views and legacy redemption remain available.

Rewards use the shared Artifacts RewardTicketCard. Newly committed tickets appear immediately and are deduplicated against refreshed tickets. Only available tickets are listed; current redeemed/expired results have explicit empty-state messages. Expedition's display adapter shows Bronze Pass as 10 hours and the exclusive expiry boundary as the preceding day's 11:59 PM IST. Underlying ticket expiry and redemption rules are unchanged.

Info uses the existing game modal, with Expedition-scoped phone margins/scrolling. Opening/closing it does not fetch state, navigate, or replay the loader. Focus events from buttons and modal focus restoration no longer trigger state refreshes. The modal remains mounted across run updates and its scroll position is retained. Timeout can settle once underneath the open modal; loaded game content remains visible during refreshes.

Admin: /admin/guess-36 has Mine Run history (20 rows/page), pause settings and counter redemption. Legacy draws/rewards are retained in a separate tab; new legacy-pick controls are hidden. Fixed rules and redemption eligibility are displayed rather than exposing untested difficulty/reward controls.

## Migration and local review

Forward migration: 20261106000000_guess36_mines. migration.sql is PostgreSQL; migration.sqlite.sql is the local SQLite companion. Do not replay both on the same database. Preserve prior migration history.

Local dev.db was backed up before applying its companion. Verification compared every original column/row across all 44 existing tables and checked foreign keys. No existing records were reset. The new flag guess_36_mines_enabled was manually enabled locally only.

Production has not been migrated, deployed or activated. Stop incompatible old application traffic while deploying the migration and compatible code; legacy code assumes non-null selections. Verify reward entitlement/redemption rules and issuance figures, then manually enable Guild Expedition in Admin. Missing/false flag pauses new runs. No timed activation is added. Rollback first pauses new runs and retains compatible settlement/recovery code; never drop run records or issued tickets.

## Verification commands

- npm run test:guess-36: constructs a disposable SQLite database from the pre-Mines f43c32e schema; seeds legacy fixtures, applies the forward migration, verifies preservation/no new tables/no drift, runs Mines/legacy/API/render/forge/Fusion/grant/marketplace/reward checks.
- npm run test:guess-36:postgres: same checks and contention on disposable embedded PostgreSQL. Set MINES_PG_MODULE to the locally installed embedded-postgres dist/index.js. Stop dev/build processes before this check because the generated Prisma provider is temporarily switched and restored. SQLite-only rename fixtures run only in the SQLite command.
- npx tsx scripts/simulate-guess36-mines.ts: deterministic, 100,000 runs per strategy/speed.
- npx tsc --noEmit; targeted eslint; git diff --check; npx next build --webpack. Never run the migration-running npm build script for compilation checks.

The HTTP/service/browser tests refuse databases without an explicit matching disposable test URL. Render checks are server-rendered state checks, not browser interaction tests. The standalone Chrome suite below verifies actual authenticated game behavior separately from the older, skipped lifecycle browser integration test.

- Chrome: set matching DATABASE_URL and MINES_TEST_DATABASE_URL to a disposable SQLite database containing `mines-test` in its path, then run `node test/guess-36/mines-browser.cjs`. It uses actual Auth.js sessions and actual reveal/collect APIs with fixed fixture boards. It starts a separate loopback test server (3016 by default), isolates source/build assets outside the repository, and never resets the normal local database. Installed Playwright and Chrome are required; no new production dependency is added.

## Economy

The approved odds and rewards were not adjusted. At fast picking speeds, analytical expected issuance per 1,000 runs is approximately:

| Collect after | Gaming minutes | Bronze Passes |
|---|---:|---:|
| 1 green | 7,500 | 0 |
| 2 greens | 6,667 | 0 |
| 3 greens | 5,000 | 0 |
| 4 greens | 2,857 | 0 |
| 5 greens | 0 | 3.97 |

These are issuance totals, not actual redeemed cost, and assume completion before timeout. At six seconds between reveals, the deterministic simulation produced about 2,595 gaming minutes plus 1.58 Bronze Passes per 1,000 runs pursuing all five; timeout preserves lower-tier rewards. Actual mix depends on player choices, network delay and redemption rates. Budget review is required before production enablement; do not silently change odds.

## Test results - 6 November 2026

- Disposable SQLite: 68 passed, no skipped checks in its migration/service/API/render/adjacent reward suites. Legacy records/tickets and foreign keys preserved, zero new game tables, zero Prisma drift.
- Disposable PostgreSQL: 66 passed (SQLite-only rename fixtures excluded). Same migration preservation/drift checks; real serializable conflicts exercised in Mines and adjacent reward transactions.
- Lifecycle with disposable SQLite enabled: 53 passed; one browser/server integration test skipped because its local integration server was not supplied. Updated obsolete Guess 36 assertions for Mine Run and corrected the pre-existing admin sample-email assertion to check current sample copy and absence of the admin name.
- Client/home/Spin/Vault/help focused suite: 59 passed.
- TypeScript, targeted ESLint and whitespace checks passed. Direct production compilation (npx next build --webpack) passed without migrations; only the existing middleware-deprecation warning remained.
- Browser verification was subsequently completed using actual Chrome; see the cleanup results below. CPU-throttled benchmarks and physical Android performance remain unverified.

## Presentation update

Player-facing name: Guild Expedition. Signed-out HTML omits the board, tile controls, timer, progress and personal-reward sections; it shows a sign-in invitation with a return link. The authenticated board and game rules are unchanged. Verified with render checks, TypeScript, targeted lint and a local HTTP response containing zero tile controls when signed out.

## Chrome verification and cleanup results

After the reported lazy-client runtime error, the page and client component were changed to a matching default export and generated Next.js assets were rebuilt. At the user's explicit request, installed Playwright was used with the actual Chrome channel after the normal browser connector remained unavailable.

- Initial follow-up: actual signed-out Chrome at 390px and a separately visible desktop window hydrated without errors. The earlier 375px signed-in check mocked current state only; it did not exercise reward transactions.
- Cleanup: 12 Chrome scenarios passed with actual Auth.js sign-ins and real reward transactions on a disposable SQLite database. Fixed boards were seeded before play solely for deterministic test coverage; production board generation is unchanged. No public-state mocking was used for these scenarios. Delayed action responses used real committed server responses.
- Layouts: 320, 375, 430 and 1280px, 36 numbered controls, signed-out gating, at least 44px tile height, no document overflow, aligned header/Info controls, and inspected phone/desktop screenshots. The scoped guide correction preserves 16px margins on narrow screens and internal scrolling on short phones.
- Completion: manual collection, red loss, fifth-green Bronze and timeout all kept Info open without document navigation, game-node replacement or entry-loader replay. The short-phone loss check preserved a nonzero modal scroll position. Escape, close button and Got It restored keyboard focus/document scroll without fetching state. Timeout caused exactly one settlement refresh.
- Rewards: immediate single shared minute ticket, Bronze Pass 10-hour display, duplicate-tap protection, redeemed/expired exclusion, and no duplicate ticket issuance. Reduced motion disables revealed-tile animation. Slow refresh retains the board and open Info. Chrome reported zero page errors.
- Background/resume handler: simulated browser visibility/focus events coalesced into one refresh. Automated Chrome tabs did not reliably report OS backgrounding, so this is explicitly an event-handler check, not a physical-device background test.
- Cleanup regressions: 34 Mines/legacy/presentation/shared-ticket checks, 3 actual API-handler checks and 3 render checks passed. TypeScript, targeted ESLint, whitespace checks and direct production compilation (`npx next build --webpack`) passed without migrations. Existing framework warnings about middleware conventions, Auth.js Edge imports and metadataBase were observed; none blocked compilation.
- No physical Android or CPU-throttled performance claim is made. The existing personal Chrome profile could not be attached through the unavailable connector; verification used fresh actual Chrome contexts.

## Repeated-loading follow-up

After the user reported the client error recurring, the normal local server log confirmed the same undefined lazy-component error. Fresh Chrome entries alone did not reproduce that session's failure. The component had previously changed from a named export to default-only; it now exposes both names as the same function so older client references remain valid. This addresses a stale-reference failure path without changing game state or adding automatic reloads. The local dev asset directory was archived and regenerated; the normal database was preserved.

`node test/guess-36/mines-loading-browser.cjs` passed against localhost:3000: four reloads and three client Back returns using the current reference, plus entry/reload with the earlier named reference injected into the RSC stream. HTTP responses and the real component bundle were not mocked. Both references rendered the real signed-out game after the loader; no undefined-component errors or stuck loader were observed. Render tests assert both exports resolve to the same function; TypeScript, targeted lint and whitespace checks also passed. The original personal Chrome session remains unavailable to the connector, so its precise cache state was not inspected.

## Login-transition follow-up

The error was reported again after login, so export compatibility alone was not a complete resolution. The login form issued `router.push(callbackUrl)` immediately followed by `router.refresh()`, allowing competing route updates against the newly authenticated server tree. It now performs one same-origin document navigation after successful credentials verification, keeps submission disabled during navigation, and retains inline invalid-credential feedback. This intentionally refreshes the authentication context once; game actions and Info do not navigate. The original profile-specific failure was not reproduced in fresh Chrome, so the login race is an identified defect rather than a proven sole cause of that profile's error.

New browser coverage uses the actual login form, not a pre-created browser session: member, admin and a member with a collected reward ticket each sign in from Guild Expedition and reload the authenticated page. The checks assert exactly one post-login document navigation, 36 tiles, the saved shared ticket, no lazy-component error, and successful recovery from an invalid password. All three flows passed against both the isolated development app and the compiled app on disposable SQLite. TypeScript, targeted lint, whitespace checks and direct production compilation passed without migrations. Use `MINES_BROWSER_LOGIN_ONLY=true`; add `MINES_BROWSER_COMPILED_APP=true` to test an already-built app. The guarded runner starts/stops its loopback-only test process and rejects the normal local database.

The automatic approval review blocked a standalone compiled local server command with only "blocked by policy" supplied as the reason. The compiled test suite completed through the guarded disposable runner; normal localhost:3000 was restored using the development server and existing local database. No deployment or production activation occurred.

## Stable rewards and complete flow - 9 November 2026

### Implemented

- The five-second branded loader is now controlled by loaded page state, rather than an unconditional route-layout mount. Active/terminal/legacy-used/paused/error states skip it. Server suspense uses a compact labeled spinner. A recovered run can finish the entrance immediately without replacing the game subtree.
- Request and clock handling are separated from presentation. Ready, Playing, Secured, Lost and Timed out are explicit phases; pending/recovery state is independent. Green progress is labeled Uncollected reward. The Info label no longer advertises the removed odds section.
- Reveal/Collect return typed `{ run, serverNow }`. Countdown and ticket-display time use a server anchor plus monotonic elapsed time. Changing the phone clock cannot advance or extend the displayed countdown. Server deadlines remain authoritative.
- The existing state API accepts an owned `recover` ID, mutually exclusive with `inspect`; repeated/empty/oversized IDs are rejected. Recovery includes only revealed tiles and current ticket status. An expired older run remains available as the just-settled result, and Today's expedition loads today's actual state without consuming an attempt.
- A single entry verification reconciles cached App Router Back state. This was required by a reproduced bug: leaving during a committed Collect request and returning with Back otherwise restored stale Playing props. The verification retains content and never repeats the transaction.
- Window-focus refreshes were removed. Actual visibility return is debounced; overlapping refresh reasons queue one reconciliation. Actions apply their committed result directly and do not trigger a follow-up fetch simply because a reward was received. One IST/ticket boundary timer handles dates/expiry without polling.
- A failed deadline read offers Check result instead of polling. An active server response can re-anchor the deadline for a later settlement. Confirmed 401 responses clear personal board/ticket UI; the saved run remains on the server for login recovery. Timers, pending reads and queued refreshes clean up on unmount.
- Tickets insert immediately and deduplicate by ID. Redeemed/expired selected tickets cannot reappear from stale local ticket arrays. Board inspection, View reward, Info and result updates preserve the game node and do not navigate.

### Verification and limits

- 27 real-Chrome scenarios passed on disposable SQLite with actual Auth.js sign-in and real reward transactions. Coverage includes 320/375/430/1280px layouts, member/admin login, all five reward levels, green/yellow/red, timeout, duplicate taps, two devices, interrupted first reveal/collection, expired sessions, navigation while pending, Back recovery, Info scroll/focus, reduced motion, phone-clock changes and explicit recovery after a failed deadline read. Action assertions require zero unexpected document navigations, no game-node replacement and no branded-loader replay.
- Midnight UI, an early-expiry response and visibility events were explicitly simulated in Chrome; real server settlement across midnight is covered separately with injected service clocks. These are not physical-device background/sleep tests. Desktop and phone screenshots were inspected.
- Disposable PostgreSQL: 73 tests passed with real transaction contention, preserved legacy data, no new tables and no schema drift. The final Node wrapper recorded exit code 0; the earlier PowerShell nonzero status was not a failing database assertion.
- Disposable SQLite: 75 tests passed across Mines, legacy Guess 36, client state, API, render, Fusion, forge, grants, marketplace and shared tickets. Legacy records and foreign keys were preserved, with no new tables or schema drift. Direct production compilation completed without running application migrations; its process exited 0. TypeScript, targeted ESLint and whitespace checks passed.
- Browser diagnostics save navigation/RSC initiators, hot-reload socket metadata and service-worker control in test artifacts. They exclude cookies, request bodies and URL queries. Latest successful full-flow artifact directory: `%TEMP%/guild-expedition-ui-XDfSBC`.
- The normal development server was restarted on localhost:3000 with the existing SQLite database. A fresh actual Chrome login through the visible form showed 36 tiles, working Info/Escape and zero page errors. No game action or reward claim was performed against the normal database during this final smoke check.
- The affected normal Chrome profile remains inaccessible: the browser access host and native pipe both report unavailable. The user confirmed Incognito works. `/sw.js` requests are a clue, not proof of a controlling stale worker. No unconfirmed worker or cache was removed, and no cookies, local storage or account data were cleared. The original profile's navigation initiator remains an external verification blocker; fresh-Chrome success does not certify that profile as fixed.
- No new schema, migration, endpoint, reward rule, balance reset, production deployment or activation was introduced by this cleanup. The existing Mines migration was exercised only in disposable verification databases.
