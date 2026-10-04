import { pool, RECIPE_SUMMARY_COLUMNS, type RecipeSummary } from "./db";
import { suggestions } from "./recommend";
import { today } from "./week";

const PAGE_SIZE = 12;

// One page of the week's deterministic suggestion order (see recommend.ts).
// `done` means the list is exhausted. Novelty is passed in, not read from
// settings, so every page of one scroll uses the value the picker was
// rendered with.
export async function suggestionPage(
  weekStart: string,
  novelty: number,
  offset: number,
  q = "",
  protein = "",
): Promise<{ recipes: RecipeSummary[]; done: boolean }> {
  const recipes = await suggestions(
    weekStart,
    novelty,
    offset,
    PAGE_SIZE,
    q,
    protein,
  );
  return { recipes, done: recipes.length < PAGE_SIZE };
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

// The plan the user is currently working through: the newest plan that
// still has uncooked recipes. Falls back to today (a fresh plan) once the
// last plan is fully cooked.
export async function currentPlanStart(): Promise<string> {
  const { rows } = await pool.query<{ w: string }>(
    `select to_char(p.week_start, 'YYYY-MM-DD') as w
     from meal_plans p
     where exists (
       select 1 from meal_plan_entries e
       where e.meal_plan_id = p.id and not e.cooked
     )
     order by p.week_start desc
     limit 1`,
  );
  return rows[0]?.w ?? today();
}

export type WeekInfo = { week: string; total: number; cooked: number };

// Weeks that have plans, newest first, with the current week always included
// (total 0 = no plan started yet). cooked/total feed the week dropdown.
export async function getWeeks(): Promise<WeekInfo[]> {
  const { rows } = await pool.query<{
    w: string;
    total: string;
    cooked: string;
  }>(
    `select to_char(p.week_start, 'YYYY-MM-DD') as w,
            count(e.id) as total,
            count(e.id) filter (where e.cooked) as cooked
     from meal_plans p
     left join meal_plan_entries e on e.meal_plan_id = p.id
     group by p.week_start`,
  );
  const weeks = new Map(rows.map((r) => [r.w, r]));
  if (!weeks.has(today()))
    weeks.set(today(), { w: today(), total: "0", cooked: "0" });
  return [...weeks.values()]
    .map((r) => ({
      week: r.w,
      total: Number(r.total),
      cooked: Number(r.cooked),
    }))
    .sort((a, b) => b.week.localeCompare(a.week));
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
