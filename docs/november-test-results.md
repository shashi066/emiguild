# Reward release verification

Fresh review: 29 October 2026, baseline Development `4f71e06`. No production deployment, migration or activation was performed.

## Fresh automated results

| Check | Result |
|---|---|
| SQLite baseline plus reward migration | Passed: six tables, baseline user/booking preserved, constraints/foreign keys valid, no Prisma schema drift |
| SQLite reward, booking-edit, rules and request-client suites | 18 passed |
| SQLite real booking/claim/reset route handlers with mocked sessions/mail scheduling | 2 passed |
| Disposable PostgreSQL baseline plus migration | Passed: six tables, preserved data, no Prisma schema drift |
| PostgreSQL reward/booking-edit suites and real handlers | 18 + 2 passed |
| Existing forge, grants, Fusion, marketplace, Guess 36 and Tower database regressions | 45 passed |
| Focused pure/client regressions, including passes, booking capacity, assistant security and Vault | 87 passed |
| Mocked Spin/Artifacts/Happy Ticket API harness | 4 passed |

These suites overlap; counts are reported per invocation, not as a unique-test total. Disposable databases were used for writes. The normal local database was not reset or migrated.

New regression assertions cover demoted-admin PATCH/DELETE/check-in denial, cross-origin booking mutations, preserved ticket redemption on denied requests, and preservation of pass/membership benefits when an edit omits benefit controls. A legacy handler fixture initially omitted an Origin header; it was corrected to exercise authorized history protection after the new origin check.

## Final checks and browser limits

Final TypeScript, changed-source lint, whitespace and direct production compilation passed; see reward-release-pr-preparation.md. Never use the migration-running npm build script for local compilation checks.

The existing Chrome localhost session has repeatedly rendered an old Vault JavaScript bundle, including a removed Happy Tickets section. A successful API response or build does not count as a successful visual check. Until the actual updated page renders, current mobile/desktop layout, popup, focus and reduced-motion browser verification remain unverified. Historical screenshots and mocked visual checks are not substituted for final signed-in verification. Physical low-end Android performance is unmeasured.

## Reproduction

- `node scripts/verify-reward-sqlite.mjs` creates only the explicitly named disposable SQLite fixture database and checks migration drift.
- Set DATABASE_URL and NOVEMBER_TEST_DATABASE_URL to that disposable database before `npm run test:november` and `node test/november/booking-http.test.cjs`.
- Set NOVEMBER_PG_MODULE to a locally installed embedded-postgres module outside the repo; `node scripts/verify-november-postgres.mjs` uses a disposable loopback PostgreSQL cluster and restores the SQLite Prisma client afterward.
- `npx tsc --noEmit`; ESLint over the changed source files; `git diff --check`; `npx next build --webpack` without migrations.

## Production requirements

Validate configured reward pools and PS5 station eligibility, review economy exposure, deploy schema before code, and record production smoke-test evidence. Existing pause flags and recovery receipts remain available; rollback must preserve legitimate rewards.
