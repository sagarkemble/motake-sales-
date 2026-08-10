# VPS deployment (interactive)

Manual full-stack deployment to a VPS with PM2 and Caddy.

## Scripts

| Script | Purpose |
|--------|---------|
| **`deploy.sh`** | Ports → domains → build → PM2 → Caddy |
| **`caddy-setup.sh`** | Caddy TLS + reverse proxy only |

```bash
# Full deploy (interactive)
./deploy/vps/deploy.sh

# Caddy only
./deploy/vps/caddy-setup.sh
```

## Prerequisites

- `./deploy/local/env-setup.sh` completed
- `pnpm install`
- Node 22+, pnpm, PM2, Caddy on the server
- DNS pointing to the VPS (ports 80/443 open)

## PM2 processes

| Name | App | Default port |
|------|-----|--------------|
| `motake-api` | Express + tRPC | 8001 |
| `motake-web` | Next.js | 3001 |

Wrappers: `deploy/pm2/start-api.sh`, `deploy/pm2/start-web.sh`

## Generated config

Written to `deploy/generated/` (gitignored):

- `runtime.env` — assigned ports
- `ecosystem.config.cjs` — PM2 config
- `motake.caddy` — Caddy site blocks

## Options

```bash
./deploy/vps/deploy.sh --skip-build    # skip pnpm build
./deploy/vps/deploy.sh --skip-caddy    # skip Caddy setup
./deploy/vps/caddy-setup.sh --force  # reconfigure existing Caddy fragment
```
