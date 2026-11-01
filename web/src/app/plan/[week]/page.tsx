import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ensurePlan, getPicks, hasCookedPlan, suggestionPage } from "@/lib/plan";
import { getNovelty } from "@/lib/settings";
import { isDate, today } from "@/lib/week";
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
  if (!isDate(week)) notFound();

  await ensurePlan(week);
  const novelty = await getNovelty();
  const [page, picks] = await Promise.all([
    suggestionPage(week, novelty, 0, q, protein),
    getPicks(week),
  ]);

  const thisWeek = today();
  const showBanner = week !== thisWeek && (await hasCookedPlan());

  const weekLabel = (w: string) =>
    new Date(w + "T12:00:00Z").toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    });

  return (
    <main className="container wide">
      {showBanner && (
        <p className="plan-banner">
          Planning the week of {weekLabel(week)}.{" "}
          <Link href={`/plan/${thisWeek}`}>
            Start a new plan for {weekLabel(thisWeek)}
          </Link>
        </p>
      )}
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
