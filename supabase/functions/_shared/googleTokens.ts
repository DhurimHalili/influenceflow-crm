// Google tokens are stored encrypted (AES-256-GCM). The key is generated in
// and only readable from Vault, through gmail_token_key(), which only the
// service role may call. So a leaked copy of the gmail_tokens table — a
// backup, an export, a mis-scoped query — holds nothing usable.
//
// Format: "v1.<iv base64url>.<ciphertext base64url>". Rows written before
// encryption existed are plain text; they still read fine and are encrypted
// the next time they are written.

// deno-lint-ignore no-explicit-any
type Admin = { rpc: (fn: string, args?: Record<string, unknown>) => PromiseLike<{ data: any; error: any }> };

let cached: Promise<CryptoKey | null> | null = null;

const toB64url = (bytes: Uint8Array) => {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};
const fromB64url = (text: string) => {
  const bin = atob(text.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((text.length + 3) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
};

function tokenKey(admin: Admin): Promise<CryptoKey | null> {
  if (!cached) {
    cached = (async () => {
      const { data, error } = await admin.rpc("gmail_token_key");
      const hex = typeof data === "string" ? data : "";
      if (error || !/^[0-9a-f]{64}$/i.test(hex)) return null;
      const raw = Uint8Array.from(hex.match(/../g)!.map((h) => parseInt(h, 16)));
      return crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
    })().catch(() => null);
    // Don't cache a failure forever (e.g. the migration landed after boot).
    cached.then((k) => { if (!k) cached = null; });
  }
  return cached;
}

export async function sealToken(admin: Admin, value: string | null | undefined): Promise<string | null> {
  if (!value) return value ?? null;
  const key = await tokenKey(admin);
  if (!key) throw new Error("Token encryption key is unavailable");
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const sealed = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(value)));
  return `v1.${toB64url(iv)}.${toB64url(sealed)}`;
}

export async function openToken(admin: Admin, value: string | null | undefined): Promise<string | null> {
  if (!value) return value ?? null;
  if (!value.startsWith("v1.")) return value; // legacy plain text
  const [, iv, data] = value.split(".");
  const key = await tokenKey(admin);
  if (!key || !iv || !data) throw new Error("Couldn't unlock the stored Google token");
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromB64url(iv) }, key, fromB64url(data));
  return new TextDecoder().decode(plain);
}

export const isSealed = (value: string | null | undefined) => !!value && value.startsWith("v1.");
