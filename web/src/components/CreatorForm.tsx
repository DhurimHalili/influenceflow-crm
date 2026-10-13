import { Check, ClipboardPaste, Wand2 } from "lucide-react";
import { useState } from "react";
import { useData } from "../contexts/DataContext";
import { asPlatform, extractFromText, parseFollowers, SOCIAL_META, SOCIAL_ORDER, socialsWithChannel } from "../lib/socials";
import { compact, dueLabel, erContext, OUTREACH_STAGES, overallStars, RATING_DIMS, ratingScore, scoreLabel, today, weightShares } from "../lib/utils";
import { ENTITY_STATUSES, STATUS_LABELS, type Creator, type EntityStatus, type Platform, type Priority, type SocialLink, type SocialPlatform } from "../types";
import { SocialBadge } from "./SocialIcon";
import { appendSocials, Fold, rowsToSocials, socialRow, socialRowError, SocialsEditor, socialsToRows, useFolds, type SocialDraft } from "./FormKit";

export { socialRow, socialRowError, type SocialDraft };
import { Input, Select, StarInput, Stars, Textarea } from "./ui";

// ---------------------------------------------------------------------------
// Draft model shared by Add, Edit and Import.
// ---------------------------------------------------------------------------


export type CreatorDraft = {
  name: string; contact_email: string; channel_link: string; niche: string; avg_views: string; engagement_rate: string; stars_consistency: number; stars_demographics: number; stars_niche: number; stars_engagement: number; priority: Priority; next_action_date: string;
  platform: Platform; pipeline_status: EntityStatus; date_contacted: string; notes: string; next_action: string;
  /** First row is the main channel. */
  socials: SocialDraft[];
};

export const emptyDraft: CreatorDraft = { name: "", contact_email: "", channel_link: "", niche: "", avg_views: "", engagement_rate: "", stars_consistency: 0, stars_demographics: 0, stars_niche: 0, stars_engagement: 0, priority: "none", next_action_date: "", platform: "YouTube", pipeline_status: "new", date_contacted: "", notes: "", next_action: "", socials: [] };

const dimClamp = (v: number) => Math.min(5, Math.max(0, Math.round(v) || 0));
export const draftDims = (draft: CreatorDraft) => ({ stars_consistency: dimClamp(draft.stars_consistency), stars_demographics: dimClamp(draft.stars_demographics), stars_niche: dimClamp(draft.stars_niche), stars_engagement: dimClamp(draft.stars_engagement) });


/** Resolved social links in order (main first), skipping empty rows. */
export const draftSocials = (draft: CreatorDraft): SocialLink[] => rowsToSocials(draft.socials);

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
  socials: socialsToRows(creator.socials),
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

type Props = { draft: CreatorDraft; setDraft: (draft: CreatorDraft) => void; mode: "add" | "edit" };

export function CreatorFields({ draft, setDraft, mode }: Props) {
  const data = useData();
  const { open, toggle } = useFolds("if.creator-form-open");
  const niches = Array.from(new Set(data.creators.filter((c) => !c.archived_at).map((c) => c.niche.trim()).filter(Boolean))).sort();

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
    const { rows, added: additions } = appendSocials(draft.socials, found.socials);
    const next: CreatorDraft = { ...draft, socials: rows };
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

    <SocialsEditor rows={draft.socials} onChange={(socials) => setDraft({ ...draft, socials })} />

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
