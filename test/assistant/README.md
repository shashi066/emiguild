# Assistant verification

`npm run test:assistant` runs the isolated flow, schema, token, SSE and permission tests.

HTTP tests in `integration.test.ts` require a disposable SQLite database whose URL contains `assistant-test`, and a Next server using that same database. Set `DATABASE_URL`, `ASSISTANT_TEST_URL`, `AUTH_URL`, `AUTH_SECRET`, and `ASSISTANT_ACTION_SECRET` in the test processes. The server and test process must share the action secret. Use a separate port and disable mail configuration. The suite creates test accounts, stations and rewards and replaces only its named fixtures when rerun.

Run `npx tsx --test test/assistant/integration.test.ts` after pushing the local schema into that disposable database. It exercises real authentication, admin ownership, booking creation, Standard/Hour Pass/Guild pricing, cancellation restoration, duplicate confirmations, stale quotes, partial multi-station failure, Daily Spin, release settings, and separate rate limits. No OpenAI key is required.

Deployment must apply both assistant migrations, including the guided-rate counters. `ASSISTANT_GUIDED_PER_MINUTE_LIMIT` defaults to 60 and is independent of AI daily limits. Administrators follow OFF/BETA/ON and the same beta email allowlist as customers.

Manual browser checks: six quick actions; optional typing; full booking without typing; back/change/start over; guest sign-in and draft restoration; two separate station confirmations; keyboard focus loop and Escape; 72dvh mobile sheet and safe-area padding; reduced motion; interruption/retry. Confirm there are no Markdown markers, intermediate lookup cards, or repeated AI summaries.
