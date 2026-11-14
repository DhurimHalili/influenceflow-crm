// Shared state of the one-day "bring your own keys" notice (components/KeysNotice.tsx).
export const KEYS_NOTICE_OPEN = "if:keys-notice";
export const KEYS_NOTICE_CLOSED = "if:keys-notice-closed";
let openNow = false;
export const setKeysNoticeOpen = (v: boolean) => { openNow = v; if (!v) window.dispatchEvent(new Event(KEYS_NOTICE_CLOSED)); };
/** Another dialog (the weekend briefing) waits while the notice is up. */
export const isKeysNoticeOpen = () => openNow;
/** Opens the notice (the owner's preview from Settings). */
export const openKeysNotice = (preview = false) => window.dispatchEvent(new CustomEvent(KEYS_NOTICE_OPEN, { detail: { preview } }));
