# Raw data provenance

All numeric series in this repository are copied from published official files.
Nothing in `data/raw` was typed from memory.

Licence: most files are Crown copyright, reusable under the
[Open Government Licence v3.0](https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/).

Re-download:

```bash
bash scripts/download-raw.sh
npm run build
```

| File | Producer | Source URL | Used for |
| --- | --- | --- | --- |
| `ons/pop.csv` | ONS | [Population estimates time series](https://www.ons.gov.uk/peoplepopulationandcommunity/populationandmigration/populationestimates/datasets/populationestimatestimeseriesdataset) | UK/nation MYE 1971–2025 |
| `ons/ukpop.csv` | ONS | [UKPOP time series](https://www.ons.gov.uk/peoplepopulationandcommunity/populationandmigration/populationestimates/timeseries/ukpop/pop) | UK MYE confirmation |
| `ons/ew-pop-1838-2025.xlsx` | ONS | [E&W population estimates 1838–2025](https://www.ons.gov.uk/peoplepopulationandcommunity/populationandmigration/populationestimates/datasets/estimatesofthepopulationforenglandandwales) | E&W/England historical stock; age–sex |
| `ons/regional-pop-1971-2023.xlsx` | ONS | Same dataset family, regional edition | English regions + Wales 1981–2023 |
| `ons/gb-pop-1937-2014.xls` | ONS | [GB MYE 1937–2014 ad hoc](https://www.ons.gov.uk/peoplepopulationandcommunity/populationandmigration/populationestimates/adhocs/004357greatbritainpopulationestimates1937to2014) | GB wartime/early post-war stock |
| `ons/mye25tablesew.xlsx` | ONS | Mid-2025 E&W tables | Age–sex pyramid (latest year) |
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
| `mac/fiscal_report_ods_tables.checked.ods` | MAC | [Fiscal impact of immigration](https://www.gov.uk/government/publications/the-fiscal-impact-of-immigration-in-the-uk) | Contested static estimates (methods panel) |
| `geo/uk-nations.geojson` | Natural Earth 50m subunits | [natural-earth-vector](https://github.com/nvkelso/natural-earth-vector) | Four UK nation polygons |

Large detailed Home Office workbooks are downloaded by the script for local inspection but not committed.
