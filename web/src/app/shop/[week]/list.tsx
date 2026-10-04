"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { DEPARTMENT_ORDER } from "@/lib/departments";
import type { GroceryItem } from "@/lib/shop";
import { refreshList, toggleItem } from "./actions";

// How often to re-fetch the list so other viewers' check-offs appear.
const POLL_MS = 3000;

export function GroceryList({
  week,
  initialItems,
  recipeNames,
}: {
  week: string;
  initialItems: GroceryItem[];
  recipeNames: string[]; // picks in plan order; markers show A, B, C...
}) {
  const [items, setItems] = useState(initialItems);
  const [pending, startTransition] = useTransition();
  // Recipe marker whose popover is pinned open by a tap ("<itemId>:<name>").
  const [openTip, setOpenTip] = useState<string | null>(null);
  useEffect(() => {
    if (!openTip) return;
    const close = () => setOpenTip(null);
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, [openTip]);
  // Markers are A, B, C... in plan order.
  const letterFor = (name: string) =>
    String.fromCharCode(65 + recipeNames.indexOf(name));
  const pendingRef = useRef(false);
  useEffect(() => {
    pendingRef.current = pending;
  }, [pending]);

  useEffect(() => {
    const tick = async () => {
      // Skip polls while hidden or mid-toggle so a stale response can't
      // clobber the checkmark the server action just returned.
      if (document.visibilityState !== "visible" || pendingRef.current) return;
      setItems(await refreshList(week));
    };
    const timer = setInterval(tick, POLL_MS);
    const onVisible = () => void tick();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [week]);

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
        <span className="grocery-recipes">
          {item.recipes.map((name) => {
            const key = `${item.id}:${name}`;
            return (
              <button
                type="button"
                key={name}
                className={openTip === key ? "open" : ""}
                aria-label={name}
                onClick={(e) => {
                  // Inside the <label>: don't let a tap toggle the checkbox.
                  e.preventDefault();
                  e.stopPropagation();
                  setOpenTip(openTip === key ? null : key);
                }}
              >
                {letterFor(name)}
                <span className="tip" role="tooltip">
                  {name}
                </span>
              </button>
            );
          })}
        </span>
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
