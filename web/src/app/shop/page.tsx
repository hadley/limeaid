import { redirect } from "next/navigation";
import { mondayOf } from "@/lib/week";

export const dynamic = "force-dynamic";

export default function ShopIndex() {
  redirect(`/shop/${mondayOf()}`);
}
