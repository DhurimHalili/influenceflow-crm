// Run: deno run --allow-read --allow-env supabase/functions/_shared/memberKeys.test.ts
// No network: a local AES key and recorded service answers.
import { checkKey, cleanKey, hintOf, openKey, sealKey } from "./memberKeys.ts";

let fail = 0;
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fail++;
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : `\n     got  ${JSON.stringify(got)}\n     want ${JSON.stringify(want)}`}`);
};
const raw = crypto.getRandomValues(new Uint8Array(32));
const k = await crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
const other = await crypto.subtle.importKey("raw", crypto.getRandomValues(new Uint8Array(32)), "AES-GCM", false, ["encrypt", "decrypt"]);
const key = async () => k;
const A = "11111111-1111-4111-8111-111111111111", B = "22222222-2222-4222-8222-222222222222";
const secret = "clay_scoped_abcDEF123456789_tsJu";

const sealed = await sealKey(key, A, "clay", secret);
eq("sealed value never contains the key", sealed.includes(secret) || sealed.includes("tsJu"), false);
eq("sealed format", /^k1\.[\w-]+\.[\w-]+$/.test(sealed), true);
eq("round trip", await openKey(key, A, "clay", sealed), secret);
eq("two seals differ (fresh IV)", sealed === await sealKey(key, A, "clay", secret), false);
eq("another member can't open it", await openKey(key, B, "clay", sealed), "");
eq("another service can't open it", await openKey(key, A, "hunter", sealed), "");
eq("another vault key can't open it", await openKey(async () => other, A, "clay", sealed), "");
eq("no vault key = nothing", await openKey(async () => null, A, "clay", sealed), "");
const parts = sealed.split(".");
const flipped = `${parts[0]}.${parts[1]}.${parts[2].slice(0, -2)}${parts[2].slice(-2) === "AA" ? "AB" : "AA"}`;
eq("tampered value = nothing", await openKey(key, A, "clay", flipped), "");
eq("garbage = nothing", await openKey(key, A, "clay", "not-a-key"), "");
let threw = false; try { await sealKey(async () => null, A, "clay", secret); } catch { threw = true; }
eq("no vault key = refuse to save", threw, true);

eq("clean: trims + Bearer + quotes", cleanKey("hunter", '  "Bearer 0123456789abcdef0123456789abcdef01234567" '), "0123456789abcdef0123456789abcdef01234567");
eq("clean: too short", cleanKey("hunter", "abc123"), "");
eq("clean: spaces inside = not a key", cleanKey("clay", "clay scoped key with spaces 123"), "");
eq("clean: a URL is not a key", cleanKey("hunter", "https://hunter.io/api-keys"), "");
eq("clean: clay key", cleanKey("clay", secret), secret);
eq("hint = last 4", hintOf(secret), "tsJu");

const ans = (status: number, body: unknown) => async () => ({ status, body });
eq("hunter ok: plan + credits left", await checkKey("hunter", "k", ans(200, { data: { plan_name: "Free", reset_date: "2026-12-01", requests: { credits: { used: 8, available: 50, remaining: 42 } } } })), { ok: true, label: "Free plan", left: 42, total: 50, resets: "2026-12-01" });
eq("hunter ok: searches pool without remaining", await checkKey("hunter", "k", ans(200, { data: { plan_name: "Free", requests: { searches: { used: 5, available: 25 } } } })), { ok: true, label: "Free plan", left: 20, total: 25, resets: null });
eq("hunter refused", await checkKey("hunter", "k", ans(401, {})), { ok: false, why: "refused" });
eq("hunter over limit", await checkKey("hunter", "k", ans(429, {})), { ok: false, why: "quota" });
eq("hunter down", await checkKey("hunter", "k", async () => null), { ok: false, why: "unreachable" });
eq("clay ok: workspace name", await checkKey("clay", "k", ans(200, { user: { id: "u", name: "Dhurim" }, workspace: { id: "1211493", name: "Mimi <b>Bridge</b>" } })), { ok: true, label: "Mimi Bridge workspace", left: null, total: null, resets: null });
eq("clay refused", await checkKey("clay", "k", ans(403, {})), { ok: false, why: "refused" });
eq("clay 200 without a workspace = not a key", await checkKey("clay", "k", ans(200, { hello: 1 })), { ok: false, why: "refused" });

if (fail) { console.log(`\n${fail} failed`); Deno.exit(1); } else console.log("\nall member-key tests pass");
