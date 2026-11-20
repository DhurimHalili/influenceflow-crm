import { ArrowRight, MessageCircleQuestion, Unlink } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { ordinal } from "../lib/followupEngine";
import { ASKS, type QuestionKind } from "../lib/followupPairing";

// Autopilot's loudest warning (owner's rule): people whose last email asked something none of the next
// follow-up's templates can answer are NEVER sent a template that doesn't fit ("Should I check back later?" →
// "Seems like it might be."). They wait here, grouped by the question, until an answer exists.

export type Unanswered = { id: string; name: string; round: number; asked: string; kind?: QuestionKind };

/** Opens Settings → Follow-up templates on that follow-up. */
export function useOpenTemplates() {
  const navigate = useNavigate();
  return (round: number) => {
    try { sessionStorage.setItem("if.session.followup-templates.round", JSON.stringify(round)); } catch { /* opens on the last tab */ }
    navigate("/app/settings#follow-templates");
  };
}

export function AnswerGuard({ people }: { people: Unanswered[] }) {
  const open = useOpenTemplates();
  if (!people.length) return null;
  // One line per person: the plan read their full email, so its verdict wins over Gmail's preview.
  const byId = new Map<string, Unanswered>();
  for (const p of people) byId.set(p.id, p);
  const groups = new Map<string, { asked: string; kind?: QuestionKind; round: number; names: Unanswered[] }>();
  for (const p of byId.values()) {
    const key = `${p.round}|${(p.asked || "").toLowerCase()}`;
    const g = groups.get(key) || { asked: p.asked, kind: p.kind, round: p.round, names: [] };
    if (!g.names.some((x) => x.id === p.id)) g.names.push(p);
    groups.set(key, g);
  }
  const n = byId.size;
  return <section className="ag" role="alert" aria-labelledby="ag-title">
    <div className="ag-head">
      <span className="ag-ico" aria-hidden="true"><Unlink size={20} /></span>
      <div>
        <h2 id="ag-title">{n === 1 ? "1 person can't be scheduled" : `${n} people can't be scheduled`}</h2>
        <p>Their last email asked a question that none of your next follow-ups can answer. Autopilot won't send them something that doesn't make sense, so they wait here until you add an answer.</p>
      </div>
    </div>
    <div className="ag-list">{[...groups.values()].map((g) => <article key={`${g.round}|${g.asked}`} className="ag-item">
      <div className="ag-chat" aria-hidden="true">
        <span className="ag-bubble you"><MessageCircleQuestion size={13} />{g.asked || `Your ${ordinal(g.round - 1)}, with no question`}</span>
        <span className="ag-bubble gap">{g.asked ? `No ${ordinal(g.round)} follow-up answers this` : `Every ${ordinal(g.round)} you have answers a question`}</span>
      </div>
      <div className="ag-body">
        <b>{g.names.length} waiting for a {ordinal(g.round)} follow-up</b>
        <small>{g.asked ? `Your ${ordinal(g.round - 1)} ${g.kind ? ASKS[g.kind] : "asks a question"}.` : `Their ${ordinal(g.round - 1)} didn't ask anything, so a ${ordinal(g.round)} like “Seems like it is.” would make no sense. Add one that works on its own, like “No worries. I'll come back another time.”`} {g.names.slice(0, 4).map((x) => x.name).join(", ")}{g.names.length > 4 ? ` and ${g.names.length - 4} more` : ""}.</small>
      </div>
      <button type="button" className="btn btn-primary btn-sm ag-fix" onClick={() => open(g.round)}>Add the answer <ArrowRight size={14} aria-hidden="true" /></button>
    </article>)}</div>
  </section>;
}
