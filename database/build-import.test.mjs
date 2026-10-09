import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const generatorPath = fileURLToPath(new URL('./build-import.mjs', import.meta.url));

function dataset(languages) {
    const translations = Object.fromEntries(languages.map((language) => [language, `${language} text`]));
    return {
        name: 'Recipe dataset',
        version: '2.0.0',
        ingredientCatalogVersion: '1.0.0',
        homepage: 'https://example.test/recipes',
        license: 'CC BY-SA 4.0',
        licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/',
        attribution: 'Recipe source',
        generatedAt: '2026-10-08',
        countries: [{
            code: 'SE',
            slug: 'sweden',
            name: translations,
            cuisine: translations,
        }],
        recipes: [{
            slug: 'sample-recipe',
            country: 'SE',
            name: translations,
            summary: translations,
            nativeName: null,
            category: 'main',
            diets: [],
            difficulty: 'easy',
            baseServings: 2,
            prepMinutes: 5,
            cookMinutes: 10,
            nutritionPerServing: {
                calories: 100,
                protein: 5,
                fat: 3,
                carbs: 10,
            },
            ingredients: [{
                id: 'sample',
                name: translations,
                quantity: 1,
                unit: 'piece',
                scaling: 'linear',
                note: null,
            }],
            steps: [{
                text: translations,
                minutes: 5,
            }],
            photo: null,
        }],
    };
}

test('SQL generator includes every source translation language', async (context) => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'pantrysmart-import-'));
    context.after(() => rm(directory, { recursive: true, force: true }));
    const inputPath = path.join(directory, 'recipes.json');
    const outputPath = path.join(directory, 'recipes.sql');
    await writeFile(inputPath, JSON.stringify(dataset(['ar', 'en', 'ru', 'sv'])));

    const result = spawnSync(process.execPath, [generatorPath, inputPath, outputPath], {
        encoding: 'utf8',
    });

    assert.equal(result.status, 0, result.stderr);
    const sql = await readFile(outputPath, 'utf8');
    assert.match(sql, /INSERT INTO `ps_ingredient_catalog_metadata`/);
    assert.match(sql, /\(1, '1\.0\.0'\)/);
    assert.equal(sql.includes('DELETE FROM'), false, 'Default upsert mode must preserve existing rows.');
    for (const language of ['ar', 'en', 'ru', 'sv']) {
        assert.ok(sql.includes(`'${language}'`), `SQL should include ${language} translations.`);
    }
});

test('SQL generator rejects an invalid ingredient catalog version', async (context) => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'pantrysmart-import-'));
    context.after(() => rm(directory, { recursive: true, force: true }));
    const inputPath = path.join(directory, 'recipes.json');
    const outputPath = path.join(directory, 'recipes.sql');
    const input = dataset(['en', 'ru']);
    input.ingredientCatalogVersion = 'catalog-latest';
    await writeFile(inputPath, JSON.stringify(input));

    const result = spawnSync(process.execPath, [generatorPath, inputPath, outputPath], {
        encoding: 'utf8',
    });

    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /ingredientCatalogVersion must be a semantic version/);
});

test('SQL generator rejects inconsistent translation languages', async (context) => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'pantrysmart-import-'));
    context.after(() => rm(directory, { recursive: true, force: true }));
    const inputPath = path.join(directory, 'recipes.json');
    const outputPath = path.join(directory, 'recipes.sql');
    const input = JSON.parse(JSON.stringify(dataset(['en', 'ru', 'sv'])));
    delete input.recipes[0].steps[0].text.sv;
    await writeFile(inputPath, JSON.stringify(input));

    const result = spawnSync(process.execPath, [generatorPath, inputPath, outputPath], {
        encoding: 'utf8',
    });

    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /must contain exactly these languages/);
});

test('replace mode clears recipe rows in foreign-key order inside the import transaction', async (context) => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'pantrysmart-import-'));
    context.after(() => rm(directory, { recursive: true, force: true }));
    const inputPath = path.join(directory, 'recipes.json');
    const outputPath = path.join(directory, 'recipes.sql');
    await writeFile(inputPath, JSON.stringify(dataset(['en', 'ru'])));

    const result = spawnSync(process.execPath, [generatorPath, inputPath, outputPath, '--replace'], {
        encoding: 'utf8',
    });

    assert.equal(result.status, 0, result.stderr);
    const sql = await readFile(outputPath, 'utf8');
    const transactionStart = sql.indexOf('START TRANSACTION;');
    const commit = sql.indexOf('COMMIT;');
    const deleteTables = [
        'ps_recipe_step_translations',
        'ps_recipe_ingredient_translations',
        'ps_recipe_translations',
        'ps_recipe_diets',
        'ps_recipe_steps',
        'ps_recipe_ingredients',
        'ps_recipes',
        'ps_country_translations',
        'ps_countries',
        'ps_recipe_dataset',
    ];
    let previousDelete = transactionStart;

    for (const table of deleteTables) {
        const deletePosition = sql.indexOf(`DELETE FROM \`${table}\`;`);
        assert.ok(deletePosition > previousDelete, `${table} should be cleared in foreign-key order.`);
        previousDelete = deletePosition;
    }

    assert.ok(commit > previousDelete, 'The replacement transaction should commit after all deletes.');
    const firstInsert = sql.indexOf('INSERT INTO `ps_recipe_dataset`');
    assert.ok(firstInsert > previousDelete, 'The new snapshot should be inserted after stale rows are cleared.');
    assert.ok(commit > firstInsert, 'The replacement snapshot should commit only after inserts.');
    assert.equal(sql.includes('DROP TABLE'), false);
    assert.match(sql, /AS step_translations;/);
});
