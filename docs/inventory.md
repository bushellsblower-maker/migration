# UK migration & demographics source inventory

**Project:** Migration  
**Repo:** `bushellsblower-maker/migration`  
**Domain:** https://migration.cybush.uk  
**Coverage intent:** ~1940–present (as available)  
**Compiled:** 2026-09-13 22:15 BST (Europe/London)  
**Phase 6 extract (2026-09-14):** UKDS UV201/UV204/UV205 bulk CSVs were re-probed and remain datastore-pending or not fetchable without a login wall (HTTP 403 from this environment). NRS multivariate bulk zips are OA/parish/island files, not UV council univariate tables. Area Overviews stay. Official E&W sex × age × birthplace is commissioned table CT21_0433 (not an RM011 sex dimension — RM011 is still persons). Scotland Figure 8 and NISRA MS-A31 stay persons. Checksum pins + `source-health.json` + red fail badge. Concordance notes are required; do not silent-conflate E&W / Scotland / NI headings. See `data/SOURCES.md` and `docs/refresh.md`.

**Phase 5 extract (2026-09-14):** Scotland Census 2022 Area Overviews colour the 32 council areas on COB / ethnicity / religion (published UV204 / UV201 / UV205 equivalents — not remapped onto E&W/NI). ONS RM011 persons (not sex) fills E&W age × birthplace; the beta `/csv` API 404s, so the official `download.ons.gov.uk` dataset file is used. Monthly GitHub Actions cron runs `npm run refresh` and stamps `public/data/refresh-status.json`. Concordance notes are required; do not silent-conflate E&W / Scotland / NI headings. UKDS bulk UV CSVs were still datastore-pending. See `data/SOURCES.md` and `docs/refresh.md`.  

## Principles

- Prefer primary statistical producers (ONS, Home Office, NRS, NISRA, National Archives, Bank of England).
- Secondary synthesis (Migration Observatory, Commons Library) labeled as such.
- Do not invent numbers; this inventory describes sources, not estimates.
- Flag contested fiscal/economic impact literature; list methods and opposing findings.
- Use careful terminology for irregular entry: report what is measured (detections), not an unknown stock of people without permission.
- Default reuse licence for most official stats: [OGL v3.0](https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/) — verify each release.

## What cannot be honestly mapped for early decades (~1940–1970s/80s)

| Theme | Gap | Earliest usable |
| --- | --- | --- |
| Ethnicity | No comparable ethnicity question in UK censuses before 1991 (England & Wales / Scotland). Cannot map ethnicity stocks continuously from 1940. | 1991 Census (categories change in 2001, 2011, 2021/22 — breaks in detailed groups). |
| Religion (modern affiliation) | Voluntary religion question only from 2001 Census (E&W, Scotland, NI). 1851 religious worship census is not comparable (attendance/places of worship, not affiliation). | 2001 Census for affiliation; earlier decades not mappable on a consistent affiliation basis. |
| Long-term international migration flows (UN 12-month definition) | No continuous official LTIM/IPS series from 1940. IPS-based estimates from ~1964 (paper) / 1975 (online); comprehensive LTIM from 1991; admin-based LTIM from ~2012 with major method change vs IPS era. | Indicative IPS timeline ~1964+ with strong caveats; comparable modern LTIM from 1991; admin-based series from YE June 2012 (provisional/revisable). |
| UK-born vs non-UK-born / nationality stocks (survey) | APS/LFS country-of-birth and nationality series start ~2000–2004. Census birthplace exists historically but geographies, classifications, and UK/overseas groupings change; wartime and Empire/Commonwealth definitions differ. | Census birthplace tables from 19th/early 20th century (Vision of Britain / census reports) for coarse UK vs overseas; modern APS stocks from 2004 (LFS back to ~2000). |
| Asylum applications/grants/backlog | Modern Home Office published asylum time series are strong from late 20th century onward (Control of Immigration / Immigration Statistics). Continuous digital tables denser from ~2000s; backlog/work-in-progress definitions change. | Use Control of Immigration / historical Immigration Statistics for pre-2010; current Immigration system statistics for recent decades. Do not back-cast backlog concepts into 1940–1970s. |
| Irregular / illegal entry / small boats | No honest time series of 'illegal immigration totals' for early decades. Small-boat detection series effectively from 2018; broader irregular detections published as official statistics from 2022. Undetected entries and visa overstays are not comprehensively measured. | Small boats daily/provisional from 2018; irregular/illegal entry routes chapter from Feb 2022. Never present as total irregular population. |
| Fertility by mother's country of birth | Parents' country of birth recorded at birth registration in England & Wales only from April 1969. | 1969+ for E&W; Scotland/NI have separate vital statistics producers with their own start dates for analogous tables. |
| Age–sex by birthplace/nationality (subnational) | Detailed cross-tabs are census-decade products or recent survey/admin research outputs; not available annually for 1940–1990 at LA level. | Census decades (birthplace historically; nationality/passports more recent); APS for national/regional stocks post-2004. |
| Fiscal impact of migration | No primary statistical series; only model-based contested estimates (static vs dynamic; average vs marginal; which public goods allocated). Cannot map a single 'fiscal impact' line from 1940. | Cite study-by-study (Dustmann–Frattini period studies; OBR FRS/EFO scenarios; MAC 2025 lifetime models) with explicit assumptions — never as fact layers without caveats. |
| Wartime population (1940–45) | 1941 Census cancelled. 1939 National Register is civilian snapshot. Mid-year estimates for 1940–47 switch between civilian / home / including forces abroad definitions. | Use ONS/Registrar General historical series with explicit wartime definition flags; do not treat as continuous usual-residence MYE. |

## Phase-1 recommended layers (for Migration HTML app)

1. **UK / nation mid-year population (stock)** (`p1-mye-total`)
   - Sources: `ons-mye`
   - Why: Anchors all rates; long historical coverage with wartime caveats.
2. **Net migration, immigration, emigration (flows)** (`p1-ltim-net`)
   - Sources: `ons-ltim-admin`, `ons-ltim-ips-historical`
   - Why: Core Migration explorer series; must show method breaks (IPS vs admin).
3. **UK-born vs non-UK-born stock** (`p1-cob-stock`)
   - Sources: `census-cob-ew-2021`, `census-cob-scotland-2022`, `census-ni-2021`, `ons-cob-nationality-aps`
   - Why: Census for maps; APS for recent national trends with uncertainty bands.
4. **Ethnicity (census snapshots 1991–2021/22)** (`p1-ethnicity-census`)
   - Sources: `census-ethnicity-ew`, `census-cob-scotland-2022`, `census-ni-2021`
   - Why: No pre-1991 series; concordance notes required.
5. **Religion (census snapshots 2001–2021/22)** (`p1-religion-census`)
   - Sources: `census-religion`
   - Why: Voluntary; nation-specific caveats.
6. **Age–sex structure (MYE pyramids)** (`p1-age-sex`)
   - Sources: `ons-age-sex-mye`
   - Why: Interpretation for dependency and fiscal context.
7. **Births / % to non-UK-born mothers (E&W)** (`p1-births-cob`)
   - Sources: `ons-births-parents-cob`
   - Why: Strong vital-registration series from 1969.
8. **Asylum claims, decisions, awaiting initial decision** (`p1-asylum`)
   - Sources: `ho-immigration-system-stats`
   - Why: Primary HO tables; people vs cases labeling.
9. **Detected small boat / illegal entry route arrivals** (`p1-small-boats`)
   - Sources: `ho-irregular-small-boats`
   - Why: Only as detections; strict terminology in UI.
10. **Employment by COB/nationality + housing affordability context** (`p1-labour-housing`)
   - Sources: `ons-emp-cob-nationality`, `ons-housing-affordability`, `ons-ashe`
   - Why: Context indicators — not causal attribution layers.
11. **Fiscal impact — contested evidence panel (not a single series)** (`p1-fiscal-notes`)
   - Sources: `obr-frs`, `mac-fiscal-2025`, `migobs-fiscal-briefing`, `dustmann-frattini-2014`
   - Why: Show methods and opposing findings; never one number as fact.

---

## Theme 1. Population & net migration / immigration / emigration

### ONS Long-Term International Migration (admin-based LTIM)

- **ID:** `ons-ltim-admin`
- **Producer:** Office for National Statistics *(primary)*
- **Earliest usable year:** 2012
- **Geography:** UK
- **Update frequency:** Twice yearly (end May and end November)
- **License:** Open Government Licence v3.0
- **API / CSV:** ONS website downloads (Excel/CSV via release pages); no single stable public REST API for full LTIM. Prefer release datasets.
- **URLs:**
  - bulletin_collection: https://www.ons.gov.uk/peoplepopulationandcommunity/populationandmigration/internationalmigration
  - qmi: https://www.ons.gov.uk/peoplepopulationandcommunity/populationandmigration/internationalmigration/methodologies/adminbasedlongterminternationalmigrationestimatesqmi
  - technical_user_guide: https://www.ons.gov.uk/peoplepopulationandcommunity/populationandmigration/internationalmigration/methodologies/provisionallongterminternationalmigrationestimatestechnicaluserguide
  - methods: https://www.ons.gov.uk/peoplepopulationandcommunity/populationandmigration/internationalmigration/methodologies/methodstoproduceprovisionallongterminternationalmigrationestimates
- **Known breaks / definition changes:**
  - Pre-2020 IPS-based LTIM vs post-pandemic admin-based methods (HOBI, RAPID, etc.) — not a continuous identical series.
  - EU+/non-EU+/British nationality groupings use different admin sources and methods; EUSS cumulative-stay methods evolving (Nov 2025 updates).
  - Latest ~4 data points provisional and revised when more travel history available; British nationals involve 3- or 9-month forecasting.
- **Confidence notes:** Official statistics in development (not yet accredited). Best current UK net migration flow measure for ~2012–present. Do not splice naively onto IPS LTIM 1991–2010s without a break marker.
- **Measures:** immigration, emigration, net migration, nationality groupings
- **Status as of:** 2026-05 (docs revised May 2026; series to YE Dec 2025 provisional)

### ONS IPS / historical LTIM timeline (pre-admin era)

- **ID:** `ons-ltim-ips-historical`
- **Producer:** Office for National Statistics *(primary)*
- **Earliest usable year:** 1964
- **Geography:** UK
- **Update frequency:** Historical (superseded for current production)
- **License:** Open Government Licence v3.0
- **API / CSV:** XLS ad hoc download for 1964–2015 citizenship timeline; IPS 3-series tables historically from 1975 online.
- **URLs:**
  - ltim_qmi_ips_era: https://www.ons.gov.uk/peoplepopulationandcommunity/populationandmigration/populationestimates/methodologies/longterminternationalmigrationqmi
  - timeline_1964_2015: https://www.ons.gov.uk/peoplepopulationandcommunity/populationandmigration/internationalmigration/adhocs/006408longterminternationalmigrationintoandoutoftheukbycitizenship1964to2015
- **Known breaks / definition changes:**
  - Estimates before 1991 use different methodology than LTIM 1991+.
  - IPS measures intentions (pre-admin) vs admin measures observed behaviour.
  - COVID IPS suspension broke continuity and accelerated admin transformation.
- **Confidence notes:** Use for long-run charts with clear discontinuity annotations at 1991 and ~2012/2020 method shifts. Online IPS from 1975; 1964–74 mainly paper/archival.
- **Measures:** immigration, emigration, net migration, citizenship
- **Status as of:** Historical ad hoc / archived LTIM QMI (IPS era)

### ONS mid-year population estimates (MYE) & time series

- **ID:** `ons-mye`
- **Producer:** Office for National Statistics (with NRS, NISRA for UK compilation) *(primary)*
- **Earliest usable year:** 1838
- **From ~1940:** Long back series exist (UK/GB/E&W). Wartime 1940–47 definitions vary (civilian vs home vs including forces abroad). 1941 Census cancelled; 1939 Register is separate civilian snapshot.
- **Geography:** UK; GB; England; Wales; Scotland; Northern Ireland; English regions; local authorities (modern series denser from 1981/1991)
- **Update frequency:** Annual (with revisions after census rebases)
- **License:** Open Government Licence v3.0
- **API / CSV:** Nomis query/download (CSV/Excel); ONS time series CSV/XLSX; components of change tables include net international migration (method-dependent).
- **URLs:**
  - time_series_dataset: https://www.ons.gov.uk/peoplepopulationandcommunity/populationandmigration/populationestimates/datasets/populationestimatestimeseriesdataset
  - uk_pop_series: https://www.ons.gov.uk/peoplepopulationandcommunity/populationandmigration/populationestimates/timeseries/ukpop
  - uk_ew_ni_scot_dataset: https://www.ons.gov.uk/peoplepopulationandcommunity/populationandmigration/populationestimates/datasets/populationestimatesforukenglandandwalesscotlandandnorthernireland
  - ew_estimates: https://www.ons.gov.uk/peoplepopulationandcommunity/populationandmigration/populationestimates/datasets/estimatesofthepopulationforenglandandwales
  - gb_1937_2014_adhoc: https://www.ons.gov.uk/peoplepopulationandcommunity/populationandmigration/populationestimates/adhocs/004357greatbritainpopulationestimates1937to2014
  - nomis_la_sya: https://www.nomisweb.co.uk/datasets/pestsyoala
- **Known breaks / definition changes:**
  - Census rebases (e.g. 2021/2022) revise intercensal years.
  - Wartime population definition breaks 1939–1948.
  - LA boundary changes over time; Nomis modern LA series commonly from 1991.
- **Confidence notes:** Core stock layer for the app. International migration component of change should be labeled with the migration method era. Mid-2025 UK total reported as provisional/rounded in recent releases.
- **Measures:** usually resident population, age, sex, components of change

### Bank of England — A Millennium of Macroeconomic Data (population context)

- **ID:** `boe-millennium`
- **Producer:** Bank of England *(primary)*
- **Earliest usable year:** 1086
- **From ~1940:** Useful long-run population/macro context through ~2016 (v3.1); not a migration-flow source.
- **Geography:** UK / historical GB aggregations (variable definitions over centuries)
- **Update frequency:** Research dataset (not routinely updated like official MYE)
- **License:** Check BoE research dataset terms on page (research reuse; not ONS OGL by default)
- **API / CSV:** Excel download from BoE research datasets page.
- **URLs:**
  - research_datasets: https://www.bankofengland.co.uk/statistics/research-datasets
- **Known breaks / definition changes:**
  - Historical reconstruction; variable definitions across centuries.
- **Confidence notes:** Secondary to ONS MYE for post-1940 official population. Good for ultra-long context charts only.
- **Measures:** population (historical macro)

### A Vision of Britain through Time (GB Historical GIS)

- **ID:** `vision-of-britain`
- **Producer:** University of Portsmouth / GB Historical GIS *(secondary synthesis)*
- **Earliest usable year:** 1801
- **Geography:** England; Wales; Scotland; historical administrative units down to parish/LA equivalents
- **Update frequency:** Project site (historical)
- **License:** See site terms; much census-derived content; cite GBHGIS/University of Portsmouth
- **API / CSV:** Web atlas and data pages; UK Data Service GB Historical Database for research downloads.
- **URLs:**
  - home: https://www.visionofbritain.org.uk/
  - atlas: https://www.visionofbritain.org.uk/atlas/
  - census_reports: https://www.visionofbritain.org.uk/census/
  - data: https://www.visionofbritain.org.uk/data/
- **Known breaks / definition changes:**
  - Administrative geography changes; census questions change.
- **Confidence notes:** Best for historical birthplace maps and long-run local population before modern Nomis geographies. Label as historical GIS synthesis of census reports.
- **Measures:** population, age structure, birthplace (historical)

### Migration Observatory — Net migration to the UK (briefing)

- **ID:** `migobs-net-migration`
- **Producer:** Migration Observatory *(secondary synthesis)*
- **Earliest usable year:** 2000
- **Geography:** UK
- **Update frequency:** Periodic
- **License:** Cite with attribution
- **API / CSV:** None
- **URLs:**
  - briefing: https://migrationobservatory.ox.ac.uk/resources/briefings/long-term-international-migration-flows-to-and-from-the-uk/
- **Known breaks / definition changes:**
  - Explains ONS method changes for users.
- **Confidence notes:** Secondary explainer for UI methodology tooltips.
- **Measures:** synthesis


## Theme 2. UK-born vs non-UK-born; nationality

### ONS Population of the UK by country of birth and nationality (APS/LFS)

- **ID:** `ons-cob-nationality-aps`
- **Producer:** Office for National Statistics *(primary)*
- **Earliest usable year:** 2000
- **Coverage note:** LFS-based ~2000–2003; APS-based 2004 to YE June 2021 in main bulletin series; later ad hoc/grouped estimates may appear — check latest release notes. Household survey: excludes most communal establishments.
- **Geography:** UK; countries; regions; local authorities (sample-size limited)
- **Update frequency:** Historically quarterly then annual; main series paused/changed after YE June 2021 quality issues
- **License:** Open Government Licence v3.0
- **API / CSV:** ONS datasets accompanying bulletins (Excel/CSV).
- **URLs:**
  - latest_bulletin: https://www.ons.gov.uk/peoplepopulationandcommunity/populationandmigration/internationalmigration/bulletins/ukpopulationbycountryofbirthandnationality/latest
  - qmi: https://www.ons.gov.uk/peoplepopulationandcommunity/populationandmigration/internationalmigration/methodologies/populationbycountryofbirthandnationalityqmi
- **Known breaks / definition changes:**
  - COVID interviewing mode change biased non-UK-born/non-British representation; reweighting/RTI adjustments applied.
  - APS totals ≠ MYE totals (household vs whole population).
  - Main publication series ends YE June 2021; treat post-2021 stock estimates cautiously unless from a documented successor product.
- **Confidence notes:** Primary modern stock source for UK/non-UK born and British/non-British — with survey uncertainty and coverage limits. Prefer Census for detailed LA stocks in census years.
- **Measures:** country of birth, nationality, UK-born, non-UK-born

### Census 2021 England & Wales — country of birth / passports / national identity (Nomis)

- **ID:** `census-cob-ew-2021`
- **Producer:** Office for National Statistics *(primary)*
- **Earliest usable year:** 2021
- **Historical note:** Country of birth asked in censuses for well over a century; categories and overseas groupings change. Ethnicity from 1991; religion from 2001; passports held more recent.
- **Geography:** England; Wales; down to Output Area / LA / region
- **Update frequency:** Decennial (2021)
- **License:** Open Government Licence v3.0
- **API / CSV:** Nomis bulk ZIP CSV; Nomis API for many tables.
- **URLs:**
  - bulk: https://www.nomisweb.co.uk/sources/census_2021_bulk
  - ts012_cob_detailed: https://www.nomisweb.co.uk/datasets/c2021ts012
  - story_of_census: https://www.ons.gov.uk/visualisations/storyofthecensus/
- **Known breaks / definition changes:**
  - Census-to-census classification changes; Scotland census in 2022 not 2021.
- **Confidence notes:** Gold-standard stock snapshot for E&W March 2021. Combine with Scotland 2022 and NI 2021 carefully (different dates).
- **Measures:** country of birth, passports held, national identity

### Scotland’s Census 2022 — country of birth / national identity

- **ID:** `census-cob-scotland-2022`
- **Producer:** National Records of Scotland *(primary)*
- **Earliest usable year:** 2022
- **Geography:** Scotland; council areas; smaller census geographies
- **Update frequency:** Decennial (2022; delayed from 2021)
- **License:** Open Government Licence v3.0 (typical for NRS census outputs — confirm on release)
- **API / CSV:** Scotland’s Census data search / published tables (CSV/Excel).
- **URLs:**
  - eilr_report: https://www.scotlandscensus.gov.uk/2022-reports/scotland-s-census-2022-ethnic-group-national-identity-language-and-religion/
  - search: https://www.scotlandscensus.gov.uk/search-the-census
- **Known breaks / definition changes:**
  - One year later than E&W/NI 2021 — UK-wide 2021 maps need Scotland 2022 or interpolated caveat.
- **Confidence notes:** Primary for Scotland stocks. Non-UK-born share rose 7.0% (2011) to 10.2% (2022) per NRS report — cite report, do not hardcode as app 'truth' without source stamp.
- **Measures:** country of birth, national identity, ethnic group, religion

### NISRA Census 2021 Northern Ireland — country of birth / ethnicity / religion

- **ID:** `census-ni-2021`
- **Producer:** Northern Ireland Statistics and Research Agency *(primary)*
- **Earliest usable year:** 2021
- **Geography:** Northern Ireland; LGDs; smaller geographies
- **Update frequency:** Decennial
- **License:** Open Government Licence v3.0 (confirm on NISRA pages)
- **API / CSV:** NISRA Flexible Table Builder; Excel downloads (e.g. MS-A18 country of birth).
- **URLs:**
  - census_hub: https://www.nisra.gov.uk/statistics/census/census-2021
  - main_stats_supplemental: https://www.nisra.gov.uk/publications/census-2021-main-statistics-northern-ireland-supplemental
- **Known breaks / definition changes:**
  - Religion questions differ from E&W (community background concepts historically important in NI).
- **Confidence notes:** Primary for NI. Religion and 'religion brought up in' are NI-specific analytic staples.
- **Measures:** country of birth, ethnic group, religion, national identity


## Theme 3. Ethnicity (Census + mid-year estimates if any)

### Census ethnicity — England & Wales (1991–2021)

- **ID:** `census-ethnicity-ew`
- **Producer:** Office for National Statistics *(primary)*
- **Earliest usable year:** 1991
- **Geography:** England; Wales; LA / OA
- **Update frequency:** Decennial
- **License:** Open Government Licence v3.0
- **API / CSV:** Nomis CSV/API; Ethnicity Facts & Figures republishes selected series.
- **URLs:**
  - ts022: https://www.nomisweb.co.uk/datasets/c2021ts022
  - bulk: https://www.nomisweb.co.uk/sources/census_2021_bulk
  - ethnic_groups_style: https://www.ethnicity-facts-figures.service.gov.uk/style-guide/ethnic-groups
  - history_blog: https://history.blog.gov.uk/2019/03/07/50-years-of-collecting-ethnicity-data/
- **Known breaks / definition changes:**
  - 1991 first ethnicity question; 2001 added Mixed; Chinese moved categories 2001→2011; write-in detail expands 2021.
  - Detailed groups not comparable across all censuses without concordance.
- **Confidence notes:** No honest ethnicity time series before 1991. Between censuses, survey/admin research estimates exist but are not full accredited annual MYE-by-ethnicity for all years.
- **Measures:** ethnic group

### ONS population estimates by ethnic group (research / characteristics methods)

- **ID:** `ons-ethnicity-estimates-research`
- **Producer:** Office for National Statistics *(primary)*
- **Earliest usable year:** 2016
- **Coverage note:** Research/illustrative methods aligning APS to MYE; not a continuous certified annual national statistics product for all years 1991–present.
- **Geography:** UK / England & Wales LA (method-dependent)
- **Update frequency:** Ad hoc / research outputs
- **License:** Open Government Licence v3.0
- **API / CSV:** Accompanying research datasets when published.
- **URLs:**
  - methodology: https://www.ons.gov.uk/peoplepopulationandcommunity/populationandmigration/populationestimates/methodologies/populationestimatesbyethnicgroup
  - research_report: https://www.ons.gov.uk/peoplepopulationandcommunity/populationandmigration/populationestimates/methodologies/researchreportonpopulationestimatesbycharacteristics
- **Known breaks / definition changes:**
  - Method experiments; not equivalent to census.
- **Confidence notes:** Use only with 'research/experimental' labeling. Prefer census for map layers.
- **Measures:** ethnic group aligned to MYE (research)


## Theme 4. Religion

### Census religion (voluntary) — UK nations

- **ID:** `census-religion`
- **Producer:** ONS / NRS / NISRA *(primary)*
- **Earliest usable year:** 2001
- **Geography:** England & Wales; Scotland; Northern Ireland; subnational
- **Update frequency:** Decennial
- **License:** Open Government Licence v3.0
- **API / CSV:** Nomis / Scotland’s Census / NISRA downloads.
- **URLs:**
  - nomis_bulk_ew: https://www.nomisweb.co.uk/sources/census_2021_bulk
  - scotland_2022_eilr: https://www.scotlandscensus.gov.uk/2022-reports/scotland-s-census-2022-ethnic-group-national-identity-language-and-religion/
  - nisra_supplemental: https://www.nisra.gov.uk/publications/census-2021-main-statistics-northern-ireland-supplemental
  - story_of_census: https://www.ons.gov.uk/visualisations/storyofthecensus/
- **Known breaks / definition changes:**
  - Voluntary question; non-response handling differs (esp. Scotland).
  - 1851 worship census not comparable to modern affiliation.
  - NI religion vs religion brought up in.
- **Confidence notes:** Cannot map modern religion affiliation before 2001. Treat as census snapshots only.
- **Measures:** religion / religious affiliation


## Theme 5. Age and sex structure (by birthplace/nationality if possible)

### MYE by age and sex (+ Nomis single year of age)

- **ID:** `ons-age-sex-mye`
- **Producer:** ONS / NRS / NISRA *(primary)*
- **Earliest usable year:** 1991
- **Coverage note:** National age–sex long before 1991; consistent LA single-year-of-age commonly via Nomis from 1991. Cross-tabs by birthplace/nationality require census or APS.
- **Geography:** UK; nations; regions; LA
- **Update frequency:** Annual
- **License:** Open Government Licence v3.0
- **API / CSV:** Nomis CSV; ONS Excel.
- **URLs:**
  - nomis: https://www.nomisweb.co.uk/datasets/pestsyoala
  - ew_dataset: https://www.ons.gov.uk/peoplepopulationandcommunity/populationandmigration/populationestimates/datasets/estimatesofthepopulationforenglandandwales
- **Known breaks / definition changes:**
  - Boundary changes; census rebases.
- **Confidence notes:** Phase-1 pyramid layer. For birthplace×age use census tables; APS for national estimates with sampling error.
- **Measures:** age, sex, population

### 1939 National Register statistics (wartime civilian age/sex)

- **ID:** `1939-register`
- **Producer:** General Register Office / HMSO (historical) *(primary)*
- **Earliest usable year:** 1939
- **Geography:** UK and Isle of Man (published tables)
- **Update frequency:** One-off wartime register
- **License:** Public domain / Crown historical; digitised copies vary (e.g. Internet Archive)
- **API / CSV:** Scanned report; not a modern API.
- **URLs:**
  - archive_org: https://archive.org/details/b32170130
  - ons_census_story: https://www.ons.gov.uk/visualisations/storyofthecensus/
- **Known breaks / definition changes:**
  - Civilian only; not usual-residence MYE; 1941 Census cancelled.
- **Confidence notes:** Bridge for late-1930s structure only. Do not extend as migration stock.
- **Measures:** age, sex, marital condition


## Theme 6. Birth rates / fertility (esp. by mother's country of birth)

### ONS Births by parents’ country of birth, England and Wales

- **ID:** `ons-births-parents-cob`
- **Producer:** Office for National Statistics *(primary)*
- **Earliest usable year:** 1969
- **Coverage note:** Parents' country of birth recorded at registration since April 1969. From 2025 releases, country-of-birth content integrated into broader Births in England and Wales datasets.
- **Geography:** England; Wales; regions/LA in detailed tables
- **Update frequency:** Annual
- **License:** Open Government Licence v3.0
- **API / CSV:** ONS datasets: Birth registrations; Linked births; Parents' country of birth (Excel/CSV).
- **URLs:**
  - births_latest: https://www.ons.gov.uk/peoplepopulationandcommunity/birthsdeathsandmarriages/livebirths/bulletins/birthsummarytablesenglandandwales/latest
  - parents_cob_2023_bulletin: https://www.ons.gov.uk/peoplepopulationandcommunity/birthsdeathsandmarriages/livebirths/bulletins/parentscountryofbirthenglandandwales/2023
  - nomis_life_events: https://www.nomisweb.co.uk/
- **Known breaks / definition changes:**
  - Country coding lists evolve.
  - Birthplace ≠ ethnicity and ≠ long-term migrant status.
  - Scotland/NI published by NRS/NISRA separately.
- **Confidence notes:** Best primary series for share of births to non-UK-born mothers in E&W from 1969. Fertility rates need consistent population denominators (MYE).
- **Measures:** live births, TFR/ASFR, mother/father country of birth


## Theme 7. Asylum applications, grants, refusals, backlog/status

### Home Office Immigration system statistics (asylum)

- **ID:** `ho-immigration-system-stats`
- **Producer:** Home Office *(primary)*
- **Earliest usable year:** 1979
- **Coverage note:** Modern quarterly Immigation system statistics; historical Control of Immigration / Asylum Statistics / Immigration statistics historical data for earlier years. Continuous digital detail denser from 2000s. Backlog/WIP definitions change; people vs cases focus has shifted in recent chapters.
- **Geography:** UK (national); some support data by UK region/LA
- **Update frequency:** Quarterly (plus transparency data)
- **License:** Open Government Licence v3.0
- **API / CSV:** ODS/Excel detailed datasets (Asy_D01 claims, Asy_D02 decisions, Asy_D03 awaiting decision, etc.). Migration transparency data for operational WIP tables (e.g. ASY_03).
- **URLs:**
  - collection: https://www.gov.uk/government/collections/migration-statistics
  - data_tables: https://www.gov.uk/government/statistical-data-sets/immigration-system-statistics-data-tables
  - asylum_backlog_chapter_example: https://www.gov.uk/government/statistics/immigration-system-statistics-year-ending-june-2026/how-many-people-are-in-the-uk-asylum-system
  - claims_chapter_example: https://www.gov.uk/government/statistics/immigration-system-statistics-year-ending-december-2025/how-many-people-claim-asylum-in-the-uk
  - historic_asylum_datasets: https://www.gov.uk/government/statistical-data-sets/asylum-and-resettlement-datasets
  - transparency: https://www.gov.uk/government/collections/migration-statistics
  - commons_library: https://commonslibrary.parliament.uk/research-briefings/sn01403/
- **Known breaks / definition changes:**
  - Applications vs people (main applicants + dependants).
  - Initial decision grant rates exclude withdrawals/admin outcomes depending on table.
  - Total asylum 'work in progress' (appeals/removals) publication lag/gaps (e.g. latest full WIP noted to June 2024 in mid-2020s chapters).
  - Policy regime changes (e.g. Illegal Migration Act effects on decision pausing) affect stocks.
- **Confidence notes:** Authoritative for asylum system throughput. Always label people vs cases. Commons Library SN01403 is useful secondary synthesis.
- **Measures:** asylum claims, initial decisions, grants, refusals, awaiting decision, appeals, support

### Migration Observatory — Asylum in the UK / asylum backlog briefings

- **ID:** `migobs-asylum`
- **Producer:** Migration Observatory *(secondary synthesis)*
- **Earliest usable year:** see notes / confirm on release
- **Geography:** UK
- **Update frequency:** Periodic
- **License:** Cite with attribution
- **API / CSV:** None
- **URLs:**
  - asylum: https://migrationobservatory.ox.ac.uk/resources/briefings/asylum-in-the-uk/
  - briefings_index: https://migrationobservatory.ox.ac.uk/resources/briefings/
- **Confidence notes:** Secondary synthesis for narrative; numbers from HO.
- **Measures:** synthesis


## Theme 8. Irregular / illegal entry / small boats / detections

### Home Office illegal entry routes / irregular migration & small boat detections

- **ID:** `ho-irregular-small-boats`
- **Producer:** Home Office *(primary)*
- **Earliest usable year:** 2018
- **Coverage note:** Small boat provisional daily series from 1 Jan 2018; irregular/illegal entry routes official statistics chapter from Feb 2022 (terminology evolved from 'irregular migration' to 'illegal entry routes' in later releases).
- **Geography:** UK (Channel/operational); national totals
- **Update frequency:** Quarterly official stats; provisional daily/weekly operational updates
- **License:** Open Government Licence v3.0
- **API / CSV:** Immigration system statistics irregular/illegal entry datasets; daily HTML/CSV-like tables on GOV.UK.
- **URLs:**
  - user_guide: https://www.gov.uk/government/publications/home-office-irregular-migration-to-the-uk-statistics-user-guide/home-office-irregular-migration-to-the-uk-statistics-user-guide
  - chapter_example: https://www.gov.uk/government/statistics/immigration-system-statistics-year-ending-december-2025/how-many-people-come-to-the-uk-via-illegal-entry-routes
  - daily_weekly: https://www.gov.uk/government/publications/migrants-detected-crossing-the-english-channel-in-small-boats/migrants-detected-crossing-the-english-channel-in-small-boats-last-7-days
  - ons_measuring_illegal: https://www.ons.gov.uk/peoplepopulationandcommunity/populationandmigration/internationalmigration/articles/measuringillegalmigrationanewwayforward/july2019
- **Known breaks / definition changes:**
  - Counts DETECTIONS not unique individuals necessarily; not undetected arrivals; not visa overstays; not French preventions (published separately).
  - Small boats most visible → detection bias vs other methods; do not infer relative attempt volumes across methods.
  - Provisional daily figures can differ from quality-assured quarterly stats.
- **Confidence notes:** CRITICAL UX: UI must say 'detected small boat arrivals' / 'detected illegal entry routes', never 'illegal immigrant population'. Home Office explicitly does not estimate stock without permission.
- **Measures:** small boat detections, other detected illegal entry methods, asylum claims from small boat arrivals

### Migration Observatory — People crossing the English Channel in small boats (briefing)

- **ID:** `migobs-small-boats`
- **Producer:** Migration Observatory, COMPAS, University of Oxford *(secondary synthesis)*
- **Earliest usable year:** 2018
- **Geography:** UK
- **Update frequency:** Updated briefings (periodic)
- **License:** Check Migration Observatory site terms; usually free to read/cite with attribution
- **API / CSV:** None (synthesis of Home Office stats).
- **URLs:**
  - briefing: https://migrationobservatory.ox.ac.uk/resources/briefings/people-crossing-the-english-channel-in-small-boats/
- **Known breaks / definition changes:**
  - Inherits HO detection definitions.
- **Confidence notes:** Excellent plain-language secondary layer for methodology caveats; always link through to HO primary tables for numbers.
- **Measures:** synthesis of detections and asylum outcomes


## Theme 9. Fiscal / economic impact estimates (contested)

### OBR Fiscal risks and sustainability / EFO — migration scenarios

- **ID:** `obr-frs`
- **Producer:** Office for Budget Responsibility *(primary)*
- **Earliest usable year:** 2011
- **Coverage note:** Long-term fiscal projections with net migration variants; age-profile tax/spend arithmetic. Not a micro estimate of 'immigrants' fiscal balance by visa. Assumptions change with ONS population projections (e.g. 2024 FRS vs 2025/2026 FRS migration settles).
- **Geography:** UK
- **Update frequency:** FRS roughly annual/periodic; EFO biannual
- **License:** Open Government Licence v3.0 (typical Crown)
- **API / CSV:** OBR chart data / supplementary tables on release pages when provided.
- **URLs:**
  - frs_july_2026: https://obr.uk/frs/fiscal-risks-and-sustainability-july-2026/
  - frs_2024_pdf: https://obr.uk/docs/dlm_uploads/Fiscal-risks-and-sustainability-report-September-2024-1.pdf
  - frs_2025_pdf: https://obr.uk/docs/dlm_uploads/Fiscal-risks-and-sustainability-report-July-2025.pdf
  - migration_box_historical: https://obr.uk/box/migration-and-fiscal-sustainability/
- **Known breaks / definition changes:**
  - Central net migration assumption jumps with ONS projections (e.g. ~129k vs ~315k vs ~230k long-run settles across FRS vintages).
  - Often assumes migrants have similar age-specific fiscal profiles to residents unless scenario varies earnings/length of stay.
  - Does not fully cost asylum backlog/system operational spikes in all vintages.
- **Confidence notes:** Contested interpretation: higher net migration usually improves modelled debt path via working-age inflows but does not 'solve' ageing; long-run debt still rises under many baselines. Present as model scenarios.
- **Methods:** Age-specific tax and spend profiles applied to ONS population projections; sensitivity on earnings and length of stay in some FRS editions.
- **Opposing / contested findings:** Results sensitive to migrant earnings mix, dependants, return migration, and public-goods allocation; zero/low migration worsens long-run debt arithmetic but is not a welfare analysis.
- **Measures:** net migration variants, debt/deficit paths, dependency ratio

### Migration Advisory Committee — Fiscal impact of immigration (2025)

- **ID:** `mac-fiscal-2025`
- **Producer:** Migration Advisory Committee / Home Office publication *(primary)*
- **Earliest usable year:** 2025
- **Coverage note:** Static (arrival year) and dynamic (lifetime NPV) estimates for specific visa cohorts (e.g. Skilled Worker 2022/23; Partner route in Annual Report 2025).
- **Geography:** UK
- **Update frequency:** Ad hoc reports
- **License:** Open Government Licence v3.0
- **API / CSV:** ODS data tables published alongside report (Mar 2026 update noted on GOV.UK).
- **URLs:**
  - report: https://www.gov.uk/government/publications/the-fiscal-impact-of-immigration-in-the-uk
  - annual_report_2025: https://www.gov.uk/government/publications/migration-advisory-committee-annual-report-2025/migration-advisory-committee-mac-annual-report-2025-accessible
- **Known breaks / definition changes:**
  - Cohort- and route-specific; not whole migrant stock; discount rate and lifetime assumptions drive NPV.
- **Confidence notes:** Shows large positive lifetime NPV for some skilled main applicants and negative for some dependants/partner routes — illustrates heterogeneity. Contested if used as a single headline for 'immigration'.
- **Methods:** In-house static + dynamic lifetime fiscal model; earnings, employment conditions of visa, public service use, discounting (~3%).
- **Opposing / contested findings:** Lifetime estimates (Dustmann–Frattini) and OBR age-profile approaches can differ in sign/magnitude depending on group, period, and cost allocation.
- **Measures:** static fiscal impact, lifetime NPV by visa route

### Dustmann & Frattini (2014) — The Fiscal Effects of Immigration to the UK

- **ID:** `dustmann-frattini-2014`
- **Producer:** Academic (Economic Journal / CReAM)
- **Earliest usable year:** 1995
- **Coverage note:** Static period analysis ~1995–2011/12; EEA vs non-EEA distinctions influential in debate.
- **Geography:** UK
- **Update frequency:** One-off academic study (widely cited)
- **License:** Journal / author copyright — cite, do not republish full text
- **API / CSV:** None for app ingestion; cite findings qualitatively or with permissioned extracts.
- **URLs:**
  - ideas_repec: https://ideas.repec.org/a/wly/econjl/v124y2014i580pf593-f643.html
- **Known breaks / definition changes:**
  - Static framework; period-specific; subsequent demographic/policy change.
- **Confidence notes:** Foundational reference often contrasted with later dynamic/lifetime models. Present as one study, not official statistics.
- **Methods:** Static accounting of revenues and expenditures attributable to immigrants vs natives over years.
- **Opposing / contested findings:** Critics dispute public-goods allocation, household composition, and extrapolation beyond study window; later MAC/OBR work uses different frames.
- **Measures:** net fiscal contribution by immigrant groups over study window

### Migration Observatory — The fiscal impact of immigration in the UK (briefing)

- **ID:** `migobs-fiscal-briefing`
- **Producer:** Migration Observatory, University of Oxford *(secondary synthesis)*
- **Earliest usable year:** see notes / confirm on release
- **Geography:** UK
- **Update frequency:** Updated briefings
- **License:** Cite with attribution; check site
- **API / CSV:** None
- **URLs:**
  - briefing: https://migrationobservatory.ox.ac.uk/resources/briefings/the-fiscal-impact-of-immigration-in-the-uk/
- **Known breaks / definition changes:**
  - Synthesis of OBR/MAC/academic literature.
- **Confidence notes:** Best secondary explainer that there is no single correct estimate; maps assumption space for the app's methodology notes.
- **Methods:** Evidence review of static vs dynamic; average vs marginal; skill/visa heterogeneity.
- **Opposing / contested findings:** Explicitly documents conflicting study results and assumption dependence.
- **Measures:** literature synthesis


## Theme 10. Employment/wages/housing context indicators

### ONS employment by country of birth and nationality (EMP06 / A12 / LMS)

- **ID:** `ons-emp-cob-nationality`
- **Producer:** Office for National Statistics *(primary)*
- **Earliest usable year:** 1997
- **Coverage note:** LFS-based; series availability varies by exact table. EMP06 and A12 current quarterly datasets.
- **Geography:** UK
- **Update frequency:** Quarterly
- **License:** Open Government Licence v3.0
- **API / CSV:** ONS CSV/XLS downloads; LMS time series.
- **URLs:**
  - emp06: https://www.ons.gov.uk/employmentandlabourmarket/peopleinwork/employmentandemployeetypes/datasets/employmentbycountryofbirthandnationalityemp06/current
  - a12: https://www.ons.gov.uk/employmentandlabourmarket/peopleinwork/employmentandemployeetypes/datasets/a12employmentunemploymentandeconomicinactivitybynationalityandcountryofbirth/current
  - uk_born_emp_level: https://www.ons.gov.uk/employmentandlabourmarket/peopleinwork/employmentandemployeetypes/timeseries/jf6f/lms
- **Known breaks / definition changes:**
  - LFS volatility and reweighting (esp. post-COVID); sample uncertainty for subgroups.
- **Confidence notes:** Core labour-market context by UK/non-UK birth and nationality. Pair with caveats on LFS quality.
- **Measures:** employment level/rate, unemployment, inactivity, by COB/nationality

### ONS Annual Survey of Hours and Earnings (ASHE)

- **ID:** `ons-ashe`
- **Producer:** Office for National Statistics *(primary)*
- **Earliest usable year:** 1997
- **Geography:** UK; nations; regions; LA (some estimates)
- **Update frequency:** Annual
- **License:** Open Government Licence v3.0
- **API / CSV:** ONS ASHE datasets.
- **URLs:**
  - bulletin_2025: https://www.ons.gov.uk/employmentandlabourmarket/peopleinwork/earningsandworkinghours/bulletins/annualsurveyofhoursandearnings/2025
- **Known breaks / definition changes:**
  - SOC 2010 → SOC 2020 break around 2021 earnings estimates.
- **Confidence notes:** Wage context; not migrant-specific in headline tables (use with EMP06 and academic/MAC earnings analyses).
- **Measures:** median/mean earnings

### ONS Housing affordability (house price to earnings ratios)

- **ID:** `ons-housing-affordability`
- **Producer:** Office for National Statistics *(primary)*
- **Earliest usable year:** 1997
- **Geography:** England; Wales; regions; LA
- **Update frequency:** Annual
- **License:** Open Government Licence v3.0
- **API / CSV:** House price to workplace-based / residence-based earnings ratio datasets.
- **URLs:**
  - bulletin_2025: https://www.ons.gov.uk/peoplepopulationandcommunity/housing/bulletins/housingaffordabilityinenglandandwales/2025
  - qmi: https://www.ons.gov.uk/peoplepopulationandcommunity/housing/methodologies/housingaffordabilityinenglandandwalesqmi
- **Known breaks / definition changes:**
  - Transfer from MHCLG method to ONS (series reconstructed); prices are transactions not stock.
- **Confidence notes:** Interpretation aid for housing pressure — not a causal migration impact measure. Scotland/NI separate producers.
- **Measures:** median price to earnings ratio

### MHCLG Dwelling stock estimates (England)

- **ID:** `mhclg-dwelling-stock`
- **Producer:** Ministry of Housing, Communities and Local Government *(primary)*
- **Earliest usable year:** see notes / confirm on release
- **Coverage note:** Long England dwelling stock series; census-baseline + net additions. Confirm earliest year on release technical notes.
- **Geography:** England; LA
- **Update frequency:** Annual
- **License:** Open Government Licence v3.0
- **API / CSV:** GOV.UK statistical tables.
- **URLs:**
  - latest: https://www.gov.uk/government/statistics/dwelling-stock-estimates-in-england-2025/dwelling-stock-estimates-england-31-march-2025
- **Known breaks / definition changes:**
  - Tenure measurement methods; Wales/Scotland/NI separate.
- **Confidence notes:** Housing supply context layer.
- **Measures:** dwelling stock by tenure


## Terminology guardrails (Theme 8)

- Prefer **detected arrivals** / **detected illegal entry routes** / **small boat detections**.
- Do **not** label HO series as total irregular/illegal population or undetected entries.
- Separate **French preventions** (operational) from **UK detections**.
- Visa overstays and Common Travel Area entries are largely outside these detection series.

## File outputs

- `inventory.md` — this document
- `inventory.json` — machine-readable copy for the Migration app ingest
