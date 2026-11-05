import { ArrowDownRight, ArrowUpRight, FileText, Handshake, History, Mail, PenLine, Undo2, Wand2 } from "lucide-react";
import { useMemo, useState } from "react";
import { useData } from "../contexts/DataContext";
import { useToast } from "../contexts/ToastContext";
import { applySamePct, negotiate, normalizeRateHistory, normalizeRateMeta, RATE_FAMILIES, RATE_SHORT, setListPrices, undoEvent, type RateEvent, type RateKey, type Rates } from "../lib/negotiation";
import { EMPTY_RATES, RATE_FIELDS, RATE_GROUPS } from "../lib/prefs";
import { currencySymbol, dateLabel, money, relativeTime } from "../lib/utils";
import type { Creator, RateCard as RateCardT } from "../types";
import { Button, Input } from "./ui";

// The rate card: what the creator asks (list price) and what you actually
// negotiated. Negotiate one format and its sibling follows by the same % —
// clearly labelled — while everything else stays as the creator set it.

const cpm = (price: number, views: number) => (views > 0 ? (price / views) * 1000 : 0);
const cpmTone = (c: number) => (c > 60 ? "cpm-high" : c > 25 ? "cpm-mid" : "cpm-low");
const SOURCE_ICON = { email: Mail, manual: PenLine, media_kit: FileText } as const;
const SOURCE_LABEL = { email: "from email", manual: "by you", media_kit: "from media kit" } as const;
const pct = (p: number) => `${p > 0 ? "+" : ""}${p}%`;

export function RateCardSection({ creator, avgViews }: { creator: Creator; avgViews: number }) {
  const data = useData();
  const { toast } = useToast();
  const [mode, setMode] = useState<"" | "edit" | "negotiate">("");
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [deal, setDeal] = useState<Partial<Record<RateKey, string>>>({});
  const [showHistory, setShowHistory] = useState(false);
  const rates = { ...EMPTY_RATES, ...(creator.rates || {}) } as unknown as Rates;
  const meta = useMemo(() => normalizeRateMeta(creator.rate_meta), [creator.rate_meta]);
  const history = useMemo(() => normalizeRateHistory(creator.rate_history), [creator.rate_history]);
  const filled = RATE_FIELDS.filter((f) => rates[f.key as RateKey] > 0);
  const last = history.find((e) => !e.undone);

  const commit = (next: { rates: Partial<Rates>; meta: typeof meta; event: RateEvent | null }, activity: string, done: string) => {
    if (!next.event) return toast("Nothing changed", "info");
    data.updateCreator(creator.id, { rates: next.rates as unknown as RateCardT, rate_meta: next.meta, rate_history: [next.event, ...history].slice(0, 60) }, { activity: `${creator.name}: ${activity}` });
    toast(done);
  };

  // ---- edit list prices ----
  const startEdit = () => { setDraft(Object.fromEntries(RATE_FIELDS.map((f) => [f.key, rates[f.key as RateKey] ? String(meta[f.key as RateKey]?.list || rates[f.key as RateKey]) : ""]))); setMode("edit"); };
  const saveEdit = () => {
    const prices = Object.fromEntries(RATE_FIELDS.map((f) => [f.key, Math.max(0, Number(draft[f.key]) || 0)])) as Partial<Record<RateKey, number>>;
    const cleared = RATE_FIELDS.filter((f) => !prices[f.key as RateKey] && rates[f.key as RateKey] > 0).map((f) => f.key as RateKey);
    const next = setListPrices(rates, meta, prices, { source: "manual" });
    for (const key of cleared) { next.rates[key] = 0; delete next.meta[key]; }
    if (!next.event && !cleared.length) { setMode(""); return; }
    data.updateCreator(creator.id, { rates: next.rates as unknown as RateCardT, rate_meta: next.meta, rate_history: next.event ? [next.event, ...history].slice(0, 60) : history }, { activity: `Rate card updated for ${creator.name}` });
    setMode("");
    toast("Rate card saved");
  };

  // ---- negotiate ----
  const agreed = Object.fromEntries(Object.entries(deal).map(([k, v]) => [k, Number(v) || 0]).filter(([, v]) => (v as number) > 0)) as Partial<Record<RateKey, number>>;
  const preview = negotiate(rates, meta, agreed, { source: "manual" });
  const startNegotiate = () => { setDeal({}); setMode("negotiate"); };
  const applyDeal = () => {
    commit(preview, preview.event?.summary || "negotiated", "Negotiated rates saved");
    setMode("");
  };
  const lastAgreed = last?.changes.find((c) => c.kind === "negotiated");
  const sameTargets = lastAgreed ? RATE_FIELDS.map((f) => f.key as RateKey).filter((k) => k !== lastAgreed.key && rates[k] > 0 && !last?.changes.some((c) => c.key === k) && !RATE_FAMILIES.some((fam) => fam.includes(k) && fam.includes(lastAgreed.key))) : [];

  return <section className="detail-section rate-card"><div className="detail-section-head"><div><span>Pricing</span><h2>Rate card</h2></div>{!mode && <div className="rate-actions">{filled.length > 0 && <Button size="sm" onClick={startNegotiate}><Handshake size={14} /> Negotiate</Button>}<Button size="sm" variant="secondary" onClick={startEdit}>{filled.length ? "Edit prices" : "Add rates"}</Button></div>}</div>

    {mode === "edit" && <div className="rate-edit"><p className="field-hint">These are {creator.name.split(" ")[0]}'s asking prices (list prices). Negotiated prices are set with “Negotiate”.</p>{RATE_GROUPS.map((group) => <fieldset key={group.id} className="rate-group"><legend>{group.label}</legend><div className="rate-edit-grid">{RATE_FIELDS.filter((f) => f.group === group.id).map((f) => <Input key={f.key} label={`${f.label} (${currencySymbol()})`} type="number" min={0} value={draft[f.key] || ""} onChange={(event) => setDraft({ ...draft, [f.key]: event.target.value })} hint={group.id !== "addon" && Number(draft[f.key]) > 0 && avgViews > 0 ? `CPM ${money(cpm(Number(draft[f.key]), avgViews))}` : f.hint} placeholder="—" />)}</div></fieldset>)}<div className="modal-actions"><Button variant="ghost" onClick={() => setMode("")}>Cancel</Button><Button onClick={saveEdit}>Save prices</Button></div></div>}

    {mode === "negotiate" && <div className="negotiate-panel">
      <p className="negotiate-lead"><Handshake size={15} /> Enter only what you agreed. Integrated, extended and dedicated move together: negotiate one and the others follow by the same %. Everything else stays as {creator.name.split(" ")[0]} priced it.</p>
      <div className="negotiate-grid">{filled.map((f) => { const key = f.key as RateKey; const list = meta[key]?.list || rates[key]; return <label key={key} className={`negotiate-row${deal[key] ? " on" : ""}`}><span><strong>{f.short}</strong><small>list {money(list)}{rates[key] !== list ? ` · now ${money(rates[key])}` : ""}</small></span><span className="money-input"><span>{currencySymbol()}</span><input type="number" min={0} inputMode="numeric" value={deal[key] || ""} onChange={(event) => setDeal({ ...deal, [key]: event.target.value })} placeholder="agreed" aria-label={`Agreed price for ${f.short}`} /></span></label>; })}</div>
      {preview.event ? <div className="negotiate-preview"><span>What changes</span>{preview.event.changes.map((c) => <div key={c.key} className={`np-row kind-${c.kind}`}><b>{RATE_SHORT[c.key]}</b><s>{money(c.from)}</s><ArrowDownRight size={13} /><strong>{money(c.to)}</strong><em>{c.kind === "auto" ? c.note : pct(Math.round(((c.to - c.list) / (c.list || c.to)) * 1000) / 10)}</em></div>)}</div> : <p className="muted-copy">Type an agreed price to see the effect.</p>}
      <div className="modal-actions"><Button variant="ghost" onClick={() => setMode("")}>Cancel</Button><Button onClick={applyDeal} disabled={!preview.event}>Save negotiated rates</Button></div>
    </div>}

    {!mode && (filled.length ? <div className="rate-board">{RATE_GROUPS.map((group) => { const items = RATE_FIELDS.filter((f) => f.group === group.id && rates[f.key as RateKey] > 0); if (!items.length) return null; return <div className="rate-board-group" key={group.id}><span>{group.label}</span><div className="rate-grid">{items.map((f) => { const key = f.key as RateKey; const value = rates[key]; const m = meta[key]; const c = group.id === "addon" ? 0 : cpm(value, avgViews); const moved = m && m.status !== "list" && m.list && m.list !== value; const Icon = m ? SOURCE_ICON[m.source] : null; return <div key={key} className={`${group.id === "addon" ? "is-addon" : ""}${m?.status === "negotiated" ? " is-negotiated" : m?.status === "auto" ? " is-auto" : ""}`}><small>{f.label}</small><strong>{group.id === "addon" ? "+" : ""}{money(value)}{moved && <s>{money(m!.list)}</s>}</strong>{m && m.status !== "list" ? <em className={`rate-tag tag-${m.status}`} title={`${m.note} · ${SOURCE_LABEL[m.source]}${m.at ? ` · ${dateLabel(m.at)}` : ""}`}>{m.status === "negotiated" ? <>{m.pct < 0 ? <ArrowDownRight size={11} /> : <ArrowUpRight size={11} />} Negotiated {pct(m.pct)}</> : <><Wand2 size={11} /> Auto {pct(m.pct)} · {m.note.split("· ")[1] || "followed"}</>}</em> : c > 0 ? <em className={cpmTone(c)} title="Cost per 1,000 views at their average views">CPM {money(c)}</em> : <em className="rate-hint">{f.hint.replace(/^Add-on · /, "")}</em>}{m && m.status === "list" && m.source === "media_kit" && Icon && <span className="rate-src"><Icon size={10} /> media kit</span>}</div>; })}</div></div>; })}
      {last && <div className="rate-last"><History size={13} /><span><strong>{last.summary}</strong><small>{SOURCE_LABEL[last.source]} · {relativeTime(last.at)}{last.evidence ? ` · “${last.evidence}”` : ""}</small></span><button type="button" className="text-link" onClick={() => { const next = undoEvent(rates, meta, last); data.updateCreator(creator.id, { rates: next.rates as unknown as RateCardT, rate_meta: next.meta, rate_history: history.map((e) => (e.id === last.id ? { ...e, undone: true } : e)) }, { activity: `Undid: ${last.summary}` }); toast("Undone — previous prices restored"); }}><Undo2 size={12} /> Undo</button></div>}
      {sameTargets.length > 0 && lastAgreed && <div className="rate-same"><span>Apply the same {pct(Math.round(((lastAgreed.to - lastAgreed.list) / lastAgreed.list) * 1000) / 10)} to</span>{sameTargets.map((k) => <button type="button" key={k} onClick={() => commit(applySamePct(rates, meta, lastAgreed.key, [k]), `${RATE_SHORT[k]} set like ${RATE_SHORT[lastAgreed.key]}`, `${RATE_SHORT[k]} updated`)}>{RATE_SHORT[k]}</button>)}{sameTargets.length > 1 && <button type="button" className="all" onClick={() => commit(applySamePct(rates, meta, lastAgreed.key, sameTargets), `all rates set like ${RATE_SHORT[lastAgreed.key]}`, "All rates updated")}>All of them</button>}</div>}
      {rates.video > 0 && rates.dedicated > 0 && <p className="rate-foot">Dedicated is {(rates.dedicated / rates.video).toFixed(1)}× the integration price{avgViews > 0 ? ` · ${money(cpm(rates.dedicated, avgViews))} vs ${money(cpm(rates.video, avgViews))} CPM` : ""}</p>}
      {history.length > 0 && <button type="button" className="text-link rate-history-toggle" onClick={() => setShowHistory((v) => !v)}><History size={12} /> {showHistory ? "Hide" : "Show"} price history ({history.length})</button>}
      {showHistory && <ol className="rate-history">{history.map((e) => { const Icon = SOURCE_ICON[e.source]; return <li key={e.id} className={e.undone ? "undone" : ""}><Icon size={12} /><span><strong>{e.summary}</strong><small>{SOURCE_LABEL[e.source]} · {dateLabel(e.at)}{e.undone ? " · undone" : ""}{e.evidence ? ` · “${e.evidence}”` : ""}</small></span></li>; })}</ol>}
    </div>
      : <p className="muted-copy">No rates yet. Add what {creator.name.split(" ")[0]} charges for an integration, a dedicated video, shorts, posts, stories, streams, podcasts or UGC — plus add-ons like usage rights. When Gmail is connected and AI reading is on, prices they email or put in a media kit fill in by themselves.</p>)}
  </section>;
}
