# Themed entry loaders, homepage quest wheel, and direct Vault rewards

Game entry screens now show lightweight themed illustrations while data loads. Vault runs Daily Spin and Forge in place, and prioritizes a live Guild Drop only when the player has not entered it. The homepage features the selected cyan-outlined capsule wheel and a readiness-aware branded entry sequence.

## Behavior

- Tower, Guild Spin, Artifacts, Tournaments, Vault, and Guess 36 share route/data-loading illustrations with an eight-second section-entry minimum. Late responses hold completed artwork; background refreshes and game actions add no entry delay. Tournament internal navigation has no additional mandatory wait.
- Homepage entry uses the optimized 51KB WebP, an immediate wordmark fallback, a gentle logo settle, and a seven-second minimum. Progress advances through 90–99; 100% also requires page/booking-control readiness. Header and assistant stay hidden until the page is ready. Internal Home links and browser Back/Forward bypass the branded sequence completely; pending internal returns show only “Loading home…”.
- Homepage secondary actions retain their original arrangement. Watch Party uses a static black/ice-blue treatment; EMIC Rewards uses magenta. The selected Side Quests wheel keeps labels upright, pauses during selection/offscreen/hidden tabs, and honors reduced motion.
- Vault Spin/Forge dialogs preflight eligibility, submit once, reconcile ambiguous responses using GET without repeating POST, and preserve confirmed results through refresh errors. Shared presentations are reused by the original game pages. Forge modal chrome uses the Artifacts amber accent; rarity colors remain independent.
- Vault discovers unentered ACTIVE Guild Drops whose start time has arrived, end time has not passed, and winner is not published. These take first action priority, ahead of claims/dailies. Joined, scheduled, expired, draft, and closed draws are excluded; owned entry/result history remains visible. Existing draw entry endpoints are unchanged.

## Review corrections

- Preserve loaded Vault content on refresh failure and immediately guard repeated retry clicks.
- Remove all design-preview selectors, abandoned variants, and development lag switches.
- Scope homepage chrome suppression to the root entry policy, so cached hidden route markup cannot hide navigation elsewhere.
- Update the existing Tower loader assertion and stale settings assertions to match the restricted public settings API. No settings API access was broadened.

## Validation

111 targeted tests and 9 disposable-database lifecycle integration tests pass (120 total). Targeted lint has zero errors and seven existing/extracted-component warnings. The isolated `next build --webpack` production build and TypeScript checks pass; `git diff --check` is clean. Validation covers homepage navigation/progress policy, daily reward requests/reconciliation, Forge clocks/fusion rules, Tower UI/clocks, Guess 36 rules/clocks/presentation, and Vault action priority. A disposable SQLite database is used for lifecycle integration; production builds are isolated from the running development server.

Browser-level navigation/hydration flashes, signed-in visual reveals, layout at enlarged text sizes, and physical Android performance remain unverified. Automated timing tests and HTTP responses do not establish real device frame rates. Reduced motion and timer cleanup are implemented.

No database schema or migration changes are introduced by this change set. No production migration or manual deployment is performed by the validation commands.
