import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

function html(title: string, body: string) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>${title}</title>
  <style>body{font-family:system-ui,sans-serif;background:#0e1116;color:#e8edf5;display:grid;place-items:center;min-height:100vh;margin:0}
  .card{background:#161b22;border:1px solid #2a3341;border-radius:12px;padding:1.5rem;max-width:420px}
  a{color:#3d9cf0}</style></head><body><div class="card">${body}</div></body></html>`;
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const appUrl = (Deno.env.get("APP_URL") || "https://dhurimhalili.github.io/influenceflow-crm").replace(/\/$/, "");
  const clientId = Deno.env.get("GOOGLE_CLIENT_ID");
  const clientSecret = Deno.env.get("GOOGLE_CLIENT_SECRET");
  const redirectUri = Deno.env.get("GMAIL_OAUTH_REDIRECT_URI");
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
      },
    });
  }

  const error = url.searchParams.get("error");
  if (error) {
    return new Response(
      html("Gmail connect failed", `<h1>Gmail connect cancelled</h1><p>${error}</p><p><a href="${appUrl}/#/settings">Back to Settings</a></p>`),
      { headers: { "Content-Type": "text/html; charset=utf-8" } },
    );
  }

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state") || "";
  const userId = state.split(".")[0];

  if (!code || !userId || !/^[0-9a-f-]{36}$/i.test(userId)) {
    return new Response(
      html("Invalid callback", `<h1>Invalid OAuth callback</h1><p><a href="${appUrl}/#/settings">Back to Settings</a></p>`),
      { status: 400, headers: { "Content-Type": "text/html; charset=utf-8" } },
    );
  }

  if (!clientId || !clientSecret || !redirectUri) {
    return new Response(
      html("Not configured", `<h1>OAuth not configured</h1><p>Missing Google secrets on Supabase.</p>`),
      { status: 503, headers: { "Content-Type": "text/html; charset=utf-8" } },
    );
  }

  try {
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });
    const tokenJson = await tokenRes.json();
    if (!tokenJson.access_token || !tokenJson.refresh_token) {
      return new Response(
        html(
          "Token error",
          `<h1>Could not get Gmail tokens</h1><pre style="white-space:pre-wrap;font-size:12px">${JSON.stringify(tokenJson)}</pre>
           <p>If refresh_token is missing, revoke app access in Google Account → Security → Third-party access, then connect again.</p>
           <p><a href="${appUrl}/#/settings">Back to Settings</a></p>`,
        ),
        { status: 400, headers: { "Content-Type": "text/html; charset=utf-8" } },
      );
    }

    let gmailEmail: string | null = null;
    try {
      const profileRes = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/profile", {
        headers: { Authorization: `Bearer ${tokenJson.access_token}` },
      });
      if (profileRes.ok) {
        const profileJson = await profileRes.json();
        gmailEmail = profileJson.emailAddress || null;
      }
    } catch {
      // optional
    }

    const admin = createClient(supabaseUrl, serviceKey);
    const expiry = tokenJson.expires_in
      ? new Date(Date.now() + Number(tokenJson.expires_in) * 1000).toISOString()
      : null;

    await admin.from("gmail_tokens").upsert({
      user_id: userId,
      access_token: tokenJson.access_token,
      refresh_token: tokenJson.refresh_token,
      expiry,
      email: gmailEmail,
      updated_at: new Date().toISOString(),
    });

    await admin
      .from("profiles")
      .update({ gmail_connected: true, updated_at: new Date().toISOString() })
      .eq("id", userId);

    return new Response(null, {
      status: 302,
      headers: { Location: `${appUrl}/#/settings?gmail=connected` },
    });
  } catch (e) {
    return new Response(
      html("Error", `<h1>OAuth error</h1><p>${String(e)}</p><p><a href="${appUrl}/#/settings">Back to Settings</a></p>`),
      { status: 500, headers: { "Content-Type": "text/html; charset=utf-8" } },
    );
  }
});
