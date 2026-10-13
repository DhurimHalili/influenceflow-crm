import { Check, ChevronDown, ClipboardPaste, ExternalLink, Plus, Star, Wand2, X } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useData } from "../contexts/DataContext";
import { asPlatform, extractFromText, parseFollowers, QUICK_SOCIALS, resolveSocial, SOCIAL_META, SOCIAL_ORDER, socialKey, socialsWithChannel } from "../lib/socials";
import { compact, dueLabel, erContext, OUTREACH_STAGES, overallStars, RATING_DIMS, ratingScore, scoreLabel, today, uid, weightShares } from "../lib/utils";
import { ENTITY_STATUSES, STATUS_LABELS, type Creator, type EntityStatus, type Platform, type Priority, type SocialLink, type SocialPlatform } from "../types";
import { SocialBadge } from "./SocialIcon";
import { Input, Select, StarInput, Stars, Textarea } from "./ui";

// ---------------------------------------------------------------------------
// Draft model shared by Add, Edit and Import.
// ---------------------------------------------------------------------------

export type SocialDraft = { key: string; platform: SocialPlatform; text: string; followers: string };

export type CreatorDraft = {
  name: string; contact_email: string; channel_link: string; niche: string; avg_views: string; engagement_rate: string; stars_consistency: number; stars_demographics: number; stars_niche: number; stars_engagement: number; priority: Priority; next_action_date: string;
  platform: Platform; pipeline_status: EntityStatus; date_contacted: string; notes: string; next_action: string;
  /** First row is the main channel. */
  socials: SocialDraft[];
};

export const emptyDraft: CreatorDraft = { name: "", contact_email: "", channel_link: "", niche: "", avg_views: "", engagement_rate: "", stars_consistency: 0, stars_demographics: 0, stars_niche: 0, stars_engagement: 0, priority: "none", next_action_date: "", platform: "YouTube", pipeline_status: "new", date_contacted: "", notes: "", next_action: "", socials: [] };

const dimClamp = (v: number) => Math.min(5, Math.max(0, Math.round(v) || 0));
export const draftDims = (draft: CreatorDraft) => ({ stars_consistency: dimClamp(draft.stars_consistency), stars_demographics: dimClamp(draft.stars_demographics), stars_niche: dimClamp(draft.stars_niche), stars_engagement: dimClamp(draft.stars_engagement) });

export const socialRow = (platform: SocialPlatform, text = "", followers = ""): SocialDraft => ({ key: uid(), platform, text, followers });

/** Resolved social links in order (main first), skipping empty rows. */
export const draftSocials = (draft: CreatorDraft): SocialLink[] => {
  const out: SocialLink[] = [];
  const seen = new Set<string>();
  for (const row of draft.socials) {
    const resolved = resolveSocial(row.text, row.platform);
    if (!resolved || seen.has(socialKey(resolved.url))) continue;
    seen.add(socialKey(resolved.url));
    out.push({ ...resolved, followers: parseFollowers(row.followers) });
  }
  return out;
};

export const socialRowError = (row: SocialDraft) => {
  if (!row.text.trim()) return "";
  if (/\s/.test(row.text.trim())) return "Handles have no spaces";
  if (row.followers.trim() && !parseFollowers(row.followers)) return "Followers: use 12000, 12k or 1.2m";
  return resolveSocial(row.text, row.platform) ? "" : row.platform === "Website" ? "Enter a web address" : `Enter a ${SOCIAL_META[row.platform].label} handle or link`;
};

export const draftHasErrors = (draft: CreatorDraft) => draft.socials.some((row) => socialRowError(row));

export const draftToCreator = (draft: CreatorDraft) => {
  const dims = draftDims(draft);
  // Rows typed in the form win; imports only carry channel_link.
  const fromRows = draftSocials(draft);
  const socials = fromRows.length || draft.socials.length ? fromRows : socialsWithChannel([], draft.channel_link.trim(), draft.platform);
  const main = socials[0];
  return {
    name: draft.name.trim(), contact_email: draft.contact_email.trim(), channel_link: main ? main.url : "", niche: draft.niche.trim(), socials,
    avg_views: Number(draft.avg_views) || 0, engagement_rate: Number(draft.engagement_rate) || 0, ...dims, stars: overallStars(dims), priority: (["none", "soon", "urgent"] as const).includes(draft.priority) ? draft.priority : "none" as Priority, next_action_date: draft.next_action_date || null,
    platform: main ? asPlatform(main.platform) : draft.platform,
    // "New" means nobody reached out yet, so it never carries a contact date.
    pipeline_status: draft.pipeline_status, date_contacted: OUTREACH_STAGES.includes(draft.pipeline_status) ? draft.date_contacted || today() : null, notes: draft.notes, next_action: draft.next_action,
  };
};

export const creatorToDraft = (creator: Creator): CreatorDraft => ({
  name: creator.name, contact_email: creator.contact_email, channel_link: creator.channel_link, niche: creator.niche, avg_views: creator.avg_views ? String(creator.avg_views) : "", engagement_rate: creator.engagement_rate ? String(creator.engagement_rate) : "",
  stars_consistency: creator.stars_consistency || 0, stars_demographics: creator.stars_demographics || 0, stars_niche: creator.stars_niche || 0, stars_engagement: creator.stars_engagement || 0,
  priority: creator.priority || "none", next_action_date: creator.next_action_date || "", platform: creator.platform, pipeline_status: creator.pipeline_status, date_contacted: creator.date_contacted || "", notes: creator.notes, next_action: creator.next_action || "",
  socials: (creator.socials || []).map((s) => socialRow(s.platform, s.handle && s.platform !== "Website" ? `@${s.handle}` : s.url, s.followers ? String(s.followers) : "")),
});

// Status change inside a form: entering an outreach stage pre-fills today's
// contact date; going back to New clears it.
export const withStatus = (draft: CreatorDraft, pipeline_status: EntityStatus): CreatorDraft => ({
  ...draft,
  pipeline_status,
  date_contacted: OUTREACH_STAGES.includes(pipeline_status) ? draft.date_contacted || today() : "",
});

export function RatingPicker({ draft, setDraft }: { draft: CreatorDraft; setDraft: (draft: CreatorDraft) => void }) {
  const weights = useData().profile.rating_weights;
  const shares = weightShares(weights);
  const score = ratingScore(draftDims(draft), weights);
  const mainPlatform = draft.socials[0]?.platform;
  return <div className="rating-pick"><div className="rating-pick-head"><span className="field-label">Creator evaluation — your call, star by star</span><span className="overall-preview"><Stars value={score} size={13} showValue /> {scoreLabel(score)}</span></div><div className="rating-pick-grid four">{RATING_DIMS.map((dim) => (<label key={dim.key}><small>{dim.short} <em>{shares[dim.weight]}%</em></small><StarInput value={draft[dim.key]} onChange={(v) => setDraft({ ...draft, [dim.key]: v })} size={18} /></label>))}</div><small className="rating-pick-foot">Weighted like an agency scorecard — audience and brand fit count most. Unrated factors are left out, never counted as zero.{Number(draft.engagement_rate) > 0 && <> · {erContext(Number(draft.engagement_rate), mainPlatform ? asPlatform(mainPlatform) : draft.platform)}</>}</small></div>;
}

// ---------------------------------------------------------------------------
// Form UI: paste-anything box, essentials, socials, then folded sections.
// ---------------------------------------------------------------------------

const SECTIONS_KEY = "if.creator-form-open";
const readOpen = (): string[] => {
  try {
    const parsed = JSON.parse(localStorage.getItem(SECTIONS_KEY) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

function Fold({ id, title, summary, filled, open, onToggle, children }: { id: string; title: string; summary: ReactNode; filled: boolean; open: boolean; onToggle: (id: string) => void; children: ReactNode }) {
  return <section className={`cf-fold${open ? " open" : ""}`}>
    <button type="button" className="cf-fold-head" aria-expanded={open} aria-controls={`cf-${id}`} onClick={() => onToggle(id)}>
      <span className={`cf-dot${filled ? " filled" : ""}`} aria-hidden="true">{filled && <Check size={10} />}</span>
      <strong>{title}</strong>
      <span className="cf-fold-summary">{summary}</span>
      <ChevronDown size={16} className="cf-chev" />
    </button>
    {open && <div className="cf-fold-body" id={`cf-${id}`}>{children}</div>}
  </section>;
}

type Props = { draft: CreatorDraft; setDraft: (draft: CreatorDraft) => void; mode: "add" | "edit" };

export function CreatorFields({ draft, setDraft, mode }: Props) {
  const data = useData();
  const [open, setOpen] = useState<string[]>(readOpen);
  const [focusKey, setFocusKey] = useState("");
  const [moreOpen, setMoreOpen] = useState(false);
  const toggle = (id: string) => {
    const next = open.includes(id) ? open.filter((x) => x !== id) : [...open, id];
    setOpen(next);
    try {
      localStorage.setItem(SECTIONS_KEY, JSON.stringify(next));
    } catch {
      // private mode: sections simply start folded next time
    }
  };
  const niches = Array.from(new Set(data.creators.filter((c) => !c.archived_at).map((c) => c.niche.trim()).filter(Boolean))).sort();

  // ----- socials
  const setSocials = (socials: SocialDraft[]) => setDraft({ ...draft, socials });
  const addSocial = (platform: SocialPlatform) => {
    const row = socialRow(platform);
    setSocials([...draft.socials, row]);
    setFocusKey(row.key);
    setMoreOpen(false);
  };
  const updateRow = (key: string, patch: Partial<SocialDraft>) => setSocials(draft.socials.map((row) => {
    if (row.key !== key) return row;
    const next = { ...row, ...patch };
    // Pasting a link from another network switches the row to that network.
    if (patch.text !== undefined) {
      const resolved = resolveSocial(patch.text, next.platform);
      if (resolved && resolved.platform !== next.platform && /[./]/.test(patch.text)) next.platform = resolved.platform;
    }
    return next;
  }));
  const tidyRow = (key: string) => setSocials(draft.socials.map((row) => {
    if (row.key !== key) return row;
    const resolved = resolveSocial(row.text, row.platform);
    if (!resolved) return row;
    return { ...row, platform: resolved.platform, text: resolved.handle && resolved.platform !== "Website" ? `@${resolved.handle}` : resolved.url };
  }));
  const removeRow = (key: string) => setSocials(draft.socials.filter((row) => row.key !== key));
  const makeMain = (key: string) => {
    const row = draft.socials.find((r) => r.key === key);
    if (row) setSocials([row, ...draft.socials.filter((r) => r.key !== key)]);
  };
  const used = new Set(draft.socials.map((r) => r.platform));
  const quick = QUICK_SOCIALS.filter((p) => !used.has(p));
  const more = SOCIAL_ORDER.filter((p) => !QUICK_SOCIALS.includes(p));

  // ----- paste anything
  const [pasteText, setPasteText] = useState("");
  const [pasteNote, setPasteNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [handleChoice, setHandleChoice] = useState("");
  const applyPaste = (text: string) => {
    const found = extractFromText(text);
    const bareHandle = !found.socials.length && /^@?[\w.]{2,40}$/.test(text.trim()) ? text.trim().replace(/^@/, "") : found.handles[0] && !found.socials.length ? found.handles[0] : "";
    if (!found.socials.length && !found.email) {
      if (bareHandle) { setHandleChoice(bareHandle); setPasteNote(null); return; }
      setPasteNote({ ok: false, text: "Nothing recognisable — paste a profile link, an @handle or a bio with links." });
      return;
    }
    const existing = new Set(draft.socials.map((r) => { const res = resolveSocial(r.text, r.platform); return res ? socialKey(res.url) : ""; }));
    const additions = found.socials.filter((s) => !existing.has(socialKey(s.url))).map((s) => socialRow(s.platform, s.handle && s.platform !== "Website" ? `@${s.handle}` : s.url));
    const next: CreatorDraft = { ...draft, socials: [...draft.socials.filter((r) => r.text.trim()), ...additions] };
    const filled: string[] = additions.map((a) => SOCIAL_META[a.platform].label);
    if (found.email && !draft.contact_email.trim()) { next.contact_email = found.email; filled.push("email"); }
    if (found.nameGuess && !draft.name.trim()) { next.name = found.nameGuess; filled.push("name (check it)"); }
    setDraft(next);
    setPasteText("");
    setHandleChoice("");
    setPasteNote(filled.length ? { ok: true, text: `Added ${filled.join(", ")}` } : { ok: false, text: "Those profiles are already on this record." });
  };
  const chooseHandle = (platform: SocialPlatform) => {
    const row = socialRow(platform, `@${handleChoice}`);
    const next: CreatorDraft = { ...draft, socials: [...draft.socials.filter((r) => r.text.trim()), row] };
    let note = `Added ${SOCIAL_META[platform].label}`;
    if (!draft.name.trim()) { next.name = handleChoice.replace(/[._-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()); note += ", name (check it)"; }
    setDraft(next);
    setHandleChoice("");
    setPasteText("");
    setPasteNote({ ok: true, text: note });
  };

  // ----- summaries for folded sections
  const main = draft.socials[0];
  const totalFollowers = draft.socials.reduce((sum, r) => sum + parseFollowers(r.followers), 0);
  const perfBits = [draft.avg_views ? `${compact(Number(draft.avg_views))} avg views` : "", draft.engagement_rate ? `${draft.engagement_rate}% ER` : "", totalFollowers ? `${compact(totalFollowers)} followers` : ""].filter(Boolean);
  const pipeBits = [STATUS_LABELS[draft.pipeline_status], draft.priority !== "none" ? (draft.priority === "urgent" ? "Urgent" : "Follow up soon") : "", draft.next_action ? draft.next_action : "", draft.next_action_date ? dueLabel(draft.next_action_date) : ""].filter(Boolean);
  const score = ratingScore(draftDims(draft), data.profile.rating_weights);
  const pipelineFilled = draft.pipeline_status !== "new" || draft.priority !== "none" || !!draft.next_action || !!draft.next_action_date;

  return <div className="creator-fields">
    {mode === "add" && <div className="cf-paste">
      <label className="cf-paste-box">
        <Wand2 size={16} />
        <input
          value={pasteText}
          onChange={(event) => { setPasteText(event.target.value); setPasteNote(null); }}
          onPaste={(event) => { const text = event.clipboardData.getData("text"); if (text.trim()) { event.preventDefault(); applyPaste(text); } }}
          onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); if (pasteText.trim()) applyPaste(pasteText); } }}
          placeholder="Quick fill: paste a link, @handle or bio"
          aria-label="Quick fill from a link, handle or bio"
        />
        {pasteText.trim() && <button type="button" onClick={() => applyPaste(pasteText)}><ClipboardPaste size={14} /> Fill</button>}
      </label>
      {handleChoice && <div className="cf-handle-choice"><span>Which network is <b>@{handleChoice}</b> on?</span>{SOCIAL_ORDER.filter((p) => p !== "Website").slice(0, 8).map((p) => <button type="button" key={p} onClick={() => chooseHandle(p)} style={{ ["--tone" as string]: SOCIAL_META[p].color }}><SocialBadge platform={p} size={18} /> {SOCIAL_META[p].label}</button>)}</div>}
      {pasteNote && <p className={`cf-paste-note ${pasteNote.ok ? "ok" : "warn"}`}>{pasteNote.ok && <Check size={13} />}{pasteNote.text}</p>}
    </div>}

    <div className="form-grid cf-essentials">
      <Input label="Full name" value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} required autoFocus={mode === "add"} placeholder="Maya Chen" />
      <Input label="Email" type="email" value={draft.contact_email} error={draft.contact_email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(draft.contact_email.trim()) ? "Enter a valid email" : ""} onChange={(event) => setDraft({ ...draft, contact_email: event.target.value })} placeholder="maya@studio.com" />
      <label className="field-wrap cf-niche"><span className="field-label">Niche</span><input className="field" list="cf-niches" value={draft.niche} onChange={(event) => setDraft({ ...draft, niche: event.target.value })} placeholder="Tech, beauty, travel…" /><datalist id="cf-niches">{niches.map((n) => <option key={n} value={n} />)}</datalist></label>
    </div>

    <div className="cf-socials">
      <div className="cf-socials-head"><span className="field-label">Social profiles</span>{draft.socials.length > 1 && <small><Star size={11} /> marks the main channel — it sets the platform and the link on cards</small>}</div>
      {draft.socials.map((row, index) => {
        const resolved = resolveSocial(row.text, row.platform);
        const error = socialRowError(row);
        return <div className={`cf-social${error ? " has-error" : ""}`} key={row.key}>
          <label className="cf-social-pick" style={{ ["--tone" as string]: SOCIAL_META[row.platform].color }}>
            <SocialBadge platform={row.platform} size={24} />
            <span className="cf-pick-label">{SOCIAL_META[row.platform].label}</span>
            <select value={row.platform} onChange={(event) => updateRow(row.key, { platform: event.target.value as SocialPlatform })} aria-label="Network">{SOCIAL_ORDER.map((p) => <option key={p} value={p}>{SOCIAL_META[p].label}</option>)}</select>
            <ChevronDown size={13} />
          </label>
          <div className="cf-social-input">
            <input
              className="field"
              value={row.text}
              autoFocus={focusKey === row.key}
              onChange={(event) => updateRow(row.key, { text: event.target.value })}
              onBlur={() => tidyRow(row.key)}
              onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); tidyRow(row.key); } }}
              placeholder={SOCIAL_META[row.platform].placeholder}
              aria-label={`${SOCIAL_META[row.platform].label} handle or link`}
              aria-invalid={!!error}
            />
            {resolved && <a href={resolved.url} target="_blank" rel="noreferrer" className="cf-open" title={`Open ${resolved.url}`} aria-label="Open profile"><ExternalLink size={13} /></a>}
          </div>
          <input className="field cf-followers" value={row.followers} onChange={(event) => updateRow(row.key, { followers: event.target.value })} placeholder="Followers" aria-label={`${SOCIAL_META[row.platform].label} followers`} inputMode="decimal" />
          <button type="button" className={`cf-main${index === 0 ? " on" : ""}`} onClick={() => makeMain(row.key)} title={index === 0 ? "Main channel" : "Make this the main channel"} aria-label={index === 0 ? "Main channel" : "Make main channel"} aria-pressed={index === 0}><Star size={14} /></button>
          <button type="button" className="cf-remove" onClick={() => removeRow(row.key)} aria-label={`Remove ${SOCIAL_META[row.platform].label}`}><X size={14} /></button>
          {error && <small className="cf-social-error">{error}</small>}
        </div>;
      })}
      <div className="cf-add-socials">
        {quick.map((p) => <button type="button" key={p} onClick={() => addSocial(p)} style={{ ["--tone" as string]: SOCIAL_META[p].color }}><SocialBadge platform={p} size={18} /> {draft.socials.length ? "" : "Add "}{SOCIAL_META[p].label}</button>)}
        <div className="cf-more">
          <button type="button" onClick={() => setMoreOpen(!moreOpen)} aria-expanded={moreOpen}><Plus size={14} /> {quick.length < QUICK_SOCIALS.length ? "Another" : "More"}</button>
          {moreOpen && <MoreMenu options={[...QUICK_SOCIALS.filter((p) => used.has(p)), ...more]} onPick={addSocial} onClose={() => setMoreOpen(false)} />}
        </div>
      </div>
    </div>

    <Fold id="performance" title="Audience & performance" open={open.includes("performance")} onToggle={toggle} filled={perfBits.length > 0} summary={perfBits.join(" · ") || "Views and engagement — optional"}>
      <div className="form-grid">
        <Input label="Average views" type="number" min="0" value={draft.avg_views} onChange={(event) => setDraft({ ...draft, avg_views: event.target.value })} placeholder="e.g. 120000" />
        <Input label="Engagement rate (%)" type="number" min="0" step="0.1" value={draft.engagement_rate} onChange={(event) => setDraft({ ...draft, engagement_rate: event.target.value })} hint={erContext(Number(draft.engagement_rate), main ? asPlatform(main.platform) : draft.platform)} />
      </div>
    </Fold>

    <Fold id="pipeline" title="Pipeline & next step" open={open.includes("pipeline")} onToggle={toggle} filled={pipelineFilled} summary={pipeBits.join(" · ")}>
      <div className="form-grid">
        <Select label="Pipeline status" value={draft.pipeline_status} onChange={(event) => setDraft(withStatus(draft, event.target.value as EntityStatus))}>{ENTITY_STATUSES.map((item) => <option value={item} key={item}>{STATUS_LABELS[item]}</option>)}</Select>
        {OUTREACH_STAGES.includes(draft.pipeline_status) ? <Input label="Date contacted" type="date" value={draft.date_contacted} max={today()} onChange={(event) => setDraft({ ...draft, date_contacted: event.target.value })} hint="Defaults to today — change it if you reached out earlier." /> : <div className="field-wrap contact-date-note"><span className="field-label">Date contacted</span><p>Set automatically the moment you move them to Contacted.</p></div>}
        <Select label="Priority" value={draft.priority} onChange={(event) => setDraft({ ...draft, priority: event.target.value as Priority })}><option value="none">No priority</option><option value="soon">Follow up soon</option><option value="urgent">Urgent</option></Select>
        <Input label="Action due" type="date" value={draft.next_action_date} onChange={(event) => setDraft({ ...draft, next_action_date: event.target.value })} />
        <Input label="Next action" value={draft.next_action} onChange={(event) => setDraft({ ...draft, next_action: event.target.value })} placeholder="Send media kit" />
      </div>
    </Fold>

    <Fold id="evaluation" title="Evaluation" open={open.includes("evaluation")} onToggle={toggle} filled={score > 0} summary={score > 0 ? <><Stars value={score} size={12} showValue /> {scoreLabel(score)}</> : "Rate audience, fit, engagement, consistency"}>
      <RatingPicker draft={draft} setDraft={setDraft} />
    </Fold>

    {mode === "add" && <Fold id="notes" title="Notes" open={open.includes("notes")} onToggle={toggle} filled={!!draft.notes.trim()} summary={draft.notes.trim() ? draft.notes.trim().slice(0, 60) + (draft.notes.trim().length > 60 ? "…" : "") : "Context, how you found them…"}>
      <Textarea label="Notes" value={draft.notes} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} rows={3} />
    </Fold>}
  </div>;
}

function MoreMenu({ options, onPick, onClose }: { options: SocialPlatform[]; onPick: (p: SocialPlatform) => void; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const away = (event: MouseEvent) => { if (ref.current && !ref.current.contains(event.target as Node)) onClose(); };
    const esc = (event: KeyboardEvent) => { if (event.key === "Escape") { event.stopPropagation(); onClose(); } };
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", esc, true);
    return () => { document.removeEventListener("mousedown", away); document.removeEventListener("keydown", esc, true); };
  }, [onClose]);
  return <div className="cf-more-menu" ref={ref} role="menu">{options.map((p) => <button type="button" role="menuitem" key={p} onClick={() => onPick(p)}><SocialBadge platform={p} size={20} /> {SOCIAL_META[p].label}</button>)}</div>;
}
