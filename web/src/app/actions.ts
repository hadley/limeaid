"use server";

import { setNovelty as saveNovelty } from "@/lib/settings";

export async function setNovelty(value: number): Promise<void> {
  await saveNovelty(value);
}
