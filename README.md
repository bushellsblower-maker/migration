# Migration

Evidence-led explorer of UK population and migration, as published — not as argued.

- Live: https://migration.cybush.uk
- Worker: `migration` on zone `cybush.uk` (`migration.cybush.uk/*`)
- Source inventory: [`docs/inventory.md`](docs/inventory.md)
- Downloaded files: [`data/SOURCES.md`](data/SOURCES.md)

Phase 1 is a static HTML/CSS/JS app served by a thin Cloudflare Worker (same pattern as other Cybush HTML apps: `wrangler.toml` assets + `src/worker.js` audit hit).

## Principles

- No invented statistics. Every plotted number is copied from a downloaded official file.
- UK-born is not nationality and is not White British.
- Detected arrivals are not a stock of people without permission.
- Fiscal estimates are methods and ranges, not one “cost”.
- Years and places without a comparable published series are marked **no comparable data**. Nothing is interpolated to fill a gap.

## Run locally

```bash
npm install
npm run build          # ingest data/raw → public/data/catalog.json
npm run preview        # static: http://127.0.0.1:8788
# or
npm start              # wrangler dev (Worker + assets)
```

`npm run build` is the ingest step (not a JS bundler). The browser loads `public/index.html`, `public/app.js`, `public/app.css`, `public/data/catalog.json`, and `public/geo/uk-nations.geojson`.

Re-download official extracts (resume-safe; some URLs are vintage-specific):

```bash
npm run download
npm run build
```

Large Home Office detail workbooks are fetched for local inspection but gitignored. The committed catalog is built from the summary tables listed in `data/SOURCES.md`.

## Deploy

GitHub → Workers Builds should use this repo’s `wrangler.toml`:

- `name = "migration"`
- `account_id = "f027194dcc0be7e3812e673468bab58d"`
- route `migration.cybush.uk/*` on `cybush.uk`
- `[assets] directory = "./public"`
- `AUDIT_HITS` dataset `cybush`

Build command: `npm run build` (regenerates the catalog from `data/raw`). If the raw workbooks are not present on the build machine, the committed `public/data/catalog.json` still serves.

## What Phase 1 shows

| Layer | Extract years | Map |
| --- | --- | --- |
| Mid-year population | 1838–2025 (UK/nations from 1971; GB wartime ad hoc 1937–) | Nations where a figure exists |
| Immigration / emigration / net | IPS-era 1964–2015 and admin LTIM YE Dec 2012–2025 | National series only |
| UK-born / non-UK-born | APS YE June 2021; census LA % 2011 & 2021 | Nations in 2021; LA table for census years |
| Ethnicity | E&W 2011 & 2021 high-level groups | E&W percentage on England and Wales |
| Religion | E&W 2011 & 2021 | Same |
| Age–sex | Mid-2025 pyramids | England / E&W (regions in the table) |
| Births by mother’s country of birth | E&W 2008–2025 (1969+ exists historically; not in this workbook) | E&W |
| Asylum | UK 2010–2025 people / decisions / awaiting | National series only |
| Small-boat / illegal-entry **detections** | 2018–2025 | National series only |
| Labour / housing context | EMP06 rates 1997–; affordability ratios | Affordability on E/W/regions |
| Contested fiscal panel | MAC 2025 Figure 10 / Table 11 + method notes | No choropleth |

The map is the four UK nations (Natural Earth 50m subunits). English-region and local-authority figures appear in the area table where the source file has them. A clean historic ITL1/LA GeoJSON series was not available to download in this pass; the UI does not invent one.

## Sources and limitations

See the on-page **Sources and limitations** section and `data/SOURCES.md`.

Notable honesty constraints (from the inventory):

- No comparable UK ethnicity question before 1991; this extract has E&W 2011/2021 only.
- Modern religion affiliation starts 2001; this extract has E&W 2011/2021.
- IPS-era and admin-based LTIM are drawn as separate series. Do not splice them.
- Small-boat figures are detections, not an irregular population.
- The fiscal panel reprints MAC model outputs and cites OBR / Migration Observatory / Dustmann–Frattini. It is not an official mapped cost.

Licence for most official files: [Open Government Licence v3.0](https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/).
