import { Sparkles } from "lucide-react";
import type { Brand } from "../types";

// Brands that came from Match (found in a creator's videos) carry this tag everywhere they're listed,
// so you always know which brands you added yourself and which the CRM found.

/** Who added it and from where, in one sentence. */
export function foundWhy(d: NonNullable<Brand["discovered"]>): string {
  const what = d.kind === "seeded" ? "sent them product" : d.kind === "affiliate" ? "affiliate link" : "sponsored them";
  const when = d.at ? new Date(d.at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "";
  return `${d.auto ? "Added by the CRM" : "Added by you from Match"}${when ? ` on ${when}` : ""} — found in ${d.creator || "a creator"}'s videos (${what}).`;
}

export function FoundTag({ brand, wide }: { brand: Pick<Brand, "discovered">; wide?: boolean }) {
  const d = brand.discovered;
  if (!d) return null;
  return <span className={`found-tag${d.auto ? " auto" : ""}`} title={foundWhy(d)}>
    <Sparkles size={11} aria-hidden="true" />{wide ? (d.auto ? "Found in videos · added by the CRM" : "Found in videos · added by you") : "From videos"}
    <span className="sr-only"> — {foundWhy(d)}</span>
  </span>;
}
