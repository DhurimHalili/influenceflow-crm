import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

// Step 1 of "Connect Gmail" (also used to add a second or third mailbox):
// returns Google's consent URL.
//
// Security:
// - `state` is a random one-time nonce stored server-side with the user it was
//   issued to. The callback accepts only a nonce it issued in the last 15
//   minutes and deletes it on use, so nobody can attach their Gmail to someone
//   else's account by crafting a callback URL (login CSRF).
// - PKCE (S256): the code Google returns is useless without the verifier that
//   never leaves the server, so an intercepted code can't be redeemed.
// - Only the caller's own Supabase session can start a connection.
//
// Scopes: read (to see what you sent and who replied — metadata and Gmail's
// short preview only are stored) and send (so the CRM can send and follow up
// in the same thread). Nothing else.

const APP_URL = (Deno.env.get("APP_URL") || "https://dhurimhalili.github.io/influenceflow-crm").replace(/\/$/, "");
const ALLOWED_ORIGINS = new Set([new URL(APP_URL).origin, "http://localhost:5173", "http://127.0.0.1:5173", "http://localhost:4173"]);
const MAX_MAILBOXES = 5;

const SCOPES = [
  "openid",
  "email",
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.send",
  // Lets the CRM cancel a scheduled send (moves it to Trash) when they already
  // replied. Never used to delete forever, read anything new, or change labels.
  "https://www.googleapis.com/auth/gmail.modify",
];

const b64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const hex = (bytes: Uint8Array) => Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");

Deno.serve(async (req) => {
  const origin = req.headers.get("Origin") || "";
  const cors = {
    "Access-Control-Allow-Origin": ALLOWED_ORIGINS.has(origin) ? origin : new URL(APP_URL).origin, "X-Content-Type-Options": "nosniff",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    Vary: "Origin",
  };
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" } });
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const clientId = Deno.env.get("GOOGLE_CLIENT_ID");
  const redirectUri = Deno.env.get("GMAIL_OAUTH_REDIRECT_URI");
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  if (!clientId || !redirectUri || !Deno.env.get("GOOGLE_CLIENT_SECRET")) {
    return json({ error: "Gmail isn't set up on the server yet (GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET and GMAIL_OAUTH_REDIRECT_URI are needed).", code: "not_configured" }, 503);
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);
  const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData.user) return json({ error: "Unauthorized" }, 401);
  const userId = userData.user.id;

  const admin = createClient(supabaseUrl, serviceKey);
  // Private circle: only approved members can connect a mailbox.
  const { data: member } = await admin.from("profiles").select("access").eq("id", userId).maybeSingle();
  if (member && member.access && member.access !== "approved") return json({ error: "Your access is waiting for the owner's approval.", code: "not_approved" }, 403);
  const [{ count: mailboxes }, { count: pending }] = await Promise.all([
    admin.from("gmail_tokens").select("id", { count: "exact", head: true }).eq("user_id", userId),
    admin.from("oauth_states").select("nonce", { count: "exact", head: true }).eq("user_id", userId).gte("created_at", new Date(Date.now() - 15 * 60 * 1000).toISOString()),
  ]);
  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* empty body */ }
  const reconnect = typeof body.reconnect === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.reconnect) ? body.reconnect : "";
  if ((mailboxes || 0) >= MAX_MAILBOXES && !reconnect) return json({ error: `You can connect up to ${MAX_MAILBOXES} mailboxes. Disconnect one first.` }, 409);
  if ((pending || 0) >= 10) return json({ error: "Too many connection attempts — wait a few minutes and try again." }, 429);

  // Housekeeping: forget stale nonces, then issue a fresh one with its PKCE verifier.
  await admin.from("oauth_states").delete().lt("created_at", new Date(Date.now() - 15 * 60 * 1000).toISOString());
  const nonce = hex(crypto.getRandomValues(new Uint8Array(24)));
  const verifier = b64url(crypto.getRandomValues(new Uint8Array(48)));
  const challenge = b64url(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier))));
  const { error: stateError } = await admin.from("oauth_states").insert({ nonce, user_id: userId, purpose: "gmail", code_verifier: verifier });
  if (stateError) return json({ error: "Could not start the Gmail connection. Please try again." }, 500);

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    access_type: "offline",
    // Always show the account chooser, so a second mailbox is one click away.
    prompt: "select_account consent",
    include_granted_scopes: "true",
    scope: SCOPES.join(" "),
    state: nonce,
    code_challenge: challenge,
    code_challenge_method: "S256",
  });
  const hint = reconnect || (!mailboxes && userData.user.email) || "";
  if (hint) params.set("login_hint", hint);
  return json({ url: `https://accounts.google.com/o/oauth2/v2/auth?${params}` });
});
