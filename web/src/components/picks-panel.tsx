"use client";

import Link from "next/link";
import { useState } from "react";
import { imageSrc } from "@/lib/images";
import type { RecipeSummary } from "@/lib/db";

const PROTEIN_ICON: Record<string, string> = {
  chicken: "🐔",
  beef: "🐄",
  pork: "🐖",
  lamb: "🐑",
  turkey: "🦃",
  seafood: "🐟",
  tofu: "🧈",
  egg: "🥚",
  vegetarian: "🌱",
};

const MAX_THUMBS = 4;

const proteinsOf = (r: RecipeSummary) =>
  r.proteins.length ? r.proteins : ["vegetarian"];

// The week's picks. One markup, two layouts (see globals.css): on mobile a
// fixed bottom bar of stacked thumbnails that opens a bottom sheet; on wide
// screens the sheet is shown permanently as a sticky sidebar and the bar is
// hidden. Protein counts are multi-label, so they can sum to more than the
// number of picks.
export function PicksPanel({
  week,
  picks,
  onRemove,
}: {
  week: string;
  picks: RecipeSummary[];
  onRemove: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);

  const counts = new Map<string, number>();
  for (const p of picks) {
    for (const protein of proteinsOf(p)) {
      counts.set(protein, (counts.get(protein) ?? 0) + 1);
    }
  }

  const isOpen = open && picks.length > 0;

  return (
    <aside className={`picks-panel${isOpen ? " open" : ""}`}>
      <div className="picks-backdrop" onClick={() => setOpen(false)} />

      <div className="picks-bar">
        {picks.length > 0 ? (
          <button
            className="picks-open"
            onClick={() => setOpen(true)}
            aria-label={`Show ${picks.length} picked dinners`}
          >
            <span className="picks-stack">
              {picks.slice(0, MAX_THUMBS).map((p) => (
                <Thumb key={p.id} recipe={p} />
              ))}
              {picks.length > MAX_THUMBS && (
                <span className="picks-more">+{picks.length - MAX_THUMBS}</span>
              )}
            </span>
          </button>
        ) : (
          <span className="picks-empty muted">
            Tap recipes to add them to this week
          </span>
        )}
        <Link href={`/shop/${week}`} className="picks-shop">
          Shop →
        </Link>
      </div>

      <div className="picks-sheet">
        <div className="picks-grab" onClick={() => setOpen(false)} />
        <div className="picks-head">
          <h2>
            {picks.length} {picks.length === 1 ? "dinner" : "dinners"}
          </h2>
          <span className="picks-proteins">
            {[...counts].map(([protein, n]) => (
              <span key={protein} title={protein}>
                {PROTEIN_ICON[protein] ?? protein} {n}
              </span>
            ))}
          </span>
        </div>
        {picks.length === 0 ? (
          <p className="muted">Tap recipes to add them to this week.</p>
        ) : (
          <ul className="picks-list">
            {picks.map((p) => (
              <li key={p.id}>
                <Thumb recipe={p} />
                <div className="picks-name">
                  {p.name}
                  <div className="muted">
                    {p.total_time_minutes
                      ? `${p.total_time_minutes} min · `
                      : ""}
                    {proteinsOf(p).join(", ")}
                  </div>
                </div>
                <button
                  className="picks-remove"
                  onClick={() => onRemove(String(p.id))}
                  aria-label={`Remove ${p.name}`}
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </aside>
  );
}

function Thumb({ recipe }: { recipe: RecipeSummary }) {
  const src = imageSrc(recipe);
  return src ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt="" />
  ) : (
    <span className="picks-thumb-placeholder" />
  );
}
