import { Captions, CheckCircle2, Download, AudioWaveform, FileVideo, Pause, Play, PlugZap, ShieldCheck, TimerReset } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useHelper } from "../contexts/HelperContext";
import { useMatch } from "../contexts/MatchContext";
import { brandDomain, isDeal, kindOf, PROOF_LABEL, proofOf, type BrandLink } from "../lib/match";
import { KIND_LABEL, sureness } from "../lib/sponsors";
import { download, dateLabel } from "../lib/utils";
import { buildXlsx, zipStored } from "../lib/xlsx";
import type { Brand, Creator } from "../types";
import { ProofList } from "./MatchBits";
import { Avatar, Button, Modal } from "./ui";
import helperManifest from "../helper/manifest.json?raw";
import helperBackground from "../helper/background.js?raw";
import helperContent from "../helper/content.js?raw";

// How much of the last year has really been read, the free caption helper,
// a brand's full history, and the export of who works with whom.

const n = (x?: number | null) => (x ?? 0).toLocaleString("en-US");
const clock = (ms: number) => new Date(ms).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

/** The helper's state in a few words, and the one thing to do next. */
function useHelperLine() {
  const h = useHelper();
  if (h.version === null) return { tone: "info", text: "Checking for the helper…", action: "" } as const;
  if (!h.version && h.missing) return { tone: "warn", text: "The helper is gone from this browser", action: "install" } as const;
  if (!h.version) return { tone: "off", text: "Spoken words aren't read yet", action: "install" } as const;
  if (h.outdated) return { tone: "warn", text: `Update the helper · ${h.version} → ${h.latest}`, action: "update" } as const;
  if (h.blockedUntil > Date.now()) return { tone: "warn", text: /403/.test(h.blockedWhy) ? `YouTube refused this browser · trying again at ${clock(h.blockedUntil)}` : `YouTube asked this connection to slow down · back at ${clock(h.blockedUntil)}`, action: "" } as const;
  if (h.paused) return { tone: "off", text: "Helper paused", action: "resume" } as const;
  if (h.today >= h.dailyCap) return { tone: "ok", text: `Done for today · ${n(h.dailyCap)} videos`, action: "" } as const;
  if (h.elsewhere) return { tone: "ok", text: "Reading in another CRM tab", action: "" } as const;
  if (h.running) return { tone: "live", text: h.left === 0 ? "All caught up" : `Reading captions · ${n(h.today)} today`, action: "pause" } as const;
  return { tone: "ok", text: "Helper connected", action: "pause" } as const;
}

/** Last-year coverage: videos, paid labels, spoken words, listened clips — and the helper. */
export function CoverageStrip() {
  const m = useMatch();
  const h = useHelper();
  const st = m.status;
  const line = useHelperLine();
  const [sheet, setSheet] = useState(false);
  if (!st || st.videos === undefined) return null;
  const spokenOf = Math.max(1, (st.transcripts || 0) + (st.noCaptions || 0) + (st.transcriptWaiting || 0));
  const spokenPct = Math.round(((st.transcripts || 0) + (st.noCaptions || 0)) / spokenOf * 100);
  return <section className="mx-cover" aria-label="What has been read">
    <div className="mx-cover-stats">
      <div title={st.failed ? `${st.failed} channel${st.failed === 1 ? "" : "s"} couldn't be read — check their YouTube link.` : undefined}><FileVideo size={15} aria-hidden="true" /><span><b>{n(st.videos)}</b><small>videos, last 12 months</small>{st.backfilling ? <em>{st.backfilling} creator{st.backfilling === 1 ? "" : "s"} still filling their year</em> : st.failed ? <em className="warn">{st.failed} channel{st.failed === 1 ? "" : "s"} couldn't be read</em> : null}</span></div>
      <div><ShieldCheck size={15} aria-hidden="true" /><span><b>{n(st.paidVideos)}</b><small>marked paid by YouTube</small></span></div>
      <div><Captions size={15} aria-hidden="true" /><span><b>{h.version ? `${spokenPct}%` : n(st.transcripts)}</b><small>{h.version ? "spoken words read" : "videos with spoken words read"}</small>{h.version && st.transcriptWaiting ? <em>{n(st.transcriptWaiting)} videos to go</em> : null}</span></div>
      <div><AudioWaveform size={15} aria-hidden="true" /><span><b>{n(st.listened)}</b><small>ad clips listened to</small>{st.listenQueue ? <em title="Gemini listens to the ad part of a paid video when nothing in writing names the brand. Its free daily limit is shared with media-kit reading; videos whose captions get read drop out of this queue.">{n(st.listenQueue)} waiting · {st.listen?.secondsLeft ? "up to 20 a day" : "free limit used · more tomorrow"}</em> : null}</span></div>
    </div>
    <button type="button" className={`mx-helper-pill ${line.tone}`} onClick={() => setSheet(true)} aria-haspopup="dialog">
      {line.tone === "live" ? <i className="mx-live-dot" aria-hidden="true" /> : line.tone === "off" ? <PlugZap size={14} aria-hidden="true" /> : line.tone === "warn" ? <TimerReset size={14} aria-hidden="true" /> : <CheckCircle2 size={14} aria-hidden="true" />}
      <span>{line.text}</span>
      <em>{line.action === "install" ? (h.missing ? "Add it back" : "Turn on — free") : line.action === "update" ? "Update" : "Details"}</em>
    </button>
    {sheet && <HelperSheet onClose={() => setSheet(false)} />}
  </section>;
}

/** The helper as a zip (the three files under src/helper), unzipped and loaded once in Chrome, Edge or Brave. */
export function downloadHelper() {
  const blob = zipStored([["influenceflow-helper/manifest.json", helperManifest], ["influenceflow-helper/background.js", helperBackground], ["influenceflow-helper/content.js", helperContent]]);
  download("influenceflow-helper.zip", new Blob([blob], { type: "application/zip" }), "application/zip");
}

const TX_NAME: Record<string, string> = { ytai: "youtube-transcript.ai", supadata: "Supadata", tubealfred: "TubeAlfred", transcriptapi: "TranscriptAPI" };

function HelperSheet({ onClose }: { onClose: () => void }) {
  const h = useHelper();
  const m = useMatch();
  const line = useHelperLine();
  const [checking, setChecking] = useState(false);
  return <Modal open onClose={onClose} title="Read what creators say" description="Captions show sponsors said out loud that no description mentions. Free, from your own browser.">
    <div className="mx-helper">
      <p className={`mx-helper-state ${line.tone}`}>{line.tone === "live" ? <i className="mx-live-dot" aria-hidden="true" /> : null}{line.text}{h.current && h.running ? <small> — {h.current}</small> : null}</p>
      {h.outdated ? <>
        <ol className="mx-helper-steps">
          <li><b>Download the new helper</b><Button size="sm" onClick={downloadHelper}><Download size={13} /> influenceflow-helper.zip</Button><span>Unzip it over your old <code>influenceflow-helper</code> folder (replace the files).</span></li>
          <li><b>Reload it</b><span>On <code>chrome://extensions</code>, click the round reload arrow on the InfluenceFlow helper card.</span></li>
          <li><b>Reload this page</b><span>It reads again by itself. Nothing you read before is lost.</span></li>
        </ol>
      </> : h.version ? <>
        <div className="mx-helper-facts">
          <div><small>This tab</small><b>{n(h.session.read)}</b><span>videos read · {n(h.session.found)} deals heard</span></div>
          <div><small>Today, this computer</small><b>{n(h.today)}</b><span>of {n(h.dailyCap)} a day</span></div>
          <div><small>Still to read</small><b>{h.left === null ? "—" : n(h.left)}</b><span>videos of the last year</span></div>
        </div>
        <div className="mx-helper-actions">
          {h.paused ? <Button size="sm" onClick={() => h.setPaused(false)}><Play size={13} /> Resume</Button> : <Button size="sm" variant="secondary" onClick={() => h.setPaused(true)}><Pause size={13} /> Pause</Button>}
          <span className="mx-fine">Version {h.version}. It reads while a CRM tab is open — one video every ~10 seconds, so it never bothers YouTube.</span>
        </div>
      </> : <>
        {h.missing ? <p className="mx-helper-gone"><b>Why it disappeared:</b> the browser loads the helper from its folder every time it starts. When that folder is deleted or moved — or it was opened straight from the zip, which Windows keeps in a temporary folder it empties on restart — the helper is gone. Put it in a folder you keep and it stays for good.</p> : null}
        <ol className="mx-helper-steps">
          <li><b>Download the helper</b><Button size="sm" onClick={downloadHelper}><Download size={13} /> influenceflow-helper.zip</Button><span>Right-click the zip → <em>Extract All…</em> and extract it into a folder you keep, for example <code>Documents</code>. Not Downloads, and not by opening the zip — that folder gets cleaned up.</span></li>
          <li><b>Open your extensions page</b><span>In Chrome, Edge or Brave type <code>chrome://extensions</code> in the address bar and turn on <em>Developer mode</em> (top right).</span></li>
          <li><b>Load it</b><span>Click <em>Load unpacked</em> and pick the extracted <code>influenceflow-helper</code> folder. Leave the folder where it is — the browser reads it at every start.</span></li>
          <li><b>Reload this page</b><span>It connects by itself and starts reading — nothing else to set up. It stays after restarts.</span></li>
        </ol>
        <div className="mx-helper-actions"><Button size="sm" variant="secondary" loading={checking} onClick={async () => { setChecking(true); await h.recheck(); setChecking(false); }}>I've installed it — check</Button></div>
      </>}
      {m.status?.tx?.services.length ? <p className="mx-helper-tx"><Captions size={14} aria-hidden="true" /><span><b>Transcript services: {m.status.tx.services.map((x) => TX_NAME[x] || x).join(", ")}</b> read paid-labelled videos first, from the server — {m.status.tx.left ? `${m.status.tx.left} more today` : "today's free allowance is used, more tomorrow"}. The helper reads everything else.</span></p> : null}
      <section className="mx-helper-why">
        <h4>Why a helper?</h4>
        <p>YouTube lets people read captions but blocks servers, so the CRM can't fetch them itself. The helper reads them from your browser, anonymously, like opening the video would — paid-labelled videos first, then the newest. A busy year of 16,000 videos takes a few days of the CRM being open; after that it keeps up with new uploads.</p>
        <h4>What it touches</h4>
        <p>Only youtube.com, only captions, without your YouTube login. The caption lines go to your CRM, which keeps just the lines that matter (the sponsor read, “they sent me this”, codes) — never whole transcripts. If YouTube ever asks to slow down it stops by itself — an hour for a plain refusal, six for a bot check. Remove it any time from the extensions page.</p>
      </section>
    </div>
  </Modal>;
}

// ---- a brand's full history ------------------------------------------------------------------

export function BrandHistory({ name, brand, domain, links, onClose }: { name: string; brand?: Brand; domain: string; links: BrandLink[]; onClose: () => void }) {
  const m = useMatch();
  const creatorsById = useMemo(() => new Map(m.world.creators.map((c) => [c.id, c])), [m.world.creators]);
  const [kind, setKind] = useState<"deals" | "all">("deals");
  const shown = kind === "deals" ? links.filter(isDeal) : links;
  const creators = Array.from(new Set(shown.map((l) => l.creator_id)));
  const videos = shown.reduce((s, l) => s + (l.video_ids?.length || l.videos || 0), 0);
  const dates = shown.flatMap((l) => [l.first_at, l.last_at]).filter((d): d is string => !!d).sort();
  return <Modal open onClose={onClose} title={`${name} — every collaboration`} description={`${creators.length} creator${creators.length === 1 ? "" : "s"} · ${videos} video${videos === 1 ? "" : "s"}${dates.length ? ` · ${dateLabel(dates[0])} – ${dateLabel(dates[dates.length - 1])}` : ""}`}>
    <div className="mx-history">
      <div className="mx-history-head">
        {brand ? <Link to={`/app/brands/${brand.id}`} className="mx-history-brand"><Avatar name={name} path={brand.avatar_path} size="sm" /><span><strong>{name}</strong><small>In your CRM{domain ? ` · ${domain}` : ""}</small></span></Link> : <span className="mx-history-brand"><Avatar name={name} size="sm" /><span><strong>{name}</strong><small>{domain || "Not in your CRM"}</small></span></span>}
        <div className="mx-seg sm" role="tablist" aria-label="Which collaborations">
          <button type="button" role="tab" aria-selected={kind === "deals"} className={kind === "deals" ? "on" : ""} onClick={() => setKind("deals")}>Brand deals</button>
          <button type="button" role="tab" aria-selected={kind === "all"} className={kind === "all" ? "on" : ""} onClick={() => setKind("all")}>+ affiliate links</button>
        </div>
        <Button size="sm" variant="secondary" onClick={() => exportDeals(shown, creatorsById, m.world.brands, `${name} collaborations`)}><Download size={13} /> Export</Button>
      </div>
      <ul className="mx-history-who">{creators.map((cid) => { const c = creatorsById.get(cid); const l = shown.filter((x) => x.creator_id === cid).sort((a, b) => b.confidence - a.confidence)[0]; return c && l ? <li key={cid}><Avatar name={c.name} path={c.avatar_path} size="sm" /><span><strong>{c.name}</strong><small>{KIND_LABEL[kindOf(l)]} · {isDeal(l) ? PROOF_LABEL[proofOf(l).level] : sureness(l.confidence)} · {l.video_ids?.length || l.videos} video{(l.video_ids?.length || l.videos) === 1 ? "" : "s"}{l.last_at ? ` · last ${dateLabel(l.last_at)}` : ""}</small></span></li> : null; })}</ul>
      {shown.length ? <ProofList links={shown} creatorsById={creatorsById} /> : <p className="muted-copy">Only affiliate links so far — switch to “+ affiliate links” to see them.</p>}
    </div>
  </Modal>;
}

// ---- export ----------------------------------------------------------------------------------

/** Who works with whom as a spreadsheet: one row per creator × brand, with the proof and the latest video. */
export function exportDeals(links: BrandLink[], creatorsById: Map<string, Creator>, brands: Brand[], title = "Who works with whom") {
  const rows = links.filter((l) => creatorsById.has(l.creator_id)).map((l) => {
    const b = brands.find((x) => (l.brand_id && x.id === l.brand_id) || (l.domain && brandDomain(x) === l.domain));
    const latest = [...l.evidence].sort((a, c) => c.at.localeCompare(a.at))[0];
    return {
      brand: b?.name || l.brand_name, website: b ? brandDomain(b) : l.domain, in_crm: b ? "Yes" : "No", creator: creatorsById.get(l.creator_id)!.name,
      kind: l.store ? "Store affiliate" : KIND_LABEL[kindOf(l)], proof: isDeal(l) ? PROOF_LABEL[proofOf(l).level] : sureness(l.confidence), why: proofOf(l).why,
      videos: l.video_ids?.length || l.videos, first_seen: l.first_at ? l.first_at.slice(0, 10) : "", last_seen: l.last_at ? l.last_at.slice(0, 10) : "",
      latest_video: latest?.title || "", latest_video_link: latest ? `https://www.youtube.com/watch?v=${latest.video}${latest.t ? `&t=${latest.t}s` : ""}` : "", their_words: latest?.quote || "",
      your_check: l.verdict === "yes" ? "Confirmed" : l.verdict === "no" ? "Marked wrong" : "",
    };
  }).sort((a, b) => a.brand.localeCompare(b.brand) || a.creator.localeCompare(b.creator));
  const headers = ["Brand", "Website", "In your CRM", "Creator", "Kind", "Proof", "Why", "Videos", "First seen", "Last seen", "Latest video", "Latest video link", "Their words", "Your check"];
  const keys = ["brand", "website", "in_crm", "creator", "kind", "proof", "why", "videos", "first_seen", "last_seen", "latest_video", "latest_video_link", "their_words", "your_check"];
  const blob = buildXlsx([{ name: "Deals", headers: Object.fromEntries(keys.map((k, i) => [k, headers[i]])), keys, rows }]);
  download(`${title.replace(/[^\w -]+/g, "").trim() || "deals"} ${new Date().toISOString().slice(0, 10)}.xlsx`, blob, blob.type);
}
