import { Check, Copy, ExternalLink, FileText, Mail, Save, Send, Trash2, Wand2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useData } from "../contexts/DataContext";
import { useToast } from "../contexts/ToastContext";
import { fillTemplate, gmailComposeUrl, mailtoUrl, relativeTime, TEMPLATE_TOKENS, uid, unfilledTokens } from "../lib/utils";
import { Button } from "./ui";

type Props = {
  /** Record the draft belongs to; switching records resets the editor. */
  recordId: string;
  recipient: string;
  recipientName: string;
  subject: string;
  body: string;
  /** Values for {first_name}, {niche}, ... when a template is applied. */
  vars: Record<string, string>;
  onSave: (subject: string, body: string, explicit: boolean) => void;
  /** Called after "Mark as sent" so the record can move to Contacted / log a follow-up. */
  onSent: () => void;
  sentLabel: string;
};

const AUTOSAVE_MS = 1200;

export function EmailDraftPanel({ recordId, recipient, recipientName, subject, body, vars: recordVars, onSave, onSent, sentLabel }: Props) {
  const data = useData();
  // Profile-level tokens ({agency}, {signature}, {my_name}) apply everywhere.
  const prefs = data.profile.preferences;
  const vars: Record<string, string> = { agency: prefs?.agency_name || "", signature: prefs?.email_signature || "", ...recordVars, my_name: recordVars.my_name || data.profile.display_name };
  const { toast } = useToast();
  const [draftSubject, setDraftSubject] = useState(subject);
  const [draftBody, setDraftBody] = useState(body);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [opened, setOpened] = useState(false);
  const [templateId, setTemplateId] = useState("");
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const subjectRef = useRef<HTMLInputElement>(null);
  const lastFocused = useRef<"subject" | "body">("body");
  const dirty = draftSubject !== subject || draftBody !== body;

  // Pick up saved values that arrive later (cloud load, another tab) as long
  // as the user is not in the middle of editing.
  useEffect(() => {
    if (!dirty) {
      setDraftSubject(subject);
      setDraftBody(body);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subject, body, recordId]);

  // Autosave quietly while typing: a draft is never lost to a closed tab.
  useEffect(() => {
    if (!dirty) return;
    const timer = window.setTimeout(() => {
      onSave(draftSubject, draftBody, false);
      setSavedAt(new Date().toISOString());
    }, AUTOSAVE_MS);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftSubject, draftBody]);

  // Leaving the page mid-sentence still saves what was typed.
  const latest = useRef({ draftSubject, draftBody, dirty, onSave });
  latest.current = { draftSubject, draftBody, dirty, onSave };
  useEffect(
    () => () => {
      const { dirty: pending, draftSubject: s, draftBody: b, onSave: save } = latest.current;
      if (pending) save(s, b, false);
    },
    [],
  );

  const saveNow = () => {
    onSave(draftSubject, draftBody, true);
    setSavedAt(new Date().toISOString());
    toast("Draft saved");
  };

  const templates = data.profile.email_templates || [];
  const applyTemplate = (id: string) => {
    setTemplateId(id);
    const template = templates.find((t) => t.id === id);
    if (!template) return;
    if ((draftSubject.trim() || draftBody.trim()) && !confirm(`Replace the current draft with "${template.name}"?`)) {
      setTemplateId("");
      return;
    }
    setDraftSubject(fillTemplate(template.subject, vars));
    setDraftBody(fillTemplate(template.body, vars));
    setTemplateId("");
    toast(`Template "${template.name}" applied`);
  };

  const saveAsTemplate = () => {
    if (!draftSubject.trim() && !draftBody.trim()) return toast("Write a subject or body first", "error");
    const name = prompt("Template name", draftSubject.trim().slice(0, 48) || "Outreach template");
    if (!name?.trim()) return;
    // Turn the recipient's real details back into reusable tokens.
    const tokenize = (value: string) => {
      let next = value;
      const pairs: [string, string][] = [
        [vars.name, "{name}"],
        [vars.first_name, "{first_name}"],
        [vars.company, "{company}"],
      ];
      // Whole words only: "Dev" must not turn "Developer" into "{first_name}eloper".
      for (const [real, token] of pairs) {
        if (!real || real.length < 2) continue;
        const escaped = real.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        next = next.replace(new RegExp(`(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`, "gu"), token);
      }
      return next;
    };
    data.updateProfile({ email_templates: [...templates, { id: uid(), name: name.trim(), subject: tokenize(draftSubject), body: tokenize(draftBody) }] });
    toast(`Saved "${name.trim()}" — reuse it on any profile`);
  };

  const insertToken = (token: string) => {
    const target = lastFocused.current === "subject" ? subjectRef.current : bodyRef.current;
    const current = lastFocused.current === "subject" ? draftSubject : draftBody;
    const start = target?.selectionStart ?? current.length;
    const end = target?.selectionEnd ?? current.length;
    const next = current.slice(0, start) + token + current.slice(end);
    if (lastFocused.current === "subject") setDraftSubject(next);
    else setDraftBody(next);
    requestAnimationFrame(() => {
      target?.focus();
      target?.setSelectionRange(start + token.length, start + token.length);
    });
  };

  const fillTokens = () => {
    setDraftSubject(fillTemplate(draftSubject, vars));
    setDraftBody(fillTemplate(draftBody, vars));
  };

  const copy = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast(`${label} copied`);
    } catch {
      toast("Copy failed — select the text and copy manually", "error");
    }
  };

  const open = (kind: "gmail" | "mail") => {
    if (dirty) onSave(draftSubject, draftBody, false);
    const url = kind === "gmail" ? gmailComposeUrl(recipient, draftSubject, draftBody) : mailtoUrl(recipient, draftSubject, draftBody);
    if (kind === "gmail") window.open(url, "_blank", "noopener,noreferrer");
    else window.location.href = url;
    setOpened(true);
  };

  const clear = () => {
    if (!confirm("Clear this draft? The subject and body will be emptied.")) return;
    setDraftSubject("");
    setDraftBody("");
    onSave("", "", true);
    toast("Draft cleared");
  };

  const missing = unfilledTokens(`${draftSubject}\n${draftBody}`);
  const words = draftBody.trim() ? draftBody.trim().split(/\s+/).length : 0;
  const hasContent = !!(draftSubject.trim() || draftBody.trim());

  return (
    <div className="email-draft" onKeyDown={(event) => { if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") { event.preventDefault(); saveNow(); } }}>
      <div className="email-draft-to">
        <Mail size={14} />
        <span>To</span>
        <strong>{recipient || <em>No email on file — add one with Edit profile</em>}</strong>
        <span className={`draft-state ${dirty ? "unsaved" : "saved"}`}>{dirty ? "Saving…" : savedAt ? <><Check size={12} /> Saved {relativeTime(savedAt)}</> : hasContent ? <><Check size={12} /> Saved</> : "Empty draft"}</span>
      </div>
      <div className="email-draft-tools">
        <label className="draft-template">
          <FileText size={14} />
          <select value={templateId} onChange={(event) => applyTemplate(event.target.value)} aria-label="Apply a template">
            <option value="">{templates.length ? "Apply a template…" : "No templates yet"}</option>
            {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </label>
        <div className="token-chips" aria-label="Insert personalization">
          {TEMPLATE_TOKENS.map((token) => <button type="button" key={token} onMouseDown={(event) => event.preventDefault()} onClick={() => insertToken(token)} title={`Insert ${token} — becomes "${vars[token.slice(1, -1)] || "…"}"`}>{token}</button>)}
        </div>
      </div>
      <input
        ref={subjectRef}
        className="field email-subject"
        value={draftSubject}
        onFocus={() => (lastFocused.current = "subject")}
        onChange={(event) => setDraftSubject(event.target.value)}
        placeholder={`Subject — e.g. Partnership idea for ${recipientName.split(" ")[0] || "you"}`}
        aria-label="Email subject"
      />
      <textarea
        ref={bodyRef}
        className="field textarea email-body"
        value={draftBody}
        onFocus={() => (lastFocused.current = "body")}
        onChange={(event) => setDraftBody(event.target.value)}
        rows={9}
        placeholder={`Hi {first_name},\n\nWrite your pitch here. Use the chips above to personalise, then save it as a template to reuse it on every profile.`}
        aria-label="Email body"
      />
      {missing.length > 0 && (
        <div className="draft-warning">
          <Wand2 size={14} />
          <span>Unfilled: {missing.join(", ")}</span>
          <button type="button" onClick={fillTokens}>Fill from profile</button>
        </div>
      )}
      <div className="email-draft-foot">
        <small>{words} words · ~{Math.max(1, Math.round(words / 200))} min read</small>
        <div>
          <Button type="button" size="sm" variant="ghost" onClick={clear} disabled={!hasContent} title="Clear draft"><Trash2 size={14} /></Button>
          <Button type="button" size="sm" variant="ghost" onClick={saveAsTemplate} disabled={!hasContent}><FileText size={14} /> Save as template</Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => void copy(`${draftSubject}\n\n${draftBody}`, "Email")} disabled={!hasContent}><Copy size={14} /> Copy</Button>
          <Button type="button" size="sm" variant="secondary" onClick={saveNow} disabled={!dirty && !!savedAt}><Save size={14} /> Save draft</Button>
        </div>
      </div>
      <div className="email-draft-send">
        <Button type="button" onClick={() => open("gmail")} disabled={!recipient || !hasContent}><ExternalLink size={14} /> Open in Gmail</Button>
        <Button type="button" variant="secondary" onClick={() => open("mail")} disabled={!recipient || !hasContent}><Mail size={14} /> Mail app</Button>
        <Button type="button" variant={opened ? "primary" : "ghost"} onClick={() => { onSent(); setOpened(false); }}><Send size={14} /> {sentLabel}</Button>
      </div>
    </div>
  );
}
