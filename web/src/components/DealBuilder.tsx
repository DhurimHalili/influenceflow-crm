import { AlertTriangle, BadgePercent, HandCoins, Sparkles, TrendingUp } from "lucide-react";
import { useData } from "../contexts/DataContext";
import { computePayout, marginOf, markupOf, priceForMargin, profitOf } from "../lib/deal";
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
};

export const dealDraftFrom = (value: { payout_model: PayoutModel; agreed_payment: number; agency_percent: number; creator_fees: Record<string, number> }): DealDraft => ({
  payout_model: value.payout_model,
  agreed_payment: value.agreed_payment ? String(value.agreed_payment) : "",
  agency_percent: String(value.agency_percent ?? ""),
  creator_fees: Object.fromEntries(Object.entries(value.creator_fees || {}).map(([k, v]) => [k, v ? String(v) : ""])),
});

export const dealValue = (draft: DealDraft, creatorIds: string[]) => ({
  payout_model: draft.payout_model,
  agreed_payment: Math.max(0, Number(draft.agreed_payment) || 0),
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
        <label className="field-wrap"><span className="field-label">You charge the brand</span><span className="money-input big"><span>{currencySymbol()}</span><input type="number" min="0" inputMode="numeric" value={draft.agreed_payment} onChange={(event) => set({ agreed_payment: event.target.value })} placeholder="e.g. 5000" aria-label="Brand price" /></span></label>
        {cost > 0 && <div className="deal-suggest"><span><Sparkles size={12} /> Pitch at</span>{MARGINS.map((m) => { const p = priceForMargin(cost, m); return <button type="button" key={m} className={price === p ? "on" : ""} onClick={() => set({ agreed_payment: String(p) })}><b>{money(p)}</b><small>{m}% margin</small></button>; })}</div>}
      </div>
    </div> : <div className="deal-percent">
      <label className="field-wrap"><span className="field-label">Brand pays</span><span className="money-input big"><span>{currencySymbol()}</span><input type="number" min="0" inputMode="numeric" value={draft.agreed_payment} onChange={(event) => set({ agreed_payment: event.target.value })} placeholder="e.g. 5000" aria-label="Brand price" /></span></label>
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
      {profit < 0 && <p className="deal-warn"><AlertTriangle size={13} /> The brand price is below what the creators get — you'd lose {money(-profit)}.</p>}
      {fixed && price > 0 && cost === 0 && creators.length > 0 && <p className="deal-warn soft"><TrendingUp size={13} /> Add each creator's fee to see your real profit.</p>}
    </div>
  </div>;
}
