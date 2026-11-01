import { ChevronDown, ExternalLink, Mail } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useData } from "../contexts/DataContext";
import { gmailComposeUrl, useGmail } from "../contexts/GmailContext";

// "Write" opens Gmail's composer in the right mailbox. Gmail sync then sees the
// sent email and moves the pipeline by itself — nothing to mark by hand.
export function WriteEmail({ to, recordId }: { to: string; recordId: string }) {
  const gmail = useGmail();
  const data = useData();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent | KeyboardEvent) => {
      if (event instanceof KeyboardEvent ? event.key === "Escape" : !ref.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);

  if (!gmail.connected) return <a href={`mailto:${to}`}>Send email <ExternalLink size={13} /></a>;
  const usual = (data.emailEvents || []).filter((e) => e.entity_id === recordId && e.direction === "out" && e.mailbox).sort((a, b) => b.at.localeCompare(a.at))[0]?.mailbox;
  const boxes = gmail.mailboxes;
  const main = boxes.find((m) => m.email === usual) || boxes[0];
  return <span className="write-email" ref={ref}>
    <a href={gmailComposeUrl(to, main?.email)} target="_blank" rel="noopener noreferrer" title={`Opens Gmail as ${main?.email}. Sync picks up what you send.`}><Mail size={13} /> Write in Gmail{boxes.length > 1 ? <em>{main?.email.split("@")[0]}</em> : null}</a>
    {boxes.length > 1 && <button type="button" className="write-more" onClick={() => setOpen((v) => !v)} aria-haspopup="menu" aria-expanded={open} aria-label="Choose mailbox"><ChevronDown size={13} /></button>}
    {open && <span className="write-menu" role="menu">{boxes.map((m) => <a role="menuitem" key={m.id} href={gmailComposeUrl(to, m.email)} target="_blank" rel="noopener noreferrer" onClick={() => setOpen(false)}>{m.email}{m.email === usual && <small>last used</small>}</a>)}</span>}
  </span>;
}
