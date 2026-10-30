# Compact Happy Tickets admin - 29 October 2026

## Implemented

The default view is Tickets. Members and Resets are separate compact views with 20-row pagination. Eligibility and member details use the existing admin modal shell. Reset reasons and account-count confirmation are inside centered dialogs with 16px phone margins. Existing admin typography, controls, alerts and table patterns are reused; the oversized permanent settings/member panels and unused ticket-slot CSS are removed.

The server-rendered initial report remains available without a client loading gate. Reads have a 20-second timeout, stale-response protection, and preserve existing content. A successful mutation remains successful if its follow-up refresh fails; refresh failure must never invite another reset transaction. Receipt recovery remains independent of presentation.

## Five tables

HappyTicket, HappyRedemption, GuildReset, RewardReceipt and RewardAudit remain. HappyPool is removed. Its configuration and version move to the internal Settings key `happy_ticket_config`, stored as `{ version, config }`. Generic Settings GET/PUT cannot expose or overwrite it. Configuration writes validate active PS5 stations and compare the exact previous settings value inside the existing serializable transaction, preserving stale-edit protection. Legacy empty configuration retains the previous safe, unconfigured defaults.

Personal stock/cooldown fields remain on User. No ticket, balance, booking, redemption, reset, audit or receipt records are cleared.

## Interfaces

Existing admin GET accepts `section=tickets|members|resets`, `page` (1-100000), optional member search (150 characters) and `userId`. Default is tickets/page 1. Invalid/unknown query parameters are rejected. Response includes the resolved section/page and `hasNext`; inactive lists are empty and not queried. Member details fetch only when requested. The response uses shared explicit types. Public ticket routes and admin mutation request shapes remain unchanged.

## Migration and rollout

Forward migration `20261029010000_happy_settings` copies configuration/version, verifies preservation, and drops only the redundant configuration table. Both SQLite and PostgreSQL variants are included. Previously committed migrations remain unchanged. Deploy migration and dependent application code together during maintenance: old code still references the retired table. No production migration or deployment was performed.

Local preview database was backed up as `prisma/dev.before-five-table-20261029-221157.db`. Local migration preserved all unrelated table contents, existing settings, ticket eligibility/version and foreign keys. Local preview uses the existing URL `/admin/happy-tickets` on port 3000.

## Verification

- Disposable SQLite: full baseline plus feature/personal/settings migrations, configuration/version preservation, existing booking/redemption/cooldown preservation, stock constraints, foreign keys and zero Prisma schema drift passed.
- Disposable PostgreSQL: same migration/preservation/drift checks and real transaction/service tests passed; client restored to SQLite afterward.
- Focused SQLite suite: 22 passed; real HTTP handler suite: 3 passed. Includes stale configuration, section isolation, bounded lists, invalid queries, generic-setting write protection, claim/reset contention/recovery, cooldown, ownership, booking/pass restoration, and Spin/Tower regression coverage. PostgreSQL runs overlapping coverage; counts are not additive unique totals.
- Real Chrome: desktop and 320/375/430px reviewed. Compact header/search/member table, empty member search, page 2 navigation, member details, eligibility modal, reset confirmation centering, keyboard wrap/Escape and no horizontal document overflow checked. Tables may scroll horizontally. No claim, grant, reset or configuration save was submitted during UI review.
- Reduced-motion behavior is retained in scoped CSS; real-device Android performance and browser-level network interruption/OS reduced-motion emulation were not measured. Transaction interruption/recovery is covered by automated tests.
- TypeScript, changed-source ESLint, whitespace and direct production compilation are run without the migration-running npm build script.

All changes remain local and uncommitted unless separately requested.
