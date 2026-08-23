# UniTools World Recipes — open dataset

501 home-cooking recipes from 127 countries in Russian and English: per-serving nutrition for every dish, minutes on every step, and ingredient scaling rules that behave the way a kitchen does (meat scales linearly with servings, salt and spices are damped).

**Licence: [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/)** — free to use, commercially included. Credit "UniTools — theunitools.com" and share derivatives under the same licence.

## Download

The canonical files live on the site and are always the current version:

- **JSON** (full dataset, ~2.6 MB): https://theunitools.com/data/unitools-recipes-v1.json
- **CSV** (one dish per row): https://theunitools.com/data/unitools-recipes-v1.csv
- Dataset page: https://theunitools.com/en/data

This repository holds the documentation, a small `sample.json` for a quick look at the structure, and a committed copy of all four data files so you can `git clone` the dataset or pin a specific revision. The copies here are kept in step with the canonical files above; both are version 1.1.0.

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

- `slug`, `url`, `country` — identity and the live page for the dish
- `name`, `summary` — `{ ru, en }` objects
- `nativeName` — the dish's name in its own language, when it has one
- `category`, `diets`, `difficulty`
- `baseServings`, `prepMinutes`, `cookMinutes` — two separate fields. **Total time is `prepMinutes` + `cookMinutes`.** `prepMinutes` is hands-on preparation (chopping, measuring); `cookMinutes` is time on heat and is `0` for the 18 no-cook dishes such as guacamole, pesto or kibbeh nayyeh. The same two values are the `prep_minutes` and `cook_minutes` columns in the CSV.
- `nutritionPerServing` — `{ calories, protein, fat, carbs }`
- `ingredients[]` — `{ id, name, quantity, unit, scaling, note }`; `scaling` is `linear` | `sublinear` | `fixed`
- `steps[]` — `{ text, minutes }`
- `photo` — `{ url, author, license }` or `null`

## Honest caveats

- Nutrition is computed from ingredients, not measured in a lab — a planning reference, not medical data.
- The dataset is maintained by one person. If you find a mistake, open an issue — the fix lands in the next version.

## Attribution

> Recipe data: [UniTools](https://theunitools.com/en/data), CC BY-SA 4.0

Photos carry their own Commons licences — author and licence sit in each dish's `photo` field.
