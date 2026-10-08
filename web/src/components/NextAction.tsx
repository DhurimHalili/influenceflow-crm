import { CalendarPlus, CheckCircle2, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { dueLabel, isPastDay, isTodayDay, today } from "../lib/utils";
import { Button } from "./ui";

type Props = {
  recordId: string;
  kind: "creator" | "brand";
  action: string;
  due: string | null;
  onChange: (value: { next_action: string; next_action_date: string | null }) => void;
  onComplete: () => void;
};

const QUICK = [
  { label: "Today", days: 0 },
  { label: "Tomorrow", days: 1 },
  { label: "In 3 days", days: 3 },
  { label: "Next week", days: 7 },
];

const plusDays = (days: number) => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

// Next action + due date. Text commits on blur / Enter (not per keystroke, so
// the audit trail gets one entry, not one per letter). A due date puts the
// action on the calendar automatically.
export function NextActionEditor({ recordId, kind, action, due, onChange, onComplete }: Props) {
  const [text, setText] = useState(action);
  useEffect(() => setText(action), [action, recordId]);
  const commit = (next: { next_action?: string; next_action_date?: string | null }) => {
    const value = { next_action: (next.next_action ?? text).trim(), next_action_date: next.next_action_date !== undefined ? next.next_action_date : due };
    if (value.next_action === action && value.next_action_date === due) return;
    onChange(value);
  };
  const state = due ? (isPastDay(due) ? "overdue" : isTodayDay(due) ? "today" : "upcoming") : "none";
  return (
    <div className={`next-action-editor state-${state}`}>
      <label className="field-wrap">
        <span className="field-label">Next action</span>
        <input
          className="field"
          value={text}
          onChange={(event) => setText(event.target.value)}
          onBlur={() => commit({})}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              (event.target as HTMLInputElement).blur();
            }
          }}
          placeholder="Send rate card, follow up on proposal, book a call…"
        />
      </label>
      <div className="next-action-due">
        <label className="field-wrap">
          <span className="field-label">Due date</span>
          <input className="field" type="date" value={due || ""} onChange={(event) => commit({ next_action_date: event.target.value || null })} />
        </label>
        <div className="due-quick">
          {QUICK.map((q) => (
            <button type="button" key={q.label} className={due === plusDays(q.days) ? "active" : ""} onClick={() => commit({ next_action_date: plusDays(q.days) })}>
              {q.label}
            </button>
          ))}
          {due && (
            <button type="button" className="clear" onClick={() => commit({ next_action_date: null })} aria-label="Remove due date">
              <X size={12} />
            </button>
          )}
        </div>
      </div>
      <div className="next-action-foot">
        <span className={`due-pill due-${state}`}>
          {due ? <>{dueLabel(due)} · on your calendar</> : "No due date — add one to see it on the calendar"}
        </span>
        <div>
          <Link className="btn btn-ghost btn-sm" to={`/app/calendar?new=1&kind=task&type=${kind}&id=${recordId}&date=${due || today()}&title=${encodeURIComponent(text)}`}>
            <CalendarPlus size={14} /> Schedule with time
          </Link>
          <Button type="button" size="sm" variant="secondary" disabled={!action && !due} onClick={onComplete}>
            <CheckCircle2 size={14} /> Mark done
          </Button>
        </div>
      </div>
    </div>
  );
}
