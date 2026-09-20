"use server";

import { pool } from "@/lib/db";
import { generateList, getList, type GroceryItem } from "@/lib/shop";

export async function toggleItem(
  weekStart: string,
  itemId: number,
  checked: boolean,
): Promise<GroceryItem[]> {
  await pool.query("update grocery_items set checked = $1 where id = $2", [
    checked,
    itemId,
  ]);
  return getList(weekStart);
}

export async function regenerate(weekStart: string): Promise<GroceryItem[]> {
  await generateList(weekStart);
  return getList(weekStart);
}
