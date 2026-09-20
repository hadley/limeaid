# Import scraped Mealime recipe JSON into a DB-ready JSONL seed file.
#
# Reads recipes/<slug>.json (schema.org Recipe, 2-servings US variant),
# filters to recipeCategory == "Dinner", and writes db/seed/recipes.jsonl
# with one JSON object per line matching the `recipes` table shape in
# db/schema.sql. A later Node seed script (with the Next.js app) loads this
# into Neon.
#
# Resumable/idempotent: re-running rewrites the JSONL from scratch.

library(jsonlite)

dir.create("db/seed", recursive = TRUE, showWarnings = FALSE)

files <- list.files("recipes", pattern = "\\.json$", full.names = TRUE)

# "PT35M" / "PT1H15M" -> minutes
parse_duration <- function(x) {
  if (is.null(x) || is.na(x)) return(NA_integer_)
  m <- regmatches(x, regexec("^PT(?:(\\d+)H)?(?:(\\d+)M)?$", x))[[1]]
  if (length(m) < 3 || m[1] == "") return(NA_integer_)
  h <- if (m[2] == "") 0L else as.integer(m[2])
  min <- if (m[3] == "") 0L else as.integer(m[3])
  h * 60L + min
}

# Mealime JSON embeds HTML entities like &quot; and &amp;
decode_entities <- function(x) {
  x <- gsub("&quot;", '"', x, fixed = TRUE)
  x <- gsub("&amp;", "&", x, fixed = TRUE)
  x <- gsub("&#39;|&apos;", "'", x)
  x <- gsub("&lt;", "<", x, fixed = TRUE)
  x <- gsub("&gt;", ">", x, fixed = TRUE)
  x
}

skipped <- 0L
out <- vector("list", length(files))
n <- 0L

for (f in files) {
  r <- fromJSON(f)
  if (!identical(r$recipeCategory, "Dinner")) {
    skipped <- skipped + 1L
    next
  }

  slug <- sub("\\.json$", "", basename(f))
  img <- list.files("recipes", pattern = paste0("^", slug, "\\.(jpeg|jpg)$"))
  if (length(img) == 0) img <- NA_character_

  instructions <- r$recipeInstructions$text
  n <- n + 1L
  out[[n]] <- list(
    slug = slug,
    mealime_id = as.integer(r[["@id"]]),
    name = decode_entities(r$name),
    source = "mealime",
    source_url = r$url,
    category = r$recipeCategory,
    total_time_minutes = parse_duration(r$totalTime),
    yield = r$recipeYield,
    image_path = if (is.na(img)) NA else paste0("recipes/", img),
    image_url = r$image,
    ingredients = decode_entities(r$recipeIngredient),
    instructions = decode_entities(instructions)
  )
}
length(out) <- n

con <- file("db/seed/recipes.jsonl", open = "w", encoding = "UTF-8")
for (rec in out) {
  writeLines(toJSON(rec, auto_unbox = TRUE, na = "null"), con, useBytes = TRUE)
}
close(con)

message("Wrote ", n, " dinner recipes to db/seed/recipes.jsonl (skipped ", skipped, " non-dinner)")
