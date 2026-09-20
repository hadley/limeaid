// Grocery-store departments. pg-free so client components can import this.
// Classifications come from the ingredient_departments table (see
// scrape-recipes/classify-departments.R); this is just display order.
export const DEPARTMENT_ORDER = [
  "Produce",
  "Meat & Seafood",
  "Dairy & Eggs",
  "Bakery",
  "Frozen",
  "Pantry & Dry Goods",
  // Staples normally render in their own "check you have these" section;
  // listed here so one leaking into the to-buy list sorts last.
  "Pantry Staples",
  "Other",
];
