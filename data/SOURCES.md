# Raw data provenance

All numeric series in this repository are copied from published official files.
Nothing in `data/raw` was typed from memory.

Licence: most files are Crown copyright, reusable under the
[Open Government Licence v3.0](https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/).

Re-download and rebuild:

```bash
npm run refresh          # download + build
npm run refresh:force    # re-fetch + build
```

Critical download or ingest failures exit 1 and do not overwrite `public/data/catalog.json`. See `data/sources.json` → `howRefreshWorks`.

Cited fiscal comparison figures (copied from published studies / the Migration Observatory Table 1, not invented) live in `data/fiscal-citations.json`. MAC Figure 10 / Table 11 / Table 23 are parsed from the MAC ODS.

| File | Producer | Source URL | Used for |
| --- | --- | --- | --- |
| `ons/pop.csv` | ONS | [Population estimates time series](https://www.ons.gov.uk/peoplepopulationandcommunity/populationandmigration/populationestimates/datasets/populationestimatestimeseriesdataset) | UK/nation MYE 1971–2025 |
| `ons/ukpop.csv` | ONS | [UKPOP time series](https://www.ons.gov.uk/peoplepopulationandcommunity/populationandmigration/populationestimates/timeseries/ukpop/pop) | UK MYE confirmation |
| `ons/ew-pop-1838-2025.xlsx` | ONS | [E&W population estimates 1838–2025](https://www.ons.gov.uk/peoplepopulationandcommunity/populationandmigration/populationestimates/datasets/estimatesofthepopulationforenglandandwales) | E&W/England historical stock; age–sex |
| `ons/regional-pop-1971-2023.xlsx` | ONS | Same dataset family, regional edition | English regions + Wales 1981–2023 |
| `ons/gb-pop-1937-2014.xls` | ONS | [GB MYE 1937–2014 ad hoc](https://www.ons.gov.uk/peoplepopulationandcommunity/populationandmigration/populationestimates/adhocs/004357greatbritainpopulationestimates1937to2014) | GB wartime/early post-war stock |
| `ons/mye25tablesew.xlsx` | ONS | Mid-2025 E&W tables | Age–sex pyramid (latest year) |
| `ons/mye24tablesuk.xlsx` | ONS | [UK MYE mid-2024](https://www.ons.gov.uk/peoplepopulationandcommunity/populationandmigration/populationestimates/datasets/populationestimatesforukenglandandwalesscotlandandnorthernireland) | UK/nation age–sex pyramids (mid-2024) |
| `nrs/census2022-eilr-chart-data.xlsx` | NRS / Scotland’s Census | [EILR chart data](https://www.scotlandscensus.gov.uk/documents/scotlands-census-2022-ethnic-group-national-identity-language-and-religion-chart-data/) | Scotland 2022 COB (Figure 8), ethnicity (Figures 4–5), religion (Figure 2), national identity (Figure 9) |
| `nrs/census2022-area-overviews.json` | NRS / Scotland’s Census | [Area Overviews API](https://www.scotlandscensus.gov.uk/search-the-census) (UV201 / UV204 / UV205 published equivalents) | 32 council-area COB, ethnic group, and religion percentages, 2022 |
| `nrs/uv-bulk-status.json` | UKDS / NRS probe | [UKDS UV204](https://statistics.ukdataservice.ac.uk/dataset/scotland-s-census-2022-uv204-country-of-birth) · [NRS multivariate bulk](https://www.scotlandscensus.gov.uk/documents/bulk-download-files-multivariate-data/) | Not a statistics table. Records that UV201/UV204/UV205 bulk CSVs were still pending or login-walled |
| `ons/census-rm011-cob-age.csv` | ONS | [RM011 country of birth by age](https://www.ons.gov.uk/datasets/RM011/editions/2021/versions/1) via [download.ons.gov.uk](https://download.ons.gov.uk/downloads/datasets/RM011/editions/2021/versions/1.csv) | E&W Census 2021 age × birthplace, persons (not sex) |
| `ons/census-ct21-0433-cob-age-sex.xlsx` | ONS | [CT21_0433 sex by age by bespoke country of birth](https://www.ons.gov.uk/peoplepopulationandcommunity/populationandmigration/populationestimates/adhocs/3102ct210433census2021) | E&W Census 2021 male/female × SYOA × birthplace (E&W only; not LA). UK-born = four UK country columns |
| `nrs/vital-events-2024-chapter-3.xlsx` | NRS | [Vital Events Reference Tables 2024, chapter 3](https://www.nrscotland.gov.uk/publications/vital-events-reference-tables-2024/) | Births by mother’s COB (Tables 3.09 council, 3.13 country) |
| `nrs/mye-scotland-2024.xlsx` | NRS | [Mid-2024 population estimates](https://www.nrscotland.gov.uk/publications/mid-2024-population-estimates/) | Council-area name → S12 codes |
| `nisra/census2021-ms-a16-cob.xlsx` | NISRA | [MS-A16](https://www.nisra.gov.uk/publications/census-2021-main-statistics-demography-tables-country-birth) | NI + 11 LGD country of birth |
| `nisra/census2021-ms-a31-cob-age.xlsx` | NISRA | Same collection | NI country of birth by broad age |
| `nisra/census2021-ms-b01-ethnicity.xlsx` | NISRA | [MS-B01](https://www.nisra.gov.uk/publications/census-2021-main-statistics-ethnicity-tables) | NI ethnic group (White excludes Irish Traveller and Roma) |
| `nisra/census2021-ms-b19-religion.xlsx` | NISRA | [MS-B19](https://www.nisra.gov.uk/publications/census-2021-main-statistics-religion-tables) | NI current religion (no standalone Muslim column) |
| `nisra/census2021-ms-b23-religion-brought-up.xlsx` | NISRA | Same collection | Religion brought up in — cited extra only; not mixed into affiliation maps |
| `nisra/census2021-ms-b15-national-identity.xlsx` | NISRA | [MS-B15](https://www.nisra.gov.uk/publications/census-2021-main-statistics-identity-tables) | National identity, not citizenship |
| `nisra/births-tables-2024.xlsx` | NISRA | [RGAR 2024 births](https://www.nisra.gov.uk/publications/registrar-general-annual-report-2024-births) | Table 3.18 mother’s country of birth 2014–2024 |
| `ons/ltim-1964-2015.xls` | ONS | [LTIM 1964–2015 ad hoc](https://www.ons.gov.uk/peoplepopulationandcommunity/populationandmigration/internationalmigration/adhocs/006408longterminternationalmigrationintoandoutoftheukbycitizenship1964to2015) | IPS-era flows (thousands) |
| `ons/ltim-flows-may2026.xlsx` | ONS | [LTIM flows YE Dec 2025](https://www.ons.gov.uk/peoplepopulationandcommunity/populationandmigration/internationalmigration/datasets/longterminternationalimmigrationemigrationandnetmigrationflowsprovisional) | Admin-based LTIM 2012– |
| `ons/ltim-fig02.xlsx` | ONS | Bulletin figure download | Cross-check admin LTIM |
| `ons/aps-cob-nationality-2021.xls` | ONS | [APS YE June 2021](https://www.ons.gov.uk/peoplepopulationandcommunity/populationandmigration/internationalmigration/datasets/populationoftheunitedkingdombycountryofbirthandnationality) | UK-born / non-UK-born stocks + CIs |
| `ons/census-*.xlsx` | ONS | Census 2021 visualisation extracts | Ethnicity, religion, country of birth |
| `ons/births-parents-cob-2025.xlsx` | ONS | [Parents’ country of birth](https://www.ons.gov.uk/peoplepopulationandcommunity/birthsdeathsandmarriages/livebirths/datasets/parentscountryofbirth) | Births by mother’s birthplace 2008–2025 |
| `ons/births-cob-map.xlsx` | ONS | 2023 bulletin figure | Regional share of births, 2016–2022 |
| `ons/emp06aug2026.xls` | ONS | [EMP06](https://www.ons.gov.uk/employmentandlabourmarket/peopleinwork/employmentandemployeetypes/datasets/employmentbycountryofbirthandnationalityemp06/current) | Employment rates by COB |
| `ons/housing-affordability.xlsx` | ONS | [House price to workplace earnings](https://www.ons.gov.uk/peoplepopulationandcommunity/housing/datasets/ratioofhousepricetoworkplacebasedearningslowerquartileandmedian) | Affordability ratios |
| `ho/asylum-summary-jun-2026.ods` | Home Office | [Immigration system statistics tables](https://www.gov.uk/government/statistical-data-sets/immigration-system-statistics-data-tables) | Asylum claims / decisions / awaiting |
| `ho/illegal-entry-summary-jun-2026.ods` | Home Office | Same collection | Detected illegal-entry / small-boat arrivals |
| `mac/fiscal_report_ods_tables.checked.ods` | MAC | [Fiscal impact of immigration](https://www.gov.uk/government/publications/the-fiscal-impact-of-immigration-in-the-uk) | Contested static (Fig 10), public-goods sensitivities (Table 11), lifetime cohort totals (Table 23) |
| `data/fiscal-citations.json` | MAC / OBR / Migration Observatory / Dustmann–Frattini (and Table 1 comparators) | [MigObs briefing](https://migrationobservatory.ox.ac.uk/resources/briefings/the-fiscal-impact-of-immigration-in-the-uk/) | Side-by-side cited estimates; never a single net total |
| `geo/uk-nations.geojson` | Natural Earth 50m subunits | [natural-earth-vector](https://github.com/nvkelso/natural-earth-vector) | Four UK nation polygons |
| `geo/itl1-ons-buc.geojson` | ONS Open Geography | [ITL1 January 2021 UK BUC FeatureServer](https://services1.arcgis.com/ESMARspQHYMw9BZ9/arcgis/rest/services/International_Territorial_Level_1_January_2021_UK_BUC_2022/FeatureServer) · [data.gov.uk](https://www.data.gov.uk/dataset/772cce9d-962b-477f-98bb-7f31dbe8b66a/international-territorial-level-1-january-2021-boundaries-uk-bgc) | 12 ITL1 polygons (ultra-generalised). OGL / OS+ONS IPR. Compact copy: `public/geo/uk-itl1.geojson`. |
| `geo/lad-ons-buc.geojson` | ONS Open Geography | [LAD December 2021 UK BUC FeatureServer](https://services1.arcgis.com/ESMARspQHYMw9BZ9/arcgis/rest/services/Local_Authority_Districts_December_2021_UK_BUC_2022/FeatureServer) · [data.gov.uk](https://www.data.gov.uk/dataset/50fb9e41-01d4-4e12-b5a2-c9add02470a8/local-authority-districts-december-2021-boundaries-uk-buc) | 374 LAD polygons (ultra-generalised, Census 2021 vintage). Compact copy: `public/geo/uk-lad.geojson`. |
| `public/geo/lookups.json` | derived | ONS LAD21 LAT/LONG centroids tested against official ITL1 BUC polygons; W/S/NI LAs by GSS prefix | LAD→ITL1 assignment for honest region roll-ups of published LA counts |

Large detailed Home Office workbooks are downloaded by the script for local inspection but not committed.
