import Link from "next/link";

type Stage = "plan" | "shop" | "cook";

const TITLES: Record<Stage, string> = {
  plan: "Plan",
  shop: "Shop",
  cook: "Cook",
};

export function StageHeader({ stage, week }: { stage: Stage; week: string }) {
  return (
    <div className="stage-header">
      {stage === "shop" && (
        <Link
          href={`/plan/${week}`}
          className="stage-arrow"
          aria-label="Back to plan"
        >
          ←
        </Link>
      )}
      {stage === "cook" && (
        <Link
          href={`/shop/${week}`}
          className="stage-arrow"
          aria-label="Back to shop"
        >
          ←
        </Link>
      )}
      <h1>{TITLES[stage]}</h1>
      {stage === "plan" && (
        <Link
          href={`/shop/${week}`}
          className="stage-arrow"
          aria-label="Forward to shop"
        >
          →
        </Link>
      )}
      {stage === "shop" && (
        <Link
          href={`/cook/${week}`}
          className="stage-arrow"
          aria-label="Forward to cook"
        >
          →
        </Link>
      )}
    </div>
  );
}
