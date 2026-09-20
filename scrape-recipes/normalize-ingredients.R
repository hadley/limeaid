# Prototype: LLM normalization of raw ingredient strings.
#
# Samples 50 unique raw ingredient strings from the dinner seed corpus and
# parses each into {quantity, unit, name} via ellmer::batch_chat_structured.
# Writes db/seed/ingredient-parse-sample.csv for human review. If the parse
# quality looks good, the same approach scales to all 743 unique strings.
#
# Requires an API key in the environment (e.g. OPENAI_API_KEY or
# ANTHROPIC_API_KEY, depending on the chat backend below).

library(ellmer)

# db/seed/recipes.jsonl is JSONL (one object per line), not a single JSON doc
lines <- readLines("db/seed/recipes.jsonl", warn = FALSE)
all_ingredients <- unique(unlist(lapply(lines, function(l) fromJSON(l)$ingredients)))

set.seed(4719)
sample_strings <- sample(all_ingredients, 50)

chat <- chat_openai(
  system_prompt = paste(
    "You parse recipe ingredient strings into structured data.",
    "For each input string, extract:",
    "- quantity: the numeric amount (null if none stated). Convert fractions",
    "  to decimals ('1/2' -> 0.5).",
    "- unit: the unit of measure as a lowercase singular noun",
    "  ('cups' -> 'cup', 'cloves' -> 'clove', 'ounces' -> 'oz').",
    "  null if none.",
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
  quantity = type_number("Numeric amount; null if none stated", required = FALSE),
  unit = type_string("Lowercase singular unit; null if none", required = FALSE),
  name = type_string("Canonical lowercase singular ingredient name")
)

parsed <- batch_chat_structured( 
  chat,
  as.list(sample_strings),
  path = "db/seed/ingredient-parse-sample-batch.json",
  type = ingredient_type
)

result <- data.frame(
  raw_text = sample_strings,
  name = parsed$name,
  quantity = parsed$quantity,
  unit = parsed$unit,
  stringsAsFactors = FALSE
)

write.csv(result, "db/seed/ingredient-parse-sample.csv", row.names = FALSE)
message("Wrote ", nrow(result), " parsed ingredients to db/seed/ingredient-parse-sample.csv")
