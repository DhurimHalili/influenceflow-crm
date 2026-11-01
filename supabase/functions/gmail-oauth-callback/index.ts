import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

// Step 2 of "Connect Gmail": Google redirects here with ?code&state.
// Runs without a Supabase session (Google calls it), so it authenticates the
// request by the one-time state nonce issued in gmail-oauth-start.
// Every value echoed into HTML is escaped.

const esc = (value: unknown) =>
  String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

const page = (title: string, message: string, appUrl: string, status = 400) =>
  new Response(
    `<!doctype html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>${esc(title)}</title>
<style>body{font-family:system-ui,sans-serif;background:#16141c;color:#f1eef7;display:grid;place-items:center;min-height:100vh;margin:0;padding:20px}
.card{background:#211e29;border:1px solid #36323f;border-radius:16px;padding:28px;max-width:440px}h1{font-size:20px;margin:0 0 8px}p{color:#b8b2c4;line-height:1.55}
a{display:inline-block;margin-top:10px;padding:10px 14px;border-radius:10px;background:#7c5cff;color:#fff;text-decoration:none;font-weight:600}</style></head>
<body><div class="card"><h1>${esc(title)}</h1><p>${esc(message)}</p><a href="${esc(appUrl)}/#/app/settings">Back to InfluenceFlow</a></div></body></html>`,
    { status, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff" } },
  );

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const appUrl = (Deno.env.get("APP_URL") || "https://dhurimhalili.github.io/influenceflow-crm").replace(/\/$/, "");
  const back = (result: string) => new Response(null, { status: 302, headers: { Location: `${appUrl}/#/app/settings?gmail=${encodeURIComponent(result)}`, "Cache-Control": "no-store" } });
  const clientId = Deno.env.get("GOOGLE_CLIENT_ID");
  const clientSecret = Deno.env.get("GOOGLE_CLIENT_SECRET");
  const redirectUri = Deno.env.get("GMAIL_OAUTH_REDIRECT_URI");
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  if (req.method !== "GET") return page("Not allowed", "This address only accepts Google's redirect.", appUrl, 405);
  if (url.searchParams.get("error")) return back("cancelled");

  const code = url.searchParams.get("code") || "";
  const state = url.searchParams.get("state") || "";
  if (!code || !/^[0-9a-f]{48}$/.test(state)) return page("Invalid link", "This Gmail connection link is not valid. Start again from Settings.", appUrl);
  if (!clientId || !clientSecret || !redirectUri) return page("Not set up", "Gmail isn't configured on the server yet.", appUrl, 503);

  const admin = createClient(supabaseUrl, serviceKey);
  // Consume the nonce: valid once, for 15 minutes, for the user it was issued to.
  const { data: stateRow } = await admin.from("oauth_states").delete().eq("nonce", state).eq("purpose", "gmail").select("user_id, created_at").maybeSingle();
  if (!stateRow || Date.now() - new Date(stateRow.created_at).getTime() > 15 * 60 * 1000) {
    return page("Link expired", "This Gmail connection link was already used or has expired. Start again from Settings.", appUrl);
  }
  const userId = stateRow.user_id as string;

  try {
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ code, client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri, grant_type: "authorization_code" }),
    });
    const token = await tokenRes.json();
    if (!tokenRes.ok || !token.access_token) return back("failed");

    const { data: existing } = await admin.from("gmail_tokens").select("refresh_token").eq("user_id", userId).maybeSingle();
    const refresh = token.refresh_token || existing?.refresh_token;
    if (!refresh) return back("no-refresh");

    let email: string | null = null;
    const profile = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/profile", { headers: { Authorization: `Bearer ${token.access_token}` } });
    if (profile.ok) email = (await profile.json()).emailAddress || null;

    const scopes = String(token.scope || "");
    const { error } = await admin.from("gmail_tokens").upsert({
      user_id: userId,
      access_token: token.access_token,
      refresh_token: refresh,
      expiry: token.expires_in ? new Date(Date.now() + Number(token.expires_in) * 1000).toISOString() : null,
      email,
      scopes,
      // A new connection (maybe another mailbox) starts its sync fresh.
      history_id: null,
      backfilled: [],
      sync_error: "",
      connected_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
    if (error) return back("failed");
    await admin.from("profiles").update({ gmail_connected: true, updated_at: new Date().toISOString() }).eq("id", userId);
    return back(scopes.includes("gmail.readonly") ? "connected" : "missing-read");
  } catch {
    return back("failed");
  }
});
