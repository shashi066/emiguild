# Happy Tickets: personal accounts

## Claims and bookings

- Each existing or new account starts with five claimable tickets. Balances are independent.
- One successful claim consumes one personal balance unit and starts a 24-hour cooldown. Other accounts are unaffected.
- A claimed ticket belongs only to its account and grants one base PS5 screen-hour. Extra time, controllers and food remain payable. Benefits cannot be stacked.
- New claims expire at the exclusive start of the next IST day: displayed as 11:59 PM on the claim day. The whole booking must finish before expiry.
- Eligible PS5 stations, weekdays and hours remain globally configurable. Issued tickets retain their rule snapshots.
- Pre-start cancellation restores the claimed ticket with its original expiry. It never restores claimable balance, changes cooldown or extends expiry.
- Claimed-ticket expiry never refills the personal balance. No automatic refill is scheduled.

## Personal banked resets

- A reset belongs to exactly one account. Its owner can activate it even with tickets remaining; the balance becomes exactly five.
- Activation consumes only that copy and changes no other account, cooldown, claimed ticket or booking.
- Each copy expires one calendar month after issuance at the same IST time, clamped for short months.
- Old ownerless shared reset fixtures are archived by the personal-balance migration, never multiplied across accounts. Existing tickets, cooldowns and redemption history are preserved.

## Admin controls

- Give everyone one banked reset: snapshot the existing accounts, issue one copy to each in a single transaction and save one recovery receipt. Later signups receive no copy of past grants.
- Refill everyone: set each existing account's personal balance to five, preserving their cooldowns and claimed tickets.
- Confirm the affected account count and require a reason. If the count changed before submission, refresh and reconfirm.
- Cancelling a grant revokes only unused, unexpired copies. Activated copies and their audit history remain.
- Search members to inspect personal stock, next claim time, claimed-ticket history and reset history. Eligibility configuration remains global.
- Server pause switches and receipt recovery remain available. Happy Tickets stay outside Vault.

Duplicate requests return committed results; changed inputs conflict. Ownership, balance limits and writes are checked transactionally. Ten attempts per account per minute remain enforced separately from the successful-claim cooldown.

Five claimable hours now exist per account. An all-account reset can add up to five times the eligible account count in claimable hours. Duplicate-account farming remains a risk; no new identity collection or reward caps are added.
