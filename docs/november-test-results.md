# Reward verification

## Latest baseline: 29 October 2026

After personal-ticket and five-table cleanup: disposable SQLite and PostgreSQL migration chains preserved configuration/version, bookings, redemptions and cooldowns with zero Prisma drift. SQLite focused suite: 22 passed; real HTTP-handler suite: 3 passed. PostgreSQL ran overlapping service/handler coverage. TypeScript, changed-source lint and direct production compilation passed. Earlier reward-release regressions included 45 database checks and 87 pure/client checks; these are historical, not fresh runs of the current cleanup.

Actual Chrome review covered compact admin tabs/search/pagination/dialogs and public ticket layout at 320/375/430px and desktop. No reward transaction was submitted during that UI review. The old localhost asset issue was resolved for that review; historical cache-blocker notes are superseded. Physical low-end Android performance remains unmeasured.

## Cleanup verification: 30 October 2026

Fresh checks passed: 23 focused tests (including a component hook harness for read deduplication, timeout, loaded-content retention and unmount abort), 3 real HTTP-handler tests, 2 API tests, TypeScript, changed-source ESLint, whitespace and direct production compilation. No schema/backend transaction code changed, so PostgreSQL migration results above remain prior evidence rather than a fresh rerun.

Chrome was disconnected for this cleanup, so no fresh browser/device performance verification is claimed. Obsolete mocked `visual.cjs`/`ui-preview.cjs` are archived locally rather than presented as validation. `browser.cjs` now uses current admin tabs/dialogs and adds resume deduplication/GET-timeout checks; booking transaction cases remain in the deterministic handler suite. Its standalone browser suite must be explicitly run against a disposable database before claiming its results.

## Reproduce

- `node scripts/verify-reward-sqlite.mjs` recreates only `prisma/november-test-clean.db` and checks the full migration chain.
- Set both DATABASE_URL and NOVEMBER_TEST_DATABASE_URL to that disposable database; run `npm run test:november`, `node test/november/booking-http.test.cjs` and `node test/november/http.test.cjs`.
- Set NOVEMBER_PG_MODULE to an external embedded-postgres installation; `node scripts/verify-november-postgres.mjs` verifies a disposable loopback PostgreSQL database and restores the SQLite client. Do not run client generation alongside the normal dev server.
- `npx tsc --noEmit`, changed-source ESLint, `git diff --check`, `npx next build --webpack` (no migrations).
- Browser runner requires a disposable November database and matching local server via NOVEMBER_BROWSER_URL. It is not a production smoke test.

Deployment must follow the coordinated migration/code order in [the release guide](november-release-checklist.md). No production migration, deployment or activation was performed during this cleanup.
