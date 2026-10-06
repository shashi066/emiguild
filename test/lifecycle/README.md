# Vault and Messaging verification

Run `npm run test:lifecycle`. Database tests require `LIFECYCLE_DB_TESTS=1` and a disposable SQLite database whose filename includes `lifecycle-test`. HTTP tests additionally require `LIFECYCLE_TEST_URL` and a test server using that database. Never run fixtures against player data. Leave Gmail credentials empty; delivery tests inject a fake transport.

## Messaging / Mail

Admin → Customers → Messaging / Mail (`/admin/lifecycle`) has campaign switches and an admin-only test send. Player Preview and its lookup/API remain removed. Loading/saving settings never sends mail.
The restored daily schedule targets 18:00 IST and requires the existing `CRON_SECRET` bearer token; absent/incorrect authentication is rejected before database work. Mail uses existing Gmail credentials and AUTH_SECRET, and automatic delivery is production-only.
Visits outside admin pages are throttled to five minutes on client/server and pause promotional mail for 72 hours. Campaigns share a rolling seven-day cap, durable reservations, and unsubscribe suppression. Interrupted/ambiguous sends are not automatically retried. Both switches off skips player evaluation.
Use fake transport tests for delivery caps/concurrency and HTTP tests for admin authorization, origin validation, cron authentication and visit throttling. No real email is sent by the test suite.

## Vault

The Vault loads its five displayed sections. Its homepage badge uses `/api/vault/summary`, returning only pendingCount. Both endpoints are private and read-only; clients deduplicate requests with a 15-second freshness window. Explicit/deadline refresh bypasses that window. The embedded Tower review button consumes parent state without a second Vault request.
No new schema migration. Booking/password-reset transports and existing unsubscribe links remain unchanged.
