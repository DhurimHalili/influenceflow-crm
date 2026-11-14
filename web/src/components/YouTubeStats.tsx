import { ChevronRight, ExternalLink, RefreshCw, Square } from "lucide-react";
import { Link } from "react-router-dom";
import { useData } from "../contexts/DataContext";
import { useToast } from "../contexts/ToastContext";
import { useYouTube } from "../contexts/YouTubeContext";
import { compact, relativeTime } from "../lib/utils";
import type { Creator } from "../types";
import { Button } from "./ui";

const KEPT_LABEL: Record<string, string> = { name: "name", contact_email: "email", country: "country", niche: "niche", avg_views: "average views", engagement_rate: "engagement rate" };

// The YouTube pieces of the influencer screens: "Refresh YouTube" for everyone
// (with live progress, which also shows on other pages via YouTubeProgress),
// and the channel panel on a profile with its own refresh.

/** Influencers page header: refresh every influencer with a YouTube channel. */
export function YouTubeRefreshAll() {
  const data = useData();
  const yt = useYouTube();
  const { toast } = useToast();
  const ids = data.creators.filter((c) => !c.archived_at && yt.channelOf(c.socials)).map((c) => c.id);
  const p = yt.progress;
  if (p.running && p.total > 1) return <Button variant="secondary" onClick={yt.cancel} title="Stop after the current batch — the rest refresh within the hour"><Square size={13} /> Stop · {p.done + p.failed}/{p.total}</Button>;
  const run = async () => {
    if (!ids.length) return toast("None of your influencers has a YouTube channel on their profile yet.", "info");
    const res = await yt.refresh(ids, { force: true });
    toast(res.message && !res.done ? res.message : `YouTube stats updated for ${res.done} influencer${res.done === 1 ? "" : "s"}${res.failed ? ` · ${res.failed} couldn't be read` : ""}${res.message ? ` — ${res.message}` : ""}`, res.done ? "success" : "error");
  };
  return <Button variant="secondary" onClick={() => void run()} title={`Read fresh numbers for ${ids.length} influencer${ids.length === 1 ? "" : "s"} with a YouTube channel — YouTube’s values replace your edits (emails stay)`}><RefreshCw size={15} /> Refresh YouTube</Button>;
}

/** Profile header: refresh this one influencer's YouTube numbers only. */
export function YouTubeRefreshOne({ creator }: { creator: Creator }) {
  const yt = useYouTube();
  const { toast } = useToast();
  if (!yt.channelOf(creator.socials)) return null;
  const busy = yt.progress.ids.has(creator.id);
  const run = async () => {
    const res = await yt.refresh([creator.id], { quiet: true, force: true });
    toast(res.done ? `${creator.name}'s YouTube numbers are fresh` : res.message || "Couldn't read the channel — check the YouTube link on the profile.", res.done ? "success" : "error");
  };
  return <Button variant="secondary" onClick={() => void run()} loading={busy} disabled={busy || (yt.progress.running && yt.progress.total > 1)} title={`Read ${creator.name}'s channel again now — YouTube’s values replace your edits (the email stays)`}><RefreshCw size={15} /> {busy ? "Reading…" : "Refresh YouTube"}</Button>;
}

/** A small pill wherever you are while a big refresh runs. */
export function YouTubeProgress() {
  const yt = useYouTube();
  const p = yt.progress;
  if (!p.running || p.total < 2) return null;
  const pct = Math.round(((p.done + p.failed) / p.total) * 100);
  return <div className="yt-progress" role="status" aria-live="polite">
    <RefreshCw size={13} className="spin" />
    <span>Updating YouTube stats · <b>{p.done + p.failed} of {p.total}</b></span>
    <i aria-hidden="true"><em style={{ width: `${pct}%` }} /></i>
    <button type="button" onClick={yt.cancel}>Stop</button>
  </div>;
}

/** On a profile: what YouTube says, when it was read, and a refresh button. */
export function YouTubePanel({ creator }: { creator: Creator }) {
  const yt = useYouTube();
  const { toast } = useToast();
  const link = yt.channelOf(creator.socials);
  if (!link) return null;
  const f = creator.youtube || {};
  const busy = yt.progress.ids.has(creator.id);
  const refresh = async () => {
    const res = await yt.refresh([creator.id], { quiet: true, force: true });
    toast(res.done ? "YouTube numbers updated" : res.message || "Couldn't read the channel — check the YouTube link on the profile.", res.done ? "success" : "error");
  };
  const at = creator.youtube_synced_at;
  return <section className="detail-section yt-panel">
    <div className="detail-section-head"><div><span>YouTube</span><h2>{f.title || "Channel numbers"}</h2></div>
      <Button size="sm" variant="secondary" onClick={() => void refresh()} loading={busy} disabled={busy || yt.progress.running}><RefreshCw size={13} /> {busy ? "Reading…" : "Refresh"}</Button></div>
    {at ? <>
      <div className="yt-stats">
        <div><small>Avg views</small><strong>{f.avg_views ? compact(f.avg_views) : "—"}</strong><em>{f.sampled ? `middle ${f.sampled} of the last ${Math.min(12, (f.sampled || 0) + 2)} videos${f.includes_recent ? "" : " · 1 day+ old"}` : "no long videos yet"}</em></div>
        <div><small>Engagement</small><strong>{f.engagement_rate ? `${f.engagement_rate}%` : "—"}</strong><em>likes + comments ÷ views</em></div>
        <div><small>Subscribers</small><strong>{f.hidden_subscribers ? "Hidden" : f.subscribers ? compact(f.subscribers) : "—"}</strong><em>{f.video_count ? `${compact(f.video_count)} videos` : ""}</em></div>
        <div><small>Uploads</small><strong>{f.uploads_90d ?? 0}</strong><em>in the last 90 days</em></div>
      </div>
      {f.sample && f.sample.length > 0 && <VideoSample sample={f.sample} avg={f.avg_views || 0} recent={!!f.includes_recent} />}
      {(f.niche || (f.kept || []).length > 0) && <p className="yt-facts">{f.niche && <span className="yt-chip">{f.niche}{f.sub_niche ? ` · ${f.sub_niche}` : ""}</span>}{(f.kept || []).length > 0 && <span className="yt-kept">Kept your {(f.kept || []).map((k) => KEPT_LABEL[k] || k).join(", ")} — the automatic refresh leaves your edit; press Refresh to take YouTube's</span>}</p>}
      <p className="yt-foot">Updated {relativeTime(at)} · refreshes every 6 hours{!yt.enabled && " (off in Settings)"} · <a href={f.url || link} target="_blank" rel="noreferrer">Open channel <ExternalLink size={11} /></a>
        {f.business_email_hidden && !creator.contact_email && <> · No email in the description — <a href={`${f.url || link}/about`} target="_blank" rel="noreferrer">check “View email address” <ExternalLink size={11} /></a></>}</p>
    </> : <p className="yt-foot">{busy ? "Reading the channel — last 12 videos, engagement, subscribers…" : yt.enabled ? "Not read yet — press Refresh, or it happens within the hour." : <>Automatic YouTube stats are off. <Link to="/app/settings#youtube">Turn them on</Link> or press Refresh.</>}</p>}
  </section>;
}

/** "Where does this number come from?" — the videos behind avg views, with the two left out. */
function VideoSample({ sample, avg, recent }: { sample: NonNullable<NonNullable<Creator["youtube"]>["sample"]>; avg: number; recent: boolean }) {
  const kept = sample.filter((v) => !v.cut);
  const total = kept.reduce((s, v) => s + v.views, 0);
  const top = Math.max(1, ...sample.map((v) => v.views));
  const full = (n: number) => n.toLocaleString("en-US");
  return <details className="yt-sample">
    <summary><ChevronRight size={14} className="yt-sample-chev" aria-hidden="true" /><span>How we got <b>{compact(avg)}</b></span><small>{sample.length} latest videos{recent ? "" : " 1 day+ old"} · no Shorts or live streams</small></summary>
    <ol>{sample.map((v) => <li key={v.id} className={v.cut ? "is-cut" : ""}>
      <a href={`https://www.youtube.com/watch?v=${encodeURIComponent(v.id)}`} target="_blank" rel="noreferrer" title={v.title}>{v.title || "Untitled video"}</a>
      <span className="yt-sample-bar" aria-hidden="true"><i style={{ width: `${Math.max(2, Math.round((v.views / top) * 100))}%` }} /></span>
      <b title={`${full(v.views)} views`}>{compact(v.views)}</b>
      <small>{v.cut ? (v.cut === "high" ? "Highest · left out" : "Lowest · left out") : relativeTime(v.at)}</small>
    </li>)}</ol>
    <p className="yt-sample-math">{kept.length > 0 ? <>{full(total)} views ÷ {kept.length} videos = <b>{full(Math.round(total / kept.length))}</b>. The highest and lowest are left out so one hit or one flop can't move it.</> : null}</p>
  </details>;
}
