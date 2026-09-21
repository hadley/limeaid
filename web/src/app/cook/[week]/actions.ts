"use server";

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
  rating: "disliked" | "liked" | "loved" | null,
): Promise<CookEntry[]> {
  await setRating(recipeId, rating);
  return getCookEntries(weekStart);
}
