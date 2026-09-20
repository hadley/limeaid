-- Mealime replacement — database schema (Postgres / Neon)
-- Single user for v1; no user table. Multi-user can be added later by
-- introducing a users table and user_id columns without reshaping anything.

create table recipes (
  id            bigint generated always as identity primary key,
  slug          text not null unique,          -- mealime slug, or generated for imports
  mealime_id    integer unique,                -- null for non-Mealime recipes
  name          text not null,
  source        text not null default 'mealime'
                check (source in ('mealime', 'imported', 'manual')),
  source_url    text,                          -- mealime url or origin site
  category      text,                          -- 'Dinner', 'Simple', etc.
  total_time_minutes integer,                  -- parsed from ISO 8601; soft signal only
  yield         text,                          -- e.g. '2 servings'
  image_path    text,                          -- local file in app storage
  image_url     text,                          -- original CDN url (fallback)
  ingredients   jsonb not null,                -- array of {name, quantity?}; quantity absent = pantry staple
  instructions  jsonb not null,                -- array of {text, amounts?}, ordered; amounts = per-step qty strings
  created_at    timestamptz not null default now()
);

create index recipes_category_idx on recipes (category);

-- Three-level rating; disliked recipes are hidden everywhere in the UI.
create table ratings (
  recipe_id  bigint not null references recipes (id) on delete cascade,
  rating     text not null check (rating in ('disliked', 'liked', 'loved')),
  updated_at timestamptz not null default now(),
  primary key (recipe_id)
);

-- Weekly dinner plans. A plan covers a week; entries are the picked dinners.
create table meal_plans (
  id          bigint generated always as identity primary key,
  week_start  date not null unique,            -- Monday of the planned week
  created_at  timestamptz not null default now()
);

create table meal_plan_entries (
  id         bigint generated always as identity primary key,
  meal_plan_id bigint not null references meal_plans (id) on delete cascade,
  recipe_id    bigint not null references recipes (id),
  cooked       boolean not null default false, -- marked once actually cooked that week
  unique (meal_plan_id, recipe_id)
);

-- Ingredient dictionary: maps each raw ingredient string ("2 cloves garlic")
-- to a parsed quantity/unit and a canonical normalized name. Populated by a
-- one-time LLM batch pass over the corpus; new recipes are normalized at
-- import time. Grocery-list merging groups by `name`; pantry-staple matching
-- is an exact match on `name`.
create table ingredients (
  id        bigint generated always as identity primary key,
  raw_text  text not null unique,              -- exact string as it appears in a recipe
  name      text,                              -- canonical lowercase singular, e.g. 'garlic'
  quantity  numeric,                           -- null for unstated amounts ("salt")
  unit      text,                              -- 'clove', 'cup', 'oz', ...; null if none
  reviewed  boolean not null default false,    -- set once a human has verified the parse
  created_at timestamptz not null default now()
);

-- Static pantry staples (spices, flour, sugar, oils, ...). Grocery list
-- generation skips items whose normalized name matches a staple.
create table pantry_staples (
  id   bigint generated always as identity primary key,
  name text not null unique                    -- lowercase, normalized
);

-- Grocery list for a plan: generated from the plan's recipes, then freely
-- editable. generated_from records provenance for regeneration.
create table grocery_items (
  id           bigint generated always as identity primary key,
  meal_plan_id bigint not null references meal_plans (id) on delete cascade,
  name          text not null,                 -- display text, e.g. '2 limes'
  ingredient_id bigint references ingredients (id), -- null for manually added free-text items
  recipe_id     bigint references recipes (id),     -- null for manually added items
  checked      boolean not null default false,
  position     smallint not null default 0,
  created_at   timestamptz not null default now()
);

create index grocery_items_meal_plan_idx on grocery_items (meal_plan_id);
