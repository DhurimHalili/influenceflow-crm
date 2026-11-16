import { Copy, Layers, Plus, RotateCcw, Save, Trash2, Wand2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useData } from "../contexts/DataContext";
import { useToast } from "../contexts/ToastContext";
import { useSessionState } from "../hooks/useSessionState";
import { fillTemplate, newTemplateId, readTemplates, ROUNDS, TEMPLATE_MAX, TEMPLATES_PER_ROUND, NAME_MAX, type Round, type TemplateBook } from "../lib/autopilot";
import { ordinal } from "../lib/followupEngine";
import { REPLY_TOKENS } from "../lib/replyTemplate";
import { Button } from "./ui";

// Settings → Follow-up templates: your own words for the 1st–4th follow-up,
// several of each. Autopilot (and "Send follow-up" on a profile) uses them only
// for influencers who never answered — spread evenly, the best fit for each
// email first. Edits survive a reload (session draft) until saved or discarded.

const TIPS: Record<Round, { lead: string; example: string }> = {
  1: { lead: "Follows your first email. Don't ask its question again in the same words — if it asked “Are you interested?”, ask “Would you be interested…”. The CRM picks the template that fits each email.", example: "Hi {first_name},\n\nIt seems you missed our email — would you be interested in this opportunity?" },
  2: { lead: "A second, lighter nudge. Short reads human.", example: "Hi {first_name},\n\nJust bringing this back to the top of your inbox — happy to share the details." },
  3: { lead: "Often a simple question that's easy to answer.", example: "Hi {first_name},\n\nIs this a bad time?" },
  4: { lead: "The last one in this thread. It should answer your 3rd — after “Is this a bad time?”: “Looks like it might — I'll come back another time.”", example: "Hi {first_name},\n\nLooks like it might — I'll come back another time." },
};
const TOKEN_HELP: Record<(typeof REPLY_TOKENS)[number], string> = { "{first_name}": "first name", "{name}": "full name", "{my_name}": "your name", "{agency}": "your agency" };
const same = (a: TemplateBook, b: TemplateBook) => JSON.stringify(a) === JSON.stringify(b);

export function FollowupTemplates({ readyByRound }: { readyByRound?: Record<number, number> }) {
  const data = useData();
  const { toast } = useToast();
  const prefs = data.profile.preferences;
  const saved = useMemo(() => readTemplates(prefs?.followup_templates), [prefs?.followup_templates]);
  const [draft, setDraft] = useSessionState<TemplateBook | null>(`followup-templates.${data.profile.id}`, null);
  const book = draft ? readTemplatesLoose(draft) : saved;
  const dirty = !!draft && !same(readTemplates(draft), saved);
  const [round, setRound] = useSessionState<Round>("followup-templates.round", 1);
  const [focus, setFocus] = useState<string>("");
  const boxes = useRef(new Map<string, HTMLTextAreaElement>());
  const list = book[round];
  const sample = { name: "Sam Rivera", my_name: data.profile.display_name, agency: prefs?.agency_name };

  const edit = (next: TemplateBook) => setDraft(next);
  const patch = (id: string, change: Partial<{ name: string; text: string }>) => edit({ ...book, [round]: book[round].map((t) => (t.id === id ? { ...t, ...change } : t)) });
  const add = (text = "") => {
    if (list.length >= TEMPLATES_PER_ROUND) { toast(`${TEMPLATES_PER_ROUND} is the most per follow-up`, "info"); return; }
    const id = newTemplateId();
    edit({ ...book, [round]: [...book[round], { id, name: `${ordinal(round)} · ${letter(book[round].length)}`, text }] });
    setFocus(id);
  };
  const remove = (id: string) => {
    const before = book;
    edit({ ...book, [round]: book[round].filter((t) => t.id !== id) });
    toast("Template removed — save to keep it that way", "info", { label: "Undo", run: () => setDraft(before) });
  };
  const duplicate = (id: string) => {
    const t = book[round].find((x) => x.id === id);
    if (!t || list.length >= TEMPLATES_PER_ROUND) return;
    const copy = { id: newTemplateId(), name: `${t.name} (copy)`.slice(0, NAME_MAX), text: t.text };
    const at = book[round].findIndex((x) => x.id === id);
    edit({ ...book, [round]: [...book[round].slice(0, at + 1), copy, ...book[round].slice(at + 1)] });
    setFocus(copy.id);
  };
  const insert = (id: string, token: string) => {
    const el = boxes.current.get(id);
    const t = book[round].find((x) => x.id === id);
    if (!t) return;
    const a = el ? el.selectionStart : t.text.length, b = el ? el.selectionEnd : t.text.length;
    patch(id, { text: (t.text.slice(0, a) + token + t.text.slice(b)).slice(0, TEMPLATE_MAX) });
    requestAnimationFrame(() => { el?.focus(); el?.setSelectionRange(a + token.length, a + token.length); });
  };
  const save = () => {
    const clean = readTemplates(book);
    data.updateProfile({ preferences: { ...prefs, followup_templates: clean } });
    setDraft(null);
    const n = ROUNDS.reduce((s, r) => s + clean[r].length, 0);
    toast(n ? `Follow-up templates saved · ${n} in all` : "Follow-up templates cleared", "success");
  };
  useEffect(() => { if (focus) requestAnimationFrame(() => { boxes.current.get(focus)?.focus(); setFocus(""); }); }, [focus]);

  const due = readyByRound?.[round] || 0;
  const spread = list.filter((t) => t.text.trim()).length;
  return <section id="follow-templates" className="settings-section" onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === "s" && dirty) { e.preventDefault(); save(); } }}>
    <div className="settings-heading"><span><Layers /></span><div><h2>Follow-up templates</h2><p>Your own words for each follow-up. <Link to="/app/autopilot">Autopilot</Link> sends them only to influencers who never answered — never one text to everyone.</p></div></div>
    <div className="settings-body ft">
      <div className="ft-rounds" role="tablist" aria-label="Which follow-up">
        {ROUNDS.map((r) => {
          const n = book[r].length;
          return <button key={r} type="button" role="tab" aria-selected={round === r} className={`ft-round${round === r ? " on" : ""}${n ? "" : " empty"}`} onClick={() => setRound(r)}>
            <b>{ordinal(r)}</b><span>follow-up</span><em>{n ? `${n} template${n === 1 ? "" : "s"}` : "none yet"}</em>
          </button>;
        })}
      </div>
      <p className="ft-tip"><Wand2 size={14} aria-hidden="true" />{TIPS[round].lead}</p>
      {spread > 0 && <p className={`ft-spread${spread < 3 ? " low" : ""}`}>{due > 0 ? <>{due} {ordinal(round)} follow-up{due === 1 ? " is" : "s are"} due today → each template goes to about <b>{Math.ceil(due / spread)}</b> {Math.ceil(due / spread) === 1 ? "person" : "people"}.</> : <>{spread} template{spread === 1 ? "" : "s"} for the {ordinal(round)} follow-up.</>} {spread < 3 && "Three or more keep the same words from going to many people at once — that's what spam filters notice."}</p>}
      <div className="ft-list">
        {list.map((t) => {
          const filled = fillTemplate(t.text, sample);
          return <article key={t.id} className="ft-card">
            <header>
              <input className="ft-name" value={t.name} maxLength={NAME_MAX} aria-label="Template name" onChange={(e) => patch(t.id, { name: e.target.value })} />
              <span className="ft-actions">
                <button type="button" onClick={() => duplicate(t.id)} aria-label={`Duplicate ${t.name}`} title="Duplicate — then reword it"><Copy size={14} /></button>
                <button type="button" onClick={() => remove(t.id)} aria-label={`Remove ${t.name}`} title="Remove"><Trash2 size={14} /></button>
              </span>
            </header>
            <textarea ref={(el) => { if (el) boxes.current.set(t.id, el); else boxes.current.delete(t.id); }} className="ft-text" rows={Math.min(9, Math.max(3, t.text.split("\n").length + 1))} value={t.text} maxLength={TEMPLATE_MAX} placeholder={TIPS[round].example} aria-label={`${t.name} text`} onChange={(e) => patch(t.id, { text: e.target.value })} />
            <footer>
              <span className="ft-tokens" role="group" aria-label="Insert a name">{REPLY_TOKENS.map((k) => <button type="button" key={k} onClick={() => insert(t.id, k)} title={`Insert ${TOKEN_HELP[k]}`}>{k}</button>)}</span>
              <small className={t.text.trim() ? "" : "warn"}>{t.text.trim() ? `${t.text.length}/${TEMPLATE_MAX}` : "Empty — it won't be used"}</small>
            </footer>
            {t.text.trim() && filled !== t.text && <p className="ft-preview" aria-label="How it reads"><span>Reads as</span>{filled.split("\n").filter(Boolean).slice(0, 3).join(" ")}</p>}
          </article>;
        })}
        {!list.length && <div className="ft-empty">
          <b>No {ordinal(round)} follow-ups yet</b>
          <p>Autopilot skips anyone whose {ordinal(round)} follow-up is due until there's one here.</p>
          <Button size="sm" onClick={() => add(TIPS[round].example)}><Plus size={14} /> Start from an example</Button>
        </div>}
        {list.length > 0 && list.length < TEMPLATES_PER_ROUND && <button type="button" className="ft-add" onClick={() => add()}><Plus size={15} /> Add another way to say it</button>}
      </div>
      <div className={`ft-save${dirty ? " dirty" : ""}`}>
        <Button size="sm" disabled={!dirty} onClick={save}><Save size={14} /> Save templates</Button>
        {dirty && <Button size="sm" variant="ghost" onClick={() => setDraft(null)}><RotateCcw size={14} /> Discard</Button>}
        <span>{dirty ? "Unsaved — kept if you reload" : "Saved"} · {ROUNDS.map((r) => `${ordinal(r)} ${book[r].length}`).join(" · ")}</span>
      </div>
    </div>
  </section>;
}

const letter = (i: number) => String.fromCharCode(65 + (i % 26));
/** A draft keeps empty / half-written cards while you type (the saved version drops them). */
function readTemplatesLoose(v: TemplateBook): TemplateBook {
  const out = { 1: [], 2: [], 3: [], 4: [] } as TemplateBook;
  for (const r of ROUNDS) out[r] = Array.isArray(v?.[r]) ? v[r].filter((t) => t && typeof t.id === "string").map((t) => ({ id: t.id, name: String(t.name ?? ""), text: String(t.text ?? "").slice(0, TEMPLATE_MAX) })) : [];
  return out;
}
