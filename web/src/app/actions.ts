"use server";

import { setSetting } from "@/lib/plan";

export async function setNovelty(value: number): Promise<void> {
  await setSetting("novelty", Math.min(1, Math.max(0, value)));
}
