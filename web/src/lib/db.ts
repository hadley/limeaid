import { Pool } from "pg";

const globalForPg = globalThis as unknown as { pool?: Pool };

export const pool =
  globalForPg.pool ??
  new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL?.includes("neon.tech")
      ? { rejectUnauthorized: false }
      : undefined,
  });

if (process.env.NODE_ENV !== "production") globalForPg.pool = pool;

export type Ingredient = {
  name: string;
  quantity: number | null;
  unit: string | null;
  display: string;
};

export type Instruction = {
  text: string;
  amounts: string[] | null;
};

export type RecipeSummary = {
  id: string;
  slug: string;
  name: string;
  proteins: string[];
  total_time_minutes: number | null;
  image_path: string | null;
  image_url: string | null;
  community_rating: number | null;
  community_rating_count: number | null;
};

export type Recipe = RecipeSummary & {
  yield: string | null;
  source_url: string | null;
  category: string | null;
  ingredients: Ingredient[];
  instructions: Instruction[];
};

export { imageSrc } from "./images";
