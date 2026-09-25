// Kitchen storage locations. pg-free so client components can import this.
// Classifications come from the ingredient_locations table (see
// scrape-recipes/classify-ingredients.R); this is just display order.
export const LOCATION_ORDER = [
  "Fridge",
  "Freezer",
  "Spice Rack",
  "Pantry",
  // Bench last: it's already by the stove, so gather it last.
  "Bench",
];
