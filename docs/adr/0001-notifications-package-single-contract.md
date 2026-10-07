# Notifications go through one package with a channel-agnostic contract

Bill and Receipt messages (and any future email/SMS) are sent only through a separate notifications package. Callers hand it one generic request — channel (`whatsapp` | `email` | `sms`), provider, and a generic payload — and the package alone knows how to call each provider's API. Domain code never calls WhatsApp or any provider directly, so swapping or adding a provider doesn't touch ordering or payment code.

The notifications package owns delivery lifecycle and status. Every accepted request returns a stable notification ID; application code stores and uses that ID to read status or request a resend, without depending on provider-specific identifiers or states. The package selects the provider, translates the generic payload, calls its API, records delivery attempts, handles retries and exposes the resulting status.

A failed or skipped notification never rolls back a Bill, Payment, ledger entry or other completed domain action. The exact queue, transactional handoff, outbox and worker architecture is deliberately deferred to v3 implementation planning.
