# Migration

Evidence-led explorer of UK population and migration, as published — not as argued.

- Live: https://migration.cybush.uk
- Worker: `migration` on zone `cybush.uk` (`migration.cybush.uk/*`)
- Source inventory: [`docs/inventory.md`](docs/inventory.md)
- Downloaded files: [`data/SOURCES.md`](data/SOURCES.md)

Phase 5 extends the Phase 1–4 static HTML/CSS/JS app served by a thin Cloudflare Worker (`wrangler.toml` assets + `src/worker.js` audit hit). The Worker name and route are unchanged. Do not treat this as a rewrite.

## Principles

- No invented statistics. Every plotted number is copied from a downloaded official file.
- UK-born is not nationality and is not White British.
- Detected arrivals are not a stock of people without permission.
- Fiscal estimates are methods and ranges, not one “cost”.
- Years and places without a comparable published series are marked **no comparable data**. Nothing is interpolated to fill a gap.

## Run locally

```bash
npm install
npm run build          # manifest + geo + ingest → public/data/catalog.json
npm run preview        # static: http://127.0.0.1:8788
# or
npm start              # wrangler dev (Worker + assets)
```

`npm run build` writes `data/raw/manifest.json`, normalises ONS geography, and ingests `data/raw` → `public/data/catalog.json` (not a JS bundler). The browser loads `public/index.html`, `public/app.js`, `public/app.css`, `public/data/catalog.json`, and `public/geo/{uk-nations,uk-itl1,uk-lad}.geojson`.

Re-download official extracts and rebuild (resume-safe; some URLs are vintage-specific):

```bash
npm run refresh        # download + build
npm run refresh:force  # re-fetch even when files already exist
# or separately:
npm run download
npm run build
```

**If a critical source fetch or schema breaks:** `scripts/download-raw.sh` exits 1 when a critical URL fails (unless `MIG_ALLOW_PARTIAL=1`). `scripts/ingest.mjs` prints `SCHEMA ERROR` and exits 1 without overwriting `catalog.json` if a required file, sheet, or series is missing or too short. Optional files (Scotland Area Overviews / EILR, NISRA, UK MYE2, RM011) only warn. The registry and this contract live in [`data/sources.json`](data/sources.json) (`howRefreshWorks`). Scheduled refresh: [`docs/refresh.md`](docs/refresh.md). A monthly GitHub Actions cron runs `npm run refresh` and writes `public/data/refresh-status.json` on success or failure.

Large Home Office detail workbooks are fetched for local inspection but gitignored. The committed catalog is built from the summary tables listed in `data/SOURCES.md`. Cited fiscal comparison figures (not official mapped series) are in [`data/fiscal-citations.json`](data/fiscal-citations.json).

## Deploy

GitHub → Workers Builds should use this repo’s `wrangler.toml`:

- `name = "migration"`
- `account_id = "f027194dcc0be7e3812e673468bab58d"`
- route `migration.cybush.uk/*` on `cybush.uk`
- `[assets] directory = "./public"`
- `AUDIT_HITS` dataset `cybush`

Build command: `npm run build` (manifest + geo + ingest). Critical raw files are committed; if a required sheet/column cannot be parsed the build fails and the previous catalog is left in place. Optional downloads (Nomis zips, Scotland Area Overviews, RM011) only warn — they do not invent a series.

## Deep-link contract

Refresh and share restore explorer state from the query string:

| Param | Values |
| --- | --- |
| `layer` | Catalog layer id (`p1-mye-total`, `p1-cob-stock`, `p3-emigration`, `p1-fiscal-notes`, `p2-identity-compare`, …) |
| `year` | Integer year on the slider |
| `year2` | Optional second published year for the compare control. Nothing is interpolated between `year` and `year2`. |
| `geo` | `nation` · `region` (ITL1) · `la` · or a feature code (`E` / `E12000007` / `TLL` / `E06000001`) |
| `metric` | Series id on the selected layer (`share-non-uk`, `share-non-british`, `pct-white`, …) |

Example: `https://migration.cybush.uk/?layer=p1-cob-stock&year=2021&year2=2011&geo=region&metric=share-non-uk`

## What Phase 5 adds

- **Scotland council-area census stocks (2022)** from official [Scotland’s Census Area Overviews](https://www.scotlandscensus.gov.uk/search-the-census) (`EILR_cob` / `EILR_ethnic` / `EILR_religion`). These are the published equivalents of UV204 / UV201 / UV205. The 32 S12 councils colour the LA map on those layers for 2022. Categories stay in NRS wording — White includes Irish/Polish/Other White; Christian is Church of Scotland + Roman Catholic + Other Christian; UK-born is the four UK countries only. They are not remapped onto E&W or NISRA headings. UKDS bulk UV CSVs were still “datastore pending” when this extract was taken.
- **England & Wales age × birthplace** from ONS Census 2021 **RM011** (`download.ons.gov.uk/downloads/datasets/RM011/editions/2021/versions/1.csv`). The old `api.beta.ons.gov.uk/.../RM011/.../csv` URL 404s. The official file is **persons** (usual residents by six age bands), not a male/female split. UK-born is the published `Europe: United Kingdom` heading. England, Wales and E&W totals are sums of the published lower-tier local authority observations. No sex split is invented.
- **Hands-off refresh:** [`.github/workflows/refresh.yml`](.github/workflows/refresh.yml) runs `npm run refresh` on a monthly cron (`17 6 1 * *`) and on `workflow_dispatch`. Success commits the catalog + `public/data/refresh-status.json`. Failure fails the workflow and records a fail stamp without overwriting the last good catalog. The header and sources page show **data as of** (manifest) vs **catalog built** vs **last successful refresh**. No Cloudflare cron Worker is shipped.
- **Optional polish:** guided year jumps (1991 / 2004 / 2012 / 2021) that only open existing layers and say when the extract has no count for that year; CSV of the current published rows; chart-canvas PNG. No map PNG export.

Honest gaps still remaining: UKDS/NRS bulk UV201/204/205 CSVs when that datastore is populated; RM011 sex split if ONS republishes it; NISRA has no standalone Muslim column; no invented irregular-migrant stock; no pre-1991 ethnicity or pre-2001 religion continuous maps; no single net fiscal cost.

## What Phase 4 already added

- **Scotland Census 2022** from the published EILR chart workbook: country of birth (Figure 8, including age bands), ethnic-group headings (Figures 4–5), religion (Figure 2), national identity (Figure 9). 2022 is Scotland’s census year — it is not spliced onto an E&W/NI 2021 UK-wide census map.
- **NISRA Census 2021** main-statistics tables: MS-A16 country of birth (NI + 11 LGDs), MS-A31 COB × broad age, MS-B01 ethnic group, MS-B19 current religion, MS-B15 national identity, MS-B23 religion-brought-up-in as a cited extra only.
- **Honest concordance** on every identity / ethnicity / religion surface. White, Christian, and UK-born are producer headings, not silent remaps. NISRA White excludes Irish Traveller and Roma. NRS “minority ethnic” includes some White minorities and is a separate metric.
- **Vital events:** NRS Table 3.13 / 3.09 and NISRA Table 3.18 sit beside the ONS E&W mother’s-COB series. Three systems, not one UK births line. Scotland 2024 council shares colour the LA map.
- **Age–sex:** ONS UK MYE2 mid-2024 pyramids for UK nations (so Scotland and NI are no longer missing from the pyramid view). COB×age tables are census snapshots, not MYE.
- **Product polish:** year slider through 2026 (Home Office YE June 2026 asylum / detections kept as mid-year points); dual-year compare (`year2`); mobile tap targets for fiscal filters and the nations / ITL1 / LA switcher.
- **Refresh:** `npm run refresh` plus [`docs/refresh.md`](docs/refresh.md) and a `workflow_dispatch` GitHub Action. Phase 5 enables the monthly cron on that same workflow.

## What Phase 3 already added

- **Fiscal assumptions panel** — filters cited MAC / OBR / Migration Observatory / Dustmann–Frattini figures by static vs dynamic, average vs marginal, public-goods allocation, and who is counted. Every card has a source and method note. The UI never averages them into one “true” net cost.
- **Data as of / provenance** — header stamp plus `catalog.provenance` (manifest SHA-256s, ingest warnings). OGL link kept on the sources page.
- **Emigration** as a first-class layer (`p3-emigration`) and the default metric on Migration flows.
- **Asylum** default chart is claims, grants, refusals, and awaiting (plus Asy_02a / Asy_03a extras from the same HO summary).
- **Detections** — small-boat vs other IER_01 methods as separate series. Terminology: detections ≠ illegal stock.
- **Context charts** on the fiscal panel: EMP06 employment by country of birth and by nationality; housing affordability remains on the labour layer.

Phase 3 honest gaps that Phase 4–5 now fill in part: Scotland 2022 / NISRA census stocks are ingested with concordance; Scotland councils colour from Area Overviews; RM011 persons (not sex) fills the E&W birthplace×age table. Still no invented irregular population.

## What Phase 2 already showed

| Layer | Extract years | Map |
| --- | --- | --- |
| Mid-year population | 1838–2025 (UK/nations from 1971; GB wartime ad hoc 1937–) | Nations where a figure exists |
| Immigration / emigration / net | IPS-era 1964–2015 and admin LTIM YE Dec 2012–2025 | National series only; emigration also has `p3-emigration` |
| UK-born / non-UK-born (country of birth) | APS YE June 2021; census LA % 2011 & 2021; Scotland Census 2022 Figure 8 + Area Overviews; NISRA MS-A16 2021 | Nations & ITL1 (2021 APS + 2022 Scotland / 2021 NI census); E&W LAs 2011 & 2021; NI LGDs 2021; Scotland councils 2022 |
| Nationality (British / non-British) | APS YE June 2021 Table 2.1 | Nations, ITL1, LAs (sample-size limited). Census national identity is not this layer. |
| Identity compare | Same three questions, side by side; optional `year2` delta | Never labelled “native” |
| Ethnicity | E&W 2011 & 2021; Scotland 2011 & 2022; NISRA MS-B01 2021 | Nation headings as published; 2021 ITL1 (E&W LA sums + Scotland/NI nation totals); E&W LAs + NI LGDs 2021; Scotland councils 2022 (NRS White heading) |
| Religion | E&W 2011 & 2021; Scotland 2011 & 2022; NISRA MS-B19 2021 | Same. MS-B23 not mixed in. Scotland councils 2022 (CoS + RC + Other Christian). |
| Age–sex | Mid-2025 E&W pyramids; mid-2024 UK MYE2; RM011 persons 2021 | UK nations (2024); E&W / English regions (2025). Birthplace×age: RM011 persons (E&W), Figure 8 (Scotland), MS-A31 (NI). |
| Births by mother’s country of birth | E&W 2008–2025; NRS Table 3.13 selected years; NISRA Table 3.18 2014–2024 | Nations; E&W either-parent regions 2016–22; Scotland councils 2024 |
| Asylum | UK 2010–2026 people / decisions / awaiting (YE June 2026 kept as a mid-year point) | National series only |
| Small-boat / illegal-entry **detections** | 2018–2026 | National series only |
| Labour / housing context | EMP06 rates 1997–; affordability ratios | Affordability on E/W/regions |
| Contested fiscal panel | MAC Figure 10 / Table 11 / Table 23 + cited comparison cards | No choropleth |

The map has three official geography levels:

- **Nations** — Natural Earth 50m subunits (Phase 1).
- **ITL1 regions** — ONS Open Geography International Territorial Level 1 (January 2021) UK BUC.
- **Local authorities** — ONS Open Geography Local Authority Districts (December 2021) UK BUC, matching Census 2021 codes.

A year or layer without a published figure at the selected level is dimmed and labelled **no comparable data**. Geometries are not invented.

## Sources and limitations

See the on-page **Sources and limitations** section and `data/SOURCES.md`.

Notable honesty constraints (from the inventory):

- No comparable UK ethnicity question before 1991; this extract has E&W 2011/2021, Scotland 2011/2022, and NISRA 2021 — three White headings, not one.
- Modern religion affiliation starts 2001; this extract has E&W, Scotland, and NI current-religion snapshots with concordance.
- IPS-era and admin-based LTIM are drawn as separate series. Do not splice them.
- Small-boat figures are detections, not an irregular population.
- The fiscal panel reprints MAC model outputs and cites OBR / Migration Observatory / Dustmann–Frattini (and the briefing’s Table 1 comparison studies). It is not an official mapped cost and it does not invent a single net figure.

Licence for most official files: [Open Government Licence v3.0](https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/).
