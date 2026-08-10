# Local setup

Interactive environment configuration for development.

## Script

**`env-setup.sh`** — prompts for each variable in `.env.example`, writes root `.env`, and symlinks it into apps and packages.

```bash
./deploy/local/env-setup.sh
```

## What it creates

| File | Purpose |
|------|---------|
| `.env` | Root secrets (gitignored) |
| `apps/api/.env` | Symlink → `../../.env` |
| `apps/web/.env.local` | Symlink → `../../.env` |
| `packages/database/.env` | Symlink → `../../.env` |
| `packages/services/.env` | Symlink → `../../.env` |
| `packages/logger/.env` | Symlink → `../../.env` |

## After setup

```bash
pnpm install
pnpm dev
```
