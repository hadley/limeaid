import { pool, type RecipeSummary } from "./db";
import { mondayOf } from "./week";

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

// Hard filters applied in SQL: no disliked, nothing cooked in the last 14
// days, plus the user's text/protein filter.
async function candidates(q = "", protein = ""): Promise<Candidate[]> {
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
       and ($1 = '' or r.name ilike '%' || $1 || '%')
       and (
         $2 = ''
         or ($2 = 'vegetarian' and cardinality(r.proteins) = 0)
         or ($2 <> 'vegetarian' and $2 = any(r.proteins))
       )
     group by r.id, rt.rating, r.proteins
     having max(e.cooked_at) is null
        or max(e.cooked_at) < now() - interval '14 days'`,
    [q, protein],
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

// Pages of BATCH recipes, persisted per week and filter combination in
// settings as `plan-pages:<week>:<q>|<protein>` (array of id arrays). Paging
// forward past the last page draws a fresh batch without replacement against
// everything already shown for that key; the history resets when the pool
// runs low.
function pagesKey(weekStart: string, q: string, protein: string) {
  return `plan-pages:${weekStart}:${q.toLowerCase()}|${protein}`;
}

async function getPages(key: string): Promise<number[][]> {
  return getSetting<number[][]>(key, []);
}

export async function showPage(
  weekStart: string,
  idx: number,
  q = "",
  protein = "",
): Promise<{ batch: RecipeSummary[]; idx: number; total: number }> {
  const key = pagesKey(weekStart, q, protein);
  let pages = await getPages(key);

  if (idx < 0) idx = 0;
  if (idx >= pages.length) {
    // Draw a fresh page.
    const novelty = await getNovelty();
    const now = Date.now();
    let shown = pages.flat();
    let available = (await candidates(q, protein)).filter(
      (c) => !shown.includes(c.id),
    );

    // Pool exhausted (or nearly): reset the page history and start over.
    if (available.length < BATCH) {
      pages = [];
      available = await candidates(q, protein);
    }

    const scored = available.map((c) => ({
      ...c,
      w: Math.exp(score(c, novelty, now) / TAU),
    }));
    const batch = stratifiedSample(scored, BATCH);
    pages = [...pages, batch.map((b) => b.id)];
    await setSetting(key, pages);
    idx = pages.length - 1;
  }

  return { batch: await recipesByIds(pages[idx]), idx, total: pages.length };
}

// Latest page, drawing the first one if this key has none yet.
export async function latestPage(
  weekStart: string,
  q = "",
  protein = "",
): Promise<{ batch: RecipeSummary[]; idx: number; total: number }> {
  const pages = await getPages(pagesKey(weekStart, q, protein));
  return showPage(weekStart, Math.max(0, pages.length - 1), q, protein);
}

export async function ensurePlan(weekStart: string): Promise<number> {
  // Select-first (not upsert) so page loads don't burn identity values.
  const { rows } = await pool.query<{ id: string }>(
    `with existing as (select id from meal_plans where week_start = $1),
          ins as (
            insert into meal_plans (week_start)
            select $1 where not exists (select 1 from existing)
            returning id
          )
     select id from existing union all select id from ins limit 1`,
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

// Weeks that have plans, newest first, with the current week always included.
export async function getWeeks(): Promise<string[]> {
  const { rows } = await pool.query<{ w: string }>(
    "select to_char(week_start, 'YYYY-MM-DD') as w from meal_plans",
  );
  const weeks = new Set([mondayOf(), ...rows.map((r) => r.w)]);
  return [...weeks].sort().reverse();
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
