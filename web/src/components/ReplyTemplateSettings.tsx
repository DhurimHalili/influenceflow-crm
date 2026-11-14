import { Building2, CornerUpLeft, RotateCcw, Save, UserRound } from "lucide-react";
import { useMemo, useRef } from "react";
import { useData } from "../contexts/DataContext";
import { useToast } from "../contexts/ToastContext";
import { useSessionState } from "../hooks/useSessionState";
import { cleanSubject } from "../lib/emailAction";
import { fillReply, readTemplate, REPLY_TEMPLATE_MAX, REPLY_TOKENS, type ReplyTemplate } from "../lib/replyTemplate";
import { Button } from "./ui";

// Settings → Reply template. The words a Reply on a profile starts with, so a
// follow-up is one tap and a few keystrokes. Off and empty until you write it;
// influencers when on, brands only when you tick them too. Edits survive a reload
// (session draft) until you save or discard them.

const TOKEN_HELP: Record<(typeof REPLY_TOKENS)[number], string> = { "{first_name}": "their first name", "{name}": "their full name", "{my_name}": "your name", "{agency}": "your agency" };

export function ReplyTemplateSettings() {
  const data = useData();
  const { toast } = useToast();
  const prefs = data.profile.preferences;
  const saved = readTemplate(prefs?.reply_template);
  const [draft, setDraft] = useSessionState<string | null>(`reply-template.${data.profile.id}`, null);
  const text = draft ?? saved.text;
  const dirty = draft !== null && draft !== saved.text;
  const box = useRef<HTMLTextAreaElement>(null);
  const write = (next: ReplyTemplate, message: string) => { data.updateProfile({ preferences: { ...prefs, reply_template: next } }); toast(message); };

  // A real conversation for the preview when there is one.
  const sample = useMemo(() => {
    const last = [...(data.emailEvents || [])].filter((e) => e.entity_type === "creator" && e.subject).sort((a, b) => b.at.localeCompare(a.at))[0];
    const who = last ? data.creators.find((c) => c.id === last.entity_id) : undefined;
    return { name: who?.name || "Sam Rivera", email: who?.contact_email || "sam@channel.com", subject: cleanSubject(last?.subject || "") || "Collab idea for your channel" };
  }, [data.emailEvents, data.creators]);
  const filled = fillReply(text, { name: sample.name, my_name: data.profile.display_name, agency: prefs?.agency_name });

  const insert = (token: string) => {
    const el = box.current;
    const at = el ? el.selectionStart : text.length, end = el ? el.selectionEnd : text.length;
    const next = (text.slice(0, at) + token + text.slice(end)).slice(0, REPLY_TEMPLATE_MAX);
    setDraft(next);
    requestAnimationFrame(() => { el?.focus(); el?.setSelectionRange(at + token.length, at + token.length); });
  };
  const save = () => {
    const clean = text.replace(/\s+$/, "");
    const empty = !clean.trim();
    // The switch stays as you set it (off until you turn it on); clearing the words turns it off — an empty template never shows.
    const on = empty ? false : saved.on;
    write({ ...saved, text: clean, on, brands: empty ? false : saved.brands }, empty ? "Reply template cleared — replies start blank" : on ? "Reply template saved" : "Reply template saved — switch it on below to use it");
    setDraft(null);
  };
  const canOn = !!saved.text.trim();

  return <section id="reply" className="settings-section"><div className="settings-heading"><span><CornerUpLeft /></span><div><h2>Reply template</h2><p>The words a Reply starts with. Press Reply on a profile and Gmail opens the conversation with this already typed — add a line and send.</p></div></div><div className="settings-body">
    <div className="rt-grid">
      <div className="rt-edit">
        <label className="rt-label" htmlFor="rt-text">Your reply starts with</label>
        <textarea id="rt-text" ref={box} className="rt-text" rows={6} value={text} maxLength={REPLY_TEMPLATE_MAX} placeholder={"Hi {first_name},\n\nJust bringing this back to the top of your inbox."} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === "s") { e.preventDefault(); if (dirty) save(); } }} />
        <div className="rt-tokens" role="group" aria-label="Insert a name">{REPLY_TOKENS.map((t) => <button type="button" key={t} onClick={() => insert(t)} title={`Insert ${TOKEN_HELP[t]}`}>{t}<small>{TOKEN_HELP[t]}</small></button>)}</div>
        <div className="rt-save">
          <Button size="sm" disabled={!dirty} onClick={save}><Save size={14} /> Save template</Button>
          {dirty && <Button size="sm" variant="ghost" onClick={() => setDraft(null)}><RotateCcw size={14} /> Discard</Button>}
          <span className="rt-count">{dirty ? "Unsaved — kept if you reload" : saved.text.trim() ? "Saved" : "Empty — replies start blank"} · {text.length}/{REPLY_TEMPLATE_MAX}</span>
        </div>
      </div>
      <figure className="rt-preview" aria-label="What Reply makes in Gmail">
        <figcaption>What Reply makes in Gmail</figcaption>
        <div className="rt-mail">
          <div className="rt-mail-head"><b>Re: {sample.subject}</b><span>To {sample.email}</span></div>
          <div className={`rt-mail-body${filled.trim() ? "" : " is-empty"}`}>{filled.trim() ? filled : "Blank — you start typing"}<i className="rt-caret" aria-hidden="true" /></div>
          <div className="rt-mail-sig">— your Gmail signature</div>
          <div className="rt-mail-quote">On {new Date().toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" })}, {sample.name} wrote: …</div>
        </div>
      </figure>
    </div>
    <div className="rt-switches">
      <label className={`toggle-row${canOn ? "" : " is-locked"}`}><span><strong><UserRound size={14} aria-hidden="true" /> Use it when I reply to influencers</strong><small>{canOn ? "Reply on an influencer starts with your template." : "Write and save a template first — an empty one never shows."}</small></span><input type="checkbox" role="switch" disabled={!canOn} checked={canOn && saved.on} onChange={(e) => write({ ...saved, on: e.target.checked }, e.target.checked ? "Reply template on for influencers" : "Reply template off — replies start blank")} /></label>
      <label className={`toggle-row${canOn && saved.on ? "" : " is-locked"}`}><span><strong><Building2 size={14} aria-hidden="true" /> Use it for brands too</strong><small>{canOn && saved.on ? "Off by default — brand replies often need different words." : "Turn the template on for influencers first."}</small></span><input type="checkbox" role="switch" disabled={!canOn || !saved.on} checked={canOn && saved.on && saved.brands} onChange={(e) => write({ ...saved, brands: e.target.checked }, e.target.checked ? "Brand replies start with your template too" : "Brand replies start blank")} /></label>
    </div>
    <p className="settings-note">Only Reply uses it — Write email and Write new email always start blank. A draft you already started in that conversation is opened as it is, never overwritten.</p>
  </div></section>;
}
