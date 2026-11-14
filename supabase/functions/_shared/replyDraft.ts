// "Reply" from a profile: a reply draft in the real Gmail thread, the way
// Gmail's own Reply button makes one — same thread, Re: subject, In-Reply-To /
// References, the right recipient, your signature and the quoted message.
// Pure: no network, no Deno. gmail-sync does the reading and writing.

export type Part = { mimeType?: string; body?: { data?: string; size?: number }; parts?: Part[]; headers?: { name: string; value: string }[] };
export type Msg = { id: string; threadId?: string; labelIds?: string[]; internalDate?: string; payload?: Part };
export type SendAs = { sendAsEmail?: string; displayName?: string; signature?: string; isPrimary?: boolean; isDefault?: boolean };

export const headerOf = (m: Msg, name: string) => m.payload?.headers?.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value || "";

/** Addresses in a header, lowercased ("Sam <SAM@x.com>, b@y.com" → [sam@x.com, b@y.com]). */
export function addressList(value: string): string[] {
  const out: string[] = [];
  for (const m of value.matchAll(/[A-Z0-9._%+'-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi)) {
    const e = m[0].toLowerCase();
    if (!out.includes(e)) out.push(e);
  }
  return out;
}

const AUTO = (m: Msg) => {
  const auto = headerOf(m, "Auto-Submitted").toLowerCase();
  return (!!auto && auto !== "no") || !!headerOf(m, "X-Autoreply") || !!headerOf(m, "X-Autorespond");
};
/** Still waiting in Gmail's Scheduled folder (or dated ahead): not something to answer. */
const pending = (m: Msg, now: number) => {
  const l = m.labelIds || [];
  return (l.includes("SCHEDULED") && !l.includes("SENT")) || Number(m.internalDate || 0) > now + 60_000;
};

/**
 * What to do in this thread: a draft you already have there (open it, never a
 * second one), else the message to answer — the newest real one, never a
 * draft, a binned message or a scheduled send; an autoresponder only when
 * nothing else is left.
 */
export function pickTarget(messages: Msg[], now = Date.now()): { draft?: Msg; latest?: Msg } {
  const sorted = [...messages].sort((a, b) => Number(a.internalDate || 0) - Number(b.internalDate || 0));
  const draft = [...sorted].reverse().find((m) => (m.labelIds || []).includes("DRAFT") && !(m.labelIds || []).includes("TRASH"));
  const real = sorted.filter((m) => { const l = m.labelIds || []; return !l.includes("DRAFT") && !l.includes("TRASH") && !pending(m, now); });
  const latest = [...real].reverse().find((m) => !AUTO(m)) || real[real.length - 1];
  return { draft, latest };
}

/** Is this message yours (sent from one of your addresses)? */
export const isMine = (m: Msg, own: Set<string>) => (m.labelIds || []).includes("SENT") || addressList(headerOf(m, "From")).some((e) => own.has(e));

/**
 * Who Gmail's Reply would address: their message → Reply-To, else From; your
 * own message (a follow-up nobody answered) → the people you sent it to. Your
 * own addresses are never recipients. Empty when it can't tell.
 */
export function replyRecipients(latest: Msg, own: Set<string>, all: Msg[] = []): string[] {
  const not = (list: string[]) => list.filter((e) => !own.has(e));
  if (isMine(latest, own)) {
    const to = not(addressList(headerOf(latest, "To")));
    if (to.length) return to;
    // Sent only to yourself / Bcc: answer whoever last wrote from the other side.
    const theirs = [...all].reverse().find((m) => !isMine(m, own));
    return theirs ? replyRecipients(theirs, own) : [];
  }
  const replyTo = not(addressList(headerOf(latest, "Reply-To")));
  return replyTo.length ? replyTo : not(addressList(headerOf(latest, "From")));
}

export const replySubject = (subject: string) => {
  const s = subject.replace(/[\r\n]+/g, " ").trim();
  return !s ? "Re:" : /^re\s*:/i.test(s) ? s : `Re: ${s}`;
};

/** Which of your addresses answers: the one they wrote to (an alias you send as), else the mailbox's own. */
export function pickSendAs(latest: Msg, own: Set<string>, sendAs: SendAs[], mailbox: string): { email: string; name: string; signature: string } {
  const list = sendAs.filter((s) => s.sendAsEmail);
  const used = isMine(latest, own) ? addressList(headerOf(latest, "From")) : [...addressList(headerOf(latest, "To")), ...addressList(headerOf(latest, "Cc"))];
  const hit = list.find((s) => used.includes(s.sendAsEmail!.toLowerCase()))
    || list.find((s) => s.sendAsEmail!.toLowerCase() === mailbox)
    || list.find((s) => s.isPrimary) || null;
  return { email: (hit?.sendAsEmail || mailbox).toLowerCase(), name: hit?.displayName || "", signature: hit?.signature || "" };
}

// ----- the quoted message ----------------------------------------------------------

const b64urlDecode = (data: string) => {
  const s = data.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(s + "=".repeat((4 - (s.length % 4)) % 4));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
};

/** The message's HTML body, else its text, from a format=full payload. */
export function bodyOf(part: Part | undefined): { html: string; text: string } {
  let html = "", text = "";
  const walk = (p: Part | undefined, depth = 0) => {
    if (!p || depth > 8) return;
    const type = (p.mimeType || "").toLowerCase();
    const isAttachment = (p.headers || []).some((h) => h.name.toLowerCase() === "content-disposition" && /attachment/i.test(h.value));
    if (!isAttachment && p.body?.data) {
      try {
        if (type === "text/html" && !html) html = b64urlDecode(p.body.data);
        else if (type === "text/plain" && !text) text = b64urlDecode(p.body.data);
      } catch { /* a part that won't decode is left out */ }
    }
    for (const c of p.parts || []) walk(c, depth + 1);
  };
  walk(part);
  return { html, text };
}

export const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** An email's HTML made safe to sit inside a quote: no document shell, scripts, styles or event handlers. */
export function quotable(html: string): string {
  return html
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<!doctype[^>]*>/gi, "")
    .replace(/<(head|script|style|title|iframe|object|embed)\b[\s\S]*?<\/\1\s*>/gi, "")
    .replace(/<\/?(html|body|meta|link|base)\b[^>]*>/gi, "")
    .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/(href|src)\s*=\s*(["'])\s*javascript:[^"']*\2/gi, "$1=$2#$2")
    .trim();
}

const textHtml = (text: string) => escapeHtml(text).replace(/\r?\n/g, "<br>");
const QUOTE_MAX = 200_000;

/** Gmail's own quote block: "On <date>, <who> wrote:" over the message. Empty when there's nothing to quote. */
export function quoteBlock(latest: Msg, body: { html: string; text: string }): string {
  const inner = body.html ? quotable(body.html) : body.text ? textHtml(body.text) : "";
  if (!inner || inner.length > QUOTE_MAX) return "";
  const date = headerOf(latest, "Date").trim();
  const from = headerOf(latest, "From").trim();
  const attr = `On ${escapeHtml(date || "an earlier day")}, ${escapeHtml(from || "they")} wrote:`;
  return `<div class="gmail_quote"><div dir="ltr" class="gmail_attr">${attr}<br></div><blockquote class="gmail_quote" style="margin:0px 0px 0px 0.8ex;border-left:1px solid rgb(204,204,204);padding-left:1ex">${inner}</blockquote></div>`;
}

/** The draft's HTML: room to type, your signature (as Gmail places it), then the quote. */
export function draftHtml(signature: string, quote: string): string {
  const sig = signature.trim() ? `<br clear="all"><div><br></div><span class="gmail_signature_prefix">-- </span><br><div dir="ltr" class="gmail_signature" data-smartmail="gmail_signature">${quotable(signature)}</div>` : "";
  return `<div dir="ltr"><br></div>${sig}<br>${quote}`;
}

// ----- the raw message ------------------------------------------------------------------

const utf8b64 = (s: string) => {
  const bytes = new TextEncoder().encode(s);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
};
const word = (s: string) => (/^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${utf8b64(s)}?=`);
/** Header values can't carry line breaks (a CR/LF would start a new header). */
const one = (s: string, max = 2000) => s.replace(/[\r\n]+/g, " ").trim().slice(0, max);
/** Message-IDs only: <...> tokens, nothing else from the header survives. */
export const msgIds = (s: string) => (s.match(/<[^<>\s]{3,250}>/g) || []).slice(-30);

export function replyRaw(o: { from: string; fromName: string; to: string[]; subject: string; messageId: string; references: string; html: string }): string {
  const name = one(o.fromName, 120).replace(/"/g, "'");
  const ids = msgIds(o.messageId);
  const refs = Array.from(new Set([...msgIds(o.references), ...ids]));
  const headers = [
    `From: ${name ? `${/^[\x20-\x7e]*$/.test(name) ? `"${name}"` : word(name)} ` : ""}<${one(o.from, 320)}>`,
    `To: ${o.to.map((e) => one(e, 320)).join(", ")}`,
    `Subject: =?UTF-8?B?${utf8b64(one(o.subject, 500))}?=`,
    ...(ids.length ? [`In-Reply-To: ${ids[ids.length - 1]}`, `References: ${refs.join(" ")}`] : []),
    "MIME-Version: 1.0",
    'Content-Type: text/html; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
  ];
  return `${headers.join("\r\n")}\r\n\r\n${utf8b64(o.html).replace(/(.{76})/g, "$1\r\n")}`;
}

/** Opens that thread in Gmail on the web, signed in as that mailbox (a draft in it shows open at the bottom). */
export const threadUrl = (mailbox: string, threadId: string) => `https://mail.google.com/mail/?authuser=${encodeURIComponent(mailbox)}#all/${threadId}`;
