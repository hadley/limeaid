# Mealime recipe scraper

Goal: build a Mealime replacement (Mealime is shutting down) — see PLAN.md.
Dinner-only planning, grocery list feeding HEB curbside via search-URL
handoff, React/Next.js + Postgres on Vercel, single user. The scraped corpus 
below is the seed catalog.

Scraping stage: complete. Full recipe JSON (embedded Next.js `__NEXT_DATA__`,
2-servings US variant) saved to `recipes-full/<slug>.json` alongside images
`recipes-full/<slug>.<jpeg|jpg>`; both gitignored. 1607/1608 recipes — the
one failure (`stuffed-acorn-squash-apple-bacon-pine-nuts`, id 4534) has no
working 2-servings US variant on Mealime itself (its "2 servings" link 404s).

## Site structure

- Index: `https://www.mealime.com/recipes?page=N`, 67 pages, 24 recipes/page.
  There is NO meal-type filter on the index (query params like `?category=dinner`
  are ignored — they return the same results).
- Recipe pages: `https://www.mealime.com/recipes/<slug>/<id>`. The rich data is
  the embedded Next.js blob in `<script id="__NEXT_DATA__" type="application/json">`
  — extract with rvest + jsonlite. Data lives at
  `props.pageProps.publishedRecipe` (id, recipe_id, slug, serving_count,
  cooking_minutes, name, presentation_image_url, cookwares, instructions,
  line_items, nutrition) plus `props.pageProps.schemaMetadata` (category,
  keywords, cuisine, reviewCount). Sanity-check `parsed$page ==
  "/recipes/[slug]/[variantId]"` — Next.js serves a 200 with a 404 page body
  for dead variant ids.
- Key fields: `line_items` = data frame of {quantity, ingredient_name}
  (quantity is "" for pantry staples); `instructions` = data frame of
  {primary_message, secondary_message} where secondary_message holds the
  per-step quantities ("1 tsp red wine vinegar") as newline-separated strings;
  `nutrition` = ~80-field nutrient profile (not yet imported into the schema).
- The page ALSO embeds a schema.org Recipe as JSON-LD, but it is a lossy
  summary: pantry staples have no quantities anywhere in it. Do not use it.
- Variant URLs: the index URL is the 4-servings/US-units variant. The reliable
  way to find other variants is the labeled links on the recipe page itself
  (`a[href*='/recipes/']` with link text "2 servings" / "4 servings" /
  "6 servings" / "US Units" / "Metric Units").
- The `id - 1` = 2-servings US shortcut holds for NEWER recipes only (median id
  ~17k). For ~200 of the oldest recipes (median id ~3.4k) it 404s — variant ids
  there are non-contiguous (e.g. 2/4/6-servings US = id-2/id/id+2, metric a
  distant id). No clean rule (not parity, not a fixed offset); use the page
  links as the fallback.

## Scripts

- `scrape-recipes/scrape-index.R`: fetches all 67 index pages with
  `httr2::req_perform_iterative(iterate_with_offset("page"), max_reqs = 67)`,
  deduplicates by slug, writes `mealime-index.csv` (slug, id, url,
  url_2serv_us).
- `scrape-recipes/scrape-full-json.R`: downloads each recipe's `__NEXT_DATA__`
  JSON to `recipes-full/<slug>.json`. Parallel via
  `req_perform_parallel(on_error = "continue")`, throttled to 100 req/sec.
  Pass 1 uses `url_2serv_us` (id - 1); pass 2 retries failures by following
  the "2 servings" link on the 4-servings page; pass 3 detects saved JSONs
  whose `serving_count != 2` (pass 2 landed 67 old recipes on 4-servings
  metric pages) and re-scrapes them via the "US Units" link followed by the
  "2 servings" link. Resumes on re-run by skipping slugs whose .json
  already exists.
- `scrape-recipes/import-recipes.R`: reads `recipes-full/*.json`, filters to
  `schemaMetadata$category == "Dinner"` (1224 of 1607), writes
  `db/seed/recipes.jsonl` matching the `recipes` table in db/schema.sql.
  Emits structured JSONB shapes: `ingredients` = [{name, quantity, unit,
  display}] (null quantity/unit = pantry staple) and `instructions` = [{text,
  amounts|null}] (amounts = per-step quantity strings). Images referenced as
  `recipes-full/<slug>.<ext>`. Quantity parsing is deterministic (no LLM —
  line_items already splits name/quantity, and all quantity strings match
  `<number> [(pkg size)] [unit words]`); package sizes stay in the unit
  (e.g. `can (15 oz)`) so grocery merging never mixes sizes, and names are
  canonicalized lowercase + comma-inversion only (no singularization).
  Also emits `proteins` = array of all matched protein categories
  (chicken/beef/pork/lamb/turkey/seafood/tofu/egg; [] = vegetarian),
  stored as `text[]` in the schema. Multi-label by design — no
  winner-take-all, so "Prosciutto-Wrapped Cod" = ["pork", "seafood"];
  99 recipes have multiple proteins. Keyword match on canonical
  ingredient names; patterns match main-dish forms only so seasonings
  (broth, fish sauce, anchovy) don't classify. bacon/prosciutto are
  pork. Known coverage gaps fixed by spot-checking: lamb, prosciutto,
  sole.
- `scrape-recipes/fix-metric-recipes.R`: superseded one-off fix for the old
  JSON-LD corpus; kept for history only.
- Deleted: `scrape-recipes.R` / `scrape-images.R` (JSON-LD era; recoverable
  from git history if needed).

## Conventions

- Use `pak::pak()` to install packages; base R pipe `|>`.
- jsonlite gotchas when emitting the JSONL: NULL list elements serialize as
  `{}` — use `NA` with `na = "null"` instead; wrap single-element vectors in
  `I()` so `auto_unbox = TRUE` doesn't collapse them to bare strings.
