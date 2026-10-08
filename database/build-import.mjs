import { readFile, writeFile } from 'node:fs/promises';

const args = process.argv.slice(2);
const replaceExisting = args.at(-1) === '--replace';
const [inputPath, outputPath, ...extraArgs] = replaceExisting ? args.slice(0, -1) : args;

if (!inputPath || !outputPath || extraArgs.length > 0) {
    console.error('Usage: node database/build-import.mjs <dataset.json> <output.sql> [--replace]');
    process.exit(1);
}

function assert(condition, message) {
    if (!condition) {
        throw new Error(message);
    }
}

function requireString(value, field, allowEmpty = false) {
    assert(typeof value === 'string', `${field} must be a string.`);
    assert(allowEmpty || value.length > 0, `${field} must not be empty.`);
    return value;
}

function requireNumber(value, field, nullable = false) {
    if (nullable && value === null) {
        return 'NULL';
    }

    assert(typeof value === 'number' && Number.isFinite(value), `${field} must be a finite number.`);
    assert(value >= 0, `${field} must not be negative.`);
    return String(value);
}

function requireTranslations(value, field, languages, nullable = false) {
    if (nullable && value === null) {
        return value;
    }

    assert(value !== null && typeof value === 'object' && !Array.isArray(value), `${field} must be an object.`);
    const actualLanguages = Object.keys(value).sort();
    assert(
        actualLanguages.length === languages.length
            && actualLanguages.every((language, index) => language === languages[index]),
        `${field} must contain exactly these languages: ${languages.join(', ')}.`
    );

    for (const language of languages) {
        if (nullable && value[language] === null) {
            continue;
        }
        requireString(value[language], `${field}.${language}`, nullable);
    }

    return value;
}

function sqlString(value, field, nullable = false) {
    if (nullable && value === null) {
        return 'NULL';
    }

    return `'${requireString(value, field, nullable).replaceAll("'", "''")}'`;
}

function insertRows(table, columns, rows, keyColumns) {
    if (rows.length === 0) {
        return '';
    }

    const mutableColumns = columns.filter((column) => !keyColumns.includes(column));
    if (mutableColumns.length === 0) {
        mutableColumns.push(keyColumns[0]);
    }
    const updateClause = mutableColumns
        .map((column) => `\`${column}\` = VALUES(\`${column}\`)`)
        .join(', ');
    const statements = [];

    for (let offset = 0; offset < rows.length; offset += 100) {
        const batch = rows.slice(offset, offset + 100);
        const values = batch.map((row) => `(${row.join(', ')})`).join(',\n');
        statements.push(
            `INSERT INTO \`${table}\` (${columns.map((column) => `\`${column}\``).join(', ')})\n`
            + `VALUES\n${values}\n`
            + `ON DUPLICATE KEY UPDATE ${updateClause};`
        );
    }

    return statements.join('\n\n');
}

function validateDataset(dataset) {
    assert(dataset && typeof dataset === 'object', 'Dataset root must be an object.');
    requireString(dataset.version, 'version');
    assert(Array.isArray(dataset.countries) && dataset.countries.length > 0, 'Dataset countries must be a non-empty array.');
    assert(Array.isArray(dataset.recipes) && dataset.recipes.length > 0, 'Dataset recipes must be a non-empty array.');
    requireString(dataset.name, 'name');
    requireString(dataset.homepage, 'homepage');
    requireString(dataset.license, 'license');
    requireString(dataset.licenseUrl, 'licenseUrl');
    requireString(dataset.attribution, 'attribution');
    requireString(dataset.generatedAt, 'generatedAt');

    const languages = Object.keys(dataset.countries[0]?.name ?? {}).sort();
    assert(languages.length > 0, 'Dataset must include translated country names.');
    assert(
        languages.every((language) => /^[a-z]{2}$/.test(language)),
        'Language codes must be two lowercase letters.'
    );

    const countryCodes = new Set();
    for (const country of dataset.countries) {
        requireString(country.code, 'country.code');
        requireString(country.slug, `country ${country.code}.slug`);
        requireTranslations(country.name, `country ${country.code}.name`, languages);
        requireTranslations(country.cuisine, `country ${country.code}.cuisine`, languages);
        assert(!countryCodes.has(country.code), `Duplicate country code ${country.code}.`);
        countryCodes.add(country.code);
    }

    const recipeSlugs = new Set();
    for (const recipe of dataset.recipes) {
        requireString(recipe.slug, 'recipe.slug');
        assert(!recipeSlugs.has(recipe.slug), `Duplicate recipe slug ${recipe.slug}.`);
        recipeSlugs.add(recipe.slug);
        assert(countryCodes.has(recipe.country), `Recipe ${recipe.slug} refers to unknown country ${recipe.country}.`);
        requireTranslations(recipe.name, `recipe ${recipe.slug}.name`, languages);
        requireTranslations(recipe.summary, `recipe ${recipe.slug}.summary`, languages);
        requireString(recipe.category, `recipe ${recipe.slug}.category`);
        requireString(recipe.difficulty, `recipe ${recipe.slug}.difficulty`);
        requireNumber(recipe.baseServings, `recipe ${recipe.slug}.baseServings`);
        requireNumber(recipe.prepMinutes, `recipe ${recipe.slug}.prepMinutes`);
        requireNumber(recipe.cookMinutes, `recipe ${recipe.slug}.cookMinutes`);
        assert(Array.isArray(recipe.diets), `recipe ${recipe.slug}.diets must be an array.`);
        assert(Array.isArray(recipe.ingredients), `recipe ${recipe.slug}.ingredients must be an array.`);
        assert(Array.isArray(recipe.steps), `recipe ${recipe.slug}.steps must be an array.`);
        assert(recipe.nutritionPerServing && typeof recipe.nutritionPerServing === 'object', `recipe ${recipe.slug}.nutritionPerServing must be an object.`);
        for (const nutrient of ['calories', 'protein', 'fat', 'carbs']) {
            requireNumber(recipe.nutritionPerServing[nutrient], `recipe ${recipe.slug}.nutritionPerServing.${nutrient}`);
        }

        if (recipe.nativeName !== null) {
            requireString(recipe.nativeName, `recipe ${recipe.slug}.nativeName`);
        }
        assert(recipe.photo === null || (typeof recipe.photo === 'object' && !Array.isArray(recipe.photo)), `recipe ${recipe.slug}.photo must be an object or null.`);
        if (recipe.photo !== null) {
            requireString(recipe.photo.url, `recipe ${recipe.slug}.photo.url`);
            requireString(recipe.photo.author, `recipe ${recipe.slug}.photo.author`, true);
            requireString(recipe.photo.license, `recipe ${recipe.slug}.photo.license`, true);
        }

        for (const [index, ingredient] of recipe.ingredients.entries()) {
            requireString(ingredient.id, `recipe ${recipe.slug}.ingredients[${index}].id`);
            requireTranslations(ingredient.name, `recipe ${recipe.slug}.ingredients[${index}].name`, languages);
            requireNumber(ingredient.quantity, `recipe ${recipe.slug}.ingredients[${index}].quantity`, true);
            requireString(ingredient.unit, `recipe ${recipe.slug}.ingredients[${index}].unit`);
            requireString(ingredient.scaling, `recipe ${recipe.slug}.ingredients[${index}].scaling`);
            requireTranslations(ingredient.note, `recipe ${recipe.slug}.ingredients[${index}].note`, languages, true);
        }

        for (const [index, step] of recipe.steps.entries()) {
            requireTranslations(step.text, `recipe ${recipe.slug}.steps[${index}].text`, languages);
            requireNumber(step.minutes, `recipe ${recipe.slug}.steps[${index}].minutes`, true);
        }
    }

    return languages;
}

function buildSql(dataset, languages, replace = false) {
    const statements = [];
    const tableOptions = 'ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci';

    statements.push(`-- UniTools World Recipes ${dataset.version}
-- Source: ${dataset.homepage}
-- Licence: ${dataset.license} (${dataset.licenseUrl})
-- Attribution: ${dataset.attribution}
-- Generated by database/build-import.mjs. Tables are never dropped; --replace replaces their rows.
SET NAMES utf8mb4;
SET @pantrysmart_previous_sql_mode = @@SESSION.sql_mode;
SET SESSION sql_mode = IF(
    FIND_IN_SET('NO_BACKSLASH_ESCAPES', @@SESSION.sql_mode) > 0,
    @@SESSION.sql_mode,
    CONCAT_WS(',', NULLIF(@@SESSION.sql_mode, ''), 'NO_BACKSLASH_ESCAPES')
);`);

    statements.push(`CREATE TABLE IF NOT EXISTS \`ps_recipe_dataset\` (
    \`dataset_version\` VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    \`dataset_name\` VARCHAR(160) NOT NULL,
    \`homepage\` VARCHAR(2048) NOT NULL,
    \`license\` VARCHAR(80) NOT NULL,
    \`license_url\` VARCHAR(2048) NOT NULL,
    \`attribution\` VARCHAR(255) NOT NULL,
    \`generated_at\` DATE NOT NULL,
    \`imported_at\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    \`recipe_count\` SMALLINT UNSIGNED NOT NULL,
    \`country_count\` SMALLINT UNSIGNED NOT NULL,
    PRIMARY KEY (\`dataset_version\`)
) ${tableOptions};`);

    statements.push(`CREATE TABLE IF NOT EXISTS \`ps_countries\` (
    \`code\` CHAR(2) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    \`slug\` VARCHAR(100) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    PRIMARY KEY (\`code\`),
    UNIQUE KEY \`uq_ps_countries_slug\` (\`slug\`)
) ${tableOptions};`);

    statements.push(`CREATE TABLE IF NOT EXISTS \`ps_country_translations\` (
    \`country_code\` CHAR(2) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    \`language_code\` CHAR(2) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    \`name\` VARCHAR(255) NOT NULL,
    \`cuisine\` VARCHAR(255) NOT NULL,
    PRIMARY KEY (\`country_code\`, \`language_code\`),
    CONSTRAINT \`fk_ps_country_translation_country\`
        FOREIGN KEY (\`country_code\`) REFERENCES \`ps_countries\` (\`code\`) ON DELETE CASCADE
) ${tableOptions};`);

    statements.push(`CREATE TABLE IF NOT EXISTS \`ps_recipes\` (
    \`slug\` VARCHAR(191) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    \`country_code\` CHAR(2) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    \`native_name\` VARCHAR(255) NULL,
    \`category\` VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    \`difficulty\` VARCHAR(16) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    \`base_servings\` SMALLINT UNSIGNED NOT NULL,
    \`prep_minutes\` SMALLINT UNSIGNED NOT NULL,
    \`cook_minutes\` SMALLINT UNSIGNED NOT NULL,
    \`calories_per_serving\` DECIMAL(8, 2) UNSIGNED NOT NULL,
    \`protein_g_per_serving\` DECIMAL(8, 2) UNSIGNED NOT NULL,
    \`fat_g_per_serving\` DECIMAL(8, 2) UNSIGNED NOT NULL,
    \`carbs_g_per_serving\` DECIMAL(8, 2) UNSIGNED NOT NULL,
    \`photo_url\` VARCHAR(2048) NULL,
    \`photo_author\` VARCHAR(255) NULL,
    \`photo_license\` VARCHAR(100) NULL,
    PRIMARY KEY (\`slug\`),
    KEY \`idx_ps_recipes_country\` (\`country_code\`),
    KEY \`idx_ps_recipes_category\` (\`category\`),
    KEY \`idx_ps_recipes_difficulty\` (\`difficulty\`),
    CONSTRAINT \`fk_ps_recipe_country\`
        FOREIGN KEY (\`country_code\`) REFERENCES \`ps_countries\` (\`code\`)
) ${tableOptions};`);

    statements.push(`CREATE TABLE IF NOT EXISTS \`ps_recipe_translations\` (
    \`recipe_slug\` VARCHAR(191) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    \`language_code\` CHAR(2) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    \`name\` VARCHAR(255) NOT NULL,
    \`summary\` TEXT NOT NULL,
    PRIMARY KEY (\`recipe_slug\`, \`language_code\`),
    KEY \`idx_ps_recipe_translations_name\` (\`language_code\`, \`name\`),
    CONSTRAINT \`fk_ps_recipe_translation_recipe\`
        FOREIGN KEY (\`recipe_slug\`) REFERENCES \`ps_recipes\` (\`slug\`) ON DELETE CASCADE
) ${tableOptions};`);

    statements.push(`CREATE TABLE IF NOT EXISTS \`ps_recipe_diets\` (
    \`recipe_slug\` VARCHAR(191) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    \`diet_code\` VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    PRIMARY KEY (\`recipe_slug\`, \`diet_code\`),
    KEY \`idx_ps_recipe_diets_code\` (\`diet_code\`, \`recipe_slug\`),
    CONSTRAINT \`fk_ps_recipe_diet_recipe\`
        FOREIGN KEY (\`recipe_slug\`) REFERENCES \`ps_recipes\` (\`slug\`) ON DELETE CASCADE
) ${tableOptions};`);

    statements.push(`CREATE TABLE IF NOT EXISTS \`ps_recipe_ingredients\` (
    \`recipe_slug\` VARCHAR(191) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    \`position\` SMALLINT UNSIGNED NOT NULL,
    \`ingredient_id\` VARCHAR(100) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    \`quantity\` DECIMAL(12, 3) UNSIGNED NULL,
    \`unit\` VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    \`scaling\` VARCHAR(20) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    PRIMARY KEY (\`recipe_slug\`, \`position\`),
    KEY \`idx_ps_recipe_ingredients_id\` (\`ingredient_id\`, \`recipe_slug\`),
    CONSTRAINT \`fk_ps_recipe_ingredient_recipe\`
        FOREIGN KEY (\`recipe_slug\`) REFERENCES \`ps_recipes\` (\`slug\`) ON DELETE CASCADE
) ${tableOptions};`);

    statements.push(`CREATE TABLE IF NOT EXISTS \`ps_recipe_ingredient_translations\` (
    \`recipe_slug\` VARCHAR(191) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    \`ingredient_position\` SMALLINT UNSIGNED NOT NULL,
    \`language_code\` CHAR(2) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    \`name\` VARCHAR(255) NOT NULL,
    \`note\` TEXT NULL,
    PRIMARY KEY (\`recipe_slug\`, \`ingredient_position\`, \`language_code\`),
    CONSTRAINT \`fk_ps_recipe_ingredient_translation_ingredient\`
        FOREIGN KEY (\`recipe_slug\`, \`ingredient_position\`)
        REFERENCES \`ps_recipe_ingredients\` (\`recipe_slug\`, \`position\`) ON DELETE CASCADE
) ${tableOptions};`);

    statements.push(`CREATE TABLE IF NOT EXISTS \`ps_recipe_steps\` (
    \`recipe_slug\` VARCHAR(191) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    \`step_number\` SMALLINT UNSIGNED NOT NULL,
    \`minutes\` SMALLINT UNSIGNED NULL,
    PRIMARY KEY (\`recipe_slug\`, \`step_number\`),
    CONSTRAINT \`fk_ps_recipe_step_recipe\`
        FOREIGN KEY (\`recipe_slug\`) REFERENCES \`ps_recipes\` (\`slug\`) ON DELETE CASCADE
) ${tableOptions};`);

    statements.push(`CREATE TABLE IF NOT EXISTS \`ps_recipe_step_translations\` (
    \`recipe_slug\` VARCHAR(191) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    \`step_number\` SMALLINT UNSIGNED NOT NULL,
    \`language_code\` CHAR(2) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    \`text\` TEXT NOT NULL,
    PRIMARY KEY (\`recipe_slug\`, \`step_number\`, \`language_code\`),
    CONSTRAINT \`fk_ps_recipe_step_translation_step\`
        FOREIGN KEY (\`recipe_slug\`, \`step_number\`)
        REFERENCES \`ps_recipe_steps\` (\`recipe_slug\`, \`step_number\`) ON DELETE CASCADE
) ${tableOptions};`);

    statements.push('START TRANSACTION;');

    if (replace) {
        statements.push(`DELETE FROM \`ps_recipe_step_translations\`;
DELETE FROM \`ps_recipe_ingredient_translations\`;
DELETE FROM \`ps_recipe_translations\`;
DELETE FROM \`ps_recipe_diets\`;
DELETE FROM \`ps_recipe_steps\`;
DELETE FROM \`ps_recipe_ingredients\`;
DELETE FROM \`ps_recipes\`;
DELETE FROM \`ps_country_translations\`;
DELETE FROM \`ps_countries\`;
DELETE FROM \`ps_recipe_dataset\`;`);
    }

    const datasetRows = [[
        sqlString(dataset.version, 'version'),
        sqlString(dataset.name, 'name'),
        sqlString(dataset.homepage, 'homepage'),
        sqlString(dataset.license, 'license'),
        sqlString(dataset.licenseUrl, 'licenseUrl'),
        sqlString(dataset.attribution, 'attribution'),
        sqlString(dataset.generatedAt, 'generatedAt'),
        requireNumber(dataset.recipes.length, 'recipe count'),
        requireNumber(dataset.countries.length, 'country count'),
    ]];
    statements.push(insertRows('ps_recipe_dataset', [
        'dataset_version', 'dataset_name', 'homepage', 'license', 'license_url',
        'attribution', 'generated_at', 'recipe_count', 'country_count',
    ], datasetRows, ['dataset_version']));

    const countries = dataset.countries.map((country) => [
        sqlString(country.code, `country ${country.code}.code`),
        sqlString(country.slug, `country ${country.code}.slug`),
    ]);
    statements.push(insertRows('ps_countries', ['code', 'slug'], countries, ['code']));

    const countryTranslations = dataset.countries.flatMap((country) => languages.map((language) => [
        sqlString(country.code, `country ${country.code}.code`),
        sqlString(language, 'language'),
        sqlString(country.name[language], `country ${country.code}.name.${language}`),
        sqlString(country.cuisine[language], `country ${country.code}.cuisine.${language}`),
    ]));
    statements.push(insertRows('ps_country_translations', [
        'country_code', 'language_code', 'name', 'cuisine',
    ], countryTranslations, ['country_code', 'language_code']));

    const recipes = dataset.recipes.map((recipe) => [
        sqlString(recipe.slug, `recipe ${recipe.slug}.slug`),
        sqlString(recipe.country, `recipe ${recipe.slug}.country`),
        sqlString(recipe.nativeName, `recipe ${recipe.slug}.nativeName`, true),
        sqlString(recipe.category, `recipe ${recipe.slug}.category`),
        sqlString(recipe.difficulty, `recipe ${recipe.slug}.difficulty`),
        requireNumber(recipe.baseServings, `recipe ${recipe.slug}.baseServings`),
        requireNumber(recipe.prepMinutes, `recipe ${recipe.slug}.prepMinutes`),
        requireNumber(recipe.cookMinutes, `recipe ${recipe.slug}.cookMinutes`),
        requireNumber(recipe.nutritionPerServing.calories, `recipe ${recipe.slug}.calories`),
        requireNumber(recipe.nutritionPerServing.protein, `recipe ${recipe.slug}.protein`),
        requireNumber(recipe.nutritionPerServing.fat, `recipe ${recipe.slug}.fat`),
        requireNumber(recipe.nutritionPerServing.carbs, `recipe ${recipe.slug}.carbs`),
        sqlString(recipe.photo?.url ?? null, `recipe ${recipe.slug}.photo.url`, true),
        sqlString(recipe.photo?.author ?? null, `recipe ${recipe.slug}.photo.author`, true),
        sqlString(recipe.photo?.license ?? null, `recipe ${recipe.slug}.photo.license`, true),
    ]);
    statements.push(insertRows('ps_recipes', [
        'slug', 'country_code', 'native_name', 'category', 'difficulty',
        'base_servings', 'prep_minutes', 'cook_minutes', 'calories_per_serving',
        'protein_g_per_serving', 'fat_g_per_serving', 'carbs_g_per_serving',
        'photo_url', 'photo_author', 'photo_license',
    ], recipes, ['slug']));

    const recipeTranslations = dataset.recipes.flatMap((recipe) => languages.map((language) => [
        sqlString(recipe.slug, `recipe ${recipe.slug}.slug`),
        sqlString(language, 'language'),
        sqlString(recipe.name[language], `recipe ${recipe.slug}.name.${language}`),
        sqlString(recipe.summary[language], `recipe ${recipe.slug}.summary.${language}`),
    ]));
    statements.push(insertRows('ps_recipe_translations', [
        'recipe_slug', 'language_code', 'name', 'summary',
    ], recipeTranslations, ['recipe_slug', 'language_code']));

    const diets = dataset.recipes.flatMap((recipe) => recipe.diets.map((diet) => [
        sqlString(recipe.slug, `recipe ${recipe.slug}.slug`),
        sqlString(diet, `recipe ${recipe.slug}.diet`),
    ]));
    statements.push(insertRows('ps_recipe_diets', [
        'recipe_slug', 'diet_code',
    ], diets, ['recipe_slug', 'diet_code']));

    const ingredients = dataset.recipes.flatMap((recipe) => recipe.ingredients.map((ingredient, index) => [
        sqlString(recipe.slug, `recipe ${recipe.slug}.slug`),
        requireNumber(index + 1, `recipe ${recipe.slug}.ingredient position`),
        sqlString(ingredient.id, `recipe ${recipe.slug}.ingredient id`),
        requireNumber(ingredient.quantity, `recipe ${recipe.slug}.ingredient quantity`, true),
        sqlString(ingredient.unit, `recipe ${recipe.slug}.ingredient unit`),
        sqlString(ingredient.scaling, `recipe ${recipe.slug}.ingredient scaling`),
    ]));
    statements.push(insertRows('ps_recipe_ingredients', [
        'recipe_slug', 'position', 'ingredient_id', 'quantity', 'unit', 'scaling',
    ], ingredients, ['recipe_slug', 'position']));

    const ingredientTranslations = dataset.recipes.flatMap((recipe) => recipe.ingredients.flatMap((ingredient, index) => languages.map((language) => [
        sqlString(recipe.slug, `recipe ${recipe.slug}.slug`),
        requireNumber(index + 1, `recipe ${recipe.slug}.ingredient position`),
        sqlString(language, 'language'),
        sqlString(ingredient.name[language], `recipe ${recipe.slug}.ingredient name.${language}`),
        sqlString(ingredient.note?.[language] ?? null, `recipe ${recipe.slug}.ingredient note.${language}`, true),
    ])));
    statements.push(insertRows('ps_recipe_ingredient_translations', [
        'recipe_slug', 'ingredient_position', 'language_code', 'name', 'note',
    ], ingredientTranslations, ['recipe_slug', 'ingredient_position', 'language_code']));

    const steps = dataset.recipes.flatMap((recipe) => recipe.steps.map((step, index) => [
        sqlString(recipe.slug, `recipe ${recipe.slug}.slug`),
        requireNumber(index + 1, `recipe ${recipe.slug}.step number`),
        requireNumber(step.minutes, `recipe ${recipe.slug}.step minutes`, true),
    ]));
    statements.push(insertRows('ps_recipe_steps', [
        'recipe_slug', 'step_number', 'minutes',
    ], steps, ['recipe_slug', 'step_number']));

    const stepTranslations = dataset.recipes.flatMap((recipe) => recipe.steps.flatMap((step, index) => languages.map((language) => [
        sqlString(recipe.slug, `recipe ${recipe.slug}.slug`),
        requireNumber(index + 1, `recipe ${recipe.slug}.step number`),
        sqlString(language, 'language'),
        sqlString(step.text[language], `recipe ${recipe.slug}.step text.${language}`),
    ])));
    statements.push(insertRows('ps_recipe_step_translations', [
        'recipe_slug', 'step_number', 'language_code', 'text',
    ], stepTranslations, ['recipe_slug', 'step_number', 'language_code']));

    statements.push(`COMMIT;
SET SESSION sql_mode = @pantrysmart_previous_sql_mode;
SELECT
    (SELECT COUNT(*) FROM \`ps_recipe_dataset\`) AS datasets,
    (SELECT COUNT(*) FROM \`ps_countries\`) AS countries,
    (SELECT COUNT(*) FROM \`ps_country_translations\`) AS country_translations,
    (SELECT COUNT(*) FROM \`ps_recipes\`) AS recipes,
    (SELECT COUNT(*) FROM \`ps_recipe_translations\`) AS recipe_translations,
    (SELECT COUNT(*) FROM \`ps_recipe_diets\`) AS diets,
    (SELECT COUNT(*) FROM \`ps_recipe_ingredients\`) AS ingredients,
    (SELECT COUNT(*) FROM \`ps_recipe_ingredient_translations\`) AS ingredient_translations,
    (SELECT COUNT(*) FROM \`ps_recipe_steps\`) AS steps,
    (SELECT COUNT(*) FROM \`ps_recipe_step_translations\`) AS step_translations;`);
    return `${statements.filter(Boolean).join('\n\n')}\n`;
}

try {
    const input = await readFile(inputPath, 'utf8');
    const dataset = JSON.parse(input);
    const languages = validateDataset(dataset);
    const sql = buildSql(dataset, languages, replaceExisting);
    await writeFile(outputPath, sql, 'utf8');
    const mode = replaceExisting ? 'mirror' : 'upsert';
    console.log(`Generated ${mode} import ${outputPath} for ${dataset.recipes.length} recipes (dataset ${dataset.version}).`);
} catch (error) {
    console.error(`Could not generate recipe import: ${error.message}`);
    process.exitCode = 1;
}
