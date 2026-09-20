# Mealime replacement — plan

## Context

Mealime is shutting down. This project replaces the pieces that mattered:

1. **Dinner meal planning** — pick 3–5 dinners per week, mixing new recipes
   and old favourites, with a rough balance of effort across the week.
2. **Grocery list** — auto-generated from the week's recipes, merged and
   deduplicated, feeding HEB curbside shopping.
3. **Recipe discovery** — browsable catalog with ratings driving what
   resurfaces.

Explicit non-goals (from the interview): nutrition tracking, dietary
restriction filtering, pantry tracking, serving-size scaling, multi-user
accounts.

## Product decisions

- **Dinners only.** The Mealime catalog import will filter to
  `recipeCategory == "Dinner"`.
- **Ratings**: three levels — disliked / liked / loved. Disliked recipes are
  hidden from all future browse/plan views. Liked/loved surface as
  "favourites" when planning.
- **Effort signal**: use `totalTime` only; present it as a soft hint. No
  separate effort model — the user gauges difficulty by eye.
- **Pantry staples**: a static, user-editable list (spices, flour, sugar,
  oils, etc. — no canned goods). Staples are excluded from the grocery list
  unless explicitly added.
- **Custom recipes**:
  - Paste-a-URL import. Try schema.org JSON-LD first; fall back to
    LLM-powered extraction of the page into the same recipe schema.
  - Manual entry form (title, ingredients, steps, time) for Instant Pot and
    family recipes.
  - Imported recipes keep a link back to the source.
- **Single user** for now: one account behind a simple login (shared password
  is fine). Data model should not preclude multi-user later, but no sharing
  UI in v1.

## HEB curbside workflow

Goal: reproduce Mealime's convenient "tap item → find product in HEB" loop.

Findings: `heb.com` search pages send **no** `X-Frame-Options` or CSP
`frame-ancestors` header, so framing is not actively blocked. However, inside
an iframe on our domain HEB's session cookies are third-party and are blocked
by Safari (ITP) and increasingly by Chrome — curbside requires being logged
in, so an iframe approach is fragile. Mealime worked because its native
webview had its own cookie jar.

**Plan (v1)**: the grocery list is a tap-through list; tapping an item opens
`https://www.heb.com/search?q=<ingredient>` in the same tab (mobile) or a new
tab (desktop). User is already logged in there; add product, go back, next
item.

**Possible later upgrade**: a browser extension that embeds the list as a
sidebar on heb.com and auto-searches each item — closest to the original
experience, but desktop-only and an extra install step.

## Recipe recommendations

Goal: when planning a week, present a small stochastic selection of recipes
to pick from, mixing favourites and new recipes.

- **Hard filters**: hide recipes cooked in the last 14 days and disliked
  recipes. 
- **Scoring**: per recipe, `rating_pts` = loved 2 / liked 1 / unrated 0.5;
  `recency_pts` = min(days since cooked, 365) / 365, never cooked = 1;
  `novelty_pts` = 1 if never cooked, else 0.25 × recency_pts. Then
  `score = (1-s) × (rating_pts × recency_pts) + s × novelty_pts`, where the
  persisted **novelty slider** `s ∈ [0,1]`: `s=0` favours old favourites,
  `s=1` favours never-cooked recipes. Scales are intentionally unequal
  (favourite term max 2 vs novelty max 1) so it takes the slider well past
  midpoint before new recipes outdraw a loved favourite.
- **Stochastic sampling**: sample with probability proportional to
  `exp(score / τ)` (softmax over scores) rather than taking top-N, so
  favourites recur often but not always. Fixed temperature τ ≈ 0.3 to
  start, tuned by feel.
- **Protein spread**: stratified weighted sampling across primary-protein
  buckets (beef / chicken / pork / lamb / seafood / vegetarian) so no page
  is dominated by one protein, without rigid quotas.
- **Paging**: show ~9–12 recipes per page (3×3/3×4 card grid). Paging or
  re-roll draws a fresh sample without replacement against recipes already
  shown this session.
- **Protein tagging** is a one-off classification pass over the scraped
  ingredient lists (rules-based or LLM), stored as a column on `recipes`.

## Architecture

- **Frontend**: React (Next.js), mobile-first — primary use is planning on
  desktop and shopping/cooking from a phone browser.
- **Backend**: Next.js API routes (or route handlers).
- **Database**: Postgres on Neon.
- **Hosting**: Vercel.
- **Auth**: single-user; simplest workable option (e.g. one account,
  password via env var / basic auth).
- **LLM extraction**: server-side call for the URL-import fallback; prompt
  the model to emit the recipe schema below.

### Data model (sketch)

- `recipes`: id, slug, name, source (`mealime` | `imported` | `manual`),
  source_url, total_time_minutes, image (local path or URL), yield,
  ingredients (structured: quantity, unit, name), instructions, category,
  primary_protein (beef | chicken | pork | lamb | seafood | vegetarian).
- `ratings`: recipe_id, rating (`disliked` | `liked` | `loved`), updated_at.
- `meal_plans` / `meal_plan_entries`: week start date, recipe_id, position.
- `cook_history` (or derived from meal plans): recipe_id, cooked_at — drives
  the 14-day exclusion and recency signal in recommendations.
- `settings`: persisted novelty slider value (single-user key-value is fine).
- `pantry_staples`: name (matched against grocery list items).
- `grocery_items` (derived per plan, with manual add/remove and check-off).

Grocery list generation: sum ingredients across the week's recipes, normalize
names/units enough to merge obvious duplicates, subtract pantry staples,
allow manual edits.

## Migration of existing data

- Seed the catalog from `recipes/*.json` (2-servings US variant already
  scraped), filtered to `recipeCategory == "Dinner"`.
- Copy images from `recipes/` into app storage (or serve statically).
- Write a one-off import script (R or Node) transforming the JSON-LD shape
  into the `recipes` table.

## Build phases

1. **Schema + seed import** — DB schema, Mealime JSON import script, image
   handling.
2. **Browse & rate** — recipe grid (photo, name, total time), thumbs
   rating, disliked hidden.
3. **Weekly plan** — pick 3–5 dinners for a week via the recommendation
   flow above (novelty slider, stratified stochastic sampling, paging).
4. **Grocery list** — generate, merge, subtract staples, manual edits,
   check-off; HEB search handoff links.
5. **Custom recipes** — URL import (JSON-LD → LLM fallback) + manual form.
6. **Polish** — PWA-ish touches (add-to-homescreen, offline tolerance for
   the grocery list) if time allows.
