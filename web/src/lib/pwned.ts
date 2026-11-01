// "Has this password leaked?" — the free stand-in for Supabase's Pro-only
// leaked-password protection. Uses Have I Been Pwned's k-anonymity range API:
// only the first 5 characters of the password's SHA-1 hash leave the browser,
// never the password or its full hash. Padding hides the response size too.
// Fails open (returns 0) if the service can't be reached, so nobody is locked out.

export async function pwnedCount(password: string): Promise<number> {
  if (!password || typeof crypto?.subtle?.digest !== "function") return 0;
  try {
    const digest = new Uint8Array(await crypto.subtle.digest("SHA-1", new TextEncoder().encode(password)));
    const hex = Array.from(digest, (b) => b.toString(16).padStart(2, "0")).join("").toUpperCase();
    const prefix = hex.slice(0, 5);
    const suffix = hex.slice(5);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4000);
    const res = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, { headers: { "Add-Padding": "true" }, signal: controller.signal, referrerPolicy: "no-referrer", credentials: "omit" });
    clearTimeout(timer);
    if (!res.ok) return 0;
    for (const line of (await res.text()).split("\n")) {
      const [hash, count] = line.trim().split(":");
      if (hash === suffix) return Number(count) || 0;
    }
    return 0;
  } catch {
    return 0;
  }
}

export const pwnedMessage = (count: number) =>
  `This password has appeared in ${count.toLocaleString()} data breach${count === 1 ? "" : "es"}, so attackers try it first. Please choose a different one.`;
