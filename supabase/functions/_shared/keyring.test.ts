// Run: deno run --allow-read --allow-env supabase/functions/_shared/keyring.test.ts
// Whose keys the work runs on — no network.
import { cred, credsFrom, runInRing, scoped, type Ring } from "./keyring.ts";

let fail = 0;
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fail++;
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : `\n     got  ${JSON.stringify(got)}\n     want ${JSON.stringify(want)}`}`);
};
Deno.env.set("YOUTUBE_API_KEYS", "WORKSPACE_YT");
Deno.env.set("GEMINI_API_KEYS", "WORKSPACE_GEMINI");
Deno.env.set("YTAI_API_KEY", "WORKSPACE_TX");
Deno.env.set("GROQ_MODEL", "model-x");
const member = (id: string, creds: Record<string, string>): Ring => ({ userId: id, owner: false, creds, services: [] });
const owner: Ring = { userId: "o", owner: true, creds: credsFrom({ gemini: ["OWNER_OWN_GEMINI"] }), services: [] };

eq("outside a ring = workspace", cred("YOUTUBE_API_KEYS"), "WORKSPACE_YT");
eq("member: own key", await runInRing(member("a", credsFrom({ youtube: ["A1", "A2"] })), async () => cred("YOUTUBE_API_KEYS")), "A1,A2");
eq("member without the key: nothing (never the workspace's)", await runInRing(member("b", {}), async () => [cred("YOUTUBE_API_KEYS"), cred("GEMINI_API_KEYS"), cred("YTAI_API_KEY"), cred("HUNTER_API_KEY")]), ["", "", "", ""]);
eq("owner: own key wins", await runInRing(owner, async () => cred("GEMINI_API_KEYS")), "OWNER_OWN_GEMINI");
eq("owner: workspace for the rest", await runInRing(owner, async () => [cred("YOUTUBE_API_KEYS"), cred("YTAI_API_KEY")]), ["WORKSPACE_YT", "WORKSPACE_TX"]);
eq("budgets: owner unscoped, member scoped", [await runInRing(owner, async () => scoped("listen")), await runInRing(member("b", {}), async () => scoped("listen"))], ["listen", "listen@b"]);
const cf = credsFrom({ cloudflare: [JSON.stringify({ account: "0123456789abcdef0123456789abcdef", token: "tok_abc" })] });
eq("cloudflare: account + token", [cf.CLOUDFLARE_ACCOUNT_ID, cf.CLOUDFLARE_AI_TOKENS], ["0123456789abcdef0123456789abcdef", "tok_abc"]);
eq("cloudflare: unreadable = missing", credsFrom({ cloudflare: ["not json"] }).CLOUDFLARE_ACCOUNT_ID, undefined);
// Interleaved work never mixes rings.
const seen = await Promise.all([10, 1, 5].map((ms, i) => runInRing(member(`u${i}`, credsFrom({ gemini: [`K${i}`] })), async () => {
  const a = cred("GEMINI_API_KEYS"); await new Promise((ok) => setTimeout(ok, ms)); await Promise.resolve(); const b = cred("GEMINI_API_KEYS"); return a === b ? b : "mixed";
})));
eq("interleaved members stay apart", seen, ["K0", "K1", "K2"]);
eq("after the work: workspace again", cred("GEMINI_API_KEYS"), "WORKSPACE_GEMINI");

if (fail) { console.log(`\n${fail} failed`); Deno.exit(1); } else console.log("\nall keyring tests pass");
