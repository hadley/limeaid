"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import type { CookEntry } from "@/lib/cook";
import { imageSrc } from "@/lib/images";
import { toggleCooked } from "./actions";

const RATING_LABEL: Record<string, string> = {
  disliked: "Disliked",
  liked: "Liked",
  loved: "Loved",
};

export function CookList({
  week,
  initialEntries,
}: {
  week: string;
  initialEntries: CookEntry[];
}) {
  const [entries, setEntries] = useState(initialEntries);
  const [pending, startTransition] = useTransition();

  const uncook = (entry: CookEntry) =>
    startTransition(async () => {
      setEntries(await toggleCooked(week, entry.entryId, false));
    });

  const cooked = entries.filter((e) => e.cooked).length;

  return (
    <>
      <div className="plan-toolbar">
        <p>
          <strong>{cooked}</strong>/{entries.length} cooked
        </p>
      </div>
      <div className="grid">
        {entries.map((e) => (
          <div key={e.entryId} className={`card${e.cooked ? " cooked" : ""}`}>
            <Link href={`/cook/${week}/${e.entryId}`}>
              {e.image_path || e.image_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={imageSrc(e) ?? undefined} alt={e.name} />
              ) : (
                <div className="card-img-placeholder" />
              )}
            </Link>
            <div className="card-body">
              <div className="card-title">
                <Link href={`/cook/${week}/${e.entryId}`}>{e.name}</Link>
              </div>
              <div className="muted">
                {e.total_time_minutes ? `${e.total_time_minutes} min` : ""}
                {e.rating ? ` · ${RATING_LABEL[e.rating]}` : ""}
              </div>
              {e.cooked ? (
                <button
                  className="uncook"
                  disabled={pending}
                  onClick={() => uncook(e)}
                >
                  Cooked ✓ — undo
                </button>
              ) : (
                <Link className="cook-button" href={`/cook/${week}/${e.entryId}`}>
                  Cook →
                </Link>
              )}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
