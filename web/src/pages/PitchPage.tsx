import { ArrowLeft, BadgeCheck, MapPin, Printer } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Link, useSearchParams } from "react-router-dom";
import { SocialBadge } from "../components/SocialIcon";
import { LogoMark } from "../components/ui";
import { useData } from "../contexts/DataContext";
import { RATE_FIELDS } from "../lib/prefs";
import { compact, initials, malePct, money, pctText } from "../lib/utils";
import type { Creator, RateCard } from "../types";

// A brand-ready pitch: pick creators (Influencers → select → "Pitch PDF"),
// set your markup, print to PDF. Shows only VERIFIED audience numbers (from
// kits/screenshots), never what a creator merely claimed — and your marked-up
// prices, never what the creator charges you.

type Key = keyof RateCard;
const roundUp = (v: number) => (v >= 1000 ? Math.ceil(v / 50) * 50 : Math.ceil(v / 5) * 5);
const viewsOf = (c: Creator) => c.audience?.verified?.avg_views || c.avg_views || 0;

export default function PitchPage() {
  const data = useData();
  const [params] = useSearchParams();
  const ids = useMemo(() => (params.get("ids") || "").split(",").filter((x) => /^[\w-]{6,64}$/.test(x)).slice(0, 12), [params]);
  const creators = ids.map((id) => data.creators.find((c) => c.id === id)).filter((c): c is Creator => !!c);
  const agency = data.profile.preferences.agency_name || data.profile.display_name;
  const [brand, setBrand] = useState(params.get("brand") || "");
  const [markup, setMarkup] = useState(25);
  const offered = RATE_FIELDS.filter((f) => f.group !== "addon" && creators.some((c) => (c.rates?.[f.key] || 0) > 0));
  const [keys, setKeys] = useState<Key[]>(() => ["video", "dedicated", "short"]);
  const [note, setNote] = useState("");
  const shown = offered.filter((f) => keys.includes(f.key));
  const price = (c: Creator, k: Key) => { const r = c.rates?.[k] || 0; return r ? roundUp(r * (1 + markup / 100)) : 0; };

  useEffect(() => {
    document.body.classList.add("pitch-open");
    const title = document.title;
    document.title = `${brand ? `${brand} · ` : ""}Creator pitch — ${agency}`;
    return () => { document.body.classList.remove("pitch-open"); document.title = title; };
  }, [brand, agency]);

  const total = (k: Key) => creators.reduce((s, c) => s + price(c, k), 0);
  const views = creators.reduce((s, c) => s + viewsOf(c), 0);
  return createPortal(<div className="pitch-root">
    <div className="pitch-controls">
      <Link to="/app/influencers" className="btn btn-ghost btn-sm"><ArrowLeft size={14} /> Back</Link>
      <label>Brand<input value={brand} onChange={(e) => setBrand(e.target.value.slice(0, 60))} placeholder="Who is it for?" /></label>
      <label>Your markup<span className="pitch-markup"><input type="number" min={0} max={300} value={markup} onChange={(e) => setMarkup(Math.max(0, Math.min(300, Number(e.target.value) || 0)))} />%</span></label>
      <div className="pitch-formats" role="group" aria-label="Prices to show">{offered.map((f) => <label key={f.key} className={keys.includes(f.key) ? "on" : ""}><input type="checkbox" checked={keys.includes(f.key)} onChange={(e) => setKeys((k) => (e.target.checked ? [...k, f.key] : k.filter((x) => x !== f.key)))} />{f.short}</label>)}</div>
      <label className="pitch-note-in">Note<input value={note} onChange={(e) => setNote(e.target.value.slice(0, 240))} placeholder="Why these creators (optional)" /></label>
      <button type="button" className="btn btn-primary btn-sm" onClick={() => window.print()}><Printer size={14} /> Save PDF</button>
    </div>
    <p className="pitch-private">Brands see your prices with the markup included — what each creator charges you never appears. Only audience numbers verified from a media kit or stats screenshot are shown.</p>

    <article className="pitch-doc">
      <header className="pitch-head">
        <div><span className="pitch-eyebrow">{agency} · Creator shortlist</span><h1>{brand ? `Creators for ${brand}` : "Creator shortlist"}</h1>{note && <p className="pitch-note">{note}</p>}</div>
        <div className="pitch-sum"><div><b>{creators.length}</b><span>creator{creators.length === 1 ? "" : "s"}</span></div>{views > 0 && <div><b>{compact(views)}</b><span>avg views combined</span></div>}{shown[0] && total(shown[0].key) > 0 && <div><b>{money(total(shown[0].key))}</b><span>{shown[0].short.toLowerCase()} total</span></div>}</div>
      </header>
      {!creators.length ? <p className="pitch-empty">No creators picked. Go to Influencers, tick the ones you want and press “Pitch PDF”.</p> : creators.map((c) => {
        const v = c.audience?.verified;
        const avg = viewsOf(c);
        return <section key={c.id} className="pitch-card">
          <div className="pitch-id"><span className="pitch-avatar" aria-hidden="true">{initials(c.name)}</span><div><h2>{c.name}</h2><p>{[c.niche, c.platform].filter(Boolean).join(" · ")}{c.country && <span><MapPin size={12} /> {c.country}</span>}</p>
            {c.socials?.length > 0 && <div className="pitch-socials">{c.socials.slice(0, 4).map((s) => <span key={s.url}><SocialBadge platform={s.platform} />{s.followers ? compact(s.followers) : s.handle ? `@${s.handle}` : ""}</span>)}</div>}</div></div>
          <div className="pitch-stats">
            {avg > 0 && <div><b>{compact(avg)}</b><span>avg views</span></div>}
            {(v?.engagement_rate || c.engagement_rate) > 0 && <div><b>{v?.engagement_rate || c.engagement_rate}%</b><span>engagement</span></div>}
            {v?.top_countries?.[0] && <div><b>{pctText(v.top_countries[0].pct)}%</b><span>{v.top_countries[0].country}</span></div>}
            {v && v.gender_female_pct > 0 && <div><b>{pctText(malePct(v))}/{pctText(v.gender_female_pct)}</b><span>male / female</span></div>}
          </div>
          {v && (v.top_countries.length > 0 || v.age_ranges.length > 0) && <div className="pitch-aud"><span className="pitch-verified"><BadgeCheck size={12} /> Verified audience</span>
            {v.top_countries.length > 0 && <p><em>Countries</em>{v.top_countries.slice(0, 3).map((x) => `${x.country} ${pctText(x.pct)}%`).join(" · ")}</p>}
            {v.age_ranges.length > 0 && <p><em>Ages</em>{[...v.age_ranges].sort((a, b) => b.pct - a.pct).slice(0, 3).map((x) => `${x.range} ${pctText(x.pct)}%`).join(" · ")}</p>}
          </div>}
          {shown.some((f) => price(c, f.key) > 0) && <div className="pitch-prices">{shown.filter((f) => price(c, f.key) > 0).map((f) => <div key={f.key}><span>{f.label}</span><b>{money(price(c, f.key))}</b>{avg > 0 && f.group === "video" && <small>{money((price(c, f.key) / avg) * 1000)} CPM</small>}</div>)}</div>}
        </section>;
      })}
      <footer className="pitch-foot"><span>Prices in {data.profile.preferences.currency || "USD"}, per deliverable. Valid 30 days.</span><span className="kit-brand"><LogoMark size={14} still /> {agency}</span></footer>
    </article>
  </div>, document.body);
}
