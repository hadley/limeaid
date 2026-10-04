import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";
import { currentPlanStart, weekStage } from "@/lib/plan";

export default async function Home() {
  const week = await currentPlanStart();
  const stage = await weekStage(week);
  redirect(
    stage === "plan"
      ? `/plan/${week}`
      : stage === "shop"
        ? `/shop/${week}`
        : `/cook/${week}`,
  );
}
