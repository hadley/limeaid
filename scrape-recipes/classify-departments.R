# Classify every canonical ingredient name into a grocery-store department
# using an LLM (OpenAI Batch API via ellmer). One-off enrichment of the seed
# data: writes db/seed/ingredient-departments.csv (name, department), which
# web/scripts/seed.mjs loads into the ingredient_departments table.
#
# Resumable: batch_chat_structured() caches per-prompt results in
# db/seed/ingredient-departments.batch.json — re-running picks up where an
# interrupted run left off. Delete that file (or pass ignore_hash = TRUE)
# after changing the prompt/departments.
#
# Run from the repo root: Rscript scrape-recipes/classify-departments.R
library(ellmer)
library(jsonlite)

departments <- c(
  "Produce",
  "Meat & Seafood",
  "Dairy & Eggs",
  "Bakery",
  "Frozen",
  "Pantry & Dry Goods",
  "Other"
)

# All canonical ingredient names from the seed (staples included — the
# shopping UI groups them separately anyway, but a complete mapping is
# simpler to consume).
# stream_in gives a data frame; ingredients is a list-column of data frames.
recipes <- stream_in(file("db/seed/recipes.jsonl"), verbose = FALSE)
names <- sort(unique(unlist(lapply(recipes$ingredients, `[[`, "name"))))
cat("Classifying", length(names), "ingredient names\n")

chat <- chat_openai(
  model = "gpt-5.6-luna",
  system_prompt = paste(
    "You classify grocery ingredient names into supermarket departments",
    "(for HEB, a Texas grocery chain). Rules of thumb:",
    "- Fresh meat, poultry, and seafood (including bacon, prosciutto,",
    "  sausage) are 'Meat & Seafood'; tofu, tempeh, and vegan sausages too.",
    "- Cheese, milk, cream, yogurt, butter, and eggs are 'Dairy & Eggs',",
    "  as are refrigerated plant milks.",
    "- Bread, tortillas, pitas, naan, buns, and rolls are 'Bakery'.",
    "- Anything sold frozen (name starts with 'frozen', edamame) is 'Frozen'.",
    "- Canned/jarred/dried goods (canned fish and beans, tomato paste and",
    "  sauce, broth, pasta, rice, grains, nuts, seeds, dried fruit, oils,",
    "  vinegars, spices, condiments, coconut milk, water chestnuts, olives,",
    "  capers) are 'Pantry & Dry Goods' even if the name doesn't say 'canned'.",
    "- Everything else fresh (vegetables, fruit, fresh herbs, garlic,",
    "  ginger, chilies) is 'Produce'.",
    "Reply with exactly one department."
  )
)

result <- batch_chat_structured(
  chat,
  prompts = as.list(names), # one prompt per ingredient: just the canonical name
  path = "db/seed/ingredient-departments.batch.json",
  type = type_object(department = type_enum(departments))
)

out <- data.frame(name = names, department = result$department)

# Hand-classified pantry staples: items Mealime lists with quantities but
# everyone keeps on hand. They get their own pseudo-department, which the
# shopping UI renders as the "check you have these" section.
staples <- c(
  "garlic",
  "chicken or vegetable broth",
  "egg",
  "eggs",
  "basmati rice",
  "tomato paste",
  "frozen peas",
  "frozen corn"
)
stopifnot(all(staples %in% out$name))
out$department[out$name %in% staples] <- "Pantry Staples"

stopifnot(
  nrow(out) == length(names),
  out$department %in% c(departments, "Pantry Staples"),
  !is.na(out$department)
)

write.csv(out, "db/seed/ingredient-departments.csv", row.names = FALSE)

print(table(out$department))
cat("\n'Other' (inspect — should be few or empty):\n")
print(out[out$department == "Other", "name"])
