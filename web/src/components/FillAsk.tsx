import { PlaneTakeoff } from "lucide-react";
import { useState } from "react";
import { useCoach } from "./Coach";
import { Button } from "./ui";
import { useAutopilot, useAutopilotPrefs } from "../contexts/AutopilotContext";
import { useToast } from "../contexts/ToastContext";

/** "Fill the last N too?" — the night fill stopped at your ceiling but the goal isn't met. Shown here and as a banner on every page. */
export function FillAsk({ short, banner = false }: { short: number; banner?: boolean }) {
  const auto = useAutopilot();
  const { toast } = useToast();
  const { stats } = useCoach();
  const ap = useAutopilotPrefs();
  const [busy, setBusy] = useState(false);
  const more = async () => {
    setBusy(true);
    const r = await auto.fillMore();
    setBusy(false);
    toast(r.ok ? (r.data.queued ? `${r.data.queued} more on autopilot tonight` : "Nothing more fits before midnight") : r.message, r.ok ? "success" : "error");
  };
  return <div className={banner ? "ap-banner" : "ap-ask"} role="status">
    <PlaneTakeoff size={banner ? 18 : 16} aria-hidden="true" />
    <p><b>{short} short of your goal of {stats.goal}.</b> {ap.cap ? `Autopilot stopped at your limit of ${ap.cap}` : "Autopilot kept to the number you started"} — fill those {short} too?</p>
    <div>
      <Button size="sm" onClick={() => void more()} loading={busy}>Fill {short} more</Button>
      <Button size="sm" variant="ghost" onClick={() => void auto.fillSkip().then(() => toast("Okay — the rest stays yours tonight", "info"))}>Not today</Button>
    </div>
  </div>;
}
