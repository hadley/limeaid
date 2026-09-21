import Link from "next/link";
import { notFound } from "next/navigation";
import { getCookEntries } from "@/lib/cook";
import { isMonday } from "@/lib/week";
import { CookList } from "./list";

export default async function CookWeekPage({
  params,
}: {
  params: Promise<{ week: string }>;
}) {
  const { week } = await params;
  if (!isMonday(week)) notFound();

  const entries = await getCookEntries(week);

  const label = new Date(week + "T12:00:00Z").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });

  return (
    <main className="container">
      <h1>Week of {label}</h1>
      {entries.length === 0 ? (
        <p className="muted">
          Nothing planned this week —{" "}
          <Link href={`/plan/${week}`}>pick some dinners</Link>.
        </p>
      ) : (
        <CookList
          week={week}
          initialEntries={JSON.parse(JSON.stringify(entries))}
        />
      )}
    </main>
  );
}
