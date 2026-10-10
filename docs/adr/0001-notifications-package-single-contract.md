# WhatsApp delivery goes through a transport-only notification boundary

Motake owns every business decision about a notification: when it is required, who receives it, its rendered text and attachment, its ordering relative to other messages, and the business document/version it represents. Ordering, billing, Payment and ledger code never call WhatsApp or a provider directly. They hand a provider-neutral WhatsApp instruction to the separate notification boundary.

The notification boundary alone selects the configured WhatsApp provider, translates the instruction to that provider's API, records attempts, retries delivery and reports normalized status under a stable notification ID. Callers never select a provider or depend on provider-specific identifiers or states. Supporting or replacing WhatsApp providers must not change Motake's business flows.

The new features support WhatsApp only. Email, SMS and additional channels are future scope rather than part of the current contract.

Once a financial transaction commits, any notification required by its business rules must not be lost, including if the application crashes before provider delivery. A failed or skipped notification never rolls back a Bill, Payment, Note, ledger entry or other completed domain action. Manual resend never repeats the financial action.

The exact package/service boundary, durable handoff, queue, outbox, worker, persistence, provider fallback and retry architecture is deliberately deferred to implementation planning immediately before development.
