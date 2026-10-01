# Lifecycle email verification

Run `npm run test:lifecycle`. Database tests require `LIFECYCLE_DB_TESTS=1` and a disposable SQLite database whose filename includes `lifecycle-test`. HTTP tests additionally require `LIFECYCLE_TEST_URL` and a test server using that same database. Never run fixture tests against player data.

## Sending configuration

Production uses the existing `GMAIL_USER`, `GMAIL_APP_PASSWORD`, and `AUTH_SECRET`. Unsubscribe signing derives a lifecycle-specific key from `AUTH_SECRET`, and links use `https://emiguild.in`. Both admin campaign switches default off, so player email remains disabled until an administrator enables a campaign. Non-production processes cannot send lifecycle emails outside the explicit test override.

The daily cron runs at 18:00 India time. Comeback checks recur every 72 hours and require no Spin, Forge, or Guess 36 activity in the preceding 72 hours. Account age, feature availability, website cooldown, unsubscribe, and one shared rolling seven-day email limit apply. Weekly digest periods begin Sunday at 18:00. Comeback takes priority when both qualify.

Registered addresses are used directly; historical consent fields are unused. Two additive tables store evaluation/unsubscribe state and send history. Apply both lifecycle migrations before production use. No queue or automatic retries are implemented. SMTP acceptance is reported as Accepted; an interrupted or ambiguous dispatch becomes Unknown and consumes the shared allowance.

Previews are read-only. Admin test sends go only to the signed-in admin, do not consume player allowance, and are limited to three daily. Total lifecycle/test send attempts are capped at 50 daily. Booking and password-reset transports are unchanged.
