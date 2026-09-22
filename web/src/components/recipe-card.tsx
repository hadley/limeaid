import Link from "next/link";
import type { ReactNode } from "react";
// Keep client-safe: imageSrc comes from lib/images (no pg), and RecipeSummary
// is a type-only import so lib/db (which pulls in node-postgres) is never
// bundled into client components that render this card.
import { imageSrc } from "@/lib/images";
import type { RecipeSummary } from "@/lib/db";

export const RATING_EMOJI: Record<string, string> = {
  disliked: "👎",
  liked: "👍",
  loved: "❤️",
};

// Shared recipe card: image with rating badge overlay, title, and a muted
// meta line (cook time + optional extra). Wrapper depends on props: a Link
// when `href` is set, a button when `onClick` is set, otherwise a plain div
// (use `titleHref` and `children` to compose interactive content inside).
export function RecipeCard({
  recipe,
  href,
  onClick,
  selected,
  disabled,
  cooked,
  titleHref,
  meta,
  children,
}: {
  recipe: RecipeSummary;
  href?: string;
  onClick?: () => void;
  selected?: boolean;
  disabled?: boolean;
  cooked?: boolean;
  titleHref?: string;
  meta?: string;
  children?: ReactNode;
}) {
  const src = imageSrc(recipe);
  const className = `card${onClick ? " card-button" : ""}${selected ? " selected" : ""}${cooked ? " cooked" : ""}`;
  const content = (
    <>
      <div className="card-img">
        {src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src} alt="" loading="lazy" />
        ) : (
          <div className="card-img-placeholder" />
        )}
        {recipe.user_rating && (
          <span className="card-rating-badge">
            {RATING_EMOJI[recipe.user_rating]}
          </span>
        )}
      </div>
      <div className="card-body">
        <div className="card-title">
          {titleHref ? <Link href={titleHref}>{recipe.name}</Link> : recipe.name}
        </div>
        <div className="muted">
          {recipe.total_time_minutes ? `${recipe.total_time_minutes} min` : ""}
          {meta ? ` · ${meta}` : ""}
        </div>
        {children}
      </div>
    </>
  );
  if (href) {
    return (
      <Link href={href} className={className}>
        {content}
      </Link>
    );
  }
  if (onClick) {
    return (
      <button className={className} onClick={onClick} disabled={disabled}>
        {content}
      </button>
    );
  }
  return <div className={className}>{content}</div>;
}
