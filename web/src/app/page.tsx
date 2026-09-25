import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";
import { weekStage } from "@/lib/plan";
import { mondayOf } from "@/lib/week";

export default async function Home() {
  const week = mondayOf();
  const stage = await weekStage(week);
  redirect(
    stage === "plan"
      ? `/plan/${week}`
      : stage === "shop"
        ? `/shop/${week}`
        : `/cook/${week}`,
  );
}
