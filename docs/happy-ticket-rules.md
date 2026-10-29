# Happy Ticket rules and operational model

One ticket covers one base PS5 screen-hour. Extra controllers, additional hours and food remain payable. A booking must last at least one hour; its first hour must fit the ticket's eligible schedule. Benefits do not stack with passes, memberships or other discounts.

## Pool, claims and expiry

- The public available balance starts at five and stays between zero and five. A claim decrements it once.
- Any signed-in user can claim. Another claim is allowed exactly 24 hours after the last successful claim, including across resets.
- A new claimed ticket expires at the exclusive start of the next IST calendar day. A November 3 claim is displayed as expiring November 3, 11:59 PM IST, and rejected at November 4 midnight. Existing issued tickets retain their stored expiry.
- The entire session must finish by that boundary. Expiry, cancellation and redemption never refill the pool.
- Initial eligibility is Monday–Friday, 16:00–23:00 IST, on explicitly selected active PS5 stations. Admins can edit days/hours/stations. Normal booking opening hours and availability also apply.
- Claims stay open on weekends. Show a warning if the issued ticket has no eligible one-hour window before expiry. No extension or weekend exception is silently granted.
- Claimed tickets snapshot their eligibility configuration. Later configuration changes do not rewrite issued tickets.
- A valid pre-start cancellation restores the ticket once with its original expiry. Already-expired tickets remain expired. No cooldown reset or pool refund occurs.
- Redeemed/cancelled bookings retain redemption history. Financial/session edits revalidate eligibility; paid bookings cannot silently change price. Deletion is blocked for bookings with redemption history.

## Resets

Forced Reset sets available balance to exactly five. It does not add five. It preserves existing claims and cooldowns, even when the pool is already full.

Banked Reset stores a separately identified entitlement without changing the balance. It expires one calendar month later at the same IST local time, clamping to the destination month's last day (January 31 → February 28/29). An admin can activate it once, or cancel it while unused and unexpired. Activation refills to five. No automatic activation or refill exists.

Banking can count as a November challenge result, but the public status must say **Banked—awaiting activation** until activation. Expiry/cancellation remains visible as the actual outcome.

## Data and interfaces

Six dedicated tables: HappyPool, HappyTicket, HappyRedemption, GuildReset, RewardReceipt and RewardAudit. Happy Ticket cooldown and durable rate counters live on User; reset/admin history is stored once. Existing passes and ArmoryTickets keep their original lifecycle. Outstanding claimed tickets can exceed five after deliberate resets; five limits available pool tickets, not total unexpired liabilities.

- `GET /api/happy-tickets`: public pool/rules; authenticated users also receive their own wallet and cooldown. Private/no-store response.
- `POST /api/happy-tickets/claim`: same-origin authenticated claim with requestId.
- `GET /api/rewards/receipts/HAPPY_CLAIM/{requestId}` and `HAPPY_BOOKING/{requestId}`: owner-only committed result recovery.
- `POST /api/bookings`: benefitMode HAPPY_TICKET, happyTicketId and requestId; original booking inputs remain required.
- `GET/POST /api/admin/happy-tickets`: current database ADMIN only. Management, configuration, reset operations and feature switches. Mutations require same origin.

Requests use actor/operation/request ID uniqueness, payload fingerprints, serializable transactions and bounded retries. A reused ID with different inputs conflicts. Pool refill events, claims and booking redemption/restoration are durable. Expiry is enforced from timestamps even without cleanup jobs. Claim attempt limits are ten per account per minute; legitimate receipt replay is not a new claim.

## Operational risks

Signup does not verify email/phone, so per-account cooldowns do not prevent duplicate-account farming. No invasive identity collection was added. Admins can pause new claims and resets; existing valid redemptions and receipt recovery remain available. Check available station capacity and liabilities before refills.
