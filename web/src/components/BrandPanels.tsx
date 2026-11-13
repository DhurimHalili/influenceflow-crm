import { Ban, CalendarClock, CircleDashed, Gift, Globe2, Pencil, Plus, Sparkles, Target, Users, Wallet } from "lucide-react";
import { briefIsEmpty, normalizeBrief, briefProgress, budgetLabel, GENDERS, TIERS } from "../lib/brandBrief";
import { SOCIAL_META } from "../lib/socials";
import { currencySymbol, dateLabel } from "../lib/utils";
import { type Brand } from "../types";
import { SocialGlyph } from "./SocialIcon";
import { Button } from "./ui";

// ---------------------------------------------------------------------------
// Brand brief: what the brand wants, at a glance, editable section by section.
// ---------------------------------------------------------------------------

function Ring({ percent }: { percent: number }) {
  const r = 16;
  const c = 2 * Math.PI * r;
  return <div className={`brief-ring${percent >= 100 ? " done" : ""}`} title={`Brief ${percent}% complete`} role="img" aria-label={`Brief ${percent}% complete`}>
    <svg viewBox="0 0 40 40" width="40" height="40" aria-hidden="true"><circle cx="20" cy="20" r={r} className="track" /><circle cx="20" cy="20" r={r} className="fill" strokeDasharray={c} strokeDashoffset={c - (c * percent) / 100} /></svg>
    <b>{percent}%</b>
  </div>;
}

/** Where a budget sits on a 0 → 100K log scale, for the little range bar. */
const scale = (n: number) => Math.min(100, Math.max(0, (Math.log10(Math.max(n, 100)) - 2) / 3 * 100));

export function BrandBriefCard({ brand, onEdit }: { brand: Brand; onEdit: (section: string) => void }) {
  const brief = normalizeBrief(brand.brief);
  const { percent, parts } = briefProgress(brief, brand.socials?.length || 0);
  const missing = parts.filter((p) => !p.done);
  const tiers = TIERS.filter((t) => brief.tiers.includes(t.value));
  const budget = budgetLabel(brief);
  const hasLooking = brief.niches.length || brief.platforms.length || brief.tiers.length || brief.formats.length;
  const hasAudience = brief.goals.length || brief.markets.length || brief.ages.length || (brief.gender && brief.gender !== "any");
  const terms = [
    brief.payment_terms && { label: "Payment", value: brief.payment_terms },
    brief.usage_rights && { label: "Usage", value: brief.usage_rights },
    brief.exclusivity && { label: "Exclusivity", value: brief.exclusivity },
  ].filter(Boolean) as { label: string; value: string }[];
  const lo = brief.budget_min ? scale(brief.budget_min) : brief.budget_max ? 0 : 0;
  const hi = brief.budget_max ? scale(brief.budget_max) : 100;

  return <section className="detail-section brief-section">
    <div className="detail-section-head"><div><span>Brand brief</span><h2>What {brand.name} wants</h2></div><div className="brief-head-actions"><Ring percent={percent} /><Button size="sm" variant="secondary" onClick={() => onEdit(missing[0]?.id || "looking")}><Pencil size={13} /> Edit brief</Button></div></div>
    {briefIsEmpty(brief) ? <div className="brief-empty">
      <Sparkles size={18} />
      <div><strong>Capture the brief once — pitch the right creators every time.</strong><p>Which creators they want, the budget, their audience. Rough answers are fine — the size and budget you add here sharpen the matches below.</p></div>
      <div className="brief-empty-actions">{parts.map((p) => <button type="button" key={p.id} onClick={() => onEdit(p.id === "terms" ? "budget" : p.id)}><Plus size={13} /> {p.label}</button>)}</div>
    </div> : <>
      <div className="brief-tiles">
        <article className="brief-tile">
          <header><Target size={14} /><strong>Looking for</strong><button type="button" onClick={() => onEdit("looking")} aria-label="Edit what they're looking for"><Pencil size={12} /></button></header>
          {hasLooking ? <>
            {brief.niches.length > 0 && <div className="brief-chips">{brief.niches.map((n) => <span className="bchip accent" key={n}>{n}</span>)}</div>}
            {brief.platforms.length > 0 && <div className="brief-chips">{brief.platforms.map((p) => <span className="bchip net" key={p} style={{ ["--tone" as string]: SOCIAL_META[p].color }}><SocialGlyph platform={p} size={11} /> {SOCIAL_META[p].label.replace(" (Twitter)", "")}</span>)}</div>}
            {tiers.length > 0 && <div className="brief-chips">{tiers.map((t) => <span className="bchip" key={t.value}>{t.label} <small>{t.range}</small></span>)}</div>}
            {brief.formats.length > 0 && <p className="brief-line">{brief.formats.join(" · ")}</p>}
          </> : <button type="button" className="brief-add" onClick={() => onEdit("looking")}><Plus size={13} /> Niches, platforms, creator size</button>}
        </article>

        <article className="brief-tile">
          <header><Wallet size={14} /><strong>Budget & terms</strong><button type="button" onClick={() => onEdit("budget")} aria-label="Edit budget and terms"><Pencil size={12} /></button></header>
          {budget ? <div className="budget-show"><b>{budget}</b><div className="budget-bar" aria-hidden="true"><i style={{ left: `${lo}%`, width: `${Math.max(3, hi - lo)}%` }} /></div><div className="budget-scale"><span>{currencySymbol()}100</span><span>{currencySymbol()}1K</span><span>{currencySymbol()}10K</span><span>{currencySymbol()}100K+</span></div></div> : <button type="button" className="brief-add" onClick={() => onEdit("budget")}><Plus size={13} /> Add a budget range</button>}
          {(terms.length > 0 || brief.gifting || brief.next_launch) && <dl className="brief-terms">
            {terms.map((t) => <div key={t.label}><dt>{t.label}</dt><dd>{t.value}</dd></div>)}
            {brief.gifting && <div><dt><Gift size={12} /></dt><dd>Gifting / product seeding OK</dd></div>}
            {brief.next_launch && <div><dt><CalendarClock size={12} /></dt><dd>Next launch {dateLabel(brief.next_launch)}</dd></div>}
          </dl>}
        </article>

        <article className="brief-tile">
          <header><Users size={14} /><strong>Audience & goals</strong><button type="button" onClick={() => onEdit("audience")} aria-label="Edit audience and goals"><Pencil size={12} /></button></header>
          {hasAudience ? <>
            {brief.goals.length > 0 && <div className="brief-chips">{brief.goals.map((g) => <span className="bchip goal" key={g}>{g}</span>)}</div>}
            {brief.markets.length > 0 && <p className="brief-line"><Globe2 size={12} /> {brief.markets.join(", ")}</p>}
            {(brief.ages.length > 0 || (brief.gender && brief.gender !== "any")) && <p className="brief-line">{[brief.ages.length ? `Ages ${brief.ages.join(", ")}` : "", brief.gender && brief.gender !== "any" ? GENDERS.find((g) => g.value === brief.gender)?.label : ""].filter(Boolean).join(" · ")}</p>}
          </> : <button type="button" className="brief-add" onClick={() => onEdit("audience")}><Plus size={13} /> Goals, markets, age</button>}
        </article>

        <article className="brief-tile">
          <header><Ban size={14} /><strong>Avoid</strong><button type="button" onClick={() => onEdit("audience")} aria-label="Edit what to avoid"><Pencil size={12} /></button></header>
          {brief.avoid.length ? <div className="brief-chips">{brief.avoid.map((a) => <span className="bchip avoid" key={a}>{a}</span>)}</div> : <p className="brief-line muted">No competitors or no-go topics noted.</p>}
        </article>
      </div>
      {missing.length > 0 && <p className="brief-missing"><CircleDashed size={13} /> Still open: {missing.map((m, i) => <span key={m.id}>{i > 0 && ", "}<button type="button" onClick={() => onEdit(m.id === "terms" ? "budget" : m.id)}>{m.label.toLowerCase()}</button></span>)}</p>}
    </>}
  </section>;
}
