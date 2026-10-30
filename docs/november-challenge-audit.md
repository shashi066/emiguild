> Personal-account update (29 October 2026): shared balances/resets below are superseded by [personal Happy Tickets](personal-happy-tickets.md) and [current ticket rules](happy-ticket-rules.md). The original reward migration is followed by a separate personal-balance migration. Earlier verification is historical, not proof of the revised UI.

# Reward release audit

Reviewed 29 October 2026 against Development `4f71e06`. This is a source and local-test audit, not production deployment evidence. The November timeline remains in the owner's Excel; this release adds no website calendar or campaign editor.

| Area | Release behavior | Remaining release requirement |
|---|---|---|
| Spin | Ten-day Epic and thirty-day Legendary consecutive streaks; a missed spin day resets both. Epic results reset Epic only. Legendary takes priority and resets both. Immutable results and request receipts protect recovery. | Verify positive-weight production Epic/Legendary pools and launch timestamp. |
| Tower | New runs snapshot rewards and protection. A valid loss pays one last-cleared-floor reward; floor one pays none. Timeouts and legacy runs retain existing policy. | Review production reward exposure and token configuration. |
| Happy Tickets | Five shared available tickets; 24-hour per-account cooldown; newly claimed tickets expire at the end of the claim day in IST. One eligible base PS5 hour, no benefit stacking. | Configure explicit active PS5 stations and review schedule. |
| Resets | Any signed-in member can activate an unused banked reset, even with stock remaining. It sets stock to five without changing cooldowns or issued tickets. Calendar-month expiry and single-use activation are enforced. | Bank legitimate reset entitlements through admin controls; no automatic resets. |
| Bookings | Ticket application/removal/replacement, restoration history, paid/start restrictions, stale edits and request recovery. Omitted benefit controls preserve existing passes/memberships. | Run signed-in final browser checks. |
| Authorization/payment | Current database role checked before and within admin booking mutations; same-origin checks protect mutations. Payment signatures are bound to stored booking orders and replay is guarded. | Production smoke test using the existing payment-at-counter flow. |
| Vault/UI | Production structure with compact cyan Legendary/Epic tracking and existing Spin/Forge actions. No Happy Tickets in Vault. Spin rules are collapsed; wheel unchanged. | Local Chrome stale assets currently block final visual verification. |
| Storage | Six tables: HappyPool, HappyTicket, HappyRedemption, GuildReset, RewardReceipt, RewardAudit; additive fields on existing models; no historical reward backfill. | Apply migration before dependent code during a separate authorized rollout. |

No production balances, users, tickets or database schema were changed during preparation. Physical Android performance has not been measured.
