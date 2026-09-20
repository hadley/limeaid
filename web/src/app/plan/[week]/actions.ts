"use server";

import { ensurePlan, getPicks, showPage } from "@/lib/plan";
import { pool, type RecipeSummary } from "@/lib/db";

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
  return getPicks(weekStart);
}

export async function gotoPage(
  weekStart: string,
  idx: number,
  q: string,
  protein: string,
): Promise<{ batch: RecipeSummary[]; idx: number; total: number }> {
  return showPage(weekStart, idx, q, protein);
}
