"use server";

import type { Rating } from "@/lib/ratings";
import { getCookEntries, setCooked, setRating, type CookEntry } from "@/lib/cook";

export async function toggleCooked(
  weekStart: string,
  entryId: number,
  cooked: boolean,
): Promise<CookEntry[]> {
  await setCooked(entryId, cooked);
  return getCookEntries(weekStart);
}

export async function rate(
  weekStart: string,
  recipeId: number,
  rating: Rating | null,
): Promise<CookEntry[]> {
  await setRating(recipeId, rating);
  return getCookEntries(weekStart);
}
