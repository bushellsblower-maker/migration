# Migration

Evidence-led explorer of UK population and migration, as published — not as argued.

- Live: https://migration.cybush.uk
- Worker: `migration` on zone `cybush.uk` (`migration.cybush.uk/*`)
- Source inventory: [`docs/inventory.md`](docs/inventory.md)
- Downloaded files: [`data/SOURCES.md`](data/SOURCES.md)

Phase 3 extends the Phase 1+2 static HTML/CSS/JS app served by a thin Cloudflare Worker (`wrangler.toml` assets + `src/worker.js` audit hit). The Worker name and route are unchanged.

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

**If a critical source fetch or schema breaks:** `scripts/download-raw.sh` exits 1 when a critical URL fails (unless `MIG_ALLOW_PARTIAL=1`). `scripts/ingest.mjs` prints `SCHEMA ERROR` and exits 1 without overwriting `catalog.json` if a required file, sheet, or series is missing or too short. Optional files only warn. The registry and this contract live in [`data/sources.json`](data/sources.json) (`howRefreshWorks`).

Large Home Office detail workbooks are fetched for local inspection but gitignored. The committed catalog is built from the summary tables listed in `data/SOURCES.md`. Cited fiscal comparison figures (not official mapped series) are in [`data/fiscal-citations.json`](data/fiscal-citations.json).

## Deploy

GitHub → Workers Builds should use this repo’s `wrangler.toml`:

- `name = "migration"`
- `account_id = "f027194dcc0be7e3812e673468bab58d"`
- route `migration.cybush.uk/*` on `cybush.uk`
- `[assets] directory = "./public"`
- `AUDIT_HITS` dataset `cybush`

Build command: `npm run build` (manifest + geo + ingest). Critical raw files are committed; if a required sheet/column cannot be parsed the build fails and the previous catalog is left in place. Optional downloads (Nomis zips, RM011) only warn.

## Deep-link contract

Refresh and share restore explorer state from the query string:

| Param | Values |
| --- | --- |
| `layer` | Catalog layer id (`p1-mye-total`, `p1-cob-stock`, `p3-emigration`, `p1-fiscal-notes`, `p2-identity-compare`, …) |
| `year` | Integer year on the slider |
| `geo` | `nation` · `region` (ITL1) · `la` · or a feature code (`E` / `E12000007` / `TLL` / `E06000001`) |
| `metric` | Series id on the selected layer (`share-non-uk`, `share-non-british`, `pct-white`, …) |

Example: `https://migration.cybush.uk/?layer=p1-cob-stock&year=2021&geo=region&metric=share-non-uk`

## What Phase 3 adds

- **Fiscal assumptions panel** — filters cited MAC / OBR / Migration Observatory / Dustmann–Frattini figures by static vs dynamic, average vs marginal, public-goods allocation, and who is counted. Every card has a source and method note. The UI never averages them into one “true” net cost.
- **Data as of / provenance** — header stamp plus `catalog.provenance` (manifest SHA-256s, ingest warnings). OGL link kept on the sources page.
- **Emigration** as a first-class layer (`p3-emigration`) and the default metric on Migration flows.
- **Asylum** default chart is claims, grants, refusals, and awaiting (plus Asy_02a / Asy_03a extras from the same HO summary).
- **Detections** — small-boat vs other IER_01 methods as separate series. Terminology: detections ≠ illegal stock.
- **Context charts** on the fiscal panel: EMP06 employment by country of birth and by nationality; housing affordability remains on the labour layer.

Honest gaps still remaining: no migrant-specific ASHE wage series; no Scotland 2022 / NISRA census splice onto the 2021 APS stocks; RM011 age-by-birthplace only if that optional CSV downloaded and parsed; no invented irregular population.

## What Phase 2 already showed

| Layer | Extract years | Map |
| --- | --- | --- |
| Mid-year population | 1838–2025 (UK/nations from 1971; GB wartime ad hoc 1937–) | Nations where a figure exists |
| Immigration / emigration / net | IPS-era 1964–2015 and admin LTIM YE Dec 2012–2025 | National series only; emigration also has `p3-emigration` |
| UK-born / non-UK-born (country of birth) | APS YE June 2021; census LA % 2011 & 2021 | Nations & ITL1 in 2021; E&W LAs 2011 & 2021 |
| Nationality (British / non-British) | APS YE June 2021 Table 2.1 | Nations, ITL1, LAs (sample-size limited) |
| Identity compare | Same three 2021 questions, side by side | Never labelled “native” |
| Ethnicity | E&W 2011 & 2021 high-level groups | E&W nations; 2021 ITL1 (sum of published LA counts); 2021 LAs |
| Religion | E&W 2011 & 2021 | Same |
| Age–sex | Mid-2025 pyramids | England / E&W (regions in the table) |
| Births by mother’s country of birth | E&W 2008–2025 (1969+ exists historically; not in this workbook) | E&W |
| Asylum | UK 2010–2025 people / decisions / awaiting | National series only |
| Small-boat / illegal-entry **detections** | 2018–2025 | National series only |
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

- No comparable UK ethnicity question before 1991; this extract has E&W 2011/2021 only.
- Modern religion affiliation starts 2001; this extract has E&W 2011/2021.
- IPS-era and admin-based LTIM are drawn as separate series. Do not splice them.
- Small-boat figures are detections, not an irregular population.
- The fiscal panel reprints MAC model outputs and cites OBR / Migration Observatory / Dustmann–Frattini (and the briefing’s Table 1 comparison studies). It is not an official mapped cost and it does not invent a single net figure.

Licence for most official files: [Open Government Licence v3.0](https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/).
