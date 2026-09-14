# Refreshing the catalog

The explorer never invents a number. Refreshing means re-downloading official extracts and re-running ingest.

```bash
npm run refresh        # download (resume-safe) + geo + ingest + refresh-status + checksum pins + source-health
npm run refresh:force  # re-fetch even when files already exist
```

`npm run build` is ingest only (plus manifest + geo + source-health from current files). Use that after a download, or when raw files are already present.

## What fails closed

- A **critical** URL failure in `scripts/download-raw.sh` exits 1 unless `MIG_ALLOW_PARTIAL=1`.
- A **SCHEMA ERROR** in `scripts/ingest.mjs` exits 1 and leaves the previous `public/data/catalog.json` in place.
- Optional Phase 4–5 files (Scotland EILR / Area Overviews, NRS vital events, NISRA MS tables, ONS UK MYE2, RM011) only warn. The Phase 1–3 series still build.

Registry and this contract: [`data/sources.json`](../data/sources.json) → `howRefreshWorks`.

## GitHub Action (hands-off)

[`.github/workflows/refresh.yml`](../.github/workflows/refresh.yml) runs `npm run refresh` on:

- **schedule:** `17 6 1 * *` (06:17 UTC on the 1st of each month)
- **workflow_dispatch**

A failed download or ingest fails the workflow. That is the visible failure. The Action does not invent a series when a producer URL 404s.

On **success**, the job commits `public/data/catalog.json`, `public/data/refresh-status.json`, `public/data/source-health.json`, `data/checksums.json`, and the manifest if they changed, so the live Worker can rebuild from `main`. On **failure** it commits only the fail stamp + source-health (not catalog.json) so the live header can show a red badge while the last good catalog stays.

## Site stamps

The header and sources page show two different dates:

| Stamp | Meaning |
| --- | --- |
| **Data as of** | When the downloaded official files in `data/raw/manifest.json` were last hashed (producer vintage in the extract). |
| **Catalog built** | When `scripts/ingest.mjs` last wrote `catalog.json`. |
| **Last successful refresh** | When `npm run refresh` last finished without a critical/schema error (`public/data/refresh-status.json`). |
| **Source health** | Per-feed last OK vs last fail and checksum match (`public/data/source-health.json`). |
| **Pinned checksums** | SHA-256 of last ingest-validated extracts (`data/checksums.json`). A download whose hash changes must still pass ingest before the catalog is replaced. |

If the last refresh failed, the header shows a red badge and the previous catalog stays.

## Cloudflare Cron Trigger (not shipped)

A Worker cron that ran `npm run refresh` would need a Node toolchain, write access to git or R2, and a secret-gated admin route. That is heavier than this static ingest pipeline. Prefer the documented command and the GitHub Action.

If a future cron is added, it must not silently overwrite `catalog.json` on a schema break, and it must not invent series when a producer URL 404s.
