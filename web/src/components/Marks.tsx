import { ArrowDownRight, ArrowUpRight, Check, CircleSlash, Sparkles, TriangleAlert, X } from "lucide-react";
import { useData } from "../contexts/DataContext";
import { reachOf } from "../lib/contact";
import { DEFAULT_CRITERIA, verdictOf, type Verdict } from "../lib/criteria";
import { socialLabel } from "../lib/socials";
import type { Creator } from "../types";
import { SocialGlyph } from "./SocialIcon";

// Small, consistent marks for the influencer screens:
//   • how you can reach someone — or a loud "No contact info" when you can't
//   • where they stand against your YouTube criteria

/** Your criteria from Settings (defaults until you change them). */
export function useCriteria() {
  return useData().profile.preferences?.youtube_criteria || DEFAULT_CRITERIA;
}

/** Under a name in a list: their email, or how else to reach them, or the no-contact mark. */
export function ContactLine({ creator }: { creator: Creator }) {
  const reach = reachOf(creator);
  if (reach.kind === "email") return <small className="contact-line">{reach.email}</small>;
  if (reach.kind === "team") return <small className="contact-line">via {reach.role} · {reach.email}</small>;
  if (reach.kind === "social") return <small className="contact-line contact-dm"><SocialGlyph platform={reach.social.platform} size={11} /> {reach.social.platform} · {socialLabel(reach.social)}</small>;
  return <NoContactMark />;
}

export function NoContactMark({ big = false }: { big?: boolean }) {
  return <span className={`nocontact-mark${big ? " big" : ""}`} title="No email, no manager and no Instagram, TikTok, WhatsApp or other DM-able profile — add one to reach them"><CircleSlash size={big ? 14 : 11} aria-hidden="true" /> No contact info</span>;
}

const ICON = { fits: Check, over: ArrowUpRight, slight: TriangleAlert, hard: ArrowDownRight, none: Check } as const;

/** A chip for lists: nothing when they fit (quiet), a clear mark when they don't. */
export function CriteriaChip({ verdict, showFits = false }: { verdict: Verdict; showFits?: boolean }) {
  if (verdict.level === "none" || (verdict.level === "fits" && !showFits)) return null;
  const Icon = ICON[verdict.level];
  return <span className={`crit-chip crit-${verdict.level}`} title={verdict.why}><Icon size={11} aria-hidden="true" /> {verdict.label}</span>;
}

/** The full verdict: headline, why, and each rule checked. Quick fill, the form and the profile. */
export function CriteriaCard({ verdict, compact = false }: { verdict: Verdict; compact?: boolean }) {
  if (verdict.level === "none") return null;
  const Icon = ICON[verdict.level];
  const title = verdict.level === "fits" ? (verdict.plus ? "Fits your criteria — and then some" : "Fits your criteria") : verdict.level === "over" ? "Above your criteria" : verdict.level === "slight" ? "Slightly below your criteria" : "Below your criteria";
  return <div className={`crit-card crit-${verdict.level}${compact ? " compact" : ""}`} role={verdict.level === "hard" ? "alert" : "status"}>
    <span className="crit-card-ico" aria-hidden="true"><Icon size={16} /></span>
    <div className="crit-card-body">
      <strong>{title}{verdict.plus && verdict.level === "fits" && <em className="crit-plus"><Sparkles size={11} /> Preferred size</em>}</strong>
      <p>{verdict.why}</p>
      {!compact && <ul>{verdict.checks.map((c) => <li key={c.key} className={c.ok ? (c.soft ? "soft" : "ok") : "bad"}>{c.ok ? (c.soft ? <i aria-hidden="true">·</i> : <Check size={12} aria-hidden="true" />) : <X size={12} aria-hidden="true" />}<span>{c.text}</span></li>)}</ul>}
    </div>
  </div>;
}

/** Verdict for a saved influencer with your criteria. */
export function useVerdict(creator: Creator) {
  return verdictOf(creator, useCriteria());
}
