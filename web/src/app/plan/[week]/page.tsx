import Link from "next/link";
import { notFound } from "next/navigation";
import { ensurePlan, getNovelty, getPicks, latestPage } from "@/lib/plan";
import { isMonday, mondayOf, shiftWeek } from "@/lib/week";
import { Picker } from "./picker";

export default async function PlanWeekPage({
  params,
}: {
  params: Promise<{ week: string }>;
}) {
  const { week } = await params;
  if (!isMonday(week)) notFound();

  await ensurePlan(week);
  const [page, picks, novelty] = await Promise.all([
    latestPage(week),
    getPicks(week),
    getNovelty(),
  ]);

  const label = new Date(week + "T12:00:00Z").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });

  return (
    <main className="container">
      <nav className="week-nav">
        <Link href={`/plan/${shiftWeek(week, -1)}`}>← Prev week</Link>
        <strong>Week of {label}</strong>
        <Link href={`/plan/${shiftWeek(week, 1)}`}>Next week →</Link>
      </nav>
      {week !== mondayOf() && (
        <p className="muted">
          <Link href={`/plan/${mondayOf()}`}>Jump to current week</Link>
        </p>
      )}
      <Picker
        week={week}
        initialPage={JSON.parse(JSON.stringify(page))}
        initialPicks={JSON.parse(JSON.stringify(picks))}
        initialNovelty={novelty}
      />
    </main>
  );
}
