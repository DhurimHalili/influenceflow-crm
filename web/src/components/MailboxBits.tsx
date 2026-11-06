// Small shared pieces for showing a mailbox: its colour (stable by position
// in your busiest-first list) and its address with the name part first.

export const mailboxTone = (index: number) => (index < 0 ? 0 : index % 6);

export function MailboxName({ email }: { email: string }) {
  const at = email.indexOf("@");
  if (at < 0) return <span className="mbx-name">{email}</span>;
  return <span className="mbx-name" title={email}><b>{email.slice(0, at)}</b><small>@{email.slice(at + 1)}</small></span>;
}
