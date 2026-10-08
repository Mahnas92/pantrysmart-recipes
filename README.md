# UniTools World Recipes — open dataset

501 home-cooking recipes from 127 countries in Russian and English: per-serving nutrition for every dish, minutes on every step, and ingredient scaling rules that behave the way a kitchen does (meat scales linearly with servings, salt and spices are damped).

**Licence: [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/)** — free to use, commercially included. Credit "UniTools — theunitools.com" and share derivatives under the same licence.

## Download

The canonical files live on the site and are always the current version:

- **JSON** (full dataset, ~2.6 MB): https://theunitools.com/data/unitools-recipes-v1.json
- **CSV** (one dish per row): https://theunitools.com/data/unitools-recipes-v1.csv
- Dataset page: https://theunitools.com/en/data

This repository holds the documentation, a small `sample.json` for a quick look at the structure, and a committed copy of all four data files so you can `git clone` the dataset or pin a specific revision. The copies here are kept in step with the canonical files above; both are version 2.0.0 — see the [changelog](#changelog).

The full licence text is in [LICENSE](LICENSE). Note it is CC BY-SA 4.0 — a content licence, not an OSI-approved software licence, because this repository is data rather than code.

## Second dataset: oven cooking times

The same repo also documents **UniTools Oven Cooking Times** — oven temperatures, practical time ranges, safe internal minimums and rest times for **200 products**, each with primary sources (FoodSafety.gov/FSIS charts, King Arthur, manufacturer package directions) and a confidence level.

- **JSON** (~216 KB): https://theunitools.com/data/unitools-cooking-times-v1.json
- **CSV** (one product per row): https://theunitools.com/data/unitools-cooking-times-v1.csv

Same licence, same attribution rules as the recipes dataset.

## What is inside

| | |
|---|---|
| Recipes | 501 |
| Countries | 127 |
| Languages | Russian + English, each written natively, not machine-translated |
| Ingredients | ~1,500 unique, with stable ids |
| Steps | 3,000+ with minutes on each |
| Nutrition | calories, protein, fat, carbs per serving — on every dish |
| Photos | Wikimedia Commons, human-reviewed, author + licence per photo |

## Recipe fields

- `slug`, `country` — identity of the dish and its country code (the per-dish `url` was removed in 2.0.0, see the changelog)
- `name`, `summary` — `{ ru, en }` objects
- `nativeName` — the dish's name in its own language, when it has one
- `category`, `diets`, `difficulty`
- `baseServings`, `prepMinutes`, `cookMinutes` — two separate fields. **Total time is `prepMinutes` + `cookMinutes`.** `prepMinutes` is hands-on preparation (chopping, measuring); `cookMinutes` is time on heat and is `0` for the 18 no-cook dishes such as guacamole, pesto or kibbeh nayyeh. The same two values are the `prep_minutes` and `cook_minutes` columns in the CSV.
- `nutritionPerServing` — `{ calories, protein, fat, carbs }`
- `ingredients[]` — `{ id, name, quantity, unit, scaling, note }`; `scaling` is `linear` | `sublinear` | `fixed`
- `steps[]` — `{ text, minutes }`
- `photo` — `{ url, author, license }` or `null`

## Stable addresses

Other projects build on these files, so the following addresses are kept working. If one ever has to move, it will answer with a permanent redirect (301), never with 404 or 410:

- the dataset pages https://theunitools.com/en/data and https://theunitools.com/ru/data — the address to credit;
- the four data files under `https://theunitools.com/data/`, including the `-v1` file names, which stay the same across versions;
- every photo address in the recipes' `photo.url` field (`https://theunitools.com/recipes/<slug>.jpg`).

## Changelog

- **2.0.0** (generated 2026-09-02, copied here 2026-09-26). Removed the per-recipe `url` field and the per-product `url` field of the cooking-times file: the individual recipe pages and cooking guides on theunitools.com were retired on 2026-08-30, and those addresses answer 410 Gone. The recipes file gains a `landingPage` field, and both files keep `homepage` — one live address for everything: https://theunitools.com/en/data. The `url` column is gone from both CSV files as well. Belgium's English country name corrected from "Belgian cuisine" to "Belgium". Every other value is unchanged: 501 recipes, 127 countries, 200 products. The major version went up because a field was removed — if your code reads `url`, drop it or use `homepage` instead.
- **1.1.0** (2026-08-23). Rebuilt from the recipes as corrected up to 2026-08-20; among other fixes, kibbeh nayyeh no longer duplicated the baked kibbeh record.
- **1.0.0** (2026-08-06). First release.

## Honest caveats

- Nutrition is computed from ingredients, not measured in a lab — a planning reference, not medical data.
- The dataset is maintained by one person. If you find a mistake, open an issue — the fix lands in the next version.

## Attribution

> Recipe data: [UniTools](https://theunitools.com/en/data), CC BY-SA 4.0

Photos carry their own Commons licences — author and licence sit in each dish's `photo` field.

## Database updater

The `Update recipe database` workflow is currently **manual-only** while
STRATO access is configured as SFTP-only. GitHub-hosted runners cannot reach
the STRATO MySQL server directly, and SFTP transfers files but does not provide
a way to run the import on the server. Automatic push-triggered runs are
disabled until an execution route is configured.

To enable automatic updates, create an **SFTP + SSH** access in the STRATO
customer login (**Datenbanken und Webspace → SFTP & SSH**). SSH provides the
terminal access needed to run the MySQL import. Once that access is available,
the workflow can upload the validated import and run it on STRATO.

When run manually from **Actions → Update recipe database → Run workflow**,
the current workflow validates and generates a full-replacement SQL import,
then attempts a direct MySQL connection. With GitHub-hosted runners blocked
from MySQL, that database step fails without changing data.

Each successful mirror replaces all rows in the `ps_*` recipe tables, so
removed recipes and related records are removed from the database. Table
definitions are preserved, and the workflow verifies row counts after import.

**Recipe repository (`mahnas92/pantrysmart-recipes`):** Configure these
repository Actions secrets under **Settings → Secrets and variables → Actions**:

- `STRATO_DB_HOST` — the database server hostname shown in the hosting panel
- `STRATO_DB_NAME` — the database name
- `STRATO_DB_USER` — the database username
- `STRATO_DB_PASSWORD` — the database password

The separate **Test STRATO database connection** workflow remains available
for a non-writing `SELECT 1` connectivity check.
