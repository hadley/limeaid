# Classify every canonical ingredient name twice in one LLM batch job
# (OpenAI Batch API via ellmer):
#   - department: grocery-store department (for the shop page grouping)
#   - location:   kitchen storage location (for the cook page's "get
#                 everything out" screen)
# One-off enrichment of the seed data: writes
# db/seed/ingredient-classifications.csv (name, department, location), which
# web/scripts/seed.mjs loads into the ingredient_departments and
# ingredient_locations tables.
#
# Resumable: batch_chat_structured() caches per-prompt results in
# db/seed/ingredient-classifications.batch.json — re-running picks up where
# an interrupted run left off. Delete that file (or pass ignore_hash = TRUE)
# after changing the prompt/departments/locations.
#
# NOTE: this costs money. Check with the user before running.
# Run from the repo root: Rscript scrape-recipes/classify-ingredients.R
library(ellmer)
library(jsonlite)

departments <- c(
  "Produce",
  "Meat & Seafood",
  "Dairy & Eggs",
  "Frozen",
  "Pantry & Dry Goods",
  "Pantry Staples",
  "Other"
)

locations <- c(
  "Fridge",
  "Freezer",
  "Pantry",
  "Spice Rack",
  "Bench"
)

# All canonical ingredient names from the seed (staples included — the shop
# UI groups them separately and the cook screen needs them located too).
recipes <- stream_in(file("db/seed/recipes.jsonl"), verbose = FALSE)
names <- sort(unique(unlist(lapply(recipes$ingredients, `[[`, "name"))))
cat("Classifying", length(names), "ingredient names\n")

chat <- chat_openai(
  model = "gpt-6-luna",
  system_prompt = paste(
    "You classify grocery ingredient names twice: their supermarket",
    "department (for HEB, a Texas grocery chain) and their storage location",
    "in a home kitchen.",
    "",
    "Department rules of thumb:",
    "- Fresh meat, poultry, and seafood (including bacon, prosciutto,",
    "  sausage) are 'Meat & Seafood'; tofu, tempeh, and vegan sausages too.",
    "- Cheese, milk, cream, yogurt, butter, and eggs are 'Dairy & Eggs',",
    "  as are refrigerated plant milks.",
    "- Bread, tortillas, pitas, naan, buns, and rolls are 'Pantry & Dry",
    "  Goods'.",
    "- Anything sold frozen (name starts with 'frozen', edamame) is 'Frozen'.",
    "- Canned/jarred/dried goods (canned fish and beans, tomato paste and",
    "  sauce, broth, pasta, rice, grains, nuts, seeds, dried fruit, oils,",
    "  vinegars, spices, condiments, coconut milk, water chestnuts, olives,",
    "  capers) are 'Pantry & Dry Goods' even if the name doesn't say 'canned'.",
    "- Salt, pepper, and other basic seasonings a cook already owns are",
    "  'Pantry Staples'.",
    "- Everything else fresh (vegetables, fruit, fresh herbs, garlic,",
    "  ginger, chilies) is 'Produce'.",
    "",
    "Location rules of thumb:",
    "- Fresh meat, poultry, seafood, dairy, eggs, tofu, and refrigerated",
    "  plant milks are 'Fridge'.",
    "- Fresh produce (vegetables, fruit, fresh herbs, ginger, chilies) is",
    "  'Fridge' — EXCEPT garlic, which lives on the 'Bench'.",
    "- Anything sold frozen (name starts with 'frozen', edamame) is",
    "  'Freezer'.",
    "- Dried herbs and spices (cumin, oregano, chili powder, cinnamon,",
    "  etc.) are 'Spice Rack'.",
    "- Salt, black pepper, olive oil, and garlic are 'Bench' (kept out by",
    "  the stove). Other oils and vinegars are 'Pantry'.",
    "- Everything else shelf-stable (canned/jarred/dried goods, pasta,",
    "  rice, grains, flour, sugar, nuts, seeds, condiments, soy sauce,",
    "  broth, bread, tortillas) is 'Pantry'.",
    "",
    "Reply with exactly one department and one location."
  )
)

result <- batch_chat_structured(
  chat,
  prompts = as.list(names), # one prompt per ingredient: just the canonical name
  path = "db/seed/ingredient-classifications.batch.json",
  type = type_object(
    department = type_enum(departments),
    location = type_enum(locations)
  )
)

out <- data.frame(
  name = names,
  department = result$department,
  location = result$location
)

# Manual overrides: corrections to the LLM's classifications, applied after
# the batch so re-runs keep them.
out$location[out$name == "chicken or vegetable broth"] <- "Fridge"
write.csv(out, "db/seed/ingredient-classifications.csv", row.names = FALSE)
cat("Wrote", nrow(out), "rows to db/seed/ingredient-classifications.csv\n")
print(table(out$department))
print(table(out$location))
