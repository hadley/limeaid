# Mealime replacement

Mealime is shutting down. This replaces the pieces that mattered: picking
3–5 dinners per week, a merged grocery list that feeds HEB curbside, and a
browsable catalog where ratings drive what resurfaces.

Single user (shared-password login). Non-goals: nutrition tracking, dietary
filtering, pantry tracking, serving scaling, multi-user.

## Status

- **Scraping: complete.** 1607/1608 recipes saved as full `__NEXT_DATA__`
  JSON (every file verified US units + 2 servings), plus images in
  `recipes-full/`. See AGENTS.md for scraper details.
- **Seed: complete.** `db/seed/recipes.jsonl` — 1224 dinner recipes matching
  the `recipes` table in `db/schema.sql` (authoritative schema).
- **Schema: proven** via a throwaway R/Shiny prototype (`app/app.R`, SQLite
  via `db/load-sqlite.R`) exercising browse, ratings, plan, and shopping
  list. Disposable — the real app is Next.js (below).
- **Stage 1 (foundation + catalog): done.** `web/` Next.js app seeded with
  1224 recipes (`npm run seed` in `web/`, DATABASE_URL in `web/.env.local`),
  browse (`/recipes`) with search + protein filter, detail
  (`/recipes/[slug]`), shared-password middleware (`APP_PASSWORD`).
- **Plan stage: done.** `/plan/[week]` (Monday `YYYY-MM-DD`; `/plan` and `/`
  redirect to current week) with scored softmax sampling (τ=0.3, stratified
  by protein bucket), 12-card batches persisted per-week in `settings`
  (`plan-batch:`/`plan-shown:` keys), tap-to-pick toggling into
  `meal_plan_entries`, and the novelty slider (`settings.novelty`, default
  0.3). Navbar shows Plan/Shop/Cook pills; Cook is display-only until its
  stage is built.
- **Shop stage: done.** `/shop/[week]` lazily generates `grocery_items`
  from the week's picks (merge by (name, unit), null-quantity → pantry
  staples section, unicode-fraction display), checkbox persistence, HEB
  search-URL handoff on the item name, and a Regenerate button that rebuilds
  from current picks (resets checkmarks). `/` redirects adaptively to plan
  or shop (cook → shop until `/cook` exists; TODO in
  `web/src/app/page.tsx`). Clicking an item's HEB link also checks it off.
  To-buy items group by department (alphabetical within) from
  `ingredient_departments`, seeded from
  `db/seed/ingredient-departments.csv` (289 names; produced by
  `scrape-recipes/classify-departments.R`, LLM batch classification).
  Department "Pantry Staples" in that CSV (garlic, broth, eggs, basmati
  rice, tomato paste, frozen peas/corn) routes items into the staples
  section even though Mealime gives them quantities.
- **Navbar**: week dropdown (`WeekSelector`, navigates same stage to the
  chosen week) and a gear settings menu holding the novelty slider;
  per-page prev/next week nav removed. Plan page has the same text/protein
  filter as /recipes, applied at sampling time (pages keyed
  `plan-pages:<week>:<q>|<protein>`).

## Components

The app is a weekly loop with three stages, always visible in the navbar as
**Plan → Shop → Cook** pills with progress counts (e.g. `Shop · 12/38`); the
current stage is highlighted:

- **plan** — no dinners picked yet this week
- **shop** — dinners picked, groceries remain unchecked
- **cook** — shopping done, meals remain uncooked

`/` redirects adaptively to the current stage. Weeks are navigable:
`/plan/[week]`, `/shop/[week]`, `/cook/[week]` (bare paths redirect to the
current week, keyed by Monday `week_start`).

### Catalog and browse (`/recipes`, `/recipes/[slug]`)

1224 seeded dinner recipes. Browse = card grid (photo, name, total time,
rating badge) with text search and protein filter. Detail page shows
structured ingredients, steps with per-step amounts, time/yield/proteins,
and the Mealime community rating (★ average + review count) — shown as a
recall aid while re-entering personal ratings from Mealime. `totalTime` is
the only effort signal, presented as a soft hint.

### Ratings

Three levels: disliked / liked / loved, one row per recipe in `ratings`.
Disliked recipes are hidden from browse and selection. **Rating happens in
the cooking flow only** (after marking a meal cooked); browse/detail show
ratings but don't edit them. Until history builds up, all recipes score as
unrated — the selection scoring handles this.

### Selection (`/plan/[week]`)

Paged recommendation grid (~12 cards/page). User taps to select until they
have the number they want; picks persist immediately to `meal_plans` +
`meal_plan_entries` so the plan survives reloads. Paging or re-roll draws a
fresh sample without replacement against recipes already shown this session.

- **Hard filters**: disliked, and anything cooked in the last 14 days
  (`meal_plan_entries.cooked_at`).
- **Scoring**: `rating_pts` = loved 2 / liked 1 / unrated 0.5;
  `recency_pts` = min(days since cooked, 365)/365 (never cooked = 1);
  `novelty_pts` = 1 if never cooked else 0.25 × recency_pts.
  `score = (1-s)(rating_pts × recency_pts) + s × novelty_pts`, where `s` is
  the persisted novelty slider (`settings` table). Scales intentionally
  unequal so new recipes only outdraw a loved favourite past the midpoint.
- **Sampling**: softmax, `p ∝ exp(score/τ)`, τ ≈ 0.3 to start.
- **Protein spread**: stratified weighted sampling across protein buckets so
  no page is dominated by one protein. `recipes.proteins` is a multi-label
  `text[]` (done at import; 298 vegetarian, 218 chicken, 171 seafood, 153
  beef, 150 pork, 52 egg, 44 tofu, 31 turkey; 99 multi-protein).

### Shopping (`/shop/[week]`)

Grocery list generated from the week's recipes: merge by (name, unit),
summing quantities — canonical names and package-sizes-in-units
(`can (15 oz)`) from the import make naive merging safe. Quantities
displayed with fractions (1½ lb). Two sections: **to buy**, then **pantry
staples** (the null-quantity ingredients: salt, oil, spices — grouped, not
silently dropped) with the prompt "check you have these". Check-off
persists to `grocery_items.checked`. No manual items.

**HEB handoff**: tapping an item opens `https://www.heb.com/search?q=<name>`
in new-tab 

### Cooking (`/cook/[week]`, `/cook/[week]/[entryId]`)

The week's meals, cooked ones dimmed. Cooking view is mobile-first, one
page per step (text + per-step amounts from the `instructions` JSONB).
Finishing marks the entry cooked (`cooked` + `cooked_at`) and prompts for a
rating.

## Architecture

- **Frontend**: Next.js (React), mobile-first — plan on desktop, shop and
  cook from a phone.
- **Backend**: route handlers + server actions (rating upsert, plan entry
  add/remove, grocery toggle, cooked toggle).
- **Database**: Postgres on Neon; schema is `db/schema.sql`; seed via a
  Node script reading `db/seed/recipes.jsonl` (the SQLite loader shows the
  field mapping). Images copied from `recipes-full/` into static storage.
- **Hosting**: Vercel. **Auth**: middleware password check via env var.
- Later polish: PWA touches (add-to-homescreen, offline grocery list).
