import { pool, type Ingredient } from "./db";
import { ensurePlan } from "./plan";
import { formatQty } from "./fractions";

export type GroceryItem = {
  id: string;
  name: string;
  display: string;
  quantity: string | null; // numeric comes back as string from pg
  unit: string | null;
  checked: boolean;
  position: number;
};

function displayFor(name: string, quantity: number, unit: string | null) {
  const qty = formatQty(quantity);
  return unit && unit !== "each"
    ? `${qty} ${unit} ${name}`
    : `${qty} ${name}`;
}

// (Re)generate the grocery list for a week from its picked recipes:
// merge by (name, unit) summing quantities; null-quantity ingredients go
// into the pantry-staples section (deduped by name). Checked state resets.
export async function generateList(weekStart: string): Promise<void> {
  const planId = await ensurePlan(weekStart);
  await pool.query("delete from grocery_items where meal_plan_id = $1", [
    planId,
  ]);

  const { rows } = await pool.query<{ ingredients: Ingredient[] }>(
    `select r.ingredients
     from meal_plan_entries e
     join meal_plans p on p.id = e.meal_plan_id
     join recipes r on r.id = e.recipe_id
     where p.week_start = $1
     order by e.id`,
    [weekStart],
  );

  const toBuy = new Map<string, { name: string; unit: string | null; qty: number }>();
  const staples = new Set<string>();
  for (const { ingredients } of rows) {
    for (const ing of ingredients) {
      if (ing.quantity == null) {
        staples.add(ing.name);
      } else {
        const key = `${ing.name}${ing.unit ?? ""}`;
        const cur = toBuy.get(key);
        if (cur) cur.qty += ing.quantity;
        else toBuy.set(key, { name: ing.name, unit: ing.unit, qty: ing.quantity });
      }
    }
  }

  let position = 0;
  const insert = `insert into grocery_items
    (meal_plan_id, name, display, quantity, unit, position)
    values ($1, $2, $3, $4, $5, $6)`;
  for (const item of toBuy.values()) {
    await pool.query(insert, [
      planId,
      item.name,
      displayFor(item.name, item.qty, item.unit),
      item.qty,
      item.unit,
      position++,
    ]);
  }
  for (const name of [...staples].sort()) {
    await pool.query(insert, [planId, name, name, null, null, position++]);
  }
}

export async function getList(weekStart: string): Promise<GroceryItem[]> {
  const { rows } = await pool.query<GroceryItem>(
    `select g.id, g.name, g.display, g.quantity, g.unit, g.checked, g.position
     from grocery_items g
     join meal_plans p on p.id = g.meal_plan_id
     where p.week_start = $1
     order by g.position`,
    [weekStart],
  );
  if (rows.length > 0) return rows;

  // Lazy generation on first visit (only if the week has picks).
  await generateList(weekStart);
  const again = await pool.query<GroceryItem>(
    `select g.id, g.name, g.display, g.quantity, g.unit, g.checked, g.position
     from grocery_items g
     join meal_plans p on p.id = g.meal_plan_id
     where p.week_start = $1
     order by g.position`,
    [weekStart],
  );
  return again.rows;
}
