# Refreshing the catalog

The explorer never invents a number. Refreshing means re-downloading official extracts and re-running ingest.

```bash
npm run refresh        # download (resume-safe) + geo + ingest
npm run refresh:force  # re-fetch even when files already exist
```

`npm run build` is ingest only (plus manifest + geo). Use that after a download, or when raw files are already present.

## What fails closed

- A **critical** URL failure in `scripts/download-raw.sh` exits 1 unless `MIG_ALLOW_PARTIAL=1`.
- A **SCHEMA ERROR** in `scripts/ingest.mjs` exits 1 and leaves the previous `public/data/catalog.json` in place.
- Optional Phase 4 files (Scotland EILR, NRS vital events, NISRA MS tables, ONS UK MYE2, RM011) only warn. The Phase 1–3 series still build.

Registry and this contract: [`data/sources.json`](../data/sources.json) → `howRefreshWorks`.

## GitHub Action

[`.github/workflows/refresh.yml`](../.github/workflows/refresh.yml) runs `npm run refresh` on **workflow_dispatch**. A monthly cron is present but commented — enable it if maintainers want a scheduled check.

The Action does **not** auto-commit. It uploads `public/data/catalog.json` as an artifact so a human can open a PR if vintages moved.

## Cloudflare Cron Trigger (not shipped)

A Worker cron that ran `npm run refresh` would need a Node toolchain, write access to git or R2, and a secret-gated admin route. That is heavier than this static ingest pipeline. Prefer the documented command and the GitHub Action.

If a future cron is added, it must not silently overwrite `catalog.json` on a schema break, and it must not invent series when a producer URL 404s.
