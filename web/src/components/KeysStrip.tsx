import { ArrowRight, BatteryCharging, Check, X } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { useData } from "../contexts/DataContext";
import { readiness, useKeyStatus } from "../lib/apiKeys";
import { hasSupabase } from "../lib/supabase";

// A calm, persistent reminder on the dashboard (and the Guide) for a member whose CRM isn't on their own keys
// yet. Hidden for the owner (the workspace keys are theirs), once all four are in, or for the rest of the
// day after "Not now".

const hideKey = (id: string) => `if.keys-strip.${id}.${new Date().toDateString()}`;

export function KeysStrip({ place = "dashboard" }: { place?: "dashboard" | "guide" }) {
  const data = useData();
  const cloud = hasSupabase && /^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(data.profile.id || "") && !data.demoSeeded;
  const { status } = useKeyStatus(cloud && data.ready);
  const [hidden, setHidden] = useState(() => { try { return place === "dashboard" && !!localStorage.getItem(hideKey(data.profile.id)); } catch { return false; } });
  const ready = readiness(status);
  if (!cloud || !status || status.owner || ready.all || hidden) return null;
  return <section className={`keys-strip ${place}`} aria-label="Finish setting up your keys">
    <span className="keys-strip-ico" aria-hidden="true"><BatteryCharging size={18} /></span>
    <div className="keys-strip-main">
      <b>Your CRM runs on {ready.done} of 4 of your keys.</b>
      <span>Emails, follow-ups and statuses work now — {ready.items.filter((i) => !i.done).map((i) => i.label.replace(/ key$/, "")).join(", ")} still wait{ready.done === 3 ? "s" : ""} for yours.</span>
      <ul>{ready.items.map((i) => <li key={i.id} className={i.done ? "done" : ""}>{i.done ? <Check size={11} aria-hidden="true" /> : <i aria-hidden="true" />}{i.label.replace(/ key$/, "")}</li>)}</ul>
    </div>
    <Link to="/app/setup" className="keys-strip-go">Finish setup <ArrowRight size={14} aria-hidden="true" /></Link>
    {place === "dashboard" && <button type="button" className="keys-strip-x" onClick={() => { try { localStorage.setItem(hideKey(data.profile.id), "1"); } catch { /* private mode */ } setHidden(true); }} aria-label="Hide until tomorrow" title="Hide until tomorrow"><X size={15} /></button>}
  </section>;
}
