# Import scraped Mealime recipe JSON into a DB-ready JSONL seed file.
#
# Reads recipes-full/<slug>.json (embedded Next.js __NEXT_DATA__, 2-servings
# US variant), filters to schemaMetadata$category == "Dinner", and writes
# db/seed/recipes.jsonl with one JSON object per line matching the `recipes`
# table shape in db/schema.sql. A later Node seed script (with the Next.js
# app) loads this into Neon.
#
# The full JSON also carries a complete nutrition profile; that stays in
# recipes-full/ for now since the schema has no column for it yet.
#
# Resumable/idempotent: re-running rewrites the JSONL from scratch.

library(jsonlite)

dir.create("db/seed", recursive = TRUE, showWarnings = FALSE)

files <- list.files("recipes-full", pattern = "\\.json$", full.names = TRUE)

skipped <- 0L
out <- vector("list", length(files))
n <- 0L

for (f in files) {
  r <- fromJSON(file(f, encoding = "UTF-8"))
  pp <- r$props$pageProps
  pr <- pp$publishedRecipe

  if (!identical(pp$schemaMetadata$category, "Dinner")) {
    skipped <- skipped + 1L
    next
  }

  slug <- pr$slug
  img <- list.files("recipes-full", pattern = paste0("^", slug, "\\.(jpeg|jpg)$"))
  if (length(img) == 0) img <- NA_character_

  # Structured ingredients from line_items; quantity is "" for pantry
  # staples (their amounts live in the per-step `amounts` below)
  to_null <- function(x) if (is.null(x) || length(x) == 0 || x == "") NA_character_ else x
  ingredients <- lapply(seq_len(nrow(pr$line_items)), function(i) {
    list(
      name = pr$line_items$ingredient_name[i],
      quantity = to_null(pr$line_items$quantity[i])
    )
  })

  # Per-step amounts from secondary_message (newline-separated display
  # strings, e.g. "1 tsp red wine vinegar"), null when a step uses none
  instructions <- lapply(seq_len(nrow(pr$instructions)), function(i) {
    amounts <- pr$instructions$secondary_message[i]
    if (is.null(amounts) || is.na(amounts)) {
      amounts <- NA
    } else {
      # I() keeps single-amount steps as a JSON array, not a bare string
      amounts <- I(strsplit(amounts, "\n", fixed = TRUE)[[1]])
    }
    list(text = pr$instructions$primary_message[i], amounts = amounts)
  })

  n <- n + 1L
  out[[n]] <- list(
    slug = slug,
    mealime_id = as.integer(pr$id),
    name = pr$name,
    source = "mealime",
    source_url = paste0("https://www.mealime.com/recipes/", slug, "/", pr$id),
    category = pp$schemaMetadata$category,
    total_time_minutes = as.integer(pr$cooking_minutes),
    yield = paste(pr$serving_count, "servings"),
    image_path = if (is.na(img)) NA else paste0("recipes-full/", img),
    image_url = pr$presentation_image_url,
    ingredients = ingredients,
    instructions = instructions
  )
}
length(out) <- n

con <- file("db/seed/recipes.jsonl", open = "w", encoding = "UTF-8")
for (rec in out) {
  writeLines(toJSON(rec, auto_unbox = TRUE, na = "null"), con, useBytes = TRUE)
}
close(con)

message("Wrote ", n, " dinner recipes to db/seed/recipes.jsonl (skipped ", skipped, " non-dinner)")
