# WhatsApp delivery goes through a transport-only notification boundary

Motake owns every business decision about a notification: when it is required, who receives it, its rendered text and attachment, its ordering relative to other messages, and the business document/version it represents. Ordering, billing, Payment and ledger code never call WhatsApp or a provider directly. After domain work commits, the main API delegates a provider-neutral instruction to a separate notification service.

The notification service alone persists delivery state, selects the configured provider, translates the instruction to that provider's API, records attempts, runs automatic retries and fallback, and reports normalized status under a stable notification ID. Callers never select a provider or depend on provider-specific identifiers or states. Supporting or replacing WhatsApp providers must not change Motake's business flows.

The new features support WhatsApp only. Email, SMS and additional channels are future scope rather than part of the current contract.

Once a financial transaction commits, any notification required by its business rules must not be lost, including if the application crashes before provider delivery. A failed or skipped notification never rolls back a Bill, Payment, Note, ledger entry or other completed domain action. Manual resend never repeats the financial action.

## Runtime topology

- **Web** (`apps/web`, PM2 on the VPS) calls the main API only. It never calls the notification service or a messaging provider.
- **Main API** (`apps/api`, PM2 on the same VPS) runs business operations against **Supabase Postgres** via **Drizzle** (`packages/database`). Supabase Auth and existing tRPC routes stay on this app. The API holds no WhatsApp credentials.
- **Notification service** (`apps/notification`, one Docker container on the same KVM) exposes tRPC for internal enqueue and status operations, serves provider webhooks (HTTP alongside tRPC), and runs **Inngest in that same container** for durable step execution, automatic retry and provider-agnostic orchestration. It uses the same Supabase database through Drizzle for notification tables.
- **Database** is Supabase Postgres, not a Postgres container on the VPS. Migrations live in `packages/database` and apply to the shared project both apps use.

## Request flow

1. Web places an order or triggers another domain action through the main API (existing tRPC from `@repo/trpc` on `apps/api`).
2. The main API performs and commits domain operations, then builds a provider-neutral payload and **delegates** to the notification service over **server-to-server tRPC** (not from the browser).
3. The notification service validates the payload, **inserts a notification row** (and related attempt history as designed), acknowledges with a stable notification ID, then **Inngest** processes send work: call the configured adapter (Meta WhatsApp Cloud API first), update rows on success or failure, and retry transient failures according to policy. Meta delivery-status webhooks update normalized status on the notification service.

Handoff durability: the notification tRPC handler must **persist before it acknowledges**. The API passes an **idempotency key** so a retried delegate after timeout or error does not create duplicate notifications. If the API cannot obtain an acknowledgment, it may retry delegation; it does not call WhatsApp directly.

## Contract and code layout

- **tRPC contract** lives in `packages/trpc/server/*`, including notification procedure inputs and outputs (Zod). This is the shared contract between the main API and the notification service; a separate `packages/notifications` contract package is not required.
- **Two routers**: the browser-facing **app router** remains mounted only on `apps/api`. A **notification router** is mounted only on `apps/notification`. Notification enqueue and internal delivery procedures are not exposed on the web client's router.
- **Implementation** of WhatsApp adapters, Inngest functions and notification persistence belongs in `packages/services` (notification module) and `apps/notification`, not in order or ledger services. Domain code may call a thin delegate helper that invokes the notification tRPC client after commit.

## Authentication

- End-user **Supabase Auth** applies to web and main API as today. The browser and web app never call the notification service.
- Main API to notification tRPC uses a **shared internal API key**: the same long random secret on both processes, sent as `Authorization: Bearer`. Notification procedures compare it in constant time and reject missing or wrong values. This is not a salesman or admin session, not the app JWT signing secret, and not the Supabase service-role key.
- Notification tRPC listens on localhost only. A future admin resend stays on the main API and is proxied internally with this key.
- Meta webhook verification (hub token and request signature) and Inngest signing are separate secrets from the internal API key. They authenticate the provider or job runner, not Motake's API.

## Deployment

- **PM2**: `apps/web`, `apps/api` (unchanged pattern).
- **Docker**: one `apps/notification` container on the KVM, including the self-hosted Inngest process. No Inngest Cloud.
- **Caddy**: routes public web and API domains to PM2; routes WhatsApp webhook paths to the notification container on localhost.
- Changes to `packages/trpc` notification procedures or `packages/services` notification logic require rebuilding and redeploying the notification container; the main API redeploys when delegation or shared procedure types change. Web redeploys only when the app router or web-facing packages change.

## Out of scope for this boundary

- Business rules for which message types fire on Bill, Payment, Note and cancellation events (domain documentation elsewhere).
- PDF or document generation; callers pass immutable document references in the delegate payload.
- Inbound WhatsApp chat.
