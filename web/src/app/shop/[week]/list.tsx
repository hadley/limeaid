"use client";

import { useState, useTransition } from "react";
import { DEPARTMENT_ORDER } from "@/lib/departments";
import type { GroceryItem } from "@/lib/shop";
import { toggleItem } from "./actions";

export function GroceryList({
  week,
  initialItems,
}: {
  week: string;
  initialItems: GroceryItem[];
}) {
  const [items, setItems] = useState(initialItems);
  const [pending, startTransition] = useTransition();

  const toggle = (item: GroceryItem) =>
    startTransition(async () => {
      setItems(await toggleItem(week, Number(item.id), !item.checked));
    });


  const toBuy = items.filter((i) => i.quantity != null);
  const staples = items.filter((i) => i.quantity == null);

  // Group to-buy items by department, alphabetical within each; unknown
  // departments sort to "Other". Headings only appear when the department
  // mapping actually distinguishes items.
  const byDept = new Map<string, GroceryItem[]>();
  for (const item of toBuy) {
    const dept = item.department ?? "Other";
    byDept.set(dept, [...(byDept.get(dept) ?? []), item]);
  }
  for (const list of byDept.values()) {
    list.sort((a, b) => a.name.localeCompare(b.name));
  }
  const depts = [...byDept.keys()].sort(
    (a, b) =>
      (DEPARTMENT_ORDER.indexOf(a) === -1 ? 99 : DEPARTMENT_ORDER.indexOf(a)) -
      (DEPARTMENT_ORDER.indexOf(b) === -1 ? 99 : DEPARTMENT_ORDER.indexOf(b)),
  );
  const showHeadings = depts.length > 1;
  staples.sort((a, b) => a.name.localeCompare(b.name));

  const row = (item: GroceryItem) => (
    <li key={item.id} className={item.checked ? "checked" : ""}>
      <label>
        <input
          type="checkbox"
          checked={item.checked}
          disabled={pending}
          onChange={() => toggle(item)}
        />
        <a
          href={`https://www.heb.com/search?q=${encodeURIComponent(item.name)}`}
          target="_blank"
          rel="noreferrer"
          onClick={(e) => {
            e.stopPropagation();
            // Opening the HEB search means you're adding it to the cart.
            if (!item.checked && !pending) toggle(item);
          }}
        >
          {item.display}
        </a>
      </label>
    </li>
  );

  if (items.length === 0) {
    return <p className="muted">No groceries yet — pick some dinners first.</p>;
  }

  return (
    <div className="shop-sections">
      {toBuy.length > 0 && !showHeadings && (
        <section>
          <h2>To buy</h2>
          <ul className="grocery">{toBuy.map(row)}</ul>
        </section>
      )}
      {showHeadings &&
        depts.map((dept) => (
          <section key={dept}>
            <h2>{dept}</h2>
            <ul className="grocery">{byDept.get(dept)!.map(row)}</ul>
          </section>
        ))}
      {staples.length > 0 && (
        <section>
          <h2>Pantry staples</h2>
          <p className="muted">Check you have these.</p>
          <ul className="grocery">{staples.map(row)}</ul>
        </section>
      )}
    </div>
  );
}
