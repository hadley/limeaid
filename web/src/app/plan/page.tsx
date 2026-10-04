import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";
import { currentPlanStart } from "@/lib/plan";

export default async function PlanIndex() {
  redirect(`/plan/${await currentPlanStart()}`);
}
