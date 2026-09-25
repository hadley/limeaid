import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ensurePlan, getPicks, latestPage } from "@/lib/plan";
import { isMonday } from "@/lib/week";
import { Filters } from "@/app/recipes/filters";
import { Picker } from "./picker";

export default async function PlanWeekPage({
  params,
  searchParams,
}: {
  params: Promise<{ week: string }>;
  searchParams: Promise<{ q?: string; protein?: string }>;
}) {
  const { week } = await params;
  const { q = "", protein = "" } = await searchParams;
  if (!isMonday(week)) notFound();

  await ensurePlan(week);
  const [page, picks] = await Promise.all([
    latestPage(week, q, protein),
    getPicks(week),
  ]);

  return (
    <main className="container wide">
      <Suspense>
        <Filters />
      </Suspense>
      <Picker
        key={`${q}|${protein}`}
        week={week}
        q={q}
        protein={protein}
        initialPage={JSON.parse(JSON.stringify(page))}
        initialPicks={JSON.parse(JSON.stringify(picks))}
      />
    </main>
  );
}
