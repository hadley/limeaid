"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ratingLabel } from "@/lib/ratings";
import { useEffect, useState } from "react";

const PROTEINS = [
  "chicken",
  "beef",
  "pork",
  "lamb",
  "turkey",
  "seafood",
  "tofu",
  "egg",
];

export function Filters() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [q, setQ] = useState(params.get("q") ?? "");
  const protein = params.get("protein") ?? "";
  const rating = params.get("rating") ?? "";

  const navigate = (nextQ: string, nextProtein: string, nextRating: string) => {
    const p = new URLSearchParams();
    if (nextQ) p.set("q", nextQ);
    if (nextProtein) p.set("protein", nextProtein);
    if (nextRating) p.set("rating", nextRating);
    router.replace(`${pathname}?${p}`);
  };

  // Debounce text input; select navigates immediately.
  useEffect(() => {
    if (q === (params.get("q") ?? "")) return;
    const t = setTimeout(() => navigate(q, protein, rating), 300);
    return () => clearTimeout(t);
  }, [q]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="filters">
      <input
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search recipes…"
      />
      <select
        value={protein}
        onChange={(e) => navigate(q, e.target.value, rating)}
      >
        <option value="">All proteins</option>
        {PROTEINS.map((p) => (
          <option key={p} value={p}>
            {p[0].toUpperCase() + p.slice(1)}
          </option>
        ))}
        <option value="vegetarian">Vegetarian</option>
      </select>
      <select
        value={rating}
        onChange={(e) => navigate(q, protein, e.target.value)}
      >
        <option value="">All ratings</option>
        {(["loved", "liked"] as const).map((r) => (
          <option key={r} value={r}>
            {ratingLabel(r)}
          </option>
        ))}
        <option value="unrated">Unrated</option>
      </select>
    </div>
  );
}
