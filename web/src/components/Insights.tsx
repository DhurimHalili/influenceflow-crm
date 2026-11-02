import { Clock3, Gauge, TrendingDown, TrendingUp } from "lucide-react";
import { useMemo } from "react";
import { useData } from "../contexts/DataContext";
import { bestTimes, dayName, hoursLabel, longDay, PARTS, PRICE_LABEL, priceIntel, replySpeed } from "../lib/insights";
import { money } from "../lib/utils";
import type { Creator } from "../types";

// Two quick reads on a creator's profile: how fast they answer, and whether
// their price is high or low next to similar creators in your CRM.

export function CreatorInsights({ creator }: { creator: Creator }) {
  const data = useData();
  const speed = useMemo(() => replySpeed(data.emailEvents || [], creator.id), [data.emailEvents, creator.id]);
  const intel = useMemo(() => priceIntel(creator, data.creators), [creator, data.creators]);
  if (!speed?.replies && !intel.length) return null;
  const first = creator.name.split(" ")[0];
  return <section className="detail-section insights-section">
    <div className="detail-section-head"><div><span>Insights</span><h2>Speed & price check</h2></div></div>
    <div className="insight-grid">
      {speed && speed.replies > 0 && <div className="insight-card">
        <span className="insight-icon"><Clock3 size={16} /></span>
        <div><strong>Replies in ~{hoursLabel(speed.medianHours)}</strong>
          <small>{first} answered {speed.replies} of {speed.asked} email round{speed.asked === 1 ? "" : "s"} ({Math.round(speed.replyRate * 100)}%){speed.fastestHours ? ` · fastest ${hoursLabel(speed.fastestHours)}` : ""}.</small>
          {(speed.usualDay || speed.usualPart) && <small>Usually writes {speed.usualDay ? `on ${speed.usualDay}s` : ""}{speed.usualDay && speed.usualPart ? " in the " : speed.usualPart ? "in the " : ""}{speed.usualPart}.</small>}
        </div>
      </div>}
      {intel.map((p) => {
        const high = p.diffPct > 10, low = p.diffPct < -10;
        return <div key={p.key} className={`insight-card ${high ? "is-high" : low ? "is-low" : "is-fair"}`}>
          <span className="insight-icon">{high ? <TrendingUp size={16} /> : low ? <TrendingDown size={16} /> : <Gauge size={16} />}</span>
          <div><strong>{PRICE_LABEL[p.key]} CPM {money(p.cpm)}{Math.abs(p.diffPct) > 10 ? ` — ${Math.abs(p.diffPct)}% ${high ? "above" : "below"}` : " — in line"}</strong>
            <small>vs {p.peers} {p.group} (median {money(p.peerCpm)} per 1,000 views).{high ? " Room to negotiate down." : low ? " A good deal — strong pitch for brands." : ""}</small>
          </div>
        </div>;
      })}
    </div>
  </section>;
}

/** Reports: when your emails get answered. */
export function BestTimeCard() {
  const data = useData();
  const t = useMemo(() => bestTimes(data.emailEvents || []), [data.emailEvents]);
  if (t.total < 20) return null;
  const days = [1, 2, 3, 4, 5, 6, 0];
  const max = Math.max(...t.cells.map((c) => c.rate), 0.01);
  return <div className="dash-panel wide best-time">
    <div className="panel-heading"><div><span>Timing</span><h2>Best time to email</h2></div>{t.best && <p className="best-pill"><Clock3 size={13} /> {longDay(t.best.day)} {PARTS.find((p) => p.key === t.best!.part)?.label.toLowerCase()} · {Math.round(t.best.rate * 100)}% replied</p>}</div>
    <p className="muted-copy">Reply rate within 5 days for {t.total} first emails and new rounds (your overall: {Math.round(t.overall * 100)}%). Darker = more replies. Cells with under 8 emails are faded.</p>
    <div className="time-grid" role="table" aria-label="Reply rate by day and time">
      <div role="row" className="tg-row tg-head"><span />{PARTS.map((p) => <span key={p.key} role="columnheader">{p.label}<small>{p.hint}</small></span>)}</div>
      {days.map((d) => <div role="row" className="tg-row" key={d}><span role="rowheader">{dayName(d)}</span>{PARTS.map((p) => {
        const c = t.cells.find((x) => x.day === d && x.part === p.key);
        const strength = c ? c.rate / max : 0;
        return <span role="cell" key={p.key} className={`tg-cell${!c || c.sent < 8 ? " thin" : ""}${t.best && c === t.best ? " best" : ""}`} style={{ ["--s" as string]: strength.toFixed(2) }} title={c ? `${c.replied}/${c.sent} replied` : "No emails"}>{c ? `${Math.round(c.rate * 100)}%` : "–"}</span>;
      })}</div>)}
    </div>
  </div>;
}
