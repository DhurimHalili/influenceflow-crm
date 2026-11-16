import { ArrowRight, Flame, MessageCircle, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAccess } from "../contexts/AccessContext";
import { useData } from "../contexts/DataContext";
import { useCoach } from "./Coach";
import { hasSupabase } from "../lib/supabase";
import { freeStage, saveLocalCount, seenCount, stageBusy, STAGE_FREE, takeStage } from "../lib/popupStage";

// The sauce drop: a one-off, very loud hello for one member (Granit) when Autopilot launched — hit 40 emails
// today, talk to Dhurim before the day ends, password "the sauce is hot". He sees it on the first 2 opens of
// the CRM (counted on his account, so a second device doesn't add more); the owner sees it once, as a preview.
// Only on 16–18 November 2026, so "before today ends" is always true.

const FOR_MEMBER = "d7f83076-2154-49ed-9ad5-f70386d8ff9c";
const DAYS = ["2026-11-16", "2026-11-17", "2026-11-18"];
const ID = "sauce-drop";
const TARGET = 40;
const WHATSAPP = `https://wa.me/38349878908?text=${encodeURIComponent("The sauce is hot 🌶️🔥")}`;
const localDay = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
let shownThisLoad = false;

/** The heat scale the meter climbs, one label every 10 emails. */
const HEAT = ["Ketchup", "Mild", "Medium", "Hot", "Reaper"];

export function SauceDropLayer() {
  const data = useData();
  const { isOwner, loaded } = useAccess();
  const { stats } = useCoach();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [open, setOpen] = useState<null | { n: number; max: number; preview: boolean }>(null);
  const [turn, setTurn] = useState(0);
  const id = data.profile.id || "";
  const who = id === FOR_MEMBER ? "member" : isOwner ? "owner" : null;
  const max = who === "member" ? 2 : 1;
  const localKey = `if.notice.${ID}.${id}`;

  useEffect(() => { const again = () => setTurn((t) => t + 1); window.addEventListener(STAGE_FREE, again); return () => window.removeEventListener(STAGE_FREE, again); }, []);
  // Once per opening of the CRM (not per page change), on its days only.
  useEffect(() => {
    if (!hasSupabase || !loaded || !data.ready || data.demoSeeded || !who || shownThisLoad || !pathname.startsWith("/app") || !DAYS.includes(localDay())) return;
    const seen = seenCount(data.profile.preferences.notices, ID, localKey);
    if (seen >= max) return;
    const t = window.setTimeout(() => {
      if (shownThisLoad || stageBusy(ID) || !takeStage(ID)) return;
      shownThisLoad = true;
      const n = seen + 1;
      saveLocalCount(localKey, n);
      const prefs = data.profile.preferences;
      data.updateProfile({ preferences: { ...prefs, notices: { ...(prefs.notices || {}), [ID]: n } } });
      setOpen({ n, max, preview: who === "owner" });
    }, 900);
    return () => window.clearTimeout(t);
  }, [loaded, data.ready, data.demoSeeded, who, pathname, max, localKey, turn]); // eslint-disable-line react-hooks/exhaustive-deps

  const close = useCallback(() => { setOpen(null); freeStage(ID); }, []);
  if (!open) return null;
  return <SauceDrop {...open} name={(data.profile.display_name || "").split(" ")[0] || "bro"} sent={stats.sentToday} onClose={close} onAutopilot={() => { close(); navigate("/app/autopilot"); }} />;
}

// Falling chillies: [left %, size px, seconds, delay s, spin deg, depth 0 near … 2 far].
const CHILLIES: [number, number, number, number, number, number][] = [
  [3, 74, 9, -1, 220, 0], [12, 40, 13, -7, -160, 2], [20, 58, 10, -3, 300, 1], [29, 34, 14, -11, -240, 2], [37, 84, 8.5, -5, 180, 0],
  [46, 44, 12, -9, -320, 1], [55, 36, 15, -2, 260, 2], [63, 70, 9.5, -6, -200, 0], [72, 46, 12.5, -12, 280, 1], [81, 56, 10.5, -4, -260, 1],
  [90, 34, 14, -8, 200, 2], [97, 64, 9.8, -2.5, -220, 0], [8, 48, 11, -10, 340, 1], [33, 30, 16, -13, -180, 2], [59, 54, 11.5, -1.5, 240, 1],
  [86, 88, 8.8, -8.5, -300, 0], [24, 66, 9.2, -7.5, 260, 0], [50, 38, 15, -5.5, -280, 2], [76, 32, 16, -14, 200, 2], [42, 60, 10.2, -11, -240, 1],
];
// Drips under the sauce edge: [left %, length px, width px, seconds, delay s].
const DRIPS: [number, number, number, number, number][] = [
  [1.4, 190, 15, 7.5, 0.4], [6, 70, 15, 4.2, 0.2], [13, 36, 11, 3.4, 1.1], [21, 60, 14, 4.8, 0.6], [31, 30, 10, 3.1, 1.8], [41, 72, 17, 5.2, 0.9],
  [52, 34, 12, 3.6, 0.3], [61, 54, 13, 4.4, 1.5], [71, 28, 10, 3.2, 0.7], [80, 66, 15, 4.9, 1.2], [89, 40, 12, 3.9, 0.4], [98.6, 250, 16, 8.6, 1.6],
];
const EMBERS = Array.from({ length: 18 }, (_, i) => [(i * 37 + 11) % 100, 3 + (i % 4), 5 + (i % 5) * 1.3, -((i * 1.7) % 9)] as const);

function Chilli({ className, style }: { className?: string; style?: CSSProperties }) {
  return <svg className={className} style={style} viewBox="0 0 64 96" aria-hidden="true">
    <path d="M24 20c10-4 24 2 30 18 6 17 2 36-10 50-4 5-9 7-9 3 0-3 3-6 5-11 5-13 3-26-4-36-5-7-12-11-15-16-2-4-1-7 3-8z" fill="url(#sx-chilli-body)" />
    <path d="M30 26c8 2 15 9 17 19" stroke="rgba(255,255,255,.55)" strokeWidth="3.5" strokeLinecap="round" fill="none" />
    <path d="M18 23c-2-6 2-12 10-12 5 0 9 3 11 7-6-2-12-1-16 3-2 2-4 3-5 2z" fill="#3fae49" />
    <path d="M27 12c-1-5 1-9 6-11" stroke="#2f8a39" strokeWidth="4" strokeLinecap="round" fill="none" />
  </svg>;
}

function SauceDrop({ n, max, preview, name, sent, onClose, onAutopilot }: { n: number; max: number; preview: boolean; name: string; sent: number; onClose: () => void; onAutopilot: () => void }) {
  const card = useRef<HTMLDivElement>(null);
  const primary = useRef<HTMLAnchorElement>(null);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const t = window.setInterval(() => setNow(Date.now()), 30_000); return () => window.clearInterval(t); }, []);
  useEffect(() => {
    primary.current?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      // Only the buttons close it: no Escape, no click outside.
      if (e.key === "Escape") { e.preventDefault(); return; }
      if (e.key !== "Tab" || !card.current) return;
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

  const midnight = new Date(now); midnight.setHours(24, 0, 0, 0);
  const minsLeft = Math.max(0, Math.round((midnight.getTime() - now) / 60_000));
  const left = Math.max(0, TARGET - sent);
  const done = left === 0;
  const every = left > 0 ? Math.floor(minsLeft / left) : 0;
  const clock = `${Math.floor(minsLeft / 60)}h ${String(minsLeft % 60).padStart(2, "0")}m`;
  const fill = Math.min(1, sent / TARGET);
  const level = HEAT[Math.min(HEAT.length - 1, Math.floor(Math.min(sent, TARGET) / 10))];
  const pace = done ? "" : every >= 20 ? `That's one every ${every} minutes. Light work.` : every >= 6 ? `That's one every ${every} minutes. Pick up the pace, chef.` : every >= 1 ? `That's one every ${every} minutes. Full send. No breaks.` : "The clock is basically on fire.";

  return <div className="sx-scrim">
    <svg className="sx-defs" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="sx-chilli-body" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#ff4d2e" /><stop offset=".55" stopColor="#e3121b" /><stop offset="1" stopColor="#8f0610" /></linearGradient>
        <linearGradient id="sx-sauce-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#ff5a1f" /><stop offset=".45" stopColor="#e5161b" /><stop offset="1" stopColor="#b30a12" /></linearGradient>
        <filter id="sx-goo"><feGaussianBlur in="SourceGraphic" stdDeviation="5" result="b" /><feColorMatrix in="b" mode="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 22 -9" /></filter>
      </defs>
    </svg>
    <div className="sx-sky" aria-hidden="true">
      <div className="sx-heat a" /><div className="sx-heat b" />
      {CHILLIES.map(([x, s, d, delay, spin, depth], i) => <Chilli key={i} className={`sx-fall d${depth}`} style={{ left: `${x}%`, width: s, "--d": `${d}s`, "--delay": `${delay}s`, "--spin": `${spin}deg` } as CSSProperties} />)}
      {EMBERS.map(([x, s, d, delay], i) => <i key={i} className="sx-ember" style={{ left: `${x}%`, width: s, height: s, "--d": `${d}s`, "--delay": `${delay}s` } as CSSProperties} />)}
      <div className="sx-tape one"><span>{"Caution · hot sauce · 40 emails today · no excuses · ".repeat(6)}</span></div>
      <div className="sx-tape two"><span>{"The sauce is hot · talk to Dhurim · new feature dropped · ".repeat(6)}</span></div>
    </div>

    <div ref={card} className={`sx${done ? " done" : ""}`} role="alertdialog" aria-modal="true" aria-labelledby="sx-title" aria-describedby="sx-sub">
      <div className="sx-bottle" aria-hidden="true">
        <svg viewBox="0 0 60 130">
          <rect x="21" y="0" width="18" height="14" rx="3" fill="#1f1f22" />
          <path d="M24 14h12v20c0 4 14 10 14 22v64c0 6-4 10-10 10H20c-6 0-10-4-10-10V56c0-12 14-18 14-22z" fill="url(#sx-sauce-fill)" />
          <path d="M14 60c0-6 4-10 8-13" stroke="rgba(255,255,255,.5)" strokeWidth="3" strokeLinecap="round" fill="none" />
          <rect x="10" y="70" width="40" height="38" rx="3" fill="#fff4dc" />
          <text x="30" y="86" textAnchor="middle" fontSize="9" fontWeight="900" fill="#b30a12" fontFamily="Manrope, sans-serif">SAUCE</text>
          <text x="30" y="99" textAnchor="middle" fontSize="6.5" fontWeight="800" fill="#1f1f22" fontFamily="Manrope, sans-serif">EXTRA HOT</text>
        </svg>
      </div>
      <i className="sx-stream" aria-hidden="true" />
      <div className="sx-sauce" aria-hidden="true">
        <svg className="sx-wave" viewBox="0 0 400 40" preserveAspectRatio="none">
          <path fill="url(#sx-sauce-fill)" d="M0 0H400V22C370 30 350 18 320 26S270 34 240 24 190 16 160 27 110 33 80 24 30 18 0 26Z">
            <animate attributeName="d" dur="5s" repeatCount="indefinite" calcMode="spline" keySplines=".45 0 .55 1;.45 0 .55 1" keyTimes="0;.5;1"
              values="M0 0H400V22C370 30 350 18 320 26S270 34 240 24 190 16 160 27 110 33 80 24 30 18 0 26Z;M0 0H400V27C372 18 348 30 318 22S268 18 238 29 188 34 158 22 108 18 78 29 28 32 0 22Z;M0 0H400V22C370 30 350 18 320 26S270 34 240 24 190 16 160 27 110 33 80 24 30 18 0 26Z" />
          </path>
        </svg>
        {DRIPS.map(([x, len, w, d, delay], i) => <i key={i} className="sx-drip" style={{ left: `${x}%`, width: w, "--len": `${len}px`, "--d": `${d}s`, "--delay": `${delay + 1.2}s` } as CSSProperties}><b /></i>)}
      </div>
      <svg className="sx-shine" viewBox="0 0 400 40" preserveAspectRatio="none" aria-hidden="true"><path d="M14 9C80 5 150 11 220 7S330 5 386 9" stroke="rgba(255,255,255,.55)" strokeWidth="2.5" strokeLinecap="round" fill="none" /></svg>

      <div className="sx-in">
        <div className="sx-top">
          <span className="sx-tag"><Flame size={13} aria-hidden="true" /> {preview ? "Preview · only Granit gets this (twice)" : `Sauce drop ${n} of ${max}`}</span>
          <button type="button" className="sx-x" onClick={onClose} aria-label="Close"><X size={17} /></button>
        </div>
        <h2 id="sx-title">{done ? <>Target hit. You <em>are</em> the sauce, {name}.</> : <>You <em>have</em> to hit the target today, bro.{name !== "bro" && <span className="sx-name"> Yes, you, {name}.</span>}</>}</h2>
        <p id="sx-sub" className="sx-sub">{done ? `${sent} emails today. Dhurim will hear about this.` : <><b>{TARGET} emails</b> before midnight. You're at <b>{sent}</b>, so <b>{left} to go</b> with {clock} left. {pace}</>}</p>

        <div className="sx-meter" role="img" aria-label={`${sent} of ${TARGET} emails today — heat level ${level}`}>
          <div className="sx-meter-tube"><i className="sx-meter-fill" style={{ "--p": fill } as CSSProperties}><span className="sx-bubble a" /><span className="sx-bubble b" /><span className="sx-bubble c" /></i>
            <Chilli className="sx-meter-pin" style={{ left: `calc(${fill * 100}% - 13px)` }} />
          </div>
          <ol className="sx-meter-scale">{HEAT.map((h, i) => <li key={h} className={Math.min(sent, TARGET) >= i * 10 ? "hit" : ""}><b>{i * 10}</b>{h}</li>)}</ol>
        </div>

        <section className="sx-drop" aria-label="New feature">
          <span className="sx-drop-badge"><i aria-hidden="true" /> New feature dropped</span>
          <h3>Autopilot. This one comes with extra sauce.</h3>
          <p>The CRM now sends your follow-ups for you: at a good hour in their country, only to people who never answered, and it backs off the second someone replies. Your goal fills itself while you sleep.</p>
          <div className="sx-pass"><span>Talk to Dhurim before today ends and give him the password:</span><q>The sauce is hot.</q></div>
        </section>

        <div className="sx-actions">
          <a ref={primary} className="sx-go" href={WHATSAPP} target="_blank" rel="noopener noreferrer"><MessageCircle size={16} aria-hidden="true" /> Tell Dhurim the password</a>
          <button type="button" className="sx-see" onClick={onAutopilot}>Show me the sauce <ArrowRight size={15} aria-hidden="true" /></button>
          <button type="button" className="sx-later" onClick={onClose}>I'm cooking, let me go</button>
        </div>
        <p className="sx-foot">{preview ? "You see this once. Granit sees it on his next two opens of the CRM, until the 18th." : "This shows up twice, so “I didn't see it” is off the menu."}</p>
      </div>
    </div>
  </div>;
}
