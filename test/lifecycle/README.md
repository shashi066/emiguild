# Vault and legacy email verification

Run `npm run test:lifecycle`. Database tests require `LIFECYCLE_DB_TESTS=1` and a disposable SQLite database whose filename includes `lifecycle-test`. HTTP tests additionally require `LIFECYCLE_TEST_URL` and a test server using that same database. Never run fixture tests against player data.

## Retired messaging

Messaging admin pages, preview/settings/test-send endpoints, website activity tracking and the email cron have been removed. Existing unsubscribe links and records are preserved. Legacy email helpers and their tests remain for compatibility but have no scheduled or admin entry point.

The Vault loads only its five displayed sections. Its homepage badge uses `/api/vault/summary`, which returns only `pendingCount`. Both endpoints remain private and read-only; clients deduplicate overlapping requests and reuse results for up to 15 seconds. Explicit refresh and deadline refresh bypass the freshness window.

Database tests compare summary counts to full Vault actions, preserve ownership and expiry rules, and verify reads do not mutate game state. No schema changes are required for these optimizations.

Booking and password-reset email transports are unchanged.
