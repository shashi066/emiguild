# Reward storage

The unreleased reward migration adds exactly six tables: HappyPool, HappyTicket, HappyRedemption, GuildReset, RewardReceipt and RewardAudit. Both Prisma schemas describe the same application model with their respective providers.

User stores claim cooldown/rate counters and Legendary progress. Existing booking, Spin and Tower models receive additive financial/snapshot fields. Nullable unique active-redemption references preserve history while allowing only one active use per ticket and booking. No historical reward backfill or progress reset is performed by the release migration.

Claims atomically update pool/cooldown, create the ticket and save a recovery receipt without a separate claim audit. Resets share finalization logic and write one compact refill audit. Booking audits contain changed financial fields and names of changed metadata fields; receipts retain committed responses for recovery. Existing Spin/Tower records remain the reward authority.

The single migration folder `20261028000000_reward_features` contains PostgreSQL `migration.sql` and SQLite `migration.sqlite.sql`. Both were validated against disposable baseline databases on 29 October 2026: baseline user/booking preservation, six tables, constraints, foreign keys and no Prisma schema drift passed. No production migration was run.

Older local feature fixtures were disposable and cleaned during the previous schema simplification. That cleanup is not part of deployment and must not be repeated against a live database. Current PR preparation only writes isolated test databases; normal local user data remains unchanged.
