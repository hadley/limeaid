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

// (Re)generate the grocery list for a week from its picked recipes. Items
// that survive the rebuild keep their checked state (matched by name + unit).
export async function generateList(weekStart: string): Promise<void> {
  const planId = await ensurePlan(weekStart);
  const checkedRows = await pool.query<{ name: string; unit: string | null }>(
    "select name, unit from grocery_items where meal_plan_id = $1 and checked",
    [planId],
  );
  const checkedKeys = new Set(
    checkedRows.rows.map((r) => keyOf(r.name, r.unit)),
  );
  await pool.query("delete from grocery_items where meal_plan_id = $1", [
    planId,
  ]);

  let position = 0;
  const insert = `insert into grocery_items
    (meal_plan_id, name, display, quantity, unit, position, checked)
    values ($1, $2, $3, $4, $5, $6, $7)`;
  for (const item of await desiredItems(weekStart)) {
    await pool.query(insert, [
      planId,
      item.name,
      item.qty == null ? item.name : displayFor(item.name, item.qty, item.unit),
      item.qty,
      item.unit,
      position++,
      checkedKeys.has(keyOf(item.name, item.unit)),
    ]);
  }
}

const LIST_SQL = `select g.id, g.name, g.display, g.quantity, g.unit, g.checked,
       g.position, d.department
  from grocery_items g
  join meal_plans p on p.id = g.meal_plan_id
  left join ingredient_departments d on d.name = g.name
  where p.week_start = $1
  order by g.position`;

// Same item multiset? Compared by (name, unit) key with summed quantities;
// quantities come back from pg as strings.
function inSync(rows: GroceryItem[], desired: DesiredItem[]): boolean {
  if (rows.length !== desired.length) return false;
  const byKey = new Map(desired.map((d) => [keyOf(d.name, d.unit), d]));
  return rows.every((row) => {
    const d = byKey.get(keyOf(row.name, row.unit));
    if (!d) return false;
    return d.qty == null
      ? row.quantity == null
      : row.quantity != null && Number(row.quantity) === d.qty;
  });
}

// The stored list as-is (no sync with the week's picks — see syncList).
export async function getList(weekStart: string): Promise<GroceryItem[]> {
  return (await pool.query<GroceryItem>(LIST_SQL, [weekStart])).rows;
}

// Reconcile the stored list with the week's picks, regenerating on first
// visit or when out of sync (checked state is preserved for surviving
// items). Call on page load; not needed after item toggles.
export async function syncList(weekStart: string): Promise<GroceryItem[]> {
  const rows = await getList(weekStart);
  if (inSync(rows, await desiredItems(weekStart))) return rows;

  await generateList(weekStart);
  return getList(weekStart);
}
