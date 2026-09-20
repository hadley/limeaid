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

const lines = fs
  .readFileSync(path.join(repoRoot, "db/seed/recipes.jsonl"), "utf8")
  .split("\n")
  .filter(Boolean);

await client.query("begin");
await client.query("truncate recipes restart identity cascade");
const insert = `insert into recipes
  (slug, mealime_id, name, source_url, category, proteins,
   total_time_minutes, yield, image_path, image_url,
   community_rating, community_rating_count, ingredients, instructions)
  values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb,$14::jsonb)`;
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
    r.image_path ?? null,
    r.image_url ?? null,
    r.community_rating ?? null,
    r.community_rating_count ?? null,
    JSON.stringify(r.ingredients),
    JSON.stringify(r.instructions),
  ]);
}
await client.query("commit");

const { rows } = await client.query("select count(*)::int as n from recipes");
console.log(`Loaded ${rows[0].n} recipes`);
await client.end();
