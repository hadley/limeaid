import Link from "next/link";
import { notFound } from "next/navigation";
import { getCookEntries } from "@/lib/cook";
import { isMonday } from "@/lib/week";
import { StageHeader } from "@/components/stage-header";
import { CookList } from "./list";

export default async function CookWeekPage({
  params,
}: {
  params: Promise<{ week: string }>;
}) {
  const { week } = await params;
  if (!isMonday(week)) notFound();

  const entries = await getCookEntries(week);

  return (
    <main className="container">
      <StageHeader stage="cook" week={week} />
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
