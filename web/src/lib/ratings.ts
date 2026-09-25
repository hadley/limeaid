// The user's three-level recipe rating, mirroring the check constraint on
// ratings.rating in db/schema.sql. pg-free so client components can import
// this.
export type Rating = "disliked" | "liked" | "loved";

// Worst to best; the order rating buttons are shown in.
export const RATINGS: Rating[] = ["disliked", "liked", "loved"];

export const RATING_EMOJI: Record<Rating, string> = {
  disliked: "👎",
  liked: "👍",
  loved: "❤️",
};

const RATING_NAME: Record<Rating, string> = {
  disliked: "Disliked",
  liked: "Liked",
  loved: "Loved",
};

// Emoji plus name, e.g. "👍 Liked", for buttons and menus.
export const ratingLabel = (r: Rating) =>
  `${RATING_EMOJI[r]} ${RATING_NAME[r]}`;
