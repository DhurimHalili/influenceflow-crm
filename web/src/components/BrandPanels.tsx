import { ArrowRight, Ban, CalendarClock, Check, CircleDashed, Gift, Globe2, Pencil, Plus, Sparkles, Target, Users, Wallet, X } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useData } from "../contexts/DataContext";
import { brandsForCreator, briefIsEmpty, normalizeBrief, briefProgress, budgetLabel, creatorReach, GENDERS, matchCreator, matchTone, TIERS, tierOf } from "../lib/brandBrief";
import { SOCIAL_META } from "../lib/socials";
import { compact, creatorScore, currencySymbol, dateLabel } from "../lib/utils";
import { STATUS_LABELS, type Brand, type Creator } from "../types";
import { SocialGlyph } from "./SocialIcon";
import { Avatar, Button } from "./ui";

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
      <div><strong>Capture the brief once — pitch the right creators every time.</strong><p>Which creators they want, the budget, their audience. Rough answers are fine; your best-fit creators appear below as soon as you add niches or platforms.</p></div>
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

// ---------------------------------------------------------------------------
// Best-fit creators for a brand
// ---------------------------------------------------------------------------

type Scope = "all" | "roster" | "fresh";
const listOr = (items: string[]) => (items.length ? items.slice(0, 3).join(" or ") : "their niche");

export function BestFitCreators({ brand, onEditBrief }: { brand: Brand; onEditBrief: () => void }) {
  const data = useData();
  const weights = data.profile.rating_weights;
  const [scope, setScope] = useState<Scope>("all");
  const [showAll, setShowAll] = useState(false);
  const linked = useMemo(() => new Set(data.campaigns.filter((c) => c.brand_id === brand.id && !c.archived_at).flatMap((c) => c.creator_ids)), [data.campaigns, brand.id]);
  const ranked = useMemo(() => data.creators
    .filter((c) => !c.archived_at && c.pipeline_status !== "denied")
    .filter((c) => scope === "all" || (scope === "roster" ? c.on_roster || c.pipeline_status === "roster" || c.pipeline_status === "signed" : !linked.has(c.id)))
    .map((creator) => ({ creator, match: matchCreator(brand.brief, creator, creatorScore(creator, weights)) }))
    .filter((x) => x.match.score >= 0)
    .sort((a, b) => b.match.score - a.match.score || creatorScore(b.creator, weights) - creatorScore(a.creator, weights)), [data.creators, brand.brief, scope, linked, weights]);

  const brief = normalizeBrief(brand.brief);
  const canMatch = brief.niches.length || brief.platforms.length || brief.tiers.length || brief.budget_max;
  // Real fits first; weak ones only on request so the list stays useful.
  const fits = ranked.filter((x) => x.match.score >= 50);
  const pool = showAll ? ranked : fits.length ? fits : ranked.slice(0, 3);
  const shown = showAll ? pool.slice(0, 30) : pool.slice(0, 6);
  const strong = ranked.filter((x) => x.match.score >= 80).length;
  const hidden = ranked.length - shown.length;

  return <section className="detail-section match-section">
    <div className="detail-section-head"><div><span>Matching</span><h2>Best-fit creators</h2></div>
      {canMatch ? <div className="match-scope" role="tablist" aria-label="Which creators">{([["all", "All"], ["roster", "Roster"], ["fresh", "Not on a campaign yet"]] as [Scope, string][]).map(([v, l]) => <button type="button" role="tab" aria-selected={scope === v} className={scope === v ? "on" : ""} key={v} onClick={() => setScope(v)}>{l}</button>)}</div> : null}
    </div>
    {!canMatch ? <div className="brief-empty compact"><Target size={18} /><div><strong>Add what {brand.name} is looking for</strong><p>Niches, platforms, creator size or a budget — and the creators in your list that fit are ranked here, with the reasons.</p></div><Button size="sm" onClick={onEditBrief}><Plus size={13} /> Fill the brief</Button></div>
      : !ranked.length ? <p className="muted-copy">No creators in this view yet.</p>
      : <>
        <p className="match-summary">{strong ? <><b>{strong}</b> strong fit{strong === 1 ? "" : "s"} · </> : null}{fits.length} good fit{fits.length === 1 ? "" : "s"} out of {ranked.length} creator{ranked.length === 1 ? "" : "s"}</p>
        {!fits.length && !showAll && <p className="match-weak-note">No creator fits this brief well yet — here are the closest. Add creators in {listOr(brief.niches)} or widen the brief.</p>}
        <div className="match-list">{shown.map(({ creator, match }) => <MatchRow key={creator.id} creator={creator} score={match.score} reasons={match.reasons} brand={brand} onCampaign={linked.has(creator.id)} />)}</div>
        {(hidden > 0 || showAll) && <button type="button" className="match-more" onClick={() => setShowAll(!showAll)}>{showAll ? "Show best fits only" : fits.length > 6 ? `Show ${Math.min(30, ranked.length) - 6} more` : `Show weaker matches (${hidden})`}</button>}
      </>}
  </section>;
}

function MatchRow({ creator, score, reasons, brand, onCampaign }: { creator: Creator; score: number; reasons: { label: string; ok: boolean | null }[]; brand: Brand; onCampaign: boolean }) {
  const reach = creatorReach(creator);
  const tier = tierOf(reach);
  return <div className={`match-row tone-${matchTone(score)}`}>
    <span className="match-score" style={{ ["--p" as string]: `${score}%` }}><b>{score}</b><small>%</small></span>
    <Link to={`/app/influencers/${creator.id}`} className="match-who"><Avatar name={creator.name} size="sm" /><span><strong>{creator.name}</strong><small>{[creator.niche, creator.platform, reach ? `${compact(reach)}${tier ? ` · ${TIERS.find((t) => t.value === tier)?.label}` : ""}` : "", STATUS_LABELS[creator.pipeline_status]].filter(Boolean).join(" · ")}</small></span></Link>
    <div className="match-reasons">{reasons.map((r) => <span key={r.label} className={`reason ${r.ok === true ? "ok" : r.ok === null ? "near" : "no"}`}>{r.ok === true ? <Check size={10} /> : r.ok === null ? <CircleDashed size={10} /> : <X size={10} />}{r.label}</span>)}{onCampaign && <span className="reason linked">On a {brand.name} campaign</span>}</div>
    <div className="match-actions"><Link className="btn btn-secondary btn-sm" to={`/app/campaigns?new=1&brand=${brand.id}&creator=${creator.id}`} title={`Start a ${brand.name} campaign with ${creator.name}`}><Plus size={13} /> Campaign</Link><Link className="match-open" to={`/app/influencers/${creator.id}`} aria-label={`Open ${creator.name}`}><ArrowRight size={15} /></Link></div>
  </div>;
}

// ---------------------------------------------------------------------------
// The other direction: on a creator's profile, which brands want them.
// ---------------------------------------------------------------------------

export function CreatorBrandMatches({ creator }: { creator: Creator }) {
  const data = useData();
  const matches = useMemo(() => brandsForCreator(data.brands, creator, creatorScore(creator, data.profile.rating_weights)), [data.brands, creator, data.profile.rating_weights]);
  if (!data.brands.some((b) => !b.archived_at && !briefIsEmpty(b.brief))) return null;
  return <section className="detail-side-section brand-matches"><span>Opportunities</span><h2>Brands looking for this</h2>
    {matches.length ? <div className="bm-list">{matches.slice(0, 4).map(({ brand, match }) => <Link to={`/app/brands/${brand.id}`} key={brand.id} className={`bm-row tone-${matchTone(match.score)}`}><Avatar name={brand.name} size="sm" /><span><strong>{brand.name}</strong><small>{[budgetLabel(brand.brief), match.reasons.filter((r) => r.ok).map((r) => r.label).slice(0, 2).join(" · ")].filter(Boolean).join(" · ")}</small></span><b>{match.score}%</b></Link>)}</div>
      : <p className="muted-copy">No brand brief matches {creator.name.split(" ")[0]} yet. Briefs that want their niche, platform or size will show up here.</p>}
  </section>;
}
