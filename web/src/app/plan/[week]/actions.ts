"use server";

import { ensurePlan, getPicks, suggestionPage } from "@/lib/plan";
import { pool, type RecipeSummary } from "@/lib/db";
import { updateList } from "@/lib/shop";

export async function togglePick(
  weekStart: string,
  recipeId: number,
): Promise<RecipeSummary[]> {
  const planId = await ensurePlan(weekStart);
  await pool.query(
    `with del as (
       delete from meal_plan_entries
       where meal_plan_id = $1 and recipe_id = $2
       returning 1
     )
     insert into meal_plan_entries (meal_plan_id, recipe_id)
     select $1, $2
     where not exists (select 1 from del)`,
    [planId, recipeId],
  );
  await updateList(weekStart);
  return getPicks(weekStart);
}

export async function loadMore(
  weekStart: string,
  novelty: number,
  offset: number,
  q: string,
  protein: string,
): Promise<{ recipes: RecipeSummary[]; done: boolean }> {
  return suggestionPage(weekStart, novelty, offset, q, protein);
}
