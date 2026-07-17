# Australian Occupation And Skill Data

## Synced Data

- `raw/osca-structure.xlsx`
  - ABS OSCA 2024 v1.0 structure workbook.
- `raw/osca-category-descriptions.xlsx`
  - ABS OSCA category descriptions workbook.
- `raw/osca-correspondence-tables.xlsx`
  - ABS OSCA / ANZSCO correspondence tables.
- `raw/osca-title-index.xlsx`
  - ABS OSCA principal titles, alternative titles, and specialisations.
- `processed/occupations-osca.json`
  - Parsed 6-digit OSCA occupations for product use.
- `processed/skills-taxonomy.json`
  - Product skill taxonomy seed: ASC core competencies, skill families, tool families, and evidenced skill seed.

## Current Data Position

OSCA is the current Australian-only occupation classification from the Australian Bureau of Statistics. JSA occupation profiles currently remain useful for labour-market signals and ANZSCO-based profile pages.

Australian Skills Classification data is split into:

- Core competencies
- Specialist tasks
- Technology tools

The full ASC specialist task dataset should be imported when available from JSA or another licensed source. Until then, `skills-taxonomy.json` contains the product-level evidenced skill seed used by the UI and scoring model.

## Sync Command

```powershell
node scripts\sync-official-data.js
```

