// Apply db/schema.sql and load db/seed/recipes.jsonl into Postgres.
// Usage: DATABASE_URL=... node scripts/seed.mjs   (or set it in web/.env.local)
import pg from "pg";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const webDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = path.resolve(webDir, "..");

// Minimal .env loader (DATABASE_URL only) so the script works without next.
if (!process.env.DATABASE_URL) {
  for (const name of [".env.local", ".env"]) {
    const file = path.join(webDir, name);
    if (!fs.existsSync(file)) continue;
    for (const line of fs.readFileSync(file, "utf8").split("\n")) {
      const m = line.match(/^DATABASE_URL=(.*)$/);
      if (m) process.env.DATABASE_URL = m[1].trim().replace(/^['"]|['"]$/g, "");
    }
  }
}
if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL not set (env or web/.env.local)");
  process.exit(1);
}

const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL.includes("neon.tech")
    ? { rejectUnauthorized: false }
    : undefined,
});
await client.connect();

const schema = fs.readFileSync(path.join(repoRoot, "db/schema.sql"), "utf8");
await client.query(schema);
console.log("Schema applied");

// Ingredient classifications are optional (produced by
// classify-ingredients.R). Canonical names may contain commas, so parse the
// CSV properly (fields with commas are quoted by write.csv); department and
// location never contain commas.
const classCsv = path.join(repoRoot, "db/seed/ingredient-classifications.csv");
if (fs.existsSync(classCsv)) {
  const unquote = (f) =>
    /^".*"$/.test(f) ? f.slice(1, -1).replace(/""/g, '"') : f;
  const lines = fs.readFileSync(classCsv, "utf8").split("\n").filter(Boolean);
  await client.query("truncate ingredient_departments");
  await client.query("truncate ingredient_locations");
  let n = 0;
  for (const line of lines.slice(1)) {
    // skip header
    const m =
      line.match(/^"((?:[^"]|"")*)",([^,]*),(.*)$/) ||
      line.match(/^([^,]*),([^,]*),(.*)$/);
    if (!m) continue;
    const name = m[1].replace(/""/g, '"');
    await client.query(
      "insert into ingredient_departments (name, department) values ($1, $2)",
      [name, unquote(m[2])],
    );
    await client.query(
      "insert into ingredient_locations (name, location) values ($1, $2)",
      [name, unquote(m[3])],
    );
    n++;
  }
  console.log(`Loaded ${n} ingredient classifications`);
} else {
  console.log("No ingredient-classifications.csv; skipping classifications");
}

const lines = fs
  .readFileSync(path.join(repoRoot, "db/seed/recipes.jsonl"), "utf8")
  .split("\n")
  .filter(Boolean);

await client.query("begin");
await client.query("truncate recipes restart identity cascade");
const insert = `insert into recipes
  (slug, mealime_id, name, source_url, category, proteins,
   total_time_minutes, yield,
   community_rating, community_rating_count, ingredients, instructions)
  values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12::jsonb)`;
for (const line of lines) {
  const r = JSON.parse(line);
  await client.query(insert, [
    r.slug,
    r.mealime_id ?? null,
    r.name,
    r.source_url ?? null,
    r.category ?? null,
    r.proteins ?? [],
    r.total_time_minutes ?? null,
    r.yield ?? null,
    r.community_rating ?? null,
    r.community_rating_count ?? null,
    JSON.stringify(r.ingredients),
    JSON.stringify(r.instructions),
  ]);
}
await client.query("commit");

// User ratings: 1-5 mealime stars mapped to disliked (2-3) / liked (4) /
// loved (5). Matched to recipes by slug; ratings for non-dinner recipes
// (not seeded) are skipped. Names may contain commas (quoted by write.csv),
// so parse from the ends: slug is field 1, rating is the 5th-from-last field.
const ratingsCsv = path.join(repoRoot, "user-ratings.csv");
if (fs.existsSync(ratingsCsv)) {
  const ratingMap = { 2: "disliked", 3: "disliked", 4: "liked", 5: "loved" };
  const lines = fs.readFileSync(ratingsCsv, "utf8").split("\n").filter(Boolean);
  await client.query("truncate ratings");
  let loaded = 0;
  let skipped = 0;
  for (const line of lines.slice(1)) {
    // skip header
    const m = line.match(
      /^([^,]*),.*,(\d+),(?:True|False),(?:yes|no),\d+,\d+\r?$/,
    );
    if (!m) continue;
    const rating = ratingMap[m[2]];
    if (!rating) continue;
    const res = await client.query(
      `insert into ratings (recipe_id, rating)
       select id, $2 from recipes where slug = $1
       on conflict (recipe_id) do update set rating = $2`,
      [m[1], rating],
    );
    if (res.rowCount > 0) loaded++;
    else skipped++;
  }
  console.log(
    `Loaded ${loaded} user ratings (${skipped} skipped, no matching seeded recipe)`,
  );
}

const { rows } = await client.query("select count(*)::int as n from recipes");
console.log(`Loaded ${rows[0].n} recipes`);
await client.end();
