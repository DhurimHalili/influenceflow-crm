import { AlertTriangle, BadgePercent, ChevronDown, HandCoins, Plus, Sparkles, TrendingUp, X } from "lucide-react";
import { useState } from "react";
import { useData } from "../contexts/DataContext";
import { computePayout, marginOf, markupOf, priceForMargin, profitOf } from "../lib/deal";
import { BRAND_MODELS, brandPays, brandRevenue, isPerformance, modelInfo, normalizeTerms, type BrandModel, type BrandTerms } from "../lib/dealTerms";
import { DELIVERABLE_RATES } from "../lib/prefs";
import { currencySymbol, money } from "../lib/utils";
import type { PayoutModel } from "../types";
import { Avatar } from "./ui";

export type DealDraft = {
  payout_model: PayoutModel;
  /** What the brand pays, as typed. */
  agreed_payment: string;
  /** Creator share in percent, as typed (percent model). */
  agency_percent: string;
  /** Fee per creator id, as typed (fixed model). */
  creator_fees: Record<string, string>;
  /** How the brand pays. */
  brand_terms: BrandTerms;
};

export const dealDraftFrom = (value: { payout_model: PayoutModel; agreed_payment: number; agency_percent: number; creator_fees: Record<string, number>; brand_terms?: BrandTerms }): DealDraft => ({
  payout_model: value.payout_model,
  brand_terms: normalizeTerms(value.brand_terms),
  agreed_payment: value.agreed_payment ? String(value.agreed_payment) : "",
  agency_percent: String(value.agency_percent ?? ""),
  creator_fees: Object.fromEntries(Object.entries(value.creator_fees || {}).map(([k, v]) => [k, v ? String(v) : ""])),
});

/** Flat deals: the price you type. Everything else: computed from the terms. */
const priceOf = (draft: DealDraft) => {
  const terms = draft.brand_terms || { model: "flat" };
  return terms.model === "flat" ? Math.max(0, Number(draft.agreed_payment) || 0) : Math.round(brandPays(terms));
};

export const dealValue = (draft: DealDraft, creatorIds: string[]) => ({
  payout_model: draft.payout_model,
  brand_terms: normalizeTerms(draft.brand_terms?.model === "flat" ? { ...draft.brand_terms, fee: Number(draft.agreed_payment) || 0 } : draft.brand_terms),
  agreed_payment: priceOf(draft),
  agency_percent: Math.min(100, Math.max(0, Number(draft.agency_percent) || 0)),
  creator_fees: Object.fromEntries(creatorIds.map((id) => [id, Math.max(0, Number(draft.creator_fees[id]) || 0)]).filter(([, v]) => (v as number) > 0)),
});

const MARGINS = [30, 40, 50, 60];
const SHARES = [70, 75, 80, 90];

/** Pick the rate that best matches the campaign platform first. */
const ratesFor = (rates: Record<string, number> | undefined, platform: string) => {
  const list = DELIVERABLE_RATES.filter((f) => (rates?.[f.key] || 0) > 0).map((f) => ({ key: f.key, label: f.short, value: rates![f.key] }));
  const prefer = platform === "YouTube" ? ["video", "dedicated", "short"] : ["TikTok", "Instagram"].includes(platform) ? ["short", "post", "story", "carousel"] : platform === "Twitch" || platform === "Kick" ? ["stream"] : [];
  return list.sort((a, b) => (prefer.indexOf(a.key) === -1 ? 99 : prefer.indexOf(a.key)) - (prefer.indexOf(b.key) === -1 ? 99 : prefer.indexOf(b.key)));
};

export function DealBuilder({ draft, onChange, creatorIds, platform }: { draft: DealDraft; onChange: (draft: DealDraft) => void; creatorIds: string[]; platform: string }) {
  const data = useData();
  const creators = creatorIds.map((id) => data.creators.find((c) => c.id === id)).filter(Boolean) as typeof data.creators;
  const deal = { ...dealValue(draft, creatorIds), creator_ids: creatorIds };
  const terms = draft.brand_terms || { model: "flat" as BrandModel };
  const flatDeal = terms.model === "flat";
  const revenue = brandRevenue(terms);
  const cost = computePayout(deal);
  const price = deal.agreed_payment;
  const profit = profitOf(deal);
  const margin = marginOf(deal);
  const markup = markupOf(deal);
  const fixed = draft.payout_model === "fixed";
  const set = (patch: Partial<DealDraft>) => onChange({ ...draft, ...patch });
  const setFee = (id: string, value: string) => set({ creator_fees: { ...draft.creator_fees, [id]: value } });
  const costShare = price > 0 ? Math.min(100, Math.max(0, (cost / price) * 100)) : cost > 0 ? 100 : 0;

  return <div className="deal-builder">
    <BrandTermsEditor terms={terms} onChange={(next) => set({ brand_terms: next })} />
    <div className="deal-toggle" role="radiogroup" aria-label="How this deal is priced">
      <button type="button" role="radio" aria-checked={fixed} className={fixed ? "on" : ""} onClick={() => set({ payout_model: "fixed" })}><HandCoins size={16} /><span><strong>Fixed fee + markup</strong><small>You lock each creator's fee and pitch the brand a higher price</small></span></button>
      <button type="button" role="radio" aria-checked={!fixed} className={!fixed ? "on" : ""} onClick={() => set({ payout_model: "percent" })}><BadgePercent size={16} /><span><strong>Percentage split</strong><small>The creator gets a share of what the brand pays</small></span></button>
    </div>

    {fixed ? <div className="deal-fees">
      <div className="deal-fees-head"><span className="field-label">What each creator gets</span><small>Their agreed fee for this campaign</small></div>
      {creators.length ? creators.map((creator) => {
        const options = ratesFor(creator.rates as unknown as Record<string, number>, platform);
        return <div className="deal-fee-row" key={creator.id}>
          <Avatar name={creator.name} size="sm" />
          <span className="deal-fee-who"><strong>{creator.name}</strong><small>{creator.platform}{creator.niche ? ` · ${creator.niche}` : ""}</small></span>
          {options.length > 0 && <span className="deal-fee-rates" aria-label="Fill from rate card">{options.slice(0, 3).map((o) => <button type="button" key={o.key} className={Number(draft.creator_fees[creator.id]) === o.value ? "on" : ""} onClick={() => setFee(creator.id, String(o.value))} title={`Use their ${o.label.toLowerCase()} rate`}>{o.label} {money(o.value)}</button>)}</span>}
          <label className="money-input deal-fee-input"><span>{currencySymbol()}</span><input type="number" min="0" inputMode="numeric" value={draft.creator_fees[creator.id] || ""} onChange={(event) => setFee(creator.id, event.target.value)} placeholder="Fee" aria-label={`Fee for ${creator.name}`} /></label>
        </div>;
      }) : <p className="deal-empty">Assign influencers above, then set what each one gets.</p>}
      <div className="deal-price-row">
        {flatDeal ? <label className="field-wrap"><span className="field-label">You charge the brand</span><span className="money-input big"><span>{currencySymbol()}</span><input type="number" min="0" inputMode="numeric" value={draft.agreed_payment} onChange={(event) => set({ agreed_payment: event.target.value })} placeholder="e.g. 5000" aria-label="Brand price" /></span></label> : <ComputedPrice terms={terms} />}
        {cost > 0 && flatDeal && <div className="deal-suggest"><span><Sparkles size={12} /> Pitch at</span>{MARGINS.map((m) => { const p = priceForMargin(cost, m); return <button type="button" key={m} className={price === p ? "on" : ""} onClick={() => set({ agreed_payment: String(p) })}><b>{money(p)}</b><small>{m}% margin</small></button>; })}</div>}
      </div>
    </div> : <div className="deal-percent">
      {flatDeal ? <label className="field-wrap"><span className="field-label">Brand pays</span><span className="money-input big"><span>{currencySymbol()}</span><input type="number" min="0" inputMode="numeric" value={draft.agreed_payment} onChange={(event) => set({ agreed_payment: event.target.value })} placeholder="e.g. 5000" aria-label="Brand price" /></span></label> : <ComputedPrice terms={terms} />}
      <label className="field-wrap"><span className="field-label">Creator share</span><span className="money-input big"><input type="number" min="0" max="100" inputMode="decimal" value={draft.agency_percent} onChange={(event) => set({ agency_percent: event.target.value })} aria-label="Creator share in percent" /><span>%</span></span><span className="deal-chips">{SHARES.map((v) => <button type="button" key={v} className={Number(draft.agency_percent) === v ? "on" : ""} onClick={() => set({ agency_percent: String(v) })}>{v}%</button>)}</span></label>
      {creators.length > 1 && <p className="deal-note">Split evenly: {money(cost / creators.length)} each across {creators.length} creators.</p>}
    </div>}

    <div className={`deal-summary${profit < 0 ? " is-loss" : ""}`}>
      <div className="deal-bar" aria-hidden="true"><i style={{ width: `${costShare}%` }} /><b style={{ width: `${100 - costShare}%` }} /></div>
      <div className="deal-figures">
        <span><small>Brand pays</small><strong>{money(price)}</strong></span>
        <span className="cost"><small>{creators.length > 1 ? "Creators get" : "Creator gets"}</small><strong>{money(cost)}</strong></span>
        <span className="keep"><small>You keep</small><strong>{money(profit)}</strong>{price > 0 && <em>{margin}% margin{fixed && markup ? ` · ${markup}× markup` : ""}</em>}</span>
      </div>
      {!flatDeal && <p className="deal-formula"><b>{modelInfo(terms.model).label}:</b> {revenue.formula}{revenue.actual !== null ? " · using actual results" : isPerformance(terms.model) ? " · estimate until results are in" : ""}</p>}
      {isPerformance(terms.model) && cost > 0 && revenue.low < cost && <p className="deal-warn soft"><AlertTriangle size={13} /> If results come in low the brand could pay as little as {money(revenue.low)} — below the {money(cost)} you owe creators.{fixed ? " Consider a minimum guarantee or a % split." : ""}</p>}
      {revenue.warning && <p className="deal-warn"><AlertTriangle size={13} /> {revenue.warning}</p>}
      {profit < 0 && <p className="deal-warn"><AlertTriangle size={13} /> The brand price is below what the creators get — you'd lose {money(-profit)}.</p>}
      {fixed && price > 0 && cost === 0 && creators.length > 0 && <p className="deal-warn soft"><TrendingUp size={13} /> Add each creator's fee to see your real profit.</p>}
    </div>
  </div>;
}

// ---------------------------------------------------------------------------
// How the brand pays: pick the structure, fill only what it needs.
// ---------------------------------------------------------------------------

type Field = { key: keyof BrandTerms; label: string; prefix?: string; suffix?: string; placeholder?: string; hint?: string };
const money$ = () => currencySymbol();
const FIELDS: Partial<Record<BrandModel, (t: BrandTerms) => Field[]>> = {
  guaranteed_views: () => [{ key: "fee", label: "Flat fee", prefix: money$(), placeholder: "6000" }, { key: "guaranteed_views", label: "Views guaranteed", placeholder: "150000" }, { key: "window_days", label: "Within", suffix: "days", placeholder: "30" }, { key: "actual_views", label: "Actual views", placeholder: "after posting", hint: "Warns you if a make-good is owed" }],
  ugc: () => [{ key: "fee", label: "Price", prefix: money$(), placeholder: "800" }],
  gifted: () => [{ key: "product_value", label: "Product value", prefix: money$(), placeholder: "300" }],
  cpm: () => [{ key: "cpm", label: "Per 1,000 views", prefix: money$(), placeholder: "25" }, { key: "window_days", label: "Views counted for", suffix: "days", placeholder: "30", hint: "Views after this window don't count" }, { key: "est_views", label: "Expected views", placeholder: "200000" }, { key: "floor", label: "Minimum", prefix: money$(), placeholder: "optional" }, { key: "cap", label: "Cap", prefix: money$(), placeholder: "optional" }, { key: "actual_views", label: "Actual views in window", placeholder: "when known" }],
  hybrid: (t) => [{ key: "fee", label: "Base fee", prefix: money$(), placeholder: "2000" }, ...((t.kicker || "cpm") === "cpm" ? [{ key: "cpm", label: "+ per 1,000 views", prefix: money$(), placeholder: "15" }, { key: "window_days", label: "Views counted for", suffix: "days", placeholder: "30" }, { key: "est_views", label: "Expected views", placeholder: "200000" }, { key: "actual_views", label: "Actual views", placeholder: "when known" }] as Field[] : t.kicker === "rev_share" ? [{ key: "rev_share_pct", label: "+ % of sales", suffix: "%", placeholder: "10" }, { key: "est_sales", label: "Expected sales", prefix: money$(), placeholder: "20000" }, { key: "actual_sales", label: "Actual sales", prefix: money$(), placeholder: "when known" }] as Field[] : [{ key: "unit_rate", label: "+ per sale", prefix: money$(), placeholder: "10" }, { key: "est_units", label: "Expected sales", placeholder: "300" }, { key: "actual_units", label: "Actual sales", placeholder: "when known" }] as Field[]), { key: "cap", label: "Bonus cap", prefix: money$(), placeholder: "optional" }],
  bonus_tiers: () => [{ key: "fee", label: "Base fee", prefix: money$(), placeholder: "3000" }, { key: "est_views", label: "Expected views", placeholder: "250000" }, { key: "actual_views", label: "Actual views", placeholder: "when known" }],
  cpa: () => [{ key: "unit_rate", label: "Per sale", prefix: money$(), placeholder: "12" }, { key: "est_units", label: "Expected sales", placeholder: "400" }, { key: "floor", label: "Minimum", prefix: money$(), placeholder: "optional" }, { key: "cap", label: "Cap", prefix: money$(), placeholder: "optional" }, { key: "actual_units", label: "Actual sales", placeholder: "when known" }],
  cpi: () => [{ key: "unit_rate", label: "Per install", prefix: money$(), placeholder: "1.50" }, { key: "est_units", label: "Expected installs", placeholder: "5000" }, { key: "floor", label: "Minimum", prefix: money$(), placeholder: "optional" }, { key: "cap", label: "Cap", prefix: money$(), placeholder: "optional" }, { key: "actual_units", label: "Actual installs", placeholder: "when known" }],
  cpl: () => [{ key: "unit_rate", label: "Per sign-up", prefix: money$(), placeholder: "4" }, { key: "est_units", label: "Expected sign-ups", placeholder: "1000" }, { key: "floor", label: "Minimum", prefix: money$(), placeholder: "optional" }, { key: "cap", label: "Cap", prefix: money$(), placeholder: "optional" }, { key: "actual_units", label: "Actual sign-ups", placeholder: "when known" }],
  cpc: () => [{ key: "unit_rate", label: "Per click", prefix: money$(), placeholder: "0.40" }, { key: "est_units", label: "Expected clicks", placeholder: "10000" }, { key: "floor", label: "Minimum", prefix: money$(), placeholder: "optional" }, { key: "cap", label: "Cap", prefix: money$(), placeholder: "optional" }, { key: "actual_units", label: "Actual clicks", placeholder: "when known" }],
  rev_share: () => [{ key: "rev_share_pct", label: "Commission", suffix: "%", placeholder: "15" }, { key: "est_sales", label: "Expected sales", prefix: money$(), placeholder: "30000" }, { key: "floor", label: "Minimum", prefix: money$(), placeholder: "optional" }, { key: "cap", label: "Cap", prefix: money$(), placeholder: "optional" }, { key: "actual_sales", label: "Actual sales", prefix: money$(), placeholder: "when known" }],
  retainer: () => [{ key: "monthly_fee", label: "Per month", prefix: money$(), placeholder: "4000" }, { key: "months", label: "Months", placeholder: "6" }],
  usage_rights: () => [{ key: "fee", label: "Fee", prefix: money$(), placeholder: "1500" }, { key: "term_days", label: "Term", suffix: "days", placeholder: "90" }],
  whitelisting: () => [{ key: "fee", label: "Fee", prefix: money$(), placeholder: "2000" }, { key: "term_days", label: "Term", suffix: "days", placeholder: "30" }],
};

function ComputedPrice({ terms }: { terms: BrandTerms }) {
  const r = brandRevenue(terms);
  const range = isPerformance(terms.model) ? `${money(r.low)} – ${r.high === null ? "no cap" : money(r.high)}` : "";
  return <div className="field-wrap computed-price"><span className="field-label">{r.actual !== null ? "Brand owes (actual results)" : "Brand pays (estimate)"}</span><strong>{money(r.actual ?? r.expected)}</strong>{range && <small>Could land anywhere from {range}</small>}</div>;
}

function BrandTermsEditor({ terms, onChange }: { terms: BrandTerms; onChange: (t: BrandTerms) => void }) {
  const [open, setOpen] = useState(false);
  const info = modelInfo(terms.model);
  const fields = FIELDS[terms.model]?.(terms) || [];
  const setField = (key: keyof BrandTerms, value: string) => onChange({ ...terms, [key]: value === "" ? undefined : Math.max(0, Number(value) || 0) });
  const groups = ["Fixed", "Performance", "Rights & retainers"] as const;
  const tiers = terms.tiers || [];
  return <div className="brand-terms">
    <div className="bt-head"><span className="field-label">How the brand pays</span>
      <button type="button" className="bt-current" onClick={() => setOpen((v) => !v)} aria-expanded={open}><span><strong>{info.label}</strong><small>{info.blurb}</small></span><ChevronDown size={16} /></button>
    </div>
    {open && <div className="bt-picker" role="listbox" aria-label="Deal structure">{groups.map((g) => <div key={g} className="bt-group"><span>{g}</span><div>{BRAND_MODELS.filter((m) => m.group === g).map((m) => <button type="button" role="option" aria-selected={m.id === terms.model} key={m.id} className={m.id === terms.model ? "on" : ""} onClick={() => { onChange({ ...terms, model: m.id, window_days: terms.window_days || (["cpm", "hybrid", "guaranteed_views"].includes(m.id) ? 30 : undefined) }); setOpen(false); }}><strong>{m.label}</strong><small>e.g. {m.example}</small></button>)}</div></div>)}</div>}
    {terms.model === "hybrid" && <div className="bt-kicker" role="radiogroup" aria-label="Performance part">{([["cpm", "Views (CPM)"], ["cpa", "Per sale"], ["rev_share", "% of sales"]] as const).map(([k, label]) => <button type="button" role="radio" aria-checked={(terms.kicker || "cpm") === k} key={k} className={(terms.kicker || "cpm") === k ? "on" : ""} onClick={() => onChange({ ...terms, kicker: k })}>{label}</button>)}</div>}
    {fields.length > 0 && <div className="bt-fields">{fields.map((f) => <label key={f.key} className="field-wrap"><span className="field-label">{f.label}</span><span className="money-input">{f.prefix && <span>{f.prefix}</span>}<input type="number" min="0" step="any" inputMode="decimal" value={(terms[f.key] as number | undefined) ?? ""} onChange={(event) => setField(f.key, event.target.value)} placeholder={f.placeholder} />{f.suffix && <span>{f.suffix}</span>}</span>{f.hint && <small className="field-hint">{f.hint}</small>}</label>)}</div>}
    {terms.model === "bonus_tiers" && <div className="bt-tiers"><span className="field-label">Bonuses</span>{tiers.map((t, i) => <div className="bt-tier" key={i}><span>at</span><input type="number" min="0" inputMode="numeric" value={t.views || ""} onChange={(event) => onChange({ ...terms, tiers: tiers.map((x, j) => (j === i ? { ...x, views: Number(event.target.value) || 0 } : x)) })} placeholder="200000" aria-label="Views milestone" /><span>views +</span><span className="money-input"><span>{currencySymbol()}</span><input type="number" min="0" inputMode="numeric" value={t.bonus || ""} onChange={(event) => onChange({ ...terms, tiers: tiers.map((x, j) => (j === i ? { ...x, bonus: Number(event.target.value) || 0 } : x)) })} placeholder="1000" aria-label="Bonus" /></span><button type="button" className="icon-btn" onClick={() => onChange({ ...terms, tiers: tiers.filter((_, j) => j !== i) })} aria-label="Remove bonus"><X size={14} /></button></div>)}{tiers.length < 4 && <button type="button" className="text-link" onClick={() => onChange({ ...terms, tiers: [...tiers, { views: 0, bonus: 0 }] })}><Plus size={13} /> Add a bonus</button>}</div>}
  </div>;
}
