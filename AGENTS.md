# Mealime recipe scraper

Goal: scrape Mealime dinner recipes. Current stage: building a CSV index of all
recipe URLs (`scrape-index.R` -> `mealime-index.csv`); recipe-page scraping is
not yet implemented.

## Site structure

- Index: `https://www.mealime.com/recipes?page=N`, 67 pages, 24 recipes/page.
  There is NO meal-type filter on the index (query params like `?category=dinner`
  are ignored — they return the same results).
- Recipe pages: `https://www.mealime.com/recipes/<slug>/<id>`. Each page embeds
  a schema.org Recipe as JSON-LD in
  `<script type="application/ld+json">` — extract with rvest + jsonlite rather
  than parsing HTML. Contains name, recipeCategory ("Dinner", "Snack", ...),
  totalTime (ISO 8601), recipeYield, recipeIngredient, recipeInstructions,
  image. Filter to dinners via `recipeCategory == "Dinner"` after fetching.
- Variant URLs (serving sizes / units) are deterministic: the index URL is the
  4-servings/US-units variant; 2-servings US is `id - 1` (verified on 3 recipes;
  re-verify if it ever breaks). Metric and 6-serving ids exist but don't follow
  as clean an offset.

## Scripts

- `scrape-index.R`: fetches all 67 index pages with
  `httr2::req_perform_iterative(iterate_with_offset("page"), max_reqs = 67)`,
  throttled to 1 req/sec, deduplicates by slug, writes `mealime-index.csv`
  (slug, id, url, url_2serv_us).

## Conventions

- Use `pak::pak()` to install packages; base R pipe `|>`.
