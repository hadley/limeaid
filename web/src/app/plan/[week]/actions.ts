"use server";

import {
  currentBatch,
  drawBatch,
  ensurePlan,
  getPicks,
  setSetting,
} from "@/lib/plan";
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

export async function reroll(weekStart: string): Promise<RecipeSummary[]> {
  return drawBatch(weekStart);
}

export async function getBatch(weekStart: string): Promise<RecipeSummary[]> {
  return currentBatch(weekStart);
}

export async function setNovelty(value: number): Promise<void> {
  const s = Math.min(1, Math.max(0, value));
  await setSetting("novelty", s);
}
