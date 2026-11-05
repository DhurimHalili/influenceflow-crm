import { AlertTriangle, BadgeCheck, Clock3, Download, ExternalLink, FileImage, FileText, Link2, LoaderCircle, MessageSquareQuote, RefreshCcw, ScanSearch, ShieldAlert, Trash2, Upload } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import { useGmail } from "../contexts/GmailContext";
import { useToast } from "../contexts/ToastContext";
import { hasSupabase, supabase } from "../lib/supabase";
import { compact, dateLabel, malePct, pctText, relativeTime } from "../lib/utils";
import type { AudienceSnapshot, Creator, CreatorFile } from "../types";
import { Button } from "./ui";

// Audience & proof: numbers from a media kit or stats screenshot are
// "Verified"; numbers the creator only typed in an email are "Their words"
// and carry a caution. Below, every file they sent (or you uploaded) —
// downloadable, with what the AI check made of it.

const KIND_LABEL: Record<CreatorFile["kind"], string> = { media_kit: "Media kit", rate_card: "Rate card", stats_screenshot: "Stats screenshot", other: "Not a media kit", unknown: "Not checked yet" };
const MAX = 10 * 1024 * 1024;
const MAGIC: [string, number[]][] = [["application/pdf", [0x25, 0x50, 0x44, 0x46]], ["image/png", [0x89, 0x50, 0x4e, 0x47]], ["image/jpeg", [0xff, 0xd8, 0xff]]];
const EXT: Record<string, string> = { "application/pdf": "pdf", "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };
const sniff = (b: Uint8Array) => {
  for (const [mime, sig] of MAGIC) if (sig.every((x, i) => b[i] === x)) return mime;
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return "image/webp";
  return null;
};
const kb = (n: number) => (n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

function Bars({ items, label }: { items: { name: string; pct: number }[]; label: string }) {
  if (!items.length) return null;
  const max = Math.max(...items.map((i) => i.pct), 1);
  return <div className="aud-bars"><span>{label}</span>{items.slice(0, 6).map((i) => <div key={i.name}><em>{i.name}</em><i><b style={{ width: `${(i.pct / max) * 100}%` }} /></i><strong>{pctText(i.pct)}%</strong></div>)}</div>;
}

function AudienceCard({ snap, verified }: { snap: AudienceSnapshot; verified: boolean }) {
  const female = snap.gender_female_pct;
  return <div className={`aud-card ${verified ? "is-verified" : "is-claimed"}`}>
    <div className="aud-head">{verified ? <BadgeCheck size={16} /> : <MessageSquareQuote size={16} />}<div><strong>{verified ? "Verified" : "Their words"}</strong><small>{verified ? `From their ${snap.kind === "stats_screenshot" ? "stats screenshot" : "media kit"}${snap.filename ? ` · ${snap.filename}` : ""} · ${dateLabel(snap.at)}` : `Said in an email${snap.subject ? ` (“${snap.subject}”)` : ""} · ${dateLabel(snap.at)}`}</small></div></div>
    {!verified && <p className="aud-caution"><ShieldAlert size={13} /> Not proven — only the creator's own words. Ask for a media kit or an analytics screenshot before you pitch these numbers.</p>}
    <div className="aud-stats">
      {snap.avg_views > 0 && <div><b>{compact(snap.avg_views)}</b><span>Avg views</span></div>}
      {snap.engagement_rate > 0 && <div><b>{snap.engagement_rate}%</b><span>Engagement</span></div>}
      {snap.followers.map((f) => <div key={f.platform}><b>{compact(f.count)}</b><span>{f.platform}</span></div>)}
    </div>
    <Bars label="Top countries" items={snap.top_countries.map((c) => ({ name: c.country, pct: c.pct }))} />
    <Bars label="Ages" items={snap.age_ranges.map((a) => ({ name: a.range, pct: a.pct }))} />
    {female > 0 && <div className="aud-gender"><span>Gender</span><i><b style={{ width: `${female}%` }} /></i><small><em className="f">Female {pctText(female)}%</em><em className="m">Male {pctText(malePct(snap))}%</em></small></div>}
  </div>;
}

export function AudienceProof({ creator }: { creator: Creator }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [files, setFiles] = useState<CreatorFile[] | null>(null);
  const [busy, setBusy] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const verified = creator.audience?.verified;
  const waiting = (f: CreatorFile) => gmail.ai && f.status === "stored" && f.storage !== "link" && (f.ai_attempts || 0) < 3 && !f.verdict;
  const claimed = creator.audience?.claimed;

  const load = useCallback(async () => {
    if (!hasSupabase) return setFiles([]);
    const { data, error } = await supabase.from("creator_files").select("id, creator_id, path, filename, mime, size, source, mailbox, received_at, kind, status, verdict, storage, url, ai_attempts").eq("creator_id", creator.id).order("received_at", { ascending: false }).limit(50);
    setFiles(error ? [] : ((data || []) as CreatorFile[]));
  }, [creator.id]);
  useEffect(() => { void load(); }, [load]);

  const gmail = useGmail();
  const download = async (file: CreatorFile) => {
    if (file.storage === "link") {
      if (/^https:\/\//.test(file.url || "")) window.open(file.url, "_blank", "noopener,noreferrer");
      return;
    }
    setBusy(`dl:${file.id}`);
    if (file.storage === "gmail") {
      // Big files stay in Gmail (no storage used) — the server fetches it for you.
      const { data, error } = await supabase.functions.invoke("gmail-sync", { body: { action: "download_file", id: file.id } });
      setBusy("");
      if (error || !(data instanceof Blob)) return toast("Couldn't get the file from Gmail — is that mailbox still connected?", "error");
      const url = URL.createObjectURL(new Blob([data], { type: file.mime }));
      const a = document.createElement("a");
      a.href = url; a.download = file.filename || "file"; a.rel = "noopener";
      document.body.appendChild(a); a.click(); a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
      return;
    }
    const { data, error } = await supabase.storage.from("creator-files").createSignedUrl(file.path, 60, { download: file.filename || true });
    setBusy("");
    if (error || !data?.signedUrl) return toast("Couldn't open the file", "error");
    window.open(data.signedUrl, "_blank", "noopener");
  };
  const remove = async (file: CreatorFile) => {
    if (!confirm(`Delete “${file.filename}”? The audience numbers it filled in stay on the profile.`)) return;
    setBusy(`rm:${file.id}`);
    if ((file.storage || "bucket") === "bucket" && file.path) await supabase.storage.from("creator-files").remove([file.path]);
    const { error } = await supabase.from("creator_files").delete().eq("id", file.id);
    setBusy("");
    if (error) return toast("Couldn't delete", "error");
    setFiles((list) => (list || []).filter((f) => f.id !== file.id));
    toast("File deleted");
  };
  const analyze = async (file: CreatorFile) => {
    setBusy(`ai:${file.id}`);
    const { data, error } = await supabase.functions.invoke("gmail-sync", { body: { action: "analyze_file", id: file.id } });
    setBusy("");
    const msg = (data as { error?: string; verdict?: string } | null)?.error || (error ? "Couldn't check the file" : "");
    if (msg) return toast(/GEMINI|ANTHROPIC|not set up|AI reading/i.test(msg) ? "AI reading isn't switched on yet — add a free Gemini key (Settings → Gmail)" : msg, /queued/i.test(msg) ? "info" : "error");
    toast((data as { verdict?: string })?.verdict || "File checked");
    void load();
  };
  const rescan = async () => {
    setBusy("rescan");
    const { data, error } = await supabase.functions.invoke("gmail-sync", { body: { action: "rescan_creator", id: creator.id } });
    setBusy("");
    const res = data as { files?: number; emails?: number; left?: number; error?: string } | null;
    if (error || !res || res.error) return toast(res?.error || "Couldn't check their emails right now", "error");
    toast(res.files ? `Found ${res.files} new file${res.files === 1 ? "" : "s"} in ${res.emails} email${res.emails === 1 ? "" : "s"}${res.left ? ` — ${res.left} more checked on the next sync` : ""}` : res.emails ? `Checked ${res.emails} email${res.emails === 1 ? "" : "s"} — no new kit${res.left ? `, ${res.left} more on the next sync` : ""}` : "No emails from them yet. If they wrote from another address, add it as their second email.");
    void load();
  };
  const upload = async (picked: File | undefined) => {
    if (!picked || !user) return;
    if (picked.size > MAX) return toast("That file is over 10 MB", "error");
    const bytes = new Uint8Array(await picked.arrayBuffer());
    const mime = sniff(bytes);
    if (!mime) return toast("Only PDFs and images (PNG, JPG, WEBP) can be added", "error");
    setBusy("upload");
    const hash = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)), (x) => x.toString(16).padStart(2, "0")).join("");
    const path = `${user.id}/${creator.id}/${hash.slice(0, 16)}.${EXT[mime]}`;
    const up = await supabase.storage.from("creator-files").upload(path, bytes, { contentType: mime, upsert: true });
    if (up.error) { setBusy(""); return toast(/quota|size|exceed/i.test(up.error.message) ? "Storage limit reached (300 MB) — delete old files first" : "Upload failed", "error"); }
    const { error } = await supabase.from("creator_files").insert({ user_id: user.id, creator_id: creator.id, path, filename: picked.name.replace(/[^\w.\- ()]+/g, "_").slice(0, 120), mime, size: bytes.length, sha256: hash, source: "upload" });
    setBusy("");
    if (error && !/duplicate/i.test(error.message)) return toast("Couldn't save the file", "error");
    toast(error ? "That file is already here" : "File added");
    void load();
  };

  return <section className="detail-section proof-section">
    <div className="detail-section-head"><div><span>Audience & proof</span><h2>Who watches {creator.name.split(" ")[0]}</h2></div><div className="proof-head-actions">{gmail.connected && <Button size="sm" variant="ghost" onClick={() => void rescan()} loading={busy === "rescan"} title="Look through their emails again for media kits, links and prices"><RefreshCcw size={14} /> Check emails</Button>}<Button size="sm" variant="secondary" onClick={() => input.current?.click()} loading={busy === "upload"}><Upload size={14} /> Add file</Button></div><input ref={input} type="file" accept="application/pdf,image/png,image/jpeg,image/webp" hidden onChange={(event) => { void upload(event.target.files?.[0]); event.target.value = ""; }} /></div>
    {verified || claimed ? <div className="aud-grid">{verified && <AudienceCard snap={verified} verified />}{claimed && <AudienceCard snap={claimed} verified={false} />}</div>
      : <p className="muted-copy">No audience data yet. When {creator.name.split(" ")[0]} emails a media kit or an analytics screenshot, it's saved here and read automatically — or add one yourself.</p>}
    <div className="proof-files">
      <span className="proof-files-label">Files {files && files.length > 0 ? `· ${files.length}` : ""}</span>
      {files === null ? <p className="muted-copy"><LoaderCircle size={13} className="spin" /> Loading…</p>
        : !files.length ? <p className="muted-copy">Media kits, rate cards and stats screenshots they email you appear here, ready to download.</p>
        : <ul>{files.map((f) => <li key={f.id} className={`pf-${f.status}`}>
          <span className="pf-icon">{f.storage === "link" ? <Link2 size={16} /> : f.mime === "application/pdf" ? <FileText size={16} /> : <FileImage size={16} />}</span>
          <div className="pf-main"><strong title={f.filename}>{f.filename || "file"}</strong><small><em className={`pf-kind kind-${f.kind}`}>{f.status === "rejected" ? <AlertTriangle size={10} /> : f.status === "analyzed" ? <BadgeCheck size={10} /> : null}{f.storage === "link" ? "Kit link" : KIND_LABEL[f.kind]}</em>{waiting(f) && <em className="pf-kind kind-queue"><Clock3 size={10} />Waiting for AI</em>}{f.source === "gmail" ? `from Gmail${f.mailbox ? ` (${f.mailbox})` : ""}` : "uploaded"} · {relativeTime(f.received_at)}{f.storage !== "link" ? ` · ${kb(f.size)}` : ""}{f.storage === "gmail" ? " · kept in Gmail" : ""}</small>{f.verdict && <p>{f.verdict}</p>}</div>
          <div className="pf-actions">{f.status === "stored" && f.storage !== "link" && <button type="button" className="icon-btn" title="Check it with AI" aria-label="Check it with AI" onClick={() => void analyze(f)} disabled={!!busy}>{busy === `ai:${f.id}` ? <LoaderCircle size={15} className="spin" /> : <ScanSearch size={15} />}</button>}<button type="button" className="icon-btn" title={f.storage === "link" ? "Open link" : "Download"} aria-label={`${f.storage === "link" ? "Open" : "Download"} ${f.filename}`} onClick={() => void download(f)} disabled={!!busy}>{busy === `dl:${f.id}` ? <LoaderCircle size={15} className="spin" /> : f.storage === "link" ? <ExternalLink size={15} /> : <Download size={15} />}</button><button type="button" className="icon-btn danger" title="Delete" aria-label={`Delete ${f.filename}`} onClick={() => void remove(f)} disabled={!!busy}><Trash2 size={15} /></button></div>
        </li>)}</ul>}
    </div>
  </section>;
}
