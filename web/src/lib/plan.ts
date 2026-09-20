import { pool, type RecipeSummary } from "./db";

const TAU = 0.3; // softmax temperature
const BATCH = 12;

export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const { rows } = await pool.query("select value from settings where key = $1", [
    key,
  ]);
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

type Candidate = {
  id: number;
  rating: string | null;
  last_cooked: string | null;
  bucket: string;
};

// Hard filters applied in SQL: no disliked, nothing cooked in the last 14 days.
async function candidates(): Promise<Candidate[]> {
  const { rows } = await pool.query<{
    id: string;
    rating: string | null;
    last_cooked: Date | null;
    proteins: string[];
  }>(
    `select r.id, rt.rating,
            max(e.cooked_at) as last_cooked,
            r.proteins
     from recipes r
     left join ratings rt on rt.recipe_id = r.id
     left join meal_plan_entries e on e.recipe_id = r.id and e.cooked
     where coalesce(rt.rating, '') <> 'disliked'
     group by r.id, rt.rating, r.proteins
     having max(e.cooked_at) is null
        or max(e.cooked_at) < now() - interval '14 days'`,
  );
  return rows.map((r) => ({
    id: Number(r.id),
    rating: r.rating,
    last_cooked: r.last_cooked ? r.last_cooked.toISOString() : null,
    bucket: r.proteins[0] ?? "vegetarian",
  }));
}

function score(c: Candidate, s: number, now: number): number {
  const ratingPts = c.rating === "loved" ? 2 : c.rating === "liked" ? 1 : 0.5;
  const days = c.last_cooked
    ? (now - new Date(c.last_cooked).getTime()) / 86400000
    : Infinity;
  const recency = c.last_cooked ? Math.min(days, 365) / 365 : 1;
  const novelty = c.last_cooked ? 0.25 * recency : 1;
  return (1 - s) * ratingPts * recency + s * novelty;
}

// Weighted pick of one item from a list; removes and returns it.
function pickWeighted<T extends { w: number }>(items: T[]): T {
  const total = items.reduce((a, b) => a + b.w, 0);
  let r = Math.random() * total;
  for (let i = 0; i < items.length; i++) {
    r -= items[i].w;
    if (r <= 0) return items.splice(i, 1)[0];
  }
  return items.pop()!;
}

// Stratified softmax sampling: round-robin across protein buckets so no
// page is dominated by one protein; weighted by exp(score/tau) within bucket.
function stratifiedSample(scored: (Candidate & { w: number })[], n: number) {
  const buckets = new Map<string, (Candidate & { w: number })[]>();
  for (const c of scored) {
    const b = buckets.get(c.bucket) ?? [];
    b.push(c);
    buckets.set(c.bucket, b);
  }
  const keys = [...buckets.keys()];
  const out: (Candidate & { w: number })[] = [];
  while (out.length < n) {
    let progressed = false;
    for (const k of keys) {
      if (out.length >= n) break;
      const b = buckets.get(k)!;
      if (b.length > 0) {
        out.push(pickWeighted(b));
        progressed = true;
      }
    }
    if (!progressed) break;
  }
  return out;
}

async function recipesByIds(ids: number[]): Promise<RecipeSummary[]> {
  if (ids.length === 0) return [];
  const { rows } = await pool.query<RecipeSummary>(
    `select r.id, r.slug, r.name, r.proteins, r.total_time_minutes,
            r.image_path, r.image_url, r.community_rating,
            r.community_rating_count
     from recipes r
     join unnest($1::bigint[]) with ordinality u(id, ord) on u.id = r.id
     order by u.ord`,
    [ids],
  );
  return rows;
}

// Draw a fresh batch of BATCH recipes without replacement against everything
// already shown this week (persisted in settings). Resets when the pool runs
// low. Stores the batch so reloads see the same cards.
export async function drawBatch(weekStart: string): Promise<RecipeSummary[]> {
  const novelty = await getNovelty();
  const shownKey = `plan-shown:${weekStart}`;
  let shown = await getSetting<number[]>(shownKey, []);

  const now = Date.now();
  const all = candidates();
  let scored = (await all)
    .filter((c) => !shown.includes(c.id))
    .map((c) => ({ ...c, w: Math.exp(score(c, novelty, now) / TAU) }));

  // Pool exhausted (or nearly): reset the shown history and start over.
  if (scored.length < BATCH) {
    shown = [];
    scored = (await candidates())
      .map((c) => ({ ...c, w: Math.exp(score(c, novelty, now) / TAU) }));
  }

  const batch = stratifiedSample(scored, BATCH);
  const ids = batch.map((b) => b.id);
  await setSetting(shownKey, [...shown, ...ids]);
  await setSetting(`plan-batch:${weekStart}`, ids);
  return recipesByIds(ids);
}

export async function currentBatch(weekStart: string): Promise<RecipeSummary[]> {
  const ids = await getSetting<number[]>(`plan-batch:${weekStart}`, []);
  return ids.length ? recipesByIds(ids) : drawBatch(weekStart);
}

export async function ensurePlan(weekStart: string): Promise<number> {
  const { rows } = await pool.query<{ id: string }>(
    `insert into meal_plans (week_start) values ($1)
     on conflict (week_start) do update set week_start = excluded.week_start
     returning id`,
    [weekStart],
  );
  return Number(rows[0].id);
}

export async function getPicks(weekStart: string): Promise<RecipeSummary[]> {
  const { rows } = await pool.query<RecipeSummary>(
    `select r.id, r.slug, r.name, r.proteins, r.total_time_minutes,
            r.image_path, r.image_url, r.community_rating,
            r.community_rating_count
     from meal_plan_entries e
     join meal_plans p on p.id = e.meal_plan_id
     join recipes r on r.id = e.recipe_id
     where p.week_start = $1
     order by e.id`,
    [weekStart],
  );
  return rows;
}

// Stage of the weekly loop, for the navbar pills and adaptive redirect.
export async function weekStage(weekStart: string): Promise<{
  stage: "plan" | "shop" | "cook";
  picks: number;
  groceriesChecked: number;
  groceriesTotal: number;
  cooked: number;
}> {
  const { rows } = await pool.query<{
    picks: string;
    groceries_checked: string;
    groceries_total: string;
    cooked: string;
  }>(
    `select
       (select count(*) from meal_plan_entries e
          join meal_plans p on p.id = e.meal_plan_id
          where p.week_start = $1) as picks,
       (select count(*) from grocery_items g
          join meal_plans p on p.id = g.meal_plan_id
          where p.week_start = $1 and g.checked) as groceries_checked,
       (select count(*) from grocery_items g
          join meal_plans p on p.id = g.meal_plan_id
          where p.week_start = $1) as groceries_total,
       (select count(*) from meal_plan_entries e
          join meal_plans p on p.id = e.meal_plan_id
          where p.week_start = $1 and e.cooked) as cooked`,
    [weekStart],
  );
  const r = rows[0];
  const picks = Number(r.picks);
  const groceriesChecked = Number(r.groceries_checked);
  const groceriesTotal = Number(r.groceries_total);
  const cooked = Number(r.cooked);
  const stage =
    picks === 0
      ? "plan"
      : groceriesChecked < groceriesTotal || groceriesTotal === 0
        ? "shop"
        : cooked < picks
          ? "cook"
          : "cook";
  return { stage, picks, groceriesChecked, groceriesTotal, cooked };
}
