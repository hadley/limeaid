import Link from "next/link";
import { notFound } from "next/navigation";
import { getCookEntries } from "@/lib/cook";
import { isDate, shiftWeek } from "@/lib/week";
import { CookList } from "./list";

const weekLabel = (w: string) =>
  new Date(w + "T12:00:00Z").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });

export default async function CookWeekPage({
  params,
}: {
  params: Promise<{ week: string }>;
}) {
  const { week } = await params;
  if (!isDate(week)) notFound();

  // Plans spill over, so last week's meals show here too, under their own
  // week so cooking one marks last week's entry. Uncooked meals sort first.
  const lastWeek = shiftWeek(week, -1);
  const [entries, previous] = await Promise.all([
    getCookEntries(week),
    getCookEntries(lastWeek),
  ]);
  previous.sort((a, b) => Number(a.cooked) - Number(b.cooked));
  entries.sort((a, b) => Number(a.cooked) - Number(b.cooked));

  const cooked = entries.filter((e) => e.cooked).length;

  return (
    <main className="container">
      {entries.length === 0 ? (
        <p className="muted">
          Nothing planned this week —{" "}
          <Link href={`/plan/${week}`}>pick some dinners</Link>.
        </p>
      ) : (
        <>
          <p className="cook-count">
            <strong>{cooked}</strong>/{entries.length} cooked
          </p>
          <CookList key={week} week={week} entries={entries} />
        </>
      )}

      {previous.length > 0 && (
        <section className="cook-previous">
          <h2>Last week · {weekLabel(lastWeek)}</h2>
          <CookList key={lastWeek} week={lastWeek} entries={previous} />
        </section>
      )}
    </main>
  );
}
