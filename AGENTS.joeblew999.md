# AGENTS.joeblew999.md — branch-local agent guide

Operational brief for any AI agent working on the `joeblew999` branch of `auth-service`.

**Project guidance:** follow upstream project instructions and this branch-local guide.
The former shared mise library is retired; see [MISE-RETIREMENT.md](MISE-RETIREMENT.md).

## What this repo is

BetterAuth-on-Cloudflare-Workers fork. Three-phase deploy lifecycle: Phase 1 dev, Phase 2 wrangler bundle, Phase 3 prod.

## Branch-local quirks

yarn-based husky pre-commit upstream — bypassed via --no-verify when committing mise.toml-only changes.

## Mise wiring

[mise.toml](mise.toml) contains only local tasks. The shared pre-push `check`
wrapper has been retired; run the project checks appropriate to your changes.
