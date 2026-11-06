import { ArchiveRestore, Check, ClipboardPaste, ExternalLink, RotateCcw, UserCheck, Wand2 } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useData } from "../contexts/DataContext";
import { useToast } from "../contexts/ToastContext";
import { creatorClashes, similarCreators, type ClashReason } from "../lib/duplicates";
import { asPlatform, extractFromText, parseFollowers, SOCIAL_META, SOCIAL_ORDER, socialsWithChannel } from "../lib/socials";
import { compact, dateLabel, dueLabel, erContext, OUTREACH_STAGES, overallStars, RATING_DIMS, ratingScore, scoreLabel, today, weightShares } from "../lib/utils";
import { ENTITY_STATUSES, STATUS_LABELS, type Creator, type EntityStatus, type Platform, type Priority, type SocialLink, type SocialPlatform } from "../types";
import { SocialBadge } from "./SocialIcon";
import { CountryPicker } from "./CountryPicker";
import { appendSocials, Fold, rowsToSocials, SecondaryEmailField, secondaryEmailError, socialRow, socialRowError, SocialsEditor, socialsToRows, useFolds, type SocialDraft } from "./FormKit";
import type { RateCard, YouTubeFacts } from "../types";
import { useYouTube, type ChannelFacts } from "../contexts/YouTubeContext";
import { COUNTRIES } from "../lib/countries";

export { socialRow, socialRowError, type SocialDraft };
import { Avatar, Input, Select, StarInput, Stars, Textarea } from "./ui";

// ---------------------------------------------------------------------------
// Draft model shared by Add, Edit and Import.
// ---------------------------------------------------------------------------


export type CreatorDraft = {
  name: string; contact_email: string; secondary_email: string; secondary_email_label: string; channel_link: string; niche: string; country: string; avg_views: string; engagement_rate: string; stars_consistency: number; stars_demographics: number; stars_niche: number; stars_engagement: number; priority: Priority; next_action_date: string;
  platform: Platform; pipeline_status: EntityStatus; date_contacted: string; notes: string; next_action: string;
  /** First row is the main channel. */
  socials: SocialDraft[];
  /** Only set by imports that carry rate columns. */
  rates?: RateCard;
  /** Filled by the YouTube quick fill: saved with the record, so it isn't read twice. */
  youtube?: YouTubeFacts;
  youtube_synced_at?: string;
  /** The YouTube facts changed in this form (quick fill, "Use YouTube's"): save them. */
  youtube_dirty?: boolean;
  /** Values the form guessed (a name from an @handle): YouTube may replace them. */
  guess?: Partial<Record<AutoKey, string>>;
};

/** Fields YouTube fills and keeps fresh — until you change them yourself. */
export type AutoKey = "name" | "contact_email" | "country" | "niche" | "avg_views" | "engagement_rate";
const NUMERIC_AUTO = new Set<AutoKey>(["avg_views", "engagement_rate"]);
export const sameAuto = (k: AutoKey, a: unknown, b: unknown) => (NUMERIC_AUTO.has(k) ? Number(a || 0) === Number(b || 0) : String(a ?? "").trim().toLowerCase() === String(b ?? "").trim().toLowerCase());
const blankAuto = (k: AutoKey, v: unknown) => (NUMERIC_AUTO.has(k) ? !(Number(v) > 0) : !String(v ?? "").trim());
const countryNameOf = (code?: string) => (code ? COUNTRIES.find((c) => c.code === code.toUpperCase())?.name || "" : "");
/** What YouTube says right now for a field ("" when it has nothing). */
export const youtubeValue = (y: YouTubeFacts | undefined, k: AutoKey): string => {
  if (!y) return "";
  if (k === "name") return y.title || "";
  if (k === "contact_email") return y.emails?.[0] || "";
  if (k === "country") return countryNameOf(y.country);
  if (k === "niche") return y.niche || "";
  if (k === "avg_views") return y.sampled && y.avg_views ? String(y.avg_views) : "";
  return y.sampled && y.engagement_rate ? String(y.engagement_rate) : "";
};

export const emptyDraft: CreatorDraft = { name: "", contact_email: "", secondary_email: "", secondary_email_label: "", channel_link: "", niche: "", country: "", avg_views: "", engagement_rate: "", stars_consistency: 0, stars_demographics: 0, stars_niche: 0, stars_engagement: 0, priority: "none", next_action_date: "", platform: "YouTube", pipeline_status: "new", date_contacted: "", notes: "", next_action: "", socials: [] };

const dimClamp = (v: number) => Math.min(5, Math.max(0, Math.round(v) || 0));
export const draftDims = (draft: CreatorDraft) => ({ stars_consistency: dimClamp(draft.stars_consistency), stars_demographics: dimClamp(draft.stars_demographics), stars_niche: dimClamp(draft.stars_niche), stars_engagement: dimClamp(draft.stars_engagement) });


/** Resolved social links in order (main first), skipping empty rows. */
export const draftSocials = (draft: CreatorDraft): SocialLink[] => rowsToSocials(draft.socials);

export const draftHasErrors = (draft: CreatorDraft) => draft.socials.some((row) => socialRowError(row)) || secondaryEmailError(draft.secondary_email);

export const draftToCreator = (draft: CreatorDraft) => {
  const dims = draftDims(draft);
  // Rows typed in the form win; imports only carry channel_link.
  const fromRows = draftSocials(draft);
  const socials = fromRows.length || draft.socials.length ? fromRows : socialsWithChannel([], draft.channel_link.trim(), draft.platform);
  const main = socials[0];
  return {
    name: draft.name.trim(), contact_email: draft.contact_email.trim(), secondary_email: draft.secondary_email.trim(), secondary_email_label: draft.secondary_email.trim() ? draft.secondary_email_label.trim() : "", ...(draft.rates ? { rates: draft.rates } : {}), channel_link: main ? main.url : "", niche: draft.niche.trim(), country: draft.country.trim(), socials,
    avg_views: Number(draft.avg_views) || 0, engagement_rate: Number(draft.engagement_rate) || 0, ...dims, stars: overallStars(dims), priority: (["none", "soon", "urgent"] as const).includes(draft.priority) ? draft.priority : "none" as Priority, next_action_date: draft.next_action_date || null,
    platform: main ? asPlatform(main.platform) : draft.platform,
    // "New" means nobody reached out yet, so it never carries a contact date.
    pipeline_status: draft.pipeline_status, date_contacted: OUTREACH_STAGES.includes(draft.pipeline_status) ? draft.date_contacted || today() : null, notes: draft.notes, next_action: draft.next_action,
    ...(draft.youtube_dirty && draft.youtube && draft.youtube_synced_at ? { youtube: draft.youtube, youtube_synced_at: draft.youtube_synced_at } : {}),
  };
};

export const creatorToDraft = (creator: Creator): CreatorDraft => ({
  name: creator.name, contact_email: creator.contact_email, secondary_email: creator.secondary_email || "", secondary_email_label: creator.secondary_email_label || "", channel_link: creator.channel_link, niche: creator.niche, country: creator.country || "", avg_views: creator.avg_views ? String(creator.avg_views) : "", engagement_rate: creator.engagement_rate ? String(creator.engagement_rate) : "",
  stars_consistency: creator.stars_consistency || 0, stars_demographics: creator.stars_demographics || 0, stars_niche: creator.stars_niche || 0, stars_engagement: creator.stars_engagement || 0,
  priority: creator.priority || "none", next_action_date: creator.next_action_date || "", platform: creator.platform, pipeline_status: creator.pipeline_status, date_contacted: creator.date_contacted || "", notes: creator.notes, next_action: creator.next_action || "",
  socials: socialsToRows(creator.socials),
  // Read-only here (to tell YouTube's values from yours); saved only when the form changes them.
  ...(creator.youtube && creator.youtube_synced_at ? { youtube: creator.youtube, youtube_synced_at: creator.youtube_synced_at } : {}),
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
// Already in the CRM? Checked live as you type — active and archived records.
// ---------------------------------------------------------------------------

const REASON_TEXT: Record<ClashReason, string> = { name: "same name", email: "same email", profile: "same profile" };

function ClashNotice({ draft }: { draft: CreatorDraft }) {
  const data = useData();
  const { toast } = useToast();
  const clashes = useMemo(() => creatorClashes(data.creators, { name: draft.name, emails: [draft.contact_email, draft.secondary_email], links: draftSocials(draft).map((s) => s.url) }), [data.creators, draft]);
  const similar = useMemo(() => similarCreators(data.creators, draft.name, new Set(clashes.map((c) => c.creator.id))), [data.creators, draft.name, clashes]);
  if (!clashes.length && !similar.length) return null;
  const active = clashes.filter((c) => !c.archived);
  const head = active.length ? "Already in your influencers" : clashes.length ? "You archived this influencer before" : "";
  return <div className={`clash-notice${active.length ? " tone-active" : clashes.length ? " tone-archived" : " tone-soft"}`} role="status" aria-live="polite">
    {head && <div className="clash-head">{active.length ? <UserCheck size={15} /> : <ArchiveRestore size={15} />}<strong>{head}</strong></div>}
    {clashes.slice(0, 3).map(({ creator, reasons, archived }) => <div className="clash-row" key={creator.id}>
      <Avatar name={creator.name} path={creator.avatar_path} size="sm" />
      <span className="clash-who"><strong>{creator.name}</strong><small>{reasons.map((r) => REASON_TEXT[r]).join(" · ").replace(/^./, (c) => c.toUpperCase())} · {archived ? `archived ${dateLabel(creator.archived_at!)}` : STATUS_LABELS[creator.pipeline_status]}</small></span>
      <em className={`clash-tag${archived ? " archived" : ""}`}>{archived ? "Archived" : "Added"}</em>
      {archived ? <button type="button" className="clash-action" onClick={() => { data.archive("creator", [creator.id], true); toast(`${creator.name} restored from the archive`); }}><RotateCcw size={13} /> Restore</button> : <Link className="clash-action" to={`/app/influencers/${creator.id}`} target="_blank" rel="noreferrer">Open <ExternalLink size={12} /></Link>}
    </div>)}
    {similar.length > 0 && <p className="clash-similar"><span>{clashes.length ? "Also similar:" : "Similar names in your CRM:"}</span>{similar.map((c) => <Link key={c.id} to={`/app/influencers/${c.id}`} target="_blank" rel="noreferrer">{c.name}<small>{c.archived_at ? "archived" : STATUS_LABELS[c.pipeline_status]}</small></Link>)}</p>}
  </div>;
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
  // ----- YouTube quick fill: the channel's numbers, country, email and suggested stars.
  const yt = useYouTube();
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const [ytBusy, setYtBusy] = useState(false);
  const [ytFacts, setYtFacts] = useState<ChannelFacts | null>(null);
  const fillFromYouTube = async (link: string) => {
    if (!yt.enabled || !link) return;
    setYtBusy(true);
    const res = await yt.lookup(link);
    setYtBusy(false);
    if (!res.facts) { setPasteNote({ ok: false, text: res.error || "Couldn't read that YouTube channel — fill the numbers in by hand." }); return; }
    const f = res.facts;
    // Read from the latest draft: anything typed while YouTube answered is kept.
    const d = draftRef.current;
    const firstYt = d.socials.findIndex((r) => r.platform === "YouTube");
    const filled: string[] = [];
    const next: CreatorDraft = { ...d, socials: d.socials.map((r, i) => (i === firstYt && f.subscribers ? { ...r, followers: String(f.subscribers) } : r)) };
    // Your own niche spelling when you already use it ("tech" → your "Tech").
    const niche = f.niche ? niches.find((n) => n.toLowerCase() === f.niche.toLowerCase()) || f.niche : "";
    const fresh: Partial<Record<AutoKey, string>> = { name: f.title, contact_email: f.emails[0] || "", country: countryNameOf(f.country), niche, ...(f.sampled ? { avg_views: String(f.avgViews), engagement_rate: String(f.engagementRate) } : {}) };
    const prevAuto = d.youtube?.auto || {};
    const auto: Partial<Record<AutoKey, string>> = { ...prevAuto };
    const LABEL: Record<AutoKey, string> = { name: "name", contact_email: "email", country: "country", niche: "niche", avg_views: "avg views", engagement_rate: "engagement" };
    for (const k of Object.keys(fresh) as AutoKey[]) {
      const value = fresh[k];
      if (!value) continue;
      const current = d[k];
      // Empty, a guess (a name made from the @handle), or what YouTube put there before: YouTube's real value wins.
      const free = blankAuto(k, current) || (d.guess?.[k] !== undefined && sameAuto(k, current, d.guess[k])) || (prevAuto[k] !== undefined && sameAuto(k, current, prevAuto[k]));
      if (free) { next[k] = value; auto[k] = value; filled.push(LABEL[k]); }
    }
    next.guess = {};
    if (f.subscribers) filled.push("subscribers");
    if (f.stars.engagement) next.stars_engagement = f.stars.engagement;
    if (f.stars.consistency) next.stars_consistency = f.stars.consistency;
    if (f.stars.demographics) next.stars_demographics = f.stars.demographics;
    if (f.stars.engagement || f.stars.consistency || f.stars.demographics) filled.push("stars");
    next.youtube = { channel_id: f.channelId, handle: f.handle, title: f.title, url: f.url, country: f.country, subscribers: f.subscribers, hidden_subscribers: f.hiddenSubscribers, video_count: f.videoCount, total_views: f.totalViews, avg_views: f.avgViews, engagement_rate: f.engagementRate, sampled: f.sampled, uploads_90d: f.uploads90d, last_upload_at: f.lastUploadAt, emails: f.emails, business_email_hidden: f.businessEmailHidden, niche: f.niche, sub_niche: f.subNiche, includes_recent: f.includesRecent, sample: f.sample, at: f.at, auto, kept: [] };
    next.youtube_dirty = true;
    next.youtube_synced_at = f.at;
    setDraft(next);
    setYtFacts(f);
    setPasteNote({ ok: true, text: `From YouTube: ${filled.join(", ")} — check and change anything you like` });
  };
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
    if (found.nameGuess && !draft.name.trim()) { next.name = found.nameGuess; next.guess = { ...draft.guess, name: found.nameGuess }; filled.push("name (check it)"); }
    setDraft(next);
    setPasteText("");
    setHandleChoice("");
    setPasteNote(filled.length ? { ok: true, text: `Added ${filled.join(", ")}` } : { ok: false, text: "Those profiles are already on this record." });
    const ytLink = found.socials.find((x) => x.platform === "YouTube");
    if (ytLink) void fillFromYouTube(ytLink.url);
  };
  const chooseHandle = (platform: SocialPlatform) => {
    const row = socialRow(platform, `@${handleChoice}`);
    const next: CreatorDraft = { ...draft, socials: [...draft.socials.filter((r) => r.text.trim()), row] };
    let note = `Added ${SOCIAL_META[platform].label}`;
    if (!draft.name.trim()) { next.name = handleChoice.replace(/[._-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()); next.guess = { ...draft.guess, name: next.name }; note += ", name (check it)"; }
    setDraft(next);
    setHandleChoice("");
    setPasteText("");
    setPasteNote({ ok: true, text: note });
    if (platform === "YouTube") void fillFromYouTube(`@${handleChoice}`);
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
      {handleChoice && <div className="cf-handle-choice"><span>Which network is <b>@{handleChoice}</b> on?</span>{SOCIAL_ORDER.filter((p) => p !== "Website" && p !== "WhatsApp").slice(0, 8).map((p) => <button type="button" key={p} onClick={() => chooseHandle(p)} style={{ ["--tone" as string]: SOCIAL_META[p].color }}><SocialBadge platform={p} size={18} /> {SOCIAL_META[p].label}</button>)}</div>}
      {ytBusy && <p className="cf-paste-note busy" role="status"><span className="cf-spin" aria-hidden="true" /> Reading the YouTube channel — last 12 videos, engagement, country…</p>}
      {!ytBusy && pasteNote && <p className={`cf-paste-note ${pasteNote.ok ? "ok" : "warn"}`}>{pasteNote.ok && <Check size={13} />}{pasteNote.text}</p>}
      {!ytBusy && ytFacts && ytFacts.businessEmailHidden && !draft.contact_email.trim() && <p className="cf-paste-note warn">No email in the channel description. YouTube may show one behind “View email address” — <a href={`${ytFacts.url}/about`} target="_blank" rel="noreferrer">open their About page <ExternalLink size={11} /></a></p>}
    </div>}

    <div className="form-grid cf-essentials">
      <div className="cf-auto"><Input label="Full name" value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} required autoFocus={mode === "add"} placeholder="Maya Chen" /><AutoHint field="name" draft={draft} setDraft={setDraft} /></div>
      <div className="cf-auto"><Input label="Email" type="email" value={draft.contact_email} error={draft.contact_email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(draft.contact_email.trim()) ? "Enter a valid email" : ""} onChange={(event) => setDraft({ ...draft, contact_email: event.target.value })} placeholder="maya@studio.com" /><AutoHint field="contact_email" draft={draft} setDraft={setDraft} /></div>
      <div className="cf-auto cf-niche-wrap"><label className="field-wrap cf-niche"><span className="field-label">Niche</span><input className="field" list="cf-niches" value={draft.niche} onChange={(event) => setDraft({ ...draft, niche: event.target.value })} placeholder="Tech, beauty, travel…" /><datalist id="cf-niches">{niches.map((n) => <option key={n} value={n} />)}</datalist></label><AutoHint field="niche" draft={draft} setDraft={setDraft} />{draft.youtube?.sub_niche && sameAuto("niche", draft.niche, draft.youtube.niche) && <span className="cf-subniche">Sub-niche: <b>{draft.youtube.sub_niche}</b></span>}</div>
      <div className="cf-auto"><CountryPicker value={draft.country} onChange={(country) => setDraft({ ...draft, country })} /><AutoHint field="country" draft={draft} setDraft={setDraft} /></div>
    </div>
    <SecondaryEmailField email={draft.secondary_email} label={draft.secondary_email_label} onChange={(patch) => setDraft({ ...draft, ...patch })} />

    {mode === "add" && <ClashNotice draft={draft} />}

    <SocialsEditor rows={draft.socials} onChange={(socials) => setDraft({ ...draft, socials })} />

    <Fold id="performance" title="Audience & performance" open={open.includes("performance")} onToggle={toggle} filled={perfBits.length > 0} summary={perfBits.join(" · ") || "Views and engagement — optional"}>
      <div className="form-grid">
        <div className="cf-auto"><Input label="Average views" type="number" min="0" value={draft.avg_views} onChange={(event) => setDraft({ ...draft, avg_views: event.target.value })} placeholder="e.g. 120000" /><AutoHint field="avg_views" draft={draft} setDraft={setDraft} /></div>
        <div className="cf-auto"><Input label="Engagement rate (%)" type="number" min="0" step="0.1" value={draft.engagement_rate} onChange={(event) => setDraft({ ...draft, engagement_rate: event.target.value })} hint={erContext(Number(draft.engagement_rate), main ? asPlatform(main.platform) : draft.platform)} /><AutoHint field="engagement_rate" draft={draft} setDraft={setDraft} /></div>
      </div>
    </Fold>

    <Fold id="pipeline" title="Pipeline & next step" open={open.includes("pipeline")} onToggle={toggle} filled={pipelineFilled} summary={pipeBits.join(" · ")}>
      <div className="form-grid">
        <Select label="Pipeline status" value={draft.pipeline_status} onChange={(event) => setDraft(withStatus(draft, event.target.value as EntityStatus))}>{ENTITY_STATUSES.map((item) => <option value={item} key={item}>{STATUS_LABELS[item]}</option>)}</Select>
        {OUTREACH_STAGES.includes(draft.pipeline_status) ? <Input label={draft.pipeline_status === "inbound" ? "They reached out on" : "Date contacted"} type="date" value={draft.date_contacted} max={today()} onChange={(event) => setDraft({ ...draft, date_contacted: event.target.value })} hint={draft.pipeline_status === "inbound" ? "The day their message came in — defaults to today." : "Defaults to today — change it if you reached out earlier."} /> : <div className="field-wrap contact-date-note"><span className="field-label">Date contacted</span><p>Set automatically the moment you move them to Contacted.</p></div>}
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

/**
 * Under a field YouTube fills: "From YouTube" while it's YouTube's value (it
 * refreshes by itself), "Your edit" the moment you change it — before you even
 * save — with a one-tap way back to YouTube's value.
 */
function AutoHint({ field, draft, setDraft }: { field: AutoKey; draft: CreatorDraft; setDraft: (draft: CreatorDraft) => void }) {
  const auto = draft.youtube?.auto?.[field];
  const yours = youtubeValue(draft.youtube, field);
  if (auto === undefined) {
    // YouTube has a value it couldn't use because the field was already filled.
    if (!yours || !draft.youtube_synced_at || sameAuto(field, draft[field], yours) || blankAuto(field, draft[field])) return null;
    return <span className="yt-hint mine"><i aria-hidden="true" />Yours — YouTube says {field === "avg_views" ? compact(Number(yours)) : yours}{field === "engagement_rate" ? "%" : ""} <button type="button" onClick={() => setDraft({ ...draft, [field]: yours, youtube: { ...draft.youtube, auto: { ...(draft.youtube?.auto || {}), [field]: yours } }, youtube_dirty: true })}>Use it</button></span>;
  }
  if (sameAuto(field, draft[field], auto)) return <span className="yt-hint yt" title="Refreshes with the channel until you change it"><i aria-hidden="true" />From YouTube · stays fresh</span>;
  return <span className="yt-hint mine" role="status"><i aria-hidden="true" />Your edit — YouTube won't change it{yours && !blankAuto(field, yours) ? <> <button type="button" onClick={() => setDraft({ ...draft, [field]: yours, youtube: { ...draft.youtube, auto: { ...(draft.youtube?.auto || {}), [field]: yours } }, youtube_dirty: true })}>Use YouTube's{field === "avg_views" ? ` (${compact(Number(yours))})` : field === "engagement_rate" ? ` (${yours}%)` : ""}</button></> : null}</span>;
}
