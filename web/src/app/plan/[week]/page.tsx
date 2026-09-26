import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ensurePlan, getPicks, suggestionPage } from "@/lib/plan";
import { getNovelty } from "@/lib/settings";
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
  const novelty = await getNovelty();
  const [page, picks] = await Promise.all([
    suggestionPage(week, novelty, 0, q, protein),
    getPicks(week),
  ]);

  return (
    <main className="container wide">
      <Suspense>
        <Filters />
      </Suspense>
      <Picker
        key={`${q}|${protein}|${novelty}`}
        week={week}
        novelty={novelty}
        q={q}
        protein={protein}
        initialPage={JSON.parse(JSON.stringify(page))}
        initialPicks={JSON.parse(JSON.stringify(picks))}
      />
    </main>
  );
}
