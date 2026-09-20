"use client";

import { useState, useTransition } from "react";
import { imageSrc } from "@/lib/images";
import type { RecipeSummary } from "@/lib/db";
import { reroll, setNovelty, togglePick } from "./actions";

export function Picker({
  week,
  initialBatch,
  initialPicks,
  initialNovelty,
}: {
  week: string;
  initialBatch: RecipeSummary[];
  initialPicks: RecipeSummary[];
  initialNovelty: number;
}) {
  const [batch, setBatch] = useState(initialBatch);
  const [picks, setPicks] = useState(initialPicks);
  const [novelty, setNoveltyState] = useState(initialNovelty);
  const [pending, startTransition] = useTransition();

  const pickIds = new Set(picks.map((p) => String(p.id)));

  const toggle = (id: string) =>
    startTransition(async () => {
      setPicks(await togglePick(week, Number(id)));
    });

  const roll = () =>
    startTransition(async () => {
      setBatch(await reroll(week));
    });

  const slide = (value: number) => {
    setNoveltyState(value);
    startTransition(() => setNovelty(value));
  };

  return (
    <>
      <div className="plan-toolbar">
        <p>
          <strong>{picks.length}</strong> dinner{picks.length === 1 ? "" : "s"}{" "}
          picked
        </p>
        <button onClick={roll} disabled={pending}>
          {pending ? "Drawing…" : "Re-roll"}
        </button>
        <label className="muted">
          Novelty
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={novelty}
            onChange={(e) => slide(Number(e.target.value))}
          />
          {novelty.toFixed(2)}
        </label>
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
        </div>
      )}

      <div className="grid">
        {batch.map((r) => {
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
      <p className="muted">
        Tap cards to pick dinners. Re-roll draws a fresh dozen you haven’t
        seen this week.
      </p>
    </>
  );
}
