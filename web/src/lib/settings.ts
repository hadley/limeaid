import { pool } from "./db";

// Key/value store backed by the `settings` table (jsonb values).

export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const { rows } = await pool.query(
    "select value from settings where key = $1",
    [key],
  );
  return rows.length ? (rows[0].value as T) : fallback;
}

export async function setSetting(key: string, value: unknown): Promise<void> {
  await pool.query(
    `insert into settings (key, value) values ($1, $2::jsonb)
     on conflict (key) do update set value = excluded.value`,
    [key, JSON.stringify(value)],
  );
}

export async function getNovelty(): Promise<number> {
  return getSetting("novelty", 0.3);
}

export async function setNovelty(value: number): Promise<void> {
  await setSetting("novelty", Math.min(1, Math.max(0, value)));
}
