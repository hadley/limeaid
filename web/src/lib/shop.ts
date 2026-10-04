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
  department: string | null;
};

// Canonical names classified as "Pantry Staples" in ingredient_departments
// (see db/seed/ingredient-classifications.csv) go in the "check you have these"
// section even though Mealime gives them quantities.

// (Display order for department sections lives in ./departments, pg-free
// so client components can import it.)

function displayFor(name: string, quantity: number, unit: string | null) {
  const qty = formatQty(quantity);
  return unit && unit !== "each" ? `${qty} ${unit} ${name}` : `${qty} ${name}`;
}

const keyOf = (name: string, unit: string | null) => `${name}${unit ?? ""}`;

type DesiredItem = {
  name: string;
  unit: string | null;
  qty: number | null; // null = pantry staple
};

// The grocery list a week's picks should produce: merged by (name, unit)
// with quantities summed; null-quantity ingredients and anything classified
// as a pantry staple go into the staples section (deduped by name).
async function desiredItems(weekStart: string): Promise<DesiredItem[]> {
  const stapleRows = await pool.query<{ name: string }>(
    "select name from ingredient_departments where department = 'Pantry Staples'",
  );
  const stapleNames = new Set(stapleRows.rows.map((r) => r.name));

  const { rows } = await pool.query<{ ingredients: Ingredient[] }>(
    `select r.ingredients
     from meal_plan_entries e
     join meal_plans p on p.id = e.meal_plan_id
     join recipes r on r.id = e.recipe_id
     where p.week_start = $1
     order by e.id`,
    [weekStart],
  );

  const toBuy = new Map<string, DesiredItem & { qty: number }>();
  const staples = new Set<string>();
  for (const { ingredients } of rows) {
    for (const ing of ingredients) {
      if (ing.quantity == null || stapleNames.has(ing.name)) {
        staples.add(ing.name);
      } else {
        const key = keyOf(ing.name, ing.unit);
        const cur = toBuy.get(key);
        if (cur) cur.qty! += ing.quantity;
        else
          toBuy.set(key, { name: ing.name, unit: ing.unit, qty: ing.quantity });
      }
    }
  }
  return [
    ...toBuy.values(),
    ...[...staples].sort().map((name) => ({ name, unit: null, qty: null })),
  ];
}

// Bring a week's grocery list in line with its picked recipes. Call after
// any change to the picks. Diffs in place in one transaction: items that
// survive keep their id and checked state (matched by name + unit), so
// concurrent viewers never see a half-rebuilt list and rows don't remount.
export async function updateList(weekStart: string): Promise<void> {
  const planId = await ensurePlan(weekStart);
  const desired = await desiredItems(weekStart);

  const client = await pool.connect();
  try {
    await client.query("begin");
    const existing = await client.query<{
      id: string;
      name: string;
      unit: string | null;
    }>("select id, name, unit from grocery_items where meal_plan_id = $1", [
      planId,
    ]);
    const idByKey = new Map(
      existing.rows.map((r) => [keyOf(r.name, r.unit), r.id]),
    );

    const keep = new Set<string>();
    for (const [position, item] of desired.entries()) {
      const display =
        item.qty == null ? item.name : displayFor(item.name, item.qty, item.unit);
      const id = idByKey.get(keyOf(item.name, item.unit));
      if (id) {
        keep.add(id);
        await client.query(
          `update grocery_items set display = $2, quantity = $3, position = $4
           where id = $1`,
          [id, display, item.qty, position],
        );
      } else {
        const ins = await client.query<{ id: string }>(
          `insert into grocery_items
             (meal_plan_id, name, display, quantity, unit, position)
           values ($1, $2, $3, $4, $5, $6)
           returning id`,
          [planId, item.name, display, item.qty, item.unit, position],
        );
        keep.add(ins.rows[0].id);
      }
    }
    await client.query(
      "delete from grocery_items where meal_plan_id = $1 and not (id = any($2))",
      [planId, [...keep]],
    );
    await client.query("commit");
  } catch (e) {
    await client.query("rollback");
    throw e;
  } finally {
    client.release();
  }
}

const LIST_SQL = `select g.id, g.name, g.display, g.quantity, g.unit, g.checked,
       g.position, d.department
  from grocery_items g
  join meal_plans p on p.id = g.meal_plan_id
  left join ingredient_departments d on d.name = g.name
  where p.week_start = $1
  order by g.position`;

// The stored list (kept current by updateList whenever picks change).
export async function getList(weekStart: string): Promise<GroceryItem[]> {
  return (await pool.query<GroceryItem>(LIST_SQL, [weekStart])).rows;
}
