// Non-destructive update of an existing database: reloads ingredient
// classifications and updates recipe `proteins` from db/seed/recipes.jsonl,
// keyed by slug. Preserves ratings, meal plans, grocery items, settings.
// Usage: DATABASE_URL=... node scripts/update-recipes.mjs
import pg from "pg";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const webDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = path.resolve(webDir, "..");

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

// Classifications: pure reference tables, nothing foreign-keys to them.
const classCsv = path.join(repoRoot, "db/seed/ingredient-classifications.csv");
const unquote = (f) =>
  /^".*"$/.test(f) ? f.slice(1, -1).replace(/""/g, '"') : f;
const classLines = fs.readFileSync(classCsv, "utf8").split("\n").filter(Boolean);
await client.query("begin");
await client.query("truncate ingredient_departments");
await client.query("truncate ingredient_locations");
let nc = 0;
for (const line of classLines.slice(1)) {
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
  nc++;
}
await client.query("commit");
console.log(`Reloaded ${nc} ingredient classifications`);

// Proteins: update in place by slug (ids unchanged, so ratings/plans intact).
const lines = fs
  .readFileSync(path.join(repoRoot, "db/seed/recipes.jsonl"), "utf8")
  .split("\n")
  .filter(Boolean);
let updated = 0;
for (const line of lines) {
  const r = JSON.parse(line);
  const res = await client.query(
    "update recipes set proteins = $2 where slug = $1 and proteins is distinct from $2",
    [r.slug, r.proteins ?? []],
  );
  updated += res.rowCount;
}
console.log(`Updated proteins on ${updated} recipes`);
await client.end();
