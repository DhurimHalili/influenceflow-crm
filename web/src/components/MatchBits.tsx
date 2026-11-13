import { BadgeDollarSign, Bot, Check, ChevronRight, CircleAlert, Ear, ExternalLink, FileText, Gift, Link2, ListVideo, Loader2, Pencil, Play, ScanSearch, Store, Tags, X } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { useMatch } from "../contexts/MatchContext";
import { counts, kindOf, linkIsBrand, type BrandLink, type Match } from "../lib/match";
import { KIND_LABEL, sureness, type DealKind, type Evidence, type Signal } from "../lib/sponsors";
import { familyOf, FAMILIES, TOPICS, topicLabel, type FamilyKey } from "../lib/taxonomy";
import { dateLabel } from "../lib/utils";
import type { Brand, Creator } from "../types";
import { Avatar, Button, Modal } from "./ui";

// Small pieces shared by the Match page and the brand / creator profiles.

/** One colour per family — the content bar and topic chips speak the same colours everywhere. */
export const FAMILY_COLOR: Record<FamilyKey, string> = {
  pc: "#7059e8", computers: "#4b78e6", peripherals: "#2d95c9", setup: "#1f9e95", mobile: "#36a466", creator: "#c2861b", software: "#8d5fd3",
  gaming: "#d0527a", cars: "#df7434", home: "#8b9a35", style: "#cf5c9b", body: "#2f9f78", life: "#c3812f", money: "#2c8a55", learn: "#5568cf", music: "#a8509a", fun: "#94775a",
};
// Topics of one family share its colour, each a step lighter, so "PC builds" and "PC cases" stay apart in a bar.
const STEP = [0, 24, 42, 12, 33, 50, 6, 18];
export const topicColor = (key: string) => {
  const fam = familyOf(key) || "fun";
  const i = TOPICS.filter((t) => t.family === fam).findIndex((t) => t.key === key);
  const mix = STEP[Math.max(0, i) % STEP.length];
  return mix ? `color-mix(in srgb, ${FAMILY_COLOR[fam]} ${100 - mix}%, #ffffff)` : FAMILY_COLOR[fam];
};

export function ScoreRing({ match, size = "md" }: { match: Pick<Match, "score" | "tone" | "missing">; size?: "sm" | "md" }) {
  if (match.missing) return <span className={`match-score mx-none ${size}`} title={match.missing === "creator" ? "Their videos haven't been read yet" : "What the brand sells isn't known yet"} aria-label="No score yet"><b>–</b></span>;
  return <span className={`match-score ${size} tone-${match.tone}`} style={{ ["--p" as string]: `${match.score}%` }} role="img" aria-label={`Match ${match.score} out of 100`}><b>{match.score}</b></span>;
}

/** A creator's content mix as one bar; topics a brand sells can be lit up. */
export function ContentBar({ topics, lit, height = 8 }: { topics: { key: string; share: number }[]; lit?: Set<string>; height?: number }) {
  const total = topics.reduce((n, t) => n + t.share, 0);
  return <div className="mx-bar" style={{ height }} role="img" aria-label={topics.slice(0, 4).map((t) => `${topicLabel(t.key)} ${Math.round(t.share * 100)}%`).join(", ") || "No clear topics"}>
    {topics.map((t) => <i key={t.key} title={`${topicLabel(t.key)} · ${Math.round(t.share * 100)}%`} className={lit && !lit.has(t.key) ? "dim" : ""} style={{ width: `${t.share * 100}%`, background: topicColor(t.key) }} />)}
    {total < 0.98 && <i className="rest" style={{ width: `${(1 - total) * 100}%` }} title={`No clear topic · ${Math.round((1 - total) * 100)}%`} />}
  </div>;
}

export function TopicChips({ items, max = 4, lit }: { items: { key: string; weight?: number; share?: number }[]; max?: number; lit?: Set<string> }) {
  const shown = items.slice(0, max);
  return <span className="mx-topics">{shown.map((t) => <span key={t.key} className={`mx-topic${lit && !lit.has(t.key) ? " dim" : ""}`} style={{ ["--tc" as string]: topicColor(t.key) }}><i />{topicLabel(t.key)}{(t.weight ?? t.share) !== undefined && items.length > 1 && <small>{Math.round((t.weight ?? t.share ?? 0) * 100)}%</small>}</span>)}{items.length > max && <span className="mx-topic more">+{items.length - max}</span>}</span>;
}

const KIND_ICON: Record<DealKind, typeof Gift> = { sponsored: BadgeDollarSign, seeded: Gift, affiliate: Link2 };
export function DealChip({ link, onOpen, showName = true, compact = false }: { link: BrandLink; onOpen?: () => void; showName?: boolean; compact?: boolean }) {
  const kind = kindOf(link);
  const Icon = link.store ? Store : KIND_ICON[kind];
  const sure = sureness(link.confidence, link.verdict === "yes");
  const label = `${showName ? `${link.brand_name} · ` : ""}${link.store ? "Store affiliate" : KIND_LABEL[kind]}${compact ? "" : ` · ${sure}`}`;
  const body = <><Icon size={12} aria-hidden="true" />{showName && <b>{link.brand_name}</b>}<span>{link.store ? "Store" : KIND_LABEL[kind]}</span>{!compact && <em className={`sure-${sure.toLowerCase()}`}>{sure}</em>}</>;
  return onOpen ? <button type="button" className={`mx-deal k-${link.store ? "store" : kind}`} onClick={onOpen} aria-label={`${label} — see why`}>{body}</button> : <span className={`mx-deal k-${link.store ? "store" : kind}`} aria-label={label}>{body}</span>;
}

const SIGNAL: Record<Signal, { icon: typeof Gift; text: string }> = {
  paid_label: { icon: BadgeDollarSign, text: "YouTube shows “Includes paid promotion”" },
  description: { icon: FileText, text: "Their own description" },
  title: { icon: Tags, text: "The video title" },
  chapters: { icon: ListVideo, text: "The video's chapters" },
  sponsorblock: { icon: ScanSearch, text: "SponsorBlock — viewers marked the segment" },
  voice: { icon: Ear, text: "Heard in the video" },
  ai: { icon: Bot, text: "AI double-checked the wording" },
  you: { icon: Check, text: "You confirmed it" },
};
export const signalText = (s: Signal) => SIGNAL[s]?.text || s;
const watch = (e: Evidence) => `https://www.youtube.com/watch?v=${encodeURIComponent(e.video)}${e.t ? `&t=${Math.max(0, Math.floor(e.t))}s` : ""}`;
const stamp = (t?: number) => (t === undefined ? "" : `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}`);

/** Why we think they work with a brand: every video, the exact words, the signals — and your call. */
export function EvidenceModal({ link, creator, onClose }: { link: BrandLink | null; creator?: Creator; onClose: () => void }) {
  const m = useMatch();
  const [busy, setBusy] = useState(false);
  const live = link ? m.links.find((l) => l.id === link.id) || link : null;
  if (!live) return null;
  const kind = kindOf(live);
  const sure = sureness(live.confidence, live.verdict === "yes");
  const check = m.seen.get(live.brand_key)?.domain_check || "";
  const decide = async (v: "" | "yes" | "no", k: DealKind | null = live.verdict_kind) => { setBusy(true); await m.verdict(live.id, v, k); setBusy(false); };
  return <Modal open onClose={onClose} title={`${live.brand_name} × ${creator?.name || "creator"}`} description={live.manual ? "Added by you." : `${live.store ? "Store affiliate" : KIND_LABEL[kind]} · ${sure}${live.verdict ? "" : ` (${Math.round(live.confidence * 100)}%)`} · ${live.videos} video${live.videos === 1 ? "" : "s"}${live.last_at ? ` · latest ${dateLabel(live.last_at)}` : ""}`}>
    <div className="mx-evidence">
      {live.verdict === "no" && <p className="mx-note warn"><CircleAlert size={14} /> You marked this as wrong — it doesn't count anywhere.</p>}
      {live.domain && <p className="mx-ev-site"><Link2 size={13} /> <a href={`https://${live.domain}`} target="_blank" rel="noopener noreferrer">{live.domain}</a><span>{live.brand_id ? "· their website in your CRM" : check === "guess" ? "· found by their name — check it's theirs" : check === "site" ? "· from the creator's own link, site checked" : check === "mismatch" ? "· the site's name differs — check it" : "· from the creator's link"}</span></p>}
      {live.evidence.length ? <ol className="mx-ev-list">{live.evidence.map((e) => <li key={e.video}>
        <a className="mx-ev-video" href={watch(e)} target="_blank" rel="noopener noreferrer"><Play size={13} /><span><strong>{e.title || "Video"}</strong><small>{e.at ? dateLabel(e.at) : ""}{e.t !== undefined ? ` · at ${stamp(e.t)}` : ""} · {KIND_LABEL[e.kind]}</small></span><ExternalLink size={13} /></a>
        {e.quote && <blockquote>{e.quote}</blockquote>}
        <div className="mx-signals">{e.signals.map((s) => { const S = SIGNAL[s]; return S ? <span key={s} title={S.text}><S.icon size={12} /> {S.text}</span> : null; })}</div>
      </li>)}</ol> : <p className="muted-copy">{live.manual ? "You added this by hand." : "No video evidence kept."}</p>}
      {!live.manual && <div className="mx-verdict">
        <span>Is this right?</span>
        <div className="mx-verdict-btns">
          <Button size="sm" variant={live.verdict === "yes" ? "primary" : "secondary"} loading={busy} onClick={() => decide(live.verdict === "yes" ? "" : "yes")}><Check size={13} /> {live.verdict === "yes" ? "Confirmed" : "Yes, they work together"}</Button>
          <Button size="sm" variant={live.verdict === "no" ? "danger" : "ghost"} loading={busy} onClick={() => decide(live.verdict === "no" ? "" : "no", null)}><X size={13} /> {live.verdict === "no" ? "Marked wrong" : "No, wrong"}</Button>
        </div>
        {live.verdict !== "no" && !live.store && <label className="mx-kind">It's a<select value={kind} onChange={(e) => decide("yes", e.target.value as DealKind)}>{(Object.keys(KIND_LABEL) as DealKind[]).map((k) => <option key={k} value={k}>{KIND_LABEL[k].toLowerCase()} deal</option>)}</select></label>}
      </div>}
      <p className="mx-fine">Sponsored = paid placement. Seeded = the brand sent the product. Affiliate = a link or code that pays commission. Your answer is kept for good — a new scan never changes it.</p>
    </div>
  </Modal>;
}

/** Pick what a brand sells (overrides their site). */
export function TopicPicker({ open, value, suggested, onSave, onClose, brand }: { open: boolean; value: string[]; suggested: string[]; onSave: (keys: string[]) => void; onClose: () => void; brand: string }) {
  const [picked, setPicked] = useState<string[]>(value.length ? value : suggested);
  const [q, setQ] = useState("");
  const groups = useMemo(() => {
    const out = new Map<FamilyKey, typeof TOPICS>();
    for (const t of TOPICS) if (!q || t.label.toLowerCase().includes(q.toLowerCase()) || FAMILIES[t.family].label.toLowerCase().includes(q.toLowerCase())) (out.get(t.family) || out.set(t.family, []).get(t.family)!).push(t);
    return out;
  }, [q]);
  const toggle = (k: string) => setPicked((p) => (p.includes(k) ? p.filter((x) => x !== k) : p.length >= 8 ? p : [...p, k]));
  return <Modal open={open} onClose={onClose} title={`What does ${brand} sell?`} description="Pick up to 8. Matching uses your pick instead of what their site says.">
    <div className="mx-picker">
      <input className="mx-picker-search" value={q} onChange={(e) => setQ(e.target.value.slice(0, 40))} placeholder="Search topics" aria-label="Search topics" />
      <div className="mx-picker-groups">{[...groups.entries()].map(([fam, list]) => <fieldset key={fam}><legend style={{ ["--tc" as string]: FAMILY_COLOR[fam] }}><i />{FAMILIES[fam].label}</legend><div>{list.map((t) => <button type="button" key={t.key} className={picked.includes(t.key) ? "on" : ""} aria-pressed={picked.includes(t.key)} onClick={() => toggle(t.key)}>{picked.includes(t.key) && <Check size={12} />}{t.label}</button>)}</div></fieldset>)}</div>
      <div className="mx-picker-foot"><span>{picked.length ? `${picked.length} picked` : "Nothing picked — their site decides"}</span><div>{value.length > 0 && <Button variant="ghost" size="sm" onClick={() => { onSave([]); onClose(); }}>Use their site</Button>}<Button size="sm" onClick={() => { onSave(picked); onClose(); }}>Save</Button></div></div>
    </div>
  </Modal>;
}

/** The deals a creator has (for a list row / card), strongest first. */
export function useCreatorDeals(creatorId: string) {
  const m = useMatch();
  return useMemo(() => (m.linksBy.get(creatorId) || []).filter((l) => counts(l)).sort((a, b) => Number(b.verdict === "yes") - Number(a.verdict === "yes") || (a.store ? 1 : 0) - (b.store ? 1 : 0) || b.confidence - a.confidence), [m.linksBy, creatorId]);
}

/** Who works with a brand (CRM creators), strongest first. */
export function useBrandDeals(brand: Pick<Brand, "id" | "domain" | "name">) {
  const m = useMatch();
  return useMemo(() => m.links.filter((l) => linkIsBrand(l, brand) && counts(l)).sort((a, b) => b.confidence - a.confidence), [m.links, brand]);
}

/** A quiet line that says the reader is still working, or what it couldn't do. */
export function ReadState({ status, note, scanning, onScan, when }: { status?: string; note?: string; scanning?: boolean; onScan?: () => void; when?: string | null }): ReactNode {
  if (scanning) return <span className="mx-state busy"><Loader2 size={12} className="spin" /> Reading their videos…</span>;
  if (!status) return <span className="mx-state">Not read yet — the CRM reads new creators within a few minutes{onScan && <> · <button type="button" onClick={onScan}>Read now</button></>}</span>;
  if (status === "no_channel") return <span className="mx-state warn">No YouTube channel to read</span>;
  if (status === "error") return <span className="mx-state warn" title={note}>Couldn't read their videos{onScan && <> · <button type="button" onClick={onScan}>Try again</button></>}</span>;
  return <span className="mx-state">Read {when ? dateLabel(when) : ""}{onScan && <> · <button type="button" onClick={onScan}>Read again</button></>}</span>;
}

export function MatchLink({ to, children }: { to: string; children: ReactNode }) {
  return <Link to={to} className="mx-more">{children} <ChevronRight size={14} /></Link>;
}

export function CreatorChip({ creator, onClick, children }: { creator: Creator; onClick?: () => void; children?: ReactNode }) {
  const inner = <><Avatar name={creator.name} path={creator.avatar_path} size="sm" /><span className="mx-chip-name">{creator.name}</span>{children}</>;
  return onClick ? <button type="button" className="mx-cchip" onClick={onClick}>{inner}</button> : <Link to={`/app/influencers/${creator.id}`} className="mx-cchip">{inner}</Link>;
}

export function EditTopicsButton({ onClick }: { onClick: () => void }) {
  return <button type="button" className="mx-icon-btn" onClick={onClick} aria-label="Change what they sell" title="Change what they sell"><Pencil size={13} /></button>;
}
