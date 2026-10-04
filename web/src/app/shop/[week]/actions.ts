"use server";

import { pool } from "@/lib/db";
import { getList, type GroceryItem } from "@/lib/shop";

// Poll target for multi-viewer live updates (see list.tsx).
export async function refreshList(weekStart: string): Promise<GroceryItem[]> {
  return getList(weekStart);
}

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
