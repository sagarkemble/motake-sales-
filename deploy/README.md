# Deployment

All deployment-related scripts live under `deploy/`.

## Folder structure

```
deploy/
├── README.md              ← you are here
├── lib/
│   ├── common.sh          Shared helpers (ports, PM2, env updates)
│   └── production-deps.sh VPS dependency check/install helpers
├── local/                 Local developer setup
│   ├── README.md
│   └── env-setup.sh       Interactive .env + symlinks
├── vps/                   Interactive VPS deployment
│   ├── README.md
│   ├── deploy.sh          Full stack: build → PM2 → Caddy
│   ├── caddy-setup.sh     Caddy TLS + reverse proxy only
│   └── sudoers-deploy-bootstrap.example
├── ci/                    GitHub Actions / non-interactive remote deploy
│   ├── README.md
│   ├── ensure-production.sh  Check/install VPS tools before deploy
│   ├── write-env.sh       Write .env from env vars (no prompts)
│   ├── deploy.sh          Non-interactive PM2 + Caddy deploy
│   └── sync-to-vps.sh     Rsync + remote deploy (called by GHA)
├── pm2/                   PM2 process wrappers
│   ├── start-api.sh       Starts apps/api (node dist/index.js)
│   └── start-web.sh       Starts apps/web (next start)
├── caddy/
│   └── Caddyfile.example  Example fragment (reference only)
└── generated/             Runtime artifacts (gitignored)
    ├── runtime.env        Assigned ports
    ├── ecosystem.config.cjs
    ├── motake.caddy
    └── Caddyfile
```

## Quick start

| Goal | Command |
|------|---------|
| Local dev env | `./deploy/local/env-setup.sh` |
| Manual VPS deploy | `./deploy/vps/deploy.sh` |
| Caddy only | `./deploy/vps/caddy-setup.sh` |
| CI deploy (on VPS) | `./deploy/ci/ensure-production.sh && ./deploy/ci/write-env.sh && ./deploy/ci/deploy.sh` |
| GitHub Actions | Push to `main` → `.github/workflows/deploy.yml` |

## Documentation

Full production plan: [`deployment.md`](../deployment.md) at repo root.

## Generated files

`deploy/generated/` is created at deploy time and gitignored. Do not commit runtime.env, ecosystem.config.cjs, or motake.caddy.
