"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { imageSrc } from "@/lib/images";
import type { RecipeSummary } from "@/lib/db";
import { gotoPage, togglePick } from "./actions";

type Page = { batch: RecipeSummary[]; idx: number; total: number };

export function Picker({
  week,
  q,
  protein,
  initialPage,
  initialPicks,
}: {
  week: string;
  q: string;
  protein: string;
  initialPage: Page;
  initialPicks: RecipeSummary[];
}) {
  const [page, setPage] = useState(initialPage);
  const [picks, setPicks] = useState(initialPicks);
  const [pending, startTransition] = useTransition();

  const pickIds = new Set(picks.map((p) => String(p.id)));

  const toggle = (id: string) =>
    startTransition(async () => {
      setPicks(await togglePick(week, Number(id)));
    });

  const goto = (idx: number) =>
    startTransition(async () => {
      setPage(await gotoPage(week, idx, q, protein));
    });

  return (
    <>
      <div className="plan-toolbar">
        <p>
          <strong>{picks.length}</strong> dinner{picks.length === 1 ? "" : "s"}{" "}
          picked
        </p>
        <span className="pagination">
          <button
            onClick={() => goto(page.idx - 1)}
            disabled={pending || page.idx === 0}
          >
            ← Prev
          </button>
          <span className="muted">
            Page {page.idx + 1} of {page.total}
          </span>
          <button onClick={() => goto(page.idx + 1)} disabled={pending}>
            {page.idx + 1 < page.total ? "Next →" : "More →"}
          </button>
        </span>
      </div>

      {picks.length > 0 && (
        <div className="picks">
          {picks.map((p) => (
            <button
              key={p.id}
              className="pick-chip"
              title="Remove from plan"
              onClick={() => toggle(String(p.id))}
            >
              {p.name} ✕
            </button>
          ))}
          <Link href={`/shop/${week}`} className="shop-button">
            Shop →
          </Link>
        </div>
      )}

      <div className="grid">
        {page.batch.map((r) => {
          const selected = pickIds.has(String(r.id));
          const src = imageSrc(r);
          return (
            <button
              key={r.id}
              className={`card card-button${selected ? " selected" : ""}`}
              onClick={() => toggle(String(r.id))}
              disabled={pending}
            >
              {src ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={src} alt="" loading="lazy" />
              ) : (
                <div className="card-img-placeholder" />
              )}
              <div className="card-body">
                <div className="card-title">{r.name}</div>
                <div className="muted">
                  {r.total_time_minutes ? `${r.total_time_minutes} min` : ""}
                  {r.community_rating
                    ? ` · ★ ${r.community_rating.toFixed(1)}`
                    : ""}
                  {selected ? " · ✓ picked" : ""}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </>
  );
}
