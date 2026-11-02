import { Mail, MapPin, Printer } from "lucide-react";
import { useEffect, useState } from "react";
import { useLocation, useParams } from "react-router-dom";
import { SocialBadge } from "../components/SocialIcon";
import { LogoMark } from "../components/ui";
import { fetchPublicKit, type KitData } from "../lib/mediaKit";
import { SOCIAL_META, socialLabel } from "../lib/socials";
import { compact, initials } from "../lib/utils";

// The public media kit brands open. Read-only, no login, no CRM data beyond
// the snapshot the agency published.

const fmtMoney = (value: number, currency: string) => {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: currency || "USD", maximumFractionDigits: 0 }).format(value);
  } catch {
    return `${value}`;
  }
};

export default function MediaKitPage() {
  const { slug = "" } = useParams();
  const [kit, setKit] = useState<KitData | null | undefined>(undefined);
  useEffect(() => {
    let alive = true;
    void fetchPublicKit(slug).then((data) => alive && setKit(data));
    return () => {
      alive = false;
    };
  }, [slug]);
  const location = useLocation();
  useEffect(() => {
    if (kit) document.title = `${kit.name} · Media kit`;
    // "Download PDF" from the CRM opens the kit with ?print=1.
    if (kit && new URLSearchParams(location.search).get("print") === "1") window.setTimeout(() => window.print(), 500);
  }, [kit, location.search]);

  if (kit === undefined) return <div className="kit-page kit-loading"><LogoMark size={36} /></div>;
  if (!kit) return <div className="kit-page kit-missing"><LogoMark size={36} /><h1>This media kit isn't available</h1><p>The link may have been taken offline. Ask the agency for a fresh one.</p></div>;

  const contact = kit.contact_email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(kit.contact_email) ? kit.contact_email : "";
  const deliverables = kit.rates.filter((r) => !r.addon);
  const addons = kit.rates.filter((r) => r.addon);
  return <div className="kit-page">
    <header className="kit-hero">
      <div className="kit-avatar" aria-hidden="true">{initials(kit.name)}</div>
      <div className="kit-id">
        <span className="kit-eyebrow">Media kit{kit.agency ? ` · ${kit.agency}` : ""}</span>
        <h1>{kit.name}</h1>
        <p>{[kit.niche && `${kit.niche} creator`, kit.platform].filter(Boolean).join(" · ")}{kit.country && <span className="kit-where"><MapPin size={13} /> {kit.country}</span>}</p>
      </div>
      <div className="kit-actions">
        {contact && <a className="kit-cta" href={`mailto:${contact}?subject=${encodeURIComponent(`Partnership with ${kit.name}`)}`}><Mail size={15} /> Work with {kit.name.split(" ")[0]}</a>}
        <button type="button" className="kit-print" onClick={() => window.print()}><Printer size={15} /> Save PDF</button>
      </div>
    </header>

    <section className="kit-stats">
      {kit.followers > 0 && <div><strong>{compact(kit.followers)}</strong><span>Total followers</span></div>}
      {kit.avg_views > 0 && <div><strong>{compact(kit.avg_views)}</strong><span>Average views</span></div>}
      {kit.engagement_rate > 0 && <div><strong>{kit.engagement_rate}%</strong><span>Engagement rate</span></div>}
      {kit.socials.length > 0 && <div><strong>{kit.socials.length}</strong><span>Platform{kit.socials.length === 1 ? "" : "s"}</span></div>}
    </section>

    {kit.audience && <section className="kit-block"><h2>Audience <small className="kit-verified">Verified from {kit.audience.source}</small></h2><div className="kit-audience">
      {kit.audience.top_countries.length > 0 && <div className="kit-aud-col"><span>Top countries</span>{kit.audience.top_countries.map((c) => <div key={c.country} className="kit-bar"><em>{c.country}</em><i><b style={{ width: `${Math.min(100, c.pct)}%` }} /></i><strong>{Math.round(c.pct)}%</strong></div>)}</div>}
      {kit.audience.age_ranges.length > 0 && <div className="kit-aud-col"><span>Age</span>{kit.audience.age_ranges.map((a) => <div key={a.range} className="kit-bar"><em>{a.range}</em><i><b style={{ width: `${Math.min(100, a.pct)}%` }} /></i><strong>{Math.round(a.pct)}%</strong></div>)}</div>}
      {kit.audience.gender_female_pct > 0 && <div className="kit-aud-col"><span>Gender</span><div className="kit-gender"><i><b style={{ width: `${kit.audience.gender_female_pct}%` }} /></i><small><em>Female {Math.round(kit.audience.gender_female_pct)}%</em><em>Male {Math.round(100 - kit.audience.gender_female_pct)}%</em></small></div></div>}
    </div></section>}

    {kit.about && <section className="kit-block"><h2>About</h2><p className="kit-about">{kit.about}</p></section>}

    {kit.socials.length > 0 && <section className="kit-block"><h2>Channels</h2><div className="kit-socials">{kit.socials.map((s) => <a key={s.url} href={s.url} target="_blank" rel="noopener noreferrer nofollow" className="kit-social"><SocialBadge platform={s.platform} size={34} /><span><strong>{socialLabel({ ...s })}</strong><small>{SOCIAL_META[s.platform]?.label || s.platform}</small></span>{s.followers > 0 && <b>{compact(s.followers)}<small>followers</small></b>}</a>)}</div></section>}

    {deliverables.length > 0 && <section className="kit-block"><h2>Rates</h2><div className="kit-rates">{deliverables.map((r) => <div key={r.label}><span>{r.label}</span><strong>{fmtMoney(r.value, kit.currency)}</strong></div>)}</div>{addons.length > 0 && <div className="kit-addons"><span>Add-ons</span>{addons.map((r) => <em key={r.label}>{r.label} +{fmtMoney(r.value, kit.currency)}</em>)}</div>}</section>}

    <footer className="kit-foot"><span>Updated {new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", year: "numeric" }).format(new Date(kit.updated_at))}</span><span className="kit-brand"><LogoMark size={16} still /> InfluenceFlow</span></footer>
  </div>;
}
