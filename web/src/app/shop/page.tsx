import { redirect } from "next/navigation";
import { currentPlanStart } from "@/lib/plan";

export const dynamic = "force-dynamic";

export default async function ShopIndex() {
  redirect(`/shop/${await currentPlanStart()}`);
}
