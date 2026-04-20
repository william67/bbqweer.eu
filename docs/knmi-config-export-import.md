# KNMI Config Export / Import

The Beheer menu (gear icon, auth-gated) allows exporting and importing dataset + report configuration as JSON files. This makes configs portable across environments (dev → prod, or into bbqweer.eu).

## What gets exported

One JSON file per dataset, containing:

```json
{
  "version": "1.0",
  "exportedAt": "2026-04-19T12:00:00.000Z",
  "dataset": {
    "id": 3,
    "code": "temperatuur",
    "name": "Temperatuur",
    "category_id": 1,
    "category_code": "meetgegevens",
    "category_name": "Meetgegevens",
    "chartYn": 1,
    "anychart_config": "{...}",
    "chartjs_config": "{...}",
    "sort_order": 10
  },
  "reports": [
    {
      "name": "Temperatuur dag",
      "timebase": "dag",
      "query": "SELECT ...<#SELECTIONS>",
      "input_station": 1,
      "input_jaar": 1,
      "input_maand": 1,
      "input_dag": 0,
      "fieldName_station": "s.code",
      "fieldName_jaar": "YEAR(datum)",
      "fieldName_maand": "MONTH(datum)",
      "fieldName_dag": null,
      "anychart_config": null,
      "chartjs_config": null,
      "sort_order": 10
    }
  ]
}
```

**Not exported**: `id` fields (resolved by `code`/`timebase` on import), `dataset_id` FK.

## How to export

1. Select a dataset in the KNMI data page
2. Open Beheer menu → **Save Config**
3. Downloads `knmi-<dataset-name>-config.json`

Config files are stored in `database/knmi reports/` in the repo (one file per dataset).

## How to import

1. Open Beheer menu → **Load Config**
2. Select a JSON file — import runs immediately

### What happens during import

**Category resolution** (uses `category_code` as business key):
- If `category_code` exists → use that category's id
- If not → auto-create the category, then proceed

**Dataset resolution** (uses `dataset.code` as business key):
- If a dataset with that `code` exists → `PUT /api/knmi-reports/datasets/:id` (update)
- If not → `POST /api/knmi-reports/datasets` (create)

**Report resolution** (uses `timebase` as business key within the dataset):
- If a report with that `timebase` already exists for this dataset → `PUT /api/knmi-reports/reports/:id` (update)
- If not → `POST /api/knmi-reports/reports` (create)

All report upserts run in parallel via `forkJoin`, then datasets are reloaded and the current view re-executes automatically.

## Business keys (portability)

| Object   | Business key               | Why not id?                          |
|----------|----------------------------|--------------------------------------|
| Category | `code`                     | ids differ between dev and prod      |
| Dataset  | `code`                     | ids differ between dev and prod      |
| Report   | `timebase` within dataset  | only one report per timebase allowed |

## Config files in the repo

Stored in `database/knmi reports/`:

| File | Dataset |
|------|---------|
| `knmi-temperatuur-config.json` | Temperatuur (etmgeg/uurgeg) |
| `knmi-neerslag-config.json` | Neerslag (neerslaggeg) |
| `knmi-zonneschijn-config.json` | Zonneschijn (etmgeg) |
| `knmi-sneeuw-config.json` | Sneeuwdek (neerslaggeg, SX field) |

After editing chart config via Beheer → Edit AnyChart/Chart.js, always do **Save Config** and commit the updated JSON so the config is version-controlled.

## Deploying to a new environment

1. Create the KNMI schema and run the DDL
2. Start the app and log in as admin
3. For each config file in `database/knmi reports/`: Beheer → Load Config
4. Categories and datasets are created automatically if missing

## AnyChart config format (`anychart_config`)

Stored as a JSON string on `datasets.anychart_config` or `reports_new.anychart_config` (report-level overrides dataset-level).

Key fields used by `my-knmi-anychart`:

```json
{
  "commonSeriesSettings": {
    "argumentField": "dagLabel",
    "type": "line"
  },
  "title": "Temperatuur",
  "argumentAxis": { "title": "Dag" },
  "valueAxis": {
    "title": "°C",
    "min": -20,
    "max": 40
  },
  "series": [
    {
      "valueField": "TX",
      "name": "Max temp",
      "type": "line",
      "color": "#e74c3c",
      "skipZero": false
    }
  ]
}
```

`skipZero: true` on a series renders `0` values as gaps (null) — used for rain, snow, sunshine where 0 means nothing happened.

Scale supports per-timebase overrides: `monthlyChartMin`, `monthlyChartMax`, `yearlyChartMin`, `yearlyChartMax`, `yearlyMajorTick`, etc.
