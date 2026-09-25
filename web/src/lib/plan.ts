import { pool, RECIPE_SUMMARY_COLUMNS, type RecipeSummary } from "./db";
import { drawBatch } from "./recommend";
import { getNovelty, getSetting, setSetting } from "./settings";
import { mondayOf } from "./week";

const BATCH = 12;

export type PlanPage = { batch: RecipeSummary[]; idx: number; total: number };

async function recipesByIds(ids: number[]): Promise<RecipeSummary[]> {
  if (ids.length === 0) return [];
  const { rows } = await pool.query<RecipeSummary>(
    `select ${RECIPE_SUMMARY_COLUMNS}
     from recipes r
     join unnest($1::bigint[]) with ordinality u(id, ord) on u.id = r.id
     left join ratings rt on rt.recipe_id = r.id
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

// Show page `idx` (default: the latest), drawing a new page when idx is past
// the end or no pages exist yet.
export async function showPage(
  weekStart: string,
  idx: number | undefined,
  q = "",
  protein = "",
): Promise<PlanPage> {
  const key = pagesKey(weekStart, q, protein);
  let pages = await getSetting<number[][]>(key, []);
  idx = Math.max(0, idx ?? pages.length - 1);

  if (idx >= pages.length) {
    const { ids, exhausted } = await drawBatch(
      BATCH,
      await getNovelty(),
      q,
      protein,
      new Set(pages.flat()),
    );
    pages = [...(exhausted ? [] : pages), ids];
    await setSetting(key, pages);
    idx = pages.length - 1;
  }

  return { batch: await recipesByIds(pages[idx]), idx, total: pages.length };
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
    `select ${RECIPE_SUMMARY_COLUMNS}
     from meal_plan_entries e
     join meal_plans p on p.id = e.meal_plan_id
     join recipes r on r.id = e.recipe_id
     left join ratings rt on rt.recipe_id = r.id
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

// Stage of the weekly loop, for the home-page redirect: plan until something
// is picked, shop until every grocery item is checked, then cook.
export async function weekStage(
  weekStart: string,
): Promise<"plan" | "shop" | "cook"> {
  const { rows } = await pool.query<{
    has_entries: boolean;
    unchecked: string;
    groceries: string;
  }>(
    `select
       exists (select 1 from meal_plan_entries where meal_plan_id = p.id)
         as has_entries,
       count(g.id) filter (where not g.checked) as unchecked,
       count(g.id) as groceries
     from (select id from meal_plans where week_start = $1) p
     left join grocery_items g on g.meal_plan_id = p.id
     group by p.id`,
    [weekStart],
  );
  const r = rows[0];
  if (!r?.has_entries) return "plan";
  if (Number(r.groceries) === 0 || Number(r.unchecked) > 0) return "shop";
  return "cook";
}
