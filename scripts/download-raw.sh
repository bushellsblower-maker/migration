#!/usr/bin/env bash
# Download OGL official files listed in data/SOURCES.md
set -uo pipefail
FAILED=0
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
RAW="$ROOT/data/raw"
UA="MigrationExplorer/0.1 (research; OGL reuse; +https://migration.cybush.uk)"
mkdir -p "$RAW/ons" "$RAW/ho" "$RAW/mac" "$RAW/geo" "$RAW/nomis"

dl() {
  local dest="$1" url="$2"
  if [[ -s "$dest" ]]; then
    echo "exists $(du -h "$dest" | cut -f1) $dest"
    return 0
  fi
  echo "GET $url"
  if curl -fL --retry 3 --retry-delay 2 -A "$UA" -o "$dest.part" "$url"; then
    mv "$dest.part" "$dest"
    echo "OK $(du -h "$dest" | cut -f1) $dest"
  else
    rm -f "$dest.part"
    echo "FAIL $dest"
    FAILED=1
    return 1
  fi
}

# ONS mid-year population time series (nations)
dl "$RAW/ons/pop.csv" \
  "https://www.ons.gov.uk/file?uri=/peoplepopulationandcommunity/populationandmigration/populationestimates/datasets/populationestimatestimeseriesdataset/current/pop.csv"

dl "$RAW/ons/ukpop.csv" \
  "https://www.ons.gov.uk/generator?format=csv&uri=/peoplepopulationandcommunity/populationandmigration/populationestimates/timeseries/ukpop/pop"

dl "$RAW/ons/ew-pop-1838-2025.xlsx" \
  "https://www.ons.gov.uk/file?uri=/peoplepopulationandcommunity/populationandmigration/populationestimates/datasets/estimatesofthepopulationforenglandandwales/englandandwalespopulationestimates1838to2025/ewpopulationestimates18382025.xlsx"

dl "$RAW/ons/regional-pop-1971-2023.xlsx" \
  "https://www.ons.gov.uk/file?uri=/peoplepopulationandcommunity/populationandmigration/populationestimates/datasets/estimatesofthepopulationforenglandandwales/regionalpopulationestimatesforenglandandwales1971to2023editionofthisdataset/regionalpopestimatesenglandandwales19712023.xlsx"

dl "$RAW/ons/mye25tablesew.xlsx" \
  "https://www.ons.gov.uk/file?uri=/peoplepopulationandcommunity/populationandmigration/populationestimates/datasets/estimatesofthepopulationforenglandandwales/mid20252023localauthorityboundaries/mye25tablesew.xlsx"

# LTIM
dl "$RAW/ons/ltim-1964-2015.xls" \
  "https://www.ons.gov.uk/file?uri=/peoplepopulationandcommunity/populationandmigration/internationalmigration/adhocs/006408longterminternationalmigrationintoandoutoftheukbycitizenship1964to2015/migrationtimelinedatasheetsv1.4december2016.xls"

dl "$RAW/ons/ltim-flows-may2026.xlsx" \
  "https://www.ons.gov.uk/file?uri=/peoplepopulationandcommunity/populationandmigration/internationalmigration/datasets/longterminternationalimmigrationemigrationandnetmigrationflowsprovisional/yearendingdecember2025/may2026publicationspreadsheet.xlsx"

dl "$RAW/ons/births-parents-cob-2025.xlsx" \
  "https://www.ons.gov.uk/file?uri=/peoplepopulationandcommunity/birthsdeathsandmarriages/livebirths/datasets/parentscountryofbirth/2025/2025birthbyparentscountry.xlsx"

dl "$RAW/ons/aps-cob-nationality-2021.xls" \
  "https://www.ons.gov.uk/file?uri=/peoplepopulationandcommunity/populationandmigration/internationalmigration/datasets/populationoftheunitedkingdombycountryofbirthandnationality/july2020tojune2021/populationbycountryofbirthandnationalityjul20tojun21.xls"

dl "$RAW/ons/ltim-fig02.xlsx" \
  "https://www.ons.gov.uk/visualisations/dvc3538/fig02/datadownload.xlsx"

# Labour / housing
dl "$RAW/ons/emp06aug2026.xls" \
  "https://www.ons.gov.uk/file?uri=/employmentandlabourmarket/peopleinwork/employmentandemployeetypes/datasets/employmentbycountryofbirthandnationalityemp06/current/emp06aug2026.xls"

dl "$RAW/ons/housing-affordability.xlsx" \
  "https://www.ons.gov.uk/file?uri=/peoplepopulationandcommunity/housing/datasets/ratioofhousepricetoworkplacebasedearningslowerquartileandmedian/current/aff1ratioofhousepricetoworkplacebasedearnings.xlsx"

# Census visualisation extracts (OGL)
dl "$RAW/ons/census-ethnicity-grouped.xlsx" \
  "https://www.ons.gov.uk/visualisations/dvc2203/groupedbarchart/datadownload.xlsx"

dl "$RAW/ons/census-ethnicity-map.xlsx" \
  "https://www.ons.gov.uk/visualisations/dvc2203/map/datadownload.xlsx"

dl "$RAW/ons/census-religion-fig1.xlsx" \
  "https://www.ons.gov.uk/visualisations/dvc2206/fig1/datadownload.xlsx"

dl "$RAW/ons/census-religion-fig2.xlsx" \
  "https://www.ons.gov.uk/visualisations/dvc2206/fig2/datadownload.xlsx"

dl "$RAW/ons/census-cob-fig1.xlsx" \
  "https://www.ons.gov.uk/visualisations/dvc2201/Figure_1/datadownload.xlsx"

dl "$RAW/ons/census-cob-fig4.xlsx" \
  "https://www.ons.gov.uk/visualisations/dvc2201/Figure_4/datadownload.xlsx"

dl "$RAW/ons/births-cob-map.xlsx" \
  "https://www.ons.gov.uk/visualisations/dvc3090/map/datadownload.xlsx"

# Home Office
dl "$RAW/ho/asylum-summary-jun-2026.ods" \
  "https://assets.publishing.service.gov.uk/media/6a85c315b0504df9f2c89800/asylum-summary-jun-2026-tables.ods"

dl "$RAW/ho/illegal-entry-summary-jun-2026.ods" \
  "https://assets.publishing.service.gov.uk/media/6a8c11c3a8f84a582b84281a/illegal-entry-routes-to-the-uk-summary-jun-2026-tables.ods"

dl "$RAW/ho/illegal-entry-dataset-jun-2026.xlsx" \
  "https://assets.publishing.service.gov.uk/media/6a85c41d3d82f78d5c514551/illegal-entry-routes-to-the-uk-dataset-jun-2026.xlsx"

dl "$RAW/ho/asylum-claims-jun-2026.xlsx" \
  "https://assets.publishing.service.gov.uk/media/6a85c2d7c9205b515d421eeb/asylum-claims-datasets-jun-2026.xlsx"

dl "$RAW/ho/asylum-awaiting-jun-2026.xlsx" \
  "https://assets.publishing.service.gov.uk/media/6a85c2bcb0504df9f2c897ff/asylum-claims-awaiting-decision-datasets-jun-2026.xlsx"

# MAC fiscal tables
dl "$RAW/mac/fiscal_report_ods_tables.checked.ods" \
  "https://assets.publishing.service.gov.uk/media/69ba8a09530e305110e7f5e1/fiscal_report_ods_tables.checked.ods"

# Nomis Census 2021 higher-geography extracts
dl "$RAW/nomis/census2021-ts012-extra.zip" \
  "https://www.nomisweb.co.uk/output/census/2021/census2021-ts012-extra.zip" || true
dl "$RAW/nomis/census2021-ts021-extra.zip" \
  "https://www.nomisweb.co.uk/output/census/2021/census2021-ts021-extra.zip" || true
dl "$RAW/nomis/census2021-ts030-extra.zip" \
  "https://www.nomisweb.co.uk/output/census/2021/census2021-ts030-extra.zip" || true

# Compact UK NUTS1 / region geometry (derived from OS OpenData / Eurostat; cite in SOURCES)
dl "$RAW/geo/nuts1.json" \
  "https://raw.githubusercontent.com/martinjc/UK-GeoJSON/master/json/eurostat/uk/nuts1.json" || true

echo "DONE (failed=$FAILED)"
ls -lh "$RAW"/ons "$RAW"/ho "$RAW"/mac "$RAW"/geo "$RAW"/nomis 2>/dev/null || true
exit 0
