"use client";

import { useState, useTransition } from "react";
import type { GroceryItem } from "@/lib/shop";
import { regenerate, toggleItem } from "./actions";

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

  const rebuild = () =>
    startTransition(async () => {
      setItems(await regenerate(week));
    });

  const toBuy = items.filter((i) => i.quantity != null);
  const staples = items.filter((i) => i.quantity == null);
  const checked = items.filter((i) => i.checked).length;

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
          onClick={(e) => e.stopPropagation()}
        >
          {item.display}
        </a>
      </label>
    </li>
  );

  return (
    <>
      <div className="plan-toolbar">
        <p>
          <strong>{checked}</strong>/{items.length} checked
        </p>
        <button onClick={rebuild} disabled={pending} title="Rebuild from this week's picks; resets checkmarks">
          Regenerate list
        </button>
      </div>

      {items.length === 0 ? (
        <p className="muted">No groceries yet — pick some dinners first.</p>
      ) : (
        <>
          <h2>To buy</h2>
          <ul className="grocery">{toBuy.map(row)}</ul>
          {staples.length > 0 && (
            <>
              <h2>Pantry staples</h2>
              <p className="muted">Check you have these.</p>
              <ul className="grocery">{staples.map(row)}</ul>
            </>
          )}
        </>
      )}
    </>
  );
}
