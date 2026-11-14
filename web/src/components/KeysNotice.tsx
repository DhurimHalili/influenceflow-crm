import { ArrowRight, Check, MessageCircle, Siren, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useData } from "../contexts/DataContext";
import { readiness, useKeyStatus } from "../lib/apiKeys";
import { KEYS_NOTICE_OPEN, setKeysNoticeOpen } from "../lib/keysNotice";
import { hasSupabase } from "../lib/supabase";

// The one-day "bring your own keys" notice. Shown on 14 November 2026 only, at most 3 times (each time the CRM
// is opened), only to members who haven't added all four keys — never to the owner (the workspace keys are
// theirs), never again once all four are in. Everything it says is true: until a member adds keys, their
// YouTube stats, video reading and AI reading wait.

const NOTICE_DAY = "2026-11-14";
const MAX_SHOWS = 3;
const localDay = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };

let shownThisLoad = false;

const store = {
  get: (k: string) => { try { return Number(localStorage.getItem(k)) || 0; } catch { return MAX_SHOWS; } },
  set: (k: string, v: number) => { try { localStorage.setItem(k, String(v)); } catch { /* private mode: shown once per load */ } },
};

export function KeysNoticeLayer() {
  const data = useData();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const cloud = hasSupabase && /^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(data.profile.id || "") && !data.demoSeeded;
  const today = localDay() === NOTICE_DAY;
  const { status } = useKeyStatus(cloud && today && data.ready);
  const ready = readiness(status);
  const [open, setOpen] = useState<null | { preview: boolean; count: number }>(null);
  const countKey = `if.keys-notice.${data.profile.id}.${NOTICE_DAY}`;

  // Each time the CRM is opened today (not each page change), up to 3 times, until all four keys are in.
  useEffect(() => {
    if (!cloud || !today || !status || status.owner || ready.all || shownThisLoad || !pathname.startsWith("/app")) return;
    const seen = store.get(countKey);
    if (seen >= MAX_SHOWS) return;
    shownThisLoad = true;
    store.set(countKey, seen + 1);
    const t = window.setTimeout(() => setOpen({ preview: false, count: seen + 1 }), 700);
    return () => window.clearTimeout(t);
  }, [cloud, today, status, ready.all, pathname, countKey]);
  useEffect(() => {
    const show = (e: Event) => setOpen({ preview: !!(e as CustomEvent<{ preview?: boolean }>).detail?.preview, count: Math.max(1, store.get(countKey)) });
    window.addEventListener(KEYS_NOTICE_OPEN, show);
    return () => window.removeEventListener(KEYS_NOTICE_OPEN, show);
  }, [countKey]);
  useEffect(() => { if (open) setKeysNoticeOpen(true); }, [open]);

  const close = useCallback(() => { setOpen(null); setKeysNoticeOpen(false); }, []);
  if (!open) return null;
  return <KeysNotice preview={open.preview} count={open.count} items={readiness(open.preview && status?.owner ? null : status).items} onClose={close} onKeys={() => { close(); navigate("/app/setup"); }} />;
}

function KeysNotice({ preview, count, items, onClose, onKeys }: { preview: boolean; count: number; items: ReturnType<typeof readiness>["items"]; onClose: () => void; onKeys: () => void }) {
  const card = useRef<HTMLDivElement>(null);
  const primary = useRef<HTMLButtonElement>(null);
  const done = items.filter((i) => i.done).length;
  useEffect(() => {
    primary.current?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); onClose(); return; }
      if (e.key !== "Tab" || !card.current) return;
      // Keep the keyboard inside the notice.
      const f = Array.from(card.current.querySelectorAll<HTMLElement>("a[href], button:not([disabled])"));
      if (!f.length) return;
      if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
      else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, [onClose]);

  return <div className="kn-scrim" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
    <div ref={card} className="kn" role="alertdialog" aria-modal="true" aria-labelledby="kn-title" aria-describedby="kn-lead">
      <div className="kn-band">
        <span className="kn-siren" aria-hidden="true"><Siren size={26} /></span>
        <div className="kn-band-text"><span className="kn-eyebrow">Important CRM update</span><span className="kn-count">{preview ? "Preview · members see this" : `Notice ${count} of ${MAX_SHOWS} today`}</span></div>
        <button type="button" className="kn-x" onClick={onClose} aria-label="Close the notice"><X size={18} /></button>
        <div className="kn-tape" aria-hidden="true"><span>Bring your own keys · bring your own keys · bring your own keys · bring your own keys · bring your own keys ·</span></div>
      </div>
      <div className="kn-body">
        <h2 id="kn-title">Your CRM just stopped borrowing Dhurim's keys.</h2>
        <p id="kn-lead" className="kn-lead">Until today, every member's CRM quietly ran on Dhurim's API keys. Everyone on one set of keys means the daily limits run dry before lunch — so from now on, everybody brings their own.</p>
        <div className="kn-paused"><b>On pause for your account until your keys are in:</b><span>YouTube stats</span><span>Video reading in Match</span><span>AI reading of emails &amp; media kits</span><span>Company facts &amp; people</span></div>
        <p className="kn-stop"><b>No serious work recommended</b> until you've talked to Dhurim and added your keys. Nothing is lost or broken — it's all waiting for you.</p>
        <ol className="kn-steps">
          <li><b>Call Dhurim</b> and ask him what's going on. <span>(He knows. He did it.)</span></li>
          <li><b>Add your keys</b> in Settings. <span>About 10 minutes — mostly clicking “Create API key” and feeling very technical.</span></li>
          <li><b>Carry on</b> like nothing happened. <span>Your data was never touched.</span></li>
        </ol>
        <ul className="kn-check" aria-label={`${done} of 4 keys added`}>{items.map((i) => <li key={i.id} className={i.done ? "done" : ""}>{i.done ? <Check size={13} aria-hidden="true" /> : <i aria-hidden="true" />}<span><b>{i.label}</b><small>{i.what}</small></span></li>)}</ul>
        <div className="kn-actions">
          <button ref={primary} type="button" className="kn-go" onClick={onKeys}>Add my keys <ArrowRight size={16} aria-hidden="true" /></button>
          <a className="kn-call" href="https://wa.me/38349878908" target="_blank" rel="noopener noreferrer"><MessageCircle size={15} aria-hidden="true" /> Message Dhurim</a>
          <button type="button" className="kn-later" onClick={onClose}>Remind me later</button>
        </div>
        <p className="kn-foot">This note shows up {MAX_SHOWS} times today, then lets you be. Add all four keys and it never comes back.</p>
      </div>
    </div>
  </div>;
}
