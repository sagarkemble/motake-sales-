# Motake

Full-stack monorepo for the Motake dairy distribution platform.


| App / Package       | Description                                                             |
| ------------------- | ----------------------------------------------------------------------- |
| `apps/web`          | Next.js frontend (port `3000`)                                          |
| `apps/api`          | Express + tRPC API with a REST layer at `/api/*` (port `8000`)          |
| `packages/trpc`     | tRPC routers shared between API and web                                 |
| `packages/services` | Business logic (auth, customers, orders, gatepasses, products, reports) |
| `packages/database` | Drizzle ORM schema, queries, and migrations (Postgres)                  |
| `packages/logger`   | Shared logger                                                           |
| `k6/`               | K6 load tests (see [k6/README.md](k6/README.md))                        |
| `scripts/`          | Seeding, token-fetch, and cleanup scripts for load testing              |


**Stack:** Node 22, pnpm, Turborepo, Next.js, Express, tRPC, Drizzle, Supabase (Auth + Postgres), ImageKit.

## Local development setup



### Prerequisites

- **Node.js 22+**
- **pnpm 9** (`corepack enable` or `npm i -g pnpm@9`)
- A **Supabase project** (Auth + Postgres)
- **ImageKit** account (public images + private Bill/Note/receipt PDFs)
- Optional: **[k6](https://grafana.com/docs/k6/latest/set-up/install-k6/)** for load tests



### 1. Install dependencies

```bash
pnpm install
```



### 2. Configure environment

Create the root `.env` (single source of env vars, symlinked into apps/packages):

```bash
./deploy/local/env-setup.sh
# or manually:
cp .env.example .env
```

Fill in at minimum:


| Variable                                                     | Purpose                                                         |
| ------------------------------------------------------------ | --------------------------------------------------------------- |
| `DATABASE_URL`                                               | Postgres connection string (Supabase or local)                  |
| `SUPABASE_URL`                                               | Supabase project URL                                            |
| `SUPABASE_SERVICE_ROLE_KEY`                                  | Server-side Supabase key                                        |
| `SUPABASE_ANON_KEY`                                          | Required by `POST /api/auth/login` (server-side password grant) |
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Browser Supabase client                                         |
| `JWT_SECRET`                                                 | Session signing secret                                          |
| `IMAGEKIT_PUBLIC_KEY` / `IMAGEKIT_PRIVATE_KEY` / `IMAGEKIT_URL_ENDPOINT` | ImageKit (uploads + private PDFs)                |
| `R2_*` (optional)                                            | Only for `pnpm media:migrate-r2-to-imagekit`                    |




### 3. Run database migrations

```bash
pnpm db:migrate
```



### 4. Start the dev servers

```bash
pnpm dev
```

- Web: [http://localhost:3000](http://localhost:3000)
- API: [http://localhost:8000](http://localhost:8000) (health: `/health`, OpenAPI docs: `/docs`)

Other useful commands:

```bash
pnpm build         # build all apps/packages
pnpm lint          # lint
pnpm check-types   # typecheck
```



## K6 load tests

Load tests simulate concurrent salesmen and admins against the API. They talk to the
**backend only** — never directly to Supabase or the database. Full details in
[k6/README.md](k6/README.md).

### 1. Configure

In `.env`:

```bash
K6_API_BASE_URL=https://sales-api.motakedairy.com   # or http://localhost:8000
K6_SALESMAN_VUS=10    # concurrent salesman virtual users
K6_ADMIN_VUS=2        # concurrent admin virtual users
```



### 2. Seed load-test users (once)

Creates `K6_ADMIN_VUS` admins (via Supabase Auth + profiles) and `K6_SALESMAN_VUS`
salesmen (via the admin API), and writes credentials to `k6/data/users.json` (gitignored):

```bash
pnpm seed:k6-users
```



### 3. Run the load test

```bash
pnpm loadtest
```

This automatically:

1. Fetches fresh access tokens for every load-test user via `POST /api/auth/login`
  (exponential backoff on rate limits; Supabase tokens expire ~1h, so this runs every time).
2. Runs k6 — each virtual user creates a session once via `POST /api/auth/session`
  and reuses the httpOnly cookie for all requests.

Smoke run (short + light):

```bash
K6_SALESMAN_VUS=5 K6_ADMIN_VUS=2 K6_RAMP_UP=10s K6_HOLD_DURATION=30s K6_RAMP_DOWN=5s pnpm loadtest
```

Useful variations:

```bash
pnpm tokens:k6                        # refresh tokens manually
K6_SKIP_TOKEN_FETCH=1 pnpm loadtest   # skip token refresh (tokens still fresh)
```



### 4. Clean up test data

Removes load-test users, customers, orders, and gatepasses via the backend
(`POST /api/admin/k6-cleanup`):

```bash
pnpm cleanup:k6                      # dry run — shows what would be deleted
CLEANUP_CONFIRM=1 pnpm cleanup:k6    # actually delete
```



## Deployment

Pushes to `main` that touch `apps/**`, `packages/**`, or `deploy/**` trigger the
[Deploy to VPS](.github/workflows/deploy.yml) workflow (build on GitHub Actions,
rsync artifacts to the VPS, PM2 + Caddy). Documentation-only changes do not deploy.

- Frontend: [https://sales.motakedairy.com](https://sales.motakedairy.com)
- API: [https://sales-api.motakedairy.com](https://sales-api.motakedairy.com)

