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

# --- deterministic quantity parsing -----------------------------------------
# line_items already splits name/quantity, and every quantity string in the
# corpus matches `<number> [(package size)] [unit words]`, so parsing is a
# regex, not an LLM. stopifnot guards against new shapes appearing.

unicode_fractions <- c(
  "¼" = 0.25, "½" = 0.5, "¾" = 0.75,
  "⅓" = 1 / 3, "⅔" = 2 / 3,
  "⅛" = 0.125, "⅜" = 0.375, "⅝" = 0.625, "⅞" = 0.875
)

parse_number <- function(x) {
  # "1 ½" -> 1.5, "½" -> 0.5, "0.454" -> 0.454
  total <- 0
  for (part in strsplit(x, " ", fixed = TRUE)[[1]]) {
    if (part %in% names(unicode_fractions)) {
      total <- total + unicode_fractions[[part]]
    } else {
      total <- total + as.numeric(part)
    }
  }
  total
}

# Size descriptors are stripped from unit words; "each" when nothing remains
# ("2 medium heads" -> 2 head; "10 medium" -> 10 each)
size_words <- c("small", "medium", "large")

unit_aliases <- c(
  "cans" = "can", "jars" = "jar", "pkgs" = "pkg", "packages" = "package",
  "blocks" = "block", "logs" = "log", "pieces" = "piece",
  "slices" = "slice", "cloves" = "clove", "ears" = "ear", "heads" = "head",
  "bunches" = "bunch", "crowns" = "crown", "sticks" = "stick",
  "caps" = "cap", "cups" = "cup", "pints" = "pint"
)

parse_quantity <- function(q) {
  # Returns list(quantity = numeric|NA, unit = character|NA). Package sizes
  # stay in the unit ("can (15 oz)") so grocery merging never mixes sizes.
  if (is.na(q) || q == "") return(list(quantity = NA_real_, unit = NA_character_))

  m <- regmatches(q, regexec("^([0-9.¼½¾⅓⅔⅛⅜⅝⅞ ]+?)\\s*(?:\\(([^)]*)\\)\\s*)?([a-z ]*)$", q))[[1]]
  stopifnot("unparseable quantity string" = length(m) == 4)

  quantity <- parse_number(trimws(m[2]))
  size <- m[3] # "" when absent
  words <- trimws(m[4])

  words <- trimws(paste(setdiff(strsplit(words, " ", fixed = TRUE)[[1]], size_words), collapse = " "))
  if (words == "") words <- "each"
  if (words %in% names(unit_aliases)) words <- unit_aliases[[words]]
  if (size != "") words <- paste0(words, " (", size, ")")

  list(quantity = quantity, unit = words)
}

# --- protein classification ---------------------------------------------------
# Keyword match against canonical ingredient names. All matching categories
# are kept (in rule order) as a `proteins` array, so a dish can be both
# chicken and pork (e.g. wrapped in prosciutto); empty array = vegetarian.
# Patterns match main-dish forms only, so seasonings (broth, fish sauce,
# anchovy) don't classify.

protein_patterns <- c(
  chicken = "chicken (breast|thigh|drumstick|wing)|ground chicken",
  beef    = "ground beef|steak|striploin|ribeye|flank steak",
  pork    = "pork chop|pork sausage|ground pork|prosciutto|bacon",
  lamb    = "lamb",
  turkey  = "turkey",
  seafood = "salmon|shrimp|cod|tilapia|tuna|halibut|mahi|sole|fish fillet|scallop|mussel|clam|crab|lobster",
  tofu    = "tofu|tempeh|vegan sausage",
  egg     = "^eggs?$"
)

classify_proteins <- function(names) {
  matched <- names(protein_patterns)[vapply(
    protein_patterns,
    \(pat) any(grepl(pat, names, ignore.case = TRUE)),
    logical(1)
  )]
  I(as.list(matched)) # keeps [] / ["pork"] as JSON arrays under auto_unbox
}

canonical_name <- function(x) {
  x <- tolower(x)
  # "butter, unsalted" -> "unsalted butter" (no singularization)
  if (grepl(", ", x, fixed = TRUE)) {
    parts <- strsplit(x, ", ", fixed = TRUE)[[1]]
    x <- paste(c(parts[-1], parts[1]), collapse = " ")
  }
  x
}

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
  # staples (their amounts live in the per-step `amounts` below). Each item
  # is {name, quantity, unit, display}: name canonicalized for grocery-list
  # merging, quantity/unit parsed, display the original string for the UI.
  ingredients <- lapply(seq_len(nrow(pr$line_items)), function(i) {
    qty_str <- pr$line_items$quantity[i]
    parsed <- parse_quantity(qty_str)
    display <- if (is.na(qty_str) || qty_str == "") {
      pr$line_items$ingredient_name[i]
    } else {
      paste(qty_str, pr$line_items$ingredient_name[i])
    }
    list(
      name = canonical_name(pr$line_items$ingredient_name[i]),
      quantity = parsed$quantity,
      unit = parsed$unit,
      display = display
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
    proteins = classify_proteins(vapply(pr$line_items$ingredient_name, canonical_name, character(1))),
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
