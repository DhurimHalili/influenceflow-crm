import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

// Step 1 of "Connect Gmail": returns Google's consent URL.
//
// Security: the OAuth `state` is a random one-time nonce stored server-side
// with the user it was issued to. The callback accepts only a nonce it issued
// in the last 15 minutes and deletes it on use, so nobody can bind their own
// Gmail to someone else's account by crafting a callback URL.
//
// Scopes: read (to see what you sent and who replied — metadata and Gmail's
// short preview only are stored) and send (so the CRM can send and follow up
// in the same thread). Nothing else.

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

const SCOPES = [
  "openid",
  "email",
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.send",
];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST" && req.method !== "GET") return json({ error: "Method not allowed" }, 405);

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

  const admin = createClient(supabaseUrl, serviceKey);
  // Housekeeping: forget stale nonces, then issue a fresh one.
  await admin.from("oauth_states").delete().lt("created_at", new Date(Date.now() - 15 * 60 * 1000).toISOString());
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  const nonce = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  const { error: stateError } = await admin.from("oauth_states").insert({ nonce, user_id: userData.user.id, purpose: "gmail" });
  if (stateError) return json({ error: "Could not start the Gmail connection. Please try again." }, 500);

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    scope: SCOPES.join(" "),
    state: nonce,
  });
  if (userData.user.email) params.set("login_hint", userData.user.email);
  return json({ url: `https://accounts.google.com/o/oauth2/v2/auth?${params}` });
});
