# Prototype: LLM normalization of raw ingredient strings.
#
# Samples 50 unique raw ingredient strings from the dinner seed corpus and
# parses each into {quantity, unit, name} via ellmer::batch_chat_structured.
# Writes db/seed/ingredient-parse-sample.csv for human review.
#
# Requires an API key in the environment (e.g. OPENAI_API_KEY or
# ANTHROPIC_API_KEY, depending on the chat backend below).
#
# TODO: emit columns matching the `ingredients` table (raw_text, name,
#   quantity, unit, reviewed = false) so the output can be loaded directly.
# TODO: skim-review the full parse output (611 rows is feasible by hand) and
#   mark `reviewed = true` for verified rows.

library(ellmer)

# Fixed unit vocabulary: enforced via type_enum() so the model can only emit
# these values (or null), keeping units consistent for grocery-list merging
# by (name, unit).
# Vocabulary trimmed to units actually used in the full 611-string parse.
# Countable discrete items (cloves, ears, stalks, sprigs, whole produce) all
# collapse to "each".
unit_vocab <- c(
  # volume
  "tbsp", "cup", "fl oz", "pint",
  # weight
  "oz", "lb",
  # count / package
  "each", "slice", "piece", "bunch", "head",
  "can", "jar", "package", "block",
  # fallback: a real unit that doesn't fit any of the above
  "unknown"
)

# db/seed/recipes.jsonl is NDJSON (one object per line); stream_in returns a
# data frame with `ingredients` as a list column
recipes <- jsonlite::stream_in(file("db/seed/recipes.jsonl"), verbose = FALSE)
all_ingredients <- unique(unlist(recipes$ingredients))

chat <- chat_openai(
  system_prompt = paste(
    "You parse recipe ingredient strings into structured data.",
    "For each input string, extract:",
    "- quantity: the numeric amount (null if none stated). Convert fractions",
    "  to decimals ('1/2' -> 0.5).",
    "- unit: the unit of measure. Use null when the string states no unit at",
    "  all ('salt', 'soy sauce', '2 tbsp olive oil' has unit 'tbsp', but plain",
    "  'olive oil' has null). Use 'each' for countable whole items, including",
    "  cloves, ears, stalks, and sprigs ('2 cloves garlic' -> quantity 2, unit",
    "  'each'; '1 small butternut squash' -> quantity 1, unit 'each'). Reserve",
    "  'unknown' for a real unit that fits no other category.",
    "- name: the canonical ingredient name, lowercase singular",
    "  ('2 cloves garlic' -> 'garlic', 'butter, unsalted' -> 'unsalted butter',",
    "  '1 small bunch cilantro' -> 'cilantro'). Drop prep notes unless they",
    "  change what you'd buy at the store.",
    "Package counts stay with the name when the size matters",
    "('1 (14 oz) can diced tomatoes' -> quantity 1, unit 'can',",
    "name 'diced tomatoes')."
  )
)

ingredient_type <- type_object(
  quantity = type_number(
    "Numeric amount; null if none stated",
    required = FALSE
  ),
  unit = type_enum(
    unit_vocab,
    "Unit from the fixed vocabulary; null if none",
    required = FALSE
  ),
  name = type_string("Canonical lowercase singular ingredient name")
)

parsed <- batch_chat_structured( 
  chat,
  as.list(all_ingredients),
  path = "db/seed/ingredients-parsed.json",
  type = ingredient_type
)

result <- data.frame(
  raw_text = all_ingredients,
  name = parsed$name,
  quantity = parsed$quantity,
  unit = parsed$unit,
  stringsAsFactors = FALSE
)

result |> count(unit, sort = TRUE) 

write.csv(result, "db/seed/ingredients-parsed.csv", row.names = FALSE)
message("Wrote ", nrow(result), " parsed ingredients to db/seed/ingredient-parse-sample.csv")
