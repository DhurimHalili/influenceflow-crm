import { Check, ChevronDown, ExternalLink, KeyRound, Orbit, Plus, Radar, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { useData } from "../contexts/DataContext";
import { useToast } from "../contexts/ToastContext";
import { useYouTube } from "../contexts/YouTubeContext";
import { ACTIVITY_LABEL, channelCounts, pendingFound, dismissFound, linkFound, mergeDiscovery, networkOf, roleLabel, roleOf, staleExtras, twinsOf, type ChannelRole, type NetChannel } from "../lib/channels";
import { asPlatform, detectPlatform, resolveSocial, socialKey, SOCIAL_META } from "../lib/socials";
import { compact, relativeTime } from "../lib/utils";
import type { Creator, FoundChannel, SocialLink, SocialPlatform } from "../types";
import { SocialGlyph } from "./SocialIcon";
import { Avatar, Button } from "./ui";

// One person, many channels. The profile's "Channels" section: a live map of everything they publish on (main
// channel in the middle of their world, extra YouTube channels close in, other networks further out, channels
// found on their own YouTube as dashed ghosts), combined reach, how active each channel is, and a yes / no on
// what was found. Finding uses the member's own YouTube key (youtube-sync "channels"), at most every 14 days per
// profile on its own, or when you press "Look for more".

const AUTO_DAYS = 14;
const searching = new Set<string>();
const triedThisSession = new Set<string>();
const PICKABLE: ChannelRole[] = ["second", "shorts", "clips", "podcast", "gaming", "live", "vlog", "music", "other"];
// X and Threads are near-black: in the dark theme they read through a light override (channels.css).
const toneOf = (p: SocialPlatform) => (p === "X" ? `var(--net-x, ${SOCIAL_META.X.color})` : p === "Threads" ? `var(--net-threads, ${SOCIAL_META.Threads.color})` : SOCIAL_META[p].color);
const firstName = (name: string) => name.trim().split(/\s+/)[0] || name;
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

type SearchState = { busy: boolean; error: string; code: "" | "no_key" | "quota" };

function useChannelSearch(creator: Creator) {
  const data = useData();
  const yt = useYouTube();
  const { toast } = useToast();
  const latest = useRef(creator);
  latest.current = data.creators.find((c) => c.id === creator.id) || creator;
  const [state, setState] = useState<SearchState>({ busy: searching.has(creator.id), error: "", code: "" });
  const mainLink = yt.channelOf(creator.socials);

  const run = async (opts: { discover: boolean; extras?: { link: string; id?: string }[]; quiet?: boolean }) => {
    const c = latest.current;
    const link = yt.channelOf(c.socials);
    if (!link || searching.has(c.id)) return false;
    searching.add(c.id);
    setState({ busy: true, error: "", code: "" });
    const skip = [...(c.channels?.dismissed || []), ...Object.values(c.channels?.stats || {}).map((s) => s.channel_id || "")].filter((id) => /^UC[\w-]{22}$/.test(id));
    const res = await yt.channels({ main: link, main_id: c.youtube?.channel_id || c.channels?.main?.id || "", discover: opts.discover, extras: opts.extras || [], skip });
    searching.delete(c.id);
    if (res.error || !res.data) {
      const code = res.status === 412 ? "no_key" : res.status === 429 ? "quota" : "";
      setState({ busy: false, error: res.error || "YouTube didn't answer — try again in a moment.", code });
      if (!opts.quiet && code !== "no_key") toast(res.error || "Couldn't look through their channel.", "error");
      return false;
    }
    const now = latest.current;
    const next = mergeDiscovery(now.channels, res.data, now.socials || [], { discovered: opts.discover });
    data.updateCreator(now.id, { channels: next }, { quiet: true });
    setState({ busy: false, error: "", code: "" });
    if (!opts.quiet && opts.discover) {
      const n = pendingFound({ socials: now.socials, channels: next }).length;
      toast(n ? `Found ${plural(n, "channel")} on ${firstName(now.name)}'s YouTube — check them below` : `Nothing new on ${firstName(now.name)}'s YouTube — you have every channel they link`, n ? "success" : "info");
    }
    return true;
  };

  // On its own: once per session per profile, when the last search is older than 14 days (or extra channels' numbers
  // are older than 3). Archived records and profiles without a YouTube channel never spend units.
  useEffect(() => {
    if (!mainLink || creator.archived_at || !yt.enabled || triedThisSession.has(creator.id)) return;
    const at = creator.channels?.at ? new Date(creator.channels.at).getTime() : 0;
    const due = !at || Date.now() - at > AUTO_DAYS * 86_400_000;
    const stale = staleExtras(creator);
    if (!due && !stale.length) return;
    triedThisSession.add(creator.id);
    void run({ discover: due, extras: stale, quiet: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [creator.id, mainLink, yt.enabled]);

  return { ...state, run, mainLink };
}

/** Round face of a channel: its YouTube picture, else the network mark in its colour. */
function Face({ platform, thumbnail, size = 40, title }: { platform: SocialPlatform; thumbnail?: string; size?: number; title?: string }) {
  const [broken, setBroken] = useState(false);
  const tone = toneOf(platform);
  return <span className="ch-face" style={{ width: size, height: size, ["--tone" as string]: tone } as CSSProperties} aria-hidden={title ? undefined : "true"} title={title}>
    {thumbnail && !broken ? <img src={thumbnail} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" draggable={false} onError={() => setBroken(true)} /> : <SocialGlyph platform={platform} size={Math.round(size * 0.46)} />}
  </span>;
}

type MapNode = { key: string; platform: SocialPlatform; title: string; followers: number; thumbnail: string; ghost: boolean; main: boolean; activity: NetChannel["activity"]; ring: 1 | 2 };

/** The map: the person in the middle, their channels around them. Sizes follow followers; ghosts = found, not confirmed. */
function ChannelMap({ creator, nodes, hot, onHot, onPick, busy }: { creator: Creator; nodes: MapNode[]; hot: string; onHot: (key: string) => void; onPick: (key: string) => void; busy: boolean }) {
  const max = Math.max(1, ...nodes.map((n) => n.followers));
  // Up to 8 channels share one ring (evenly spaced: nothing can overlap); more split YouTube in, other networks out.
  const one = nodes.length <= 8;
  const rings = one ? [nodes, [] as MapNode[]] : [nodes.filter((n) => n.ring === 1), nodes.filter((n) => n.ring === 2)];
  // Inner ring from the top; the outer ring turned to sit as far from the inner nodes as it can (no stacking).
  const TAU = Math.PI * 2;
  const innerAngles = rings[0].map((_, i) => -Math.PI / 2 + i * (TAU / Math.max(1, rings[0].length)));
  const gap = (a: number, b: number) => { const d = Math.abs(((a - b) % TAU + TAU) % TAU); return Math.min(d, TAU - d); };
  let outerShift = 0, best = -1;
  const outerStep = TAU / Math.max(1, rings[1].length);
  for (let s = 0; s < outerStep; s += Math.PI / 60) {
    const worst = Math.min(Math.PI, ...rings[1].flatMap((_, j) => innerAngles.map((a) => gap(-Math.PI / 2 + s + j * outerStep, a))));
    if (worst > best + 1e-6) { best = worst; outerShift = s; }
  }
  const placed = rings.flatMap((list, r) => list.map((n, i) => {
    const angle = r === 0 ? innerAngles[i] : -Math.PI / 2 + outerShift + i * outerStep;
    const radius = one ? 37 : r === 0 ? 28 : 44;
    const size = n.ghost ? 34 : Math.round(36 + 22 * Math.sqrt(n.followers / max));
    return { ...n, x: 50 + radius * Math.cos(angle), y: 50 + radius * Math.sin(angle), size, delay: (r * 4 + i) * 55 };
  }));
  return <div className={`ch-map${busy ? " is-busy" : ""}`} aria-label={`${creator.name}'s channels`} role="group">
    <span className="ch-ring r1" aria-hidden="true" /><span className="ch-ring r2" aria-hidden="true" />
    {busy && <span className="ch-sweep" aria-hidden="true" />}
    <svg className="ch-lines" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
      {placed.map((n) => <line key={n.key} x1="50" y1="50" x2={n.x} y2={n.y} className={`${n.ghost ? "ghost" : ""}${hot === n.key ? " hot" : ""}`} style={{ ["--tone" as string]: toneOf(n.platform) } as CSSProperties} />)}
    </svg>
    <span className="ch-core"><Avatar name={creator.name} path={creator.avatar_path} size="lg" /><small>{firstName(creator.name)}</small></span>
    {placed.map((n) => <button key={n.key} type="button"
      className={`ch-node${n.ghost ? " is-ghost" : ""}${n.main ? " is-main" : ""}${hot === n.key ? " is-hot" : ""} act-${n.activity}`}
      style={{ left: `${n.x}%`, top: `${n.y}%`, width: n.size, height: n.size, ["--tone" as string]: toneOf(n.platform), ["--d" as string]: `${n.delay}ms` } as CSSProperties}
      onMouseEnter={() => onHot(n.key)} onMouseLeave={() => onHot("")} onFocus={() => onHot(n.key)} onBlur={() => onHot("")} onClick={() => onPick(n.key)}
      aria-label={`${n.title}${n.ghost ? " — found, not confirmed" : ""}${n.followers ? ` · ${compact(n.followers)}` : ""}`}>
      <Face platform={n.platform} thumbnail={n.thumbnail} size={n.size - 6} />
      {n.ghost && <i className="ch-q" aria-hidden="true">?</i>}
      {!n.ghost && n.activity !== "unknown" && <i className="ch-dot" aria-hidden="true" />}
      {n.followers > 0 && <em>{compact(n.followers)}</em>}
    </button>)}
  </div>;
}

function RolePicker({ value, label, onPick }: { value: ChannelRole; label: string; onPick: (role: ChannelRole) => void }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", key);
    return () => { document.removeEventListener("pointerdown", away); document.removeEventListener("keydown", key); };
  }, [open]);
  return <span className="ch-role-pick" ref={box}>
    <button type="button" className={`ch-role role-${value}`} onClick={() => setOpen((v) => !v)} aria-haspopup="menu" aria-expanded={open} title="What kind of channel is this?">{label}<ChevronDown size={12} /></button>
    {open && <span className="ch-role-menu" role="menu">{PICKABLE.map((r) => <button key={r} type="button" role="menuitemradio" aria-checked={r === value} className={r === value ? "on" : ""} onClick={() => { onPick(r); setOpen(false); }}>{roleLabel(r)}{r === value && <Check size={12} />}</button>)}</span>}
  </span>;
}

function Tile({ ch, hot, onHot, twin, onRole, onRemove, onEdit }: { ch: NetChannel; hot: boolean; onHot: (k: string) => void; twin?: { id: string; name: string }; onRole: (r: ChannelRole) => void; onRemove: () => void; onEdit: () => void }) {
  const yt = ch.platform === "YouTube";
  return <article id={`ch-${ch.key.replace(/[^a-z0-9]+/gi, "-")}`} className={`ch-tile${hot ? " is-hot" : ""}${ch.main ? " is-main" : ""}`} style={{ ["--tone" as string]: toneOf(ch.platform) } as CSSProperties} onMouseEnter={() => onHot(ch.key)} onMouseLeave={() => onHot("")}>
    <header>
      <Face platform={ch.platform} thumbnail={ch.thumbnail} size={42} />
      <div className="ch-tile-id"><strong title={ch.title}>{ch.title}</strong>
        <span className="ch-tile-sub">{yt && !ch.main ? <RolePicker value={ch.role} label={ch.roleText} onPick={onRole} /> : <span className={`ch-role static role-${ch.main ? "main" : "net"}`}>{ch.main ? "Main channel" : SOCIAL_META[ch.platform].label}</span>}{ch.handle && ch.title !== `@${ch.handle}` && <small>@{ch.handle}</small>}</span></div>
    </header>
    <dl className="ch-stats">
      <div><dt>{yt ? "Subscribers" : "Followers"}</dt><dd>{ch.hidden ? "Hidden" : ch.followers ? compact(ch.followers) : "—"}</dd></div>
      {yt && <div><dt>Avg views</dt><dd>{ch.avgViews ? compact(ch.avgViews) : "—"}</dd></div>}
      {yt && <div><dt>Uploads · 90 d</dt><dd>{ch.uploads90d ?? "—"}</dd></div>}
    </dl>
    {yt && <p className={`ch-pulse act-${ch.activity}`}><i aria-hidden="true" />{ch.activity === "unknown" ? (ch.main ? "Numbers come with the next YouTube refresh" : "Numbers on their way") : `${ACTIVITY_LABEL[ch.activity]} · last upload ${relativeTime(ch.lastUpload)}`}</p>}
    {!yt && !ch.followers && <button type="button" className="ch-addcount" onClick={onEdit}><Plus size={12} /> Add their follower count</button>}
    {ch.niche && <p className="ch-niche">{ch.niche}</p>}
    {twin && <Link className="ch-twin" to={`/app/influencers/${twin.id}`}>Also in your list as <b>{twin.name}</b></Link>}
    <footer>
      <a className="ch-open" href={ch.url} target="_blank" rel="noreferrer">Open <ExternalLink size={12} /></a>
      {!ch.main && <button type="button" className="ch-remove" onClick={onRemove} aria-label={`Remove ${ch.title} from their channels`} title="Remove from their channels"><Trash2 size={14} /></button>}
    </footer>
  </article>;
}

function Ghost({ f, twin, onYes, onNo }: { f: FoundChannel; twin?: { id: string; name: string }; onYes: () => void; onNo: () => void }) {
  const platform = f.platform || "YouTube";
  const yt = platform === "YouTube";
  const role = yt ? roleLabel((f.role as ChannelRole) || roleOf({ title: f.title, handle: f.handle || "" }).role, f.language) : SOCIAL_META[platform].label;
  return <article className={`ch-ghost lvl-${f.level}`} style={{ ["--tone" as string]: toneOf(platform) } as CSSProperties}>
    <header>
      <Face platform={platform} thumbnail={f.thumbnail} size={42} />
      <div className="ch-tile-id"><strong title={f.title}>{f.title}</strong><small>{f.handle && f.title !== `@${f.handle}` ? `@${f.handle} · ` : ""}{role}</small></div>
      <span className={`ch-level lvl-${f.level}`}>{f.level === "sure" ? "Sure" : "Likely"}</span>
    </header>
    {yt && (f.subscribers || f.video_count) ? <p className="ch-ghost-stats">{f.hidden_subscribers ? "Subscribers hidden" : `${compact(f.subscribers || 0)} subscribers`}{f.video_count ? ` · ${compact(f.video_count)} videos` : ""}{f.last_upload_at ? ` · last upload ${relativeTime(f.last_upload_at)}` : ""}</p> : null}
    <ul className="ch-why">{f.why.slice(0, 3).map((w) => <li key={w}>{w}</li>)}</ul>
    {twin && <Link className="ch-twin" to={`/app/influencers/${twin.id}`}>Already in your list as <b>{twin.name}</b></Link>}
    <footer>
      <Button size="sm" onClick={onYes}><Check size={14} /> Yes, theirs</Button>
      <Button size="sm" variant="ghost" onClick={onNo}><X size={14} /> Not theirs</Button>
      <a className="ch-open" href={f.url} target="_blank" rel="noreferrer">Check it <ExternalLink size={12} /></a>
    </footer>
  </article>;
}

/** Profile section: every channel of theirs, found ones to confirm, and a box to add one. */
export function ChannelsSection({ creator, onEdit }: { creator: Creator; onEdit: () => void }) {
  const data = useData();
  const { toast } = useToast();
  const search = useChannelSearch(creator);
  const net = useMemo(() => networkOf(creator), [creator]);
  const twin = useMemo(() => twinsOf(creator, data.creators), [creator, data.creators]);
  const [hot, setHot] = useState("");
  const [text, setText] = useState("");
  const [addError, setAddError] = useState("");
  const name = firstName(creator.name);

  const nodes: MapNode[] = [
    ...net.channels.map((c) => ({ key: c.key, platform: c.platform, title: c.title, followers: c.hidden ? 0 : c.followers, thumbnail: c.thumbnail, ghost: false, main: c.main, activity: c.activity, ring: (c.platform === "YouTube" ? 1 : 2) as 1 | 2 })),
    ...net.found.map((f) => ({ key: `found:${f.id}`, platform: (f.platform || "YouTube") as SocialPlatform, title: f.title, followers: f.subscribers || 0, thumbnail: f.thumbnail || "", ghost: true, main: false, activity: "unknown" as const, ring: ((f.platform || "YouTube") === "YouTube" ? 1 : 2) as 1 | 2 })),
  ];
  const pick = (key: string) => {
    const id = key.startsWith("found:") ? `ch-found-${key.slice(6)}` : `ch-${key.replace(/[^a-z0-9]+/gi, "-")}`;
    const el = document.getElementById(id);
    if (!el) return;
    el.scrollIntoView({ behavior: window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "center" });
    el.classList.remove("flash"); void el.offsetWidth; el.classList.add("flash");
  };

  const save = (patch: Partial<Creator>, activity: string, undo: Partial<Creator>, message: string) => {
    data.updateCreator(creator.id, patch, { activity });
    toast(message, "success", { label: "Undo", run: () => data.updateCreator(creator.id, undo, { activity: `Undid: ${activity}` }) });
  };
  const before = (): Partial<Creator> => ({ socials: creator.socials, channels: creator.channels, channel_link: creator.channel_link, platform: creator.platform });

  const yes = (f: FoundChannel) => {
    const undo = before();
    const next = linkFound(creator, f);
    save({ ...next, ...(creator.socials?.length ? {} : { channel_link: f.url, platform: asPlatform(f.platform || "YouTube") }) }, `Linked ${f.title} to ${creator.name}'s channels`, undo, `${f.title} is now one of ${name}'s channels`);
    if ((f.platform || "YouTube") === "YouTube") void search.run({ discover: false, extras: [{ link: f.url, id: f.id }], quiet: true });
  };
  const no = (f: FoundChannel) => {
    const undo = before();
    save({ channels: dismissFound(creator.channels, f.id) }, `Marked ${f.title} as not ${creator.name}'s channel`, undo, `Got it — ${f.title} won't be suggested again`);
  };
  const remove = (ch: NetChannel) => {
    const undo = before();
    const stats = { ...(creator.channels?.stats || {}) };
    delete stats[ch.key];
    save({ socials: (creator.socials || []).filter((s) => socialKey(s.url) !== ch.key), channels: { ...(creator.channels || {}), stats } }, `Removed ${ch.title} from ${creator.name}'s channels`, undo, `${ch.title} removed`);
  };
  const setRole = (ch: NetChannel, role: ChannelRole) => {
    data.updateCreator(creator.id, { channels: { ...(creator.channels || {}), roles: { ...(creator.channels?.roles || {}), [ch.key]: role } } }, { quiet: true });
    toast(`${ch.title}: ${roleLabel(role)}`);
  };
  const add = (e: FormEvent) => {
    e.preventDefault();
    const raw = text.trim();
    if (!raw) return;
    const platform = detectPlatform(raw);
    if (!platform || platform === "Website") return setAddError(platform === "Website" ? "That looks like a website — add it under Edit profile → Socials. Paste a YouTube, TikTok, Instagram, X or Twitch link here." : "Paste the full link, e.g. youtube.com/@name or tiktok.com/@name.");
    const r = resolveSocial(raw, platform);
    if (!r) return setAddError("That link doesn't point to a profile — copy it from the channel page.");
    if ((creator.socials || []).some((s) => socialKey(s.url) === socialKey(r.url))) return setAddError(`Already one of ${name}'s channels.`);
    const t = twin(socialKey(r.url));
    const undo = before();
    const social: SocialLink = { ...r, followers: 0 };
    const first = !(creator.socials || []).length;
    save({ socials: [...(creator.socials || []), social], ...(first ? { channel_link: r.url, platform: asPlatform(platform) } : {}) }, `Added ${SOCIAL_META[platform].label} ${r.handle ? `@${r.handle}` : r.url} to ${creator.name}'s channels`, undo, t ? `Added — note: ${t.name} in your list has this channel too` : `Added to ${name}'s channels`);
    setText(""); setAddError("");
    if (platform === "YouTube" && !first) void search.run({ discover: false, extras: [{ link: r.url }], quiet: true });
  };

  const total = net.channels.length;
  const active = net.channels.filter((c) => c.activity === "active").length;
  const shareOf = (c: NetChannel) => (net.reach ? (c.hidden ? 0 : c.followers) / net.reach : 0);
  const legend = net.channels.filter((c) => !c.hidden && c.followers > 0);
  const title = total > 1 ? `${name} publishes on ${plural(total, "channel")}` : total === 1 ? `${name}'s channel` : `${name}'s channels`;

  return <section className="detail-section ch-section" id="channels">
    <div className="detail-section-head">
      <div><span>Channels</span><h2>{title}</h2></div>
      {search.mainLink && <div className="ch-head-actions">
        {creator.channels?.at && !search.busy && <small>Searched {relativeTime(creator.channels.at)}</small>}
        <Button size="sm" variant="secondary" loading={search.busy} disabled={search.busy} onClick={() => void search.run({ discover: true, extras: staleExtras(creator, 0) })} title={`Look through ${name}'s YouTube for their other channels and refresh the numbers (uses a few units of your YouTube key)`}><Radar size={14} /> {search.busy ? "Searching…" : "Look for more"}</Button>
      </div>}
    </div>

    {total || net.found.length ? <div className="ch-hero">
      <ChannelMap creator={creator} nodes={nodes} hot={hot} onHot={setHot} onPick={pick} busy={search.busy} />
      <div className="ch-summary">
        {net.reach > 0 ? <div className="ch-reach"><strong>{compact(net.reach)}</strong><span>followers across {plural(total, "channel")}</span></div> : <div className="ch-reach"><strong>{total}</strong><span>{total === 1 ? "channel" : "channels"} · follower counts not added yet</span></div>}
        {legend.length > 1 && <>
          <div className="ch-share" role="img" aria-label={legend.map((c) => `${c.title} ${Math.round(shareOf(c) * 100)}%`).join(", ")}>
            {legend.map((c) => <i key={c.key} className={hot === c.key ? "hot" : ""} style={{ flexGrow: Math.max(0.02, shareOf(c)), ["--tone" as string]: toneOf(c.platform) } as CSSProperties} onMouseEnter={() => setHot(c.key)} onMouseLeave={() => setHot("")} />)}
          </div>
          <ul className="ch-legend">{legend.slice(0, 6).map((c) => <li key={c.key} className={hot === c.key ? "hot" : ""} style={{ ["--tone" as string]: toneOf(c.platform) } as CSSProperties}><i aria-hidden="true" /><span>{c.title}<small>{c.platform === "YouTube" ? c.roleText : SOCIAL_META[c.platform].label}</small></span><b>{Math.max(1, Math.round(shareOf(c) * 100))}%</b></li>)}{legend.length > 6 && <li className="more">+{legend.length - 6} more</li>}</ul>
          <p className="ch-note">Followers added up across channels — one fan can follow two.</p>
        </>}
        <div className="ch-facts">
          {net.youtube > 0 && <span><SocialGlyph platform="YouTube" size={12} /> {plural(net.youtube, "YouTube channel")}</span>}
          {net.networks > 1 && <span>{plural(net.networks, "network")}</span>}
          {active > 0 && <span className="ok">{active} posted in the last 2 weeks</span>}
          {net.found.length > 0 && <button type="button" className="warn" onClick={() => pick(`found:${net.found[0].id}`)}>{plural(net.found.length, "channel")} found · check</button>}
        </div>
      </div>
    </div> : <div className="ch-empty"><Orbit size={22} aria-hidden="true" /><div><strong>No channels yet</strong><p>Paste their YouTube, TikTok or Instagram below. With a YouTube channel on file, the CRM finds their other channels for you.</p></div></div>}

    {search.code === "no_key" && <div className="ch-alert"><KeyRound size={15} /><span>Finding {name}'s other channels uses your own YouTube key. <Link to="/app/setup">Add it in Getting started</Link> — it's free.</span></div>}
    {search.error && search.code !== "no_key" && <div className="ch-alert is-error"><span>{search.error}</span><button type="button" onClick={() => void search.run({ discover: true, extras: staleExtras(creator, 0) })}>Try again</button></div>}
    {!search.mainLink && total > 0 && <p className="ch-hint">Add their YouTube channel and the CRM looks through it for their other channels.</p>}

    {net.found.length > 0 && <div className="ch-found">
      <h3><Radar size={14} /> Found on {name}'s YouTube <b>{net.found.length}</b><small>Only channels their own channel calls theirs, or that share their name and are promoted there.</small></h3>
      <div className="ch-ghosts">{net.found.map((f) => <div key={f.id} id={`ch-found-${f.id}`}><Ghost f={f} twin={twin(socialKey(f.url), f.id)} onYes={() => yes(f)} onNo={() => no(f)} /></div>)}</div>
    </div>}

    {total > 0 && <div className="ch-grid">{net.channels.map((ch) => <Tile key={ch.key} ch={ch} hot={hot === ch.key} onHot={setHot} twin={twin(ch.key, ch.stats?.channel_id || (ch.main ? creator.youtube?.channel_id : undefined))} onRole={(r) => setRole(ch, r)} onRemove={() => remove(ch)} onEdit={onEdit} />)}</div>}

    {net.links.length > 0 && <p className="ch-links"><span>Also linked</span>{net.links.map((l) => <a key={l.url} href={l.url} target="_blank" rel="noreferrer"><SocialGlyph platform={l.platform} size={12} />{l.handle ? `@${l.handle}` : l.url.replace(/^https?:\/\/(www\.)?/, "").slice(0, 40)}</a>)}</p>}

    <form className="ch-add" onSubmit={add}>
      <label htmlFor={`ch-add-${creator.id}`} className="sr-only">Add a channel</label>
      <input id={`ch-add-${creator.id}`} value={text} onChange={(e) => { setText(e.target.value); setAddError(""); }} placeholder="Paste another channel — youtube.com/@…, tiktok.com/@…, instagram.com/…" autoComplete="off" spellCheck={false} aria-invalid={!!addError} aria-describedby={addError ? `ch-add-err-${creator.id}` : undefined} />
      <Button type="submit" size="sm" variant="secondary" disabled={!text.trim()}><Plus size={14} /> Add channel</Button>
      {addError && <small id={`ch-add-err-${creator.id}`} className="ch-add-error" role="alert">{addError}</small>}
    </form>
  </section>;
}

/** List pill: how many channels they have, and how many more were found on their YouTube. */
export function ChannelPill({ creator }: { creator: Pick<Creator, "socials" | "channels"> }) {
  const n = channelCounts(creator);
  if (n.channels < 2 && !n.found) return null;
  return <span className={`ch-pill${n.found ? " has-found" : ""}`} title={`${plural(n.channels, "channel")}${n.found ? ` · ${n.found} more found on their YouTube — open the profile to check` : ""}`}>
    <Orbit size={11} aria-hidden="true" />{n.channels}<span className="sr-only"> channels</span>{n.found > 0 && <em>+{n.found}<span className="sr-only"> found</span></em>}
  </span>;
}
