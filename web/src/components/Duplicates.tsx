import { ArrowLeft, ArrowRight, Check, CopyX, ExternalLink, Merge, ShieldCheck, Sparkles } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useData } from "../contexts/DataContext";
import { useToast } from "../contexts/ToastContext";
import { brandDuplicates, creatorDuplicates, DUP_LABELS, type DupGroup, type DupKind } from "../lib/duplicates";
import { compact, dateLabel } from "../lib/utils";
import { STATUS_LABELS, type Brand, type Creator, type EntityStatus } from "../types";
import { Avatar, Button, FieldMergeReview, Modal, StatusBadge } from "./ui";

// Two records for one person split their mail: Gmail files a reply on one
// copy while you follow up from the other, so the clock, the status and the
// history all go wrong. Every list shows a red alert until each pair is merged
// or marked "not the same"; the copies are pinned to the top of the list.

const statusText = (v: unknown) => STATUS_LABELS[v as EntityStatus] || String(v);
const dayText = (v: unknown) => dateLabel(String(v));
export const CREATOR_MERGE_FIELDS = [{ key: "name", label: "Name" }, { key: "contact_email", label: "Email" }, { key: "secondary_email", label: "Email 2" }, { key: "secondary_email_label", label: "Email 2 is" }, { key: "channel_link", label: "Channel" }, { key: "pipeline_status", label: "Status", format: statusText }, { key: "date_contacted", label: "Contacted", format: dayText }, { key: "niche", label: "Niche" }, { key: "country", label: "Country" }, { key: "platform", label: "Platform" }, { key: "avg_views", label: "Avg. views" }, { key: "engagement_rate", label: "Engagement" }, { key: "stars_demographics", label: "Audience" }, { key: "stars_niche", label: "Niche fit" }, { key: "stars_engagement", label: "Engagement stars" }, { key: "stars_consistency", label: "Consistency" }, { key: "draft_subject", label: "Draft subject" }, { key: "draft_body", label: "Draft body" }, { key: "notes", label: "Notes" }];
export const BRAND_MERGE_FIELDS = [{ key: "name", label: "Company" }, { key: "domain", label: "Domain" }, { key: "brand_type", label: "Type" }, { key: "contact_email", label: "Email" }, { key: "secondary_email", label: "Email 2" }, { key: "secondary_email_label", label: "Email 2 is" }, { key: "pipeline_status", label: "Status", format: statusText }, { key: "date_contacted", label: "Contacted", format: dayText }, { key: "draft_subject", label: "Draft subject" }, { key: "draft_body", label: "Draft body" }, { key: "notes", label: "Notes" }];

const OPEN_EVENT = "if:dup-review";
type Rec = Creator | Brand;
const noun = (kind: DupKind, n: number) => (kind === "creator" ? (n === 1 ? "influencer" : "influencers") : n === 1 ? "brand" : "brands");

export function useDuplicates(kind: DupKind) {
  const data = useData();
  const { toast } = useToast();
  const dismissed = data.profile.preferences?.not_duplicates;
  const groups = useMemo(() => (kind === "creator" ? creatorDuplicates(data.creators, dismissed || []) : brandDuplicates(data.brands, dismissed || [])), [kind, data.creators, data.brands, dismissed]);
  const byId = useMemo(() => {
    const map = new Map<string, DupGroup>();
    for (const g of groups) for (const id of g.ids) if (!map.has(id)) map.set(id, g);
    return map;
  }, [groups]);
  const strong = groups.filter((g) => g.strong);
  const setDismissed = (next: string[]) => data.updateProfile({ preferences: { ...data.profile.preferences, not_duplicates: next.slice(-1000) } });
  const keepBoth = (group: DupGroup) => {
    const before = data.profile.preferences?.not_duplicates || [];
    const keys = group.pairs.map((p) => p.key);
    setDismissed(Array.from(new Set([...before, ...keys])));
    toast(`Kept both — they won't be flagged again.`, "success", { label: "Undo", run: () => setDismissed(before) });
  };
  return { groups, strong, byId, keepBoth };
}

/** Opens the review on the group a record belongs to (the list's red tag). */
export const openDuplicateReview = (kind: DupKind, id?: string) => window.dispatchEvent(new CustomEvent(OPEN_EVENT, { detail: { kind, id } }));

export function DupTag({ kind, id, strong }: { kind: DupKind; id: string; strong: boolean }) {
  return <button type="button" className={`dup-tag${strong ? "" : " soft"}`} onClick={(event) => { event.preventDefault(); event.stopPropagation(); openDuplicateReview(kind, id); }} title={strong ? "Another record has the same email or profile — review" : "Another record has the same name — check"}>
    <CopyX size={12} aria-hidden="true" />{strong ? "Possible duplicate" : "Same name"}
  </button>;
}

/** The red alert at the top of a list (and the dashboard). Stays until every pair is merged or kept apart. */
export function DuplicateAlert({ kind, compact: small = false }: { kind: DupKind; compact?: boolean }) {
  const data = useData();
  const { groups, strong } = useDuplicates(kind);
  const [open, setOpen] = useState(false);
  const [startId, setStartId] = useState<string | undefined>();
  useEffect(() => {
    const onOpen = (event: Event) => {
      const detail = (event as CustomEvent<{ kind: DupKind; id?: string }>).detail;
      if (detail?.kind !== kind) return;
      setStartId(detail.id);
      setOpen(true);
    };
    window.addEventListener(OPEN_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_EVENT, onOpen);
  }, [kind]);
  const list: Rec[] = kind === "creator" ? data.creators : data.brands;
  const nameOf = (id: string) => list.find((r) => r.id === id)?.name || "Unnamed";
  const review = <DuplicateReview kind={kind} open={open} startId={startId} onClose={() => { setOpen(false); setStartId(undefined); }} />;
  if (!groups.length) return review;
  const shown = strong.length ? strong : groups;
  const records = shown.reduce((n, g) => n + g.ids.length, 0);
  const first = shown[0];
  const reason = first.reasons[0];
  if (!strong.length) {
    if (small) return review;
    return <>{review}<div className="dup-alert soft" role="status">
      <span className="dup-alert-icon" aria-hidden="true"><CopyX size={17} /></span>
      <div className="dup-alert-copy"><strong>{records} {noun(kind, records)} share a name</strong><p>Probably different people — a quick look makes sure nothing is split in two.</p></div>
      <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>Check</Button>
    </div></>;
  }
  return <>{review}<div className={`dup-alert${small ? " compact" : ""}`} role="alert">
    <span className="dup-alert-icon" aria-hidden="true"><CopyX size={small ? 16 : 19} /><i /></span>
    <div className="dup-alert-copy">
      <strong>{shown.length === 1 ? `${first.ids.length} ${noun(kind, first.ids.length)} look like the same ${kind === "creator" ? "person" : "company"}` : `${shown.length} possible duplicates · ${records} ${noun(kind, records)}`}</strong>
      {!small && <p>{DUP_LABELS[reason]}{first.pairs[0]?.matches[0] ? ` (${first.pairs[0].matches[0].value})` : ""} on {first.ids.slice(0, 3).map(nameOf).join(" and ")}{first.ids.length > 3 ? "…" : ""}. Until you merge them, replies can land on one copy while you follow up from the other.</p>}
    </div>
    <Button size="sm" className="dup-alert-cta" onClick={() => setOpen(true)}><Merge size={14} /> {small ? "Fix" : "Review & fix"}</Button>
  </div></>;
}

/** On a profile: "this record has a twin". */
export function DuplicateStrip({ kind, id }: { kind: DupKind; id: string }) {
  const data = useData();
  const { byId, keepBoth } = useDuplicates(kind);
  const [open, setOpen] = useState(false);
  const group = byId.get(id);
  if (!group) return null;
  const list: Rec[] = kind === "creator" ? data.creators : data.brands;
  const others = group.ids.filter((x) => x !== id).map((x) => list.find((r) => r.id === x)).filter((r): r is Rec => !!r);
  const pair = group.pairs.find((p) => p.a === id || p.b === id) || group.pairs[0];
  return <div className={`dup-strip${group.strong ? "" : " soft"}`} role={group.strong ? "alert" : "status"}>
    <CopyX size={16} aria-hidden="true" />
    <span><strong>{group.strong ? "Possible duplicate of" : "Same name as"} {others.map((r, i) => <span key={r.id}>{i ? ", " : ""}<Link to={`/app/${kind === "creator" ? "influencers" : "brands"}/${r.id}`}>{r.name}</Link></span>)}</strong>
      <small>{pair.matches.map((m) => `${DUP_LABELS[m.reason]}${m.reason === "name" ? "" : `: ${m.value}`}`).join(" · ")}</small></span>
    <div><Button size="sm" variant="secondary" onClick={() => keepBoth(group)}>Not the same</Button><Button size="sm" onClick={() => setOpen(true)}><Merge size={14} /> Review & merge</Button></div>
    <DuplicateReview kind={kind} open={open} startId={id} onClose={() => setOpen(false)} />
  </div>;
}

function useHistory(kind: DupKind) {
  const data = useData();
  return useMemo(() => {
    const map = new Map<string, { emails: number; last: string; followups: number; campaigns: number; contacts: number }>();
    const get = (id: string) => { let v = map.get(id); if (!v) { v = { emails: 0, last: "", followups: 0, campaigns: 0, contacts: 0 }; map.set(id, v); } return v; };
    for (const e of data.emailEvents || []) if (e.entity_type === kind && !e.scheduled) { const v = get(e.entity_id); v.emails++; if (e.at > v.last) v.last = e.at; }
    for (const f of data.followups) { const id = kind === "creator" ? f.creator_id : f.brand_id; if (id) get(id).followups++; }
    for (const c of data.campaigns) { if (kind === "creator") c.creator_ids.forEach((id) => get(id).campaigns++); else if (c.brand_id) get(c.brand_id).campaigns++; }
    if (kind === "brand") for (const c of data.contacts) get(c.brand_id).contacts++;
    return map;
  }, [kind, data.emailEvents, data.followups, data.campaigns, data.contacts]);
}

const clean = (v: string) => v.trim().toLowerCase().replace(/^https?:\/\/(www\.)?/, "").replace(/\/+$/, "");

export function DuplicateReview({ kind, open, onClose, startId }: { kind: DupKind; open: boolean; onClose: () => void; startId?: string }) {
  const data = useData();
  const { toast } = useToast();
  const { groups, keepBoth } = useDuplicates(kind);
  const history = useHistory(kind);
  const [index, setIndex] = useState(0);
  const [keepId, setKeepId] = useState<string | null>(null);
  const [mergedCount, setMergedCount] = useState(0);
  useEffect(() => {
    if (!open) return;
    const at = startId ? groups.findIndex((g) => g.ids.includes(startId)) : 0;
    setIndex(Math.max(0, at));
    setKeepId(null);
    setMergedCount(0);
    // Only when the dialog opens: the groups shrink as you merge.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, startId]);
  const list: Rec[] = kind === "creator" ? data.creators : data.brands;
  const safeIndex = Math.min(index, Math.max(0, groups.length - 1));
  const group = groups[safeIndex];
  const records = (group?.ids || []).map((id) => list.find((r) => r.id === id)).filter((r): r is Rec => !!r);
  const weight = (id: string) => { const h = history.get(id); return h ? h.emails * 2 + h.followups * 2 + h.campaigns * 5 + h.contacts : 0; };
  const suggested = records.length ? records.reduce((best, r) => (weight(r.id) > weight(best.id) || (weight(r.id) === weight(best.id) && r.created_at < best.created_at) ? r : best)) : null;
  const matched = new Set((group?.pairs || []).flatMap((p) => p.matches.filter((m) => m.reason !== "name").map((m) => clean(m.value))));
  const keep = keepId ? records.find((r) => r.id === keepId) : null;
  const other = keep ? records.find((r) => r.id !== keep.id) : null;
  const fields = kind === "creator" ? CREATOR_MERGE_FIELDS : BRAND_MERGE_FIELDS;
  const close = () => { setKeepId(null); onClose(); };
  const kindPath = kind === "creator" ? "influencers" : "brands";

  const confirmMerge = async (merged: Record<string, unknown>) => {
    if (!keep || !other) return;
    const ok = kind === "creator" ? await data.mergeCreators(keep.id, other.id, merged as Partial<Creator>) : await data.mergeBrands(keep.id, other.id, merged as Partial<Brand>);
    if (!ok) { toast("Couldn't merge — nothing was changed. Check your connection and try again.", "error"); return; }
    toast(`Merged into ${keep.name}. Emails, follow-ups and history moved over.`);
    setMergedCount((n) => n + 1);
    // A group of three keeps going with the same kept record.
    setKeepId(records.length > 2 ? keep.id : null);
  };

  const fact = (label: string, value: string, raw = value) => <div className={raw && matched.has(clean(raw)) ? "hit" : ""}><dt>{label}</dt><dd title={value}>{value || "—"}</dd></div>;

  return <Modal open={open} onClose={close} title={kind === "creator" ? "Possible duplicate influencers" : "Possible duplicate brands"} description="Merge copies of one person into a single record — or tell the CRM they're different." wide>
    {!group ? <div className="dup-done"><span><ShieldCheck size={26} /></span><strong>{mergedCount ? `All clear — ${mergedCount} merged` : "All clear"}</strong><p>No {noun(kind, 2)} share an email, profile or {kind === "creator" ? "channel" : "website"} anymore. New ones are flagged the moment they appear.</p><Button onClick={close}>Done</Button></div> : <div className="dup-review">
      <div className="dup-review-head">
        <div className="dup-reasons">{group.pairs.flatMap((p) => p.matches).filter((m, i, all) => all.findIndex((x) => x.reason === m.reason && x.value === m.value) === i).slice(0, 4).map((m) => <span key={m.reason + m.value} className={`dup-reason r-${m.reason}`}>{DUP_LABELS[m.reason]}{m.reason === "name" ? "" : <b>{m.value}</b>}</span>)}</div>
        {groups.length > 1 && <div className="dup-nav"><button type="button" onClick={() => { setIndex(Math.max(0, safeIndex - 1)); setKeepId(null); }} disabled={safeIndex === 0} aria-label="Previous duplicate"><ArrowLeft size={15} /></button><span>{safeIndex + 1} of {groups.length}</span><button type="button" onClick={() => { setIndex(Math.min(groups.length - 1, safeIndex + 1)); setKeepId(null); }} disabled={safeIndex >= groups.length - 1} aria-label="Next duplicate"><ArrowRight size={15} /></button></div>}
      </div>
      {!keep ? <>
        <p className="dup-why">{group.reasons.includes("email") ? "Gmail files each email under the copy its thread started on — so their replies and your follow-ups end up split between these records." : group.strong ? "Both records point to the same profile, so outreach, numbers and history are split between them." : "Same name only — often two different people. Check the details before merging."} Pick the one to keep; the other's emails, follow-ups, campaigns and files move into it.</p>
        <div className={`dup-cards n-${Math.min(records.length, 3)}`}>{records.map((r) => {
          const h = history.get(r.id) || { emails: 0, last: "", followups: 0, campaigns: 0, contacts: 0 };
          const c = r as Creator; const b = r as Brand;
          return <article key={r.id} className={`dup-card${suggested?.id === r.id ? " suggested" : ""}`}>
            {suggested?.id === r.id && <span className="dup-suggest"><Sparkles size={12} /> More history — keep this one</span>}
            <header><Avatar name={r.name} path={r.avatar_path} /><div><strong title={r.name}>{r.name}</strong><span><StatusBadge status={r.pipeline_status} /><small>Added {dateLabel(r.created_at)}</small></span></div><Link to={`/app/${kindPath}/${r.id}`} className="dup-open" onClick={close} aria-label={`Open ${r.name}`} title="Open profile"><ExternalLink size={14} /></Link></header>
            <dl>
              {fact("Email", r.contact_email)}
              {r.secondary_email && fact(r.secondary_email_label || "Email 2", r.secondary_email)}
              {kind === "creator" ? <>{fact("Channel", c.channel_link ? c.channel_link.replace(/^https?:\/\/(www\.)?/, "") : "", c.channel_link)}{c.youtube?.title && fact("YouTube", c.youtube.title)}{fact("Avg. views", c.avg_views ? compact(c.avg_views) : "", "")}</> : <>{fact("Website", b.domain)}{fact("Contacts", String(h.contacts), "")}</>}
            </dl>
            <ul className="dup-history"><li><b>{h.emails}</b> email{h.emails === 1 ? "" : "s"}{h.last && <small> · last {dateLabel(h.last)}</small>}</li><li><b>{h.followups}</b> follow-up{h.followups === 1 ? "" : "s"}</li><li><b>{h.campaigns}</b> campaign{h.campaigns === 1 ? "" : "s"}</li></ul>
            <Button variant={suggested?.id === r.id ? "primary" : "secondary"} onClick={() => setKeepId(r.id)}><Check size={15} /> Keep this one</Button>
          </article>;
        })}</div>
        <div className="dup-foot">
          <Button variant="ghost" onClick={() => keepBoth(group)}>They're different — keep {records.length === 2 ? "both" : "all"}</Button>
          {group.reasons.includes("email") && <small>Two channels sharing one inbox? Keep both: Gmail then matches each email by its thread and the channel's name in the subject.</small>}
        </div>
      </> : other ? <div className="dup-merge-step">
        <button type="button" className="dup-back" onClick={() => setKeepId(null)}><ArrowLeft size={14} /> Choose again</button>
        <p className="dup-why">Keeping <b>{keep.name}</b>. Pick the value to keep for each field — empty fields already take the other copy's value. Their addresses stay linked so Gmail keeps matching their mail.</p>
        <FieldMergeReview key={`${keep.id}-${other.id}`} keep={keep as unknown as Record<string, unknown>} remove={other as unknown as Record<string, unknown>} fields={fields} keepLabel={`Keep · ${keep.name}`} removeLabel={`Merge in · ${other.name}`} onConfirm={confirmMerge} />
      </div> : null}
    </div>}
  </Modal>;
}
