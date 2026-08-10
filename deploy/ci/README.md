# CI / remote deployment

Non-interactive deployment for GitHub Actions and automated VPS deploys.

## Scripts

| Script | Runs on | Purpose |
|--------|---------|---------|
| **`ensure-production.sh`** | VPS | Check/install Node, pnpm, PM2, Caddy before deploy |
| **`write-env.sh`** | VPS | Write `.env` from environment variables |
| **`deploy.sh`** | VPS | Build (optional) → migrate → PM2 → Caddy |
| **`sync-to-vps.sh`** | GHA runner | Rsync repo + ensure-production + write-env + deploy |

## GitHub Actions

Workflow: [`.github/workflows/deploy.yml`](../../.github/workflows/deploy.yml)

Triggers on push to `main` (with path filters) or manual `workflow_dispatch`.

Flow:

1. **Build job** — `pnpm build` with `NEXT_PUBLIC_*` secrets
2. **Deploy job** — rsync to VPS → `ensure-production.sh` → `write-env.sh` → `deploy.sh --skip-build`

## Fresh VPS (one-time, as root)

Before the first GitHub Actions deploy, SSH as root and run:

```bash
mkdir -p /var/www/motake
chown deploy:deploy /var/www/motake
# After first rsync, or copy from repo:
cp deploy/vps/sudoers-deploy-bootstrap.example /etc/sudoers.d/deploy-motake
chmod 440 /etc/sudoers.d/deploy-motake
visudo -c
```

After that, `ensure-production.sh` installs everything else automatically on each deploy.

## Required GitHub Secrets

See [`deployment.md`](../../deployment.md) §5 for the full list.

Minimum:

- `VPS_HOST`, `VPS_USER`, `VPS_APP_PATH`, `VPS_SSH_KEY`
- `DATABASE_URL`, `JWT_SECRET`, Supabase, R2 keys
- `NEXT_PUBLIC_*`, `BASE_URL`, `CORS_ALLOWED_ORIGIN`

## Required GitHub Variables

- `MOTAKE_FRONTEND_DOMAIN` — e.g. `motake-front.lunarstudio.dev`
- `MOTAKE_API_DOMAIN` — e.g. `motake-back.lunarstudio.dev`
- `MOTAKE_ROUTING_MODE` — `separate`
- `MOTAKE_WEB_PORT` — `3001`
- `MOTAKE_API_PORT` — `8001`

## Manual CI deploy on VPS

If you have all env vars exported:

```bash
export MOTAKE_ROUTING_MODE=separate
export MOTAKE_FRONTEND_DOMAIN=motake-front.lunarstudio.dev
export MOTAKE_API_DOMAIN=motake-back.lunarstudio.dev
# ... plus all write-env.sh vars

./deploy/ci/write-env.sh
./deploy/ci/deploy.sh
```

## Options

```bash
./deploy/ci/ensure-production.sh         # check + install missing tools
./deploy/ci/ensure-production.sh --check-only
./deploy/ci/deploy.sh --skip-build     # use existing build artifacts
./deploy/ci/deploy.sh --skip-caddy     # skip Caddy reload
./deploy/ci/deploy.sh --skip-migrate   # skip db:migrate
```
