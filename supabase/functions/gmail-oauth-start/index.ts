import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const clientId = Deno.env.get("GOOGLE_CLIENT_ID");
  const redirectUri = Deno.env.get("GMAIL_OAUTH_REDIRECT_URI");
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

  if (!clientId || !redirectUri) {
    return new Response(JSON.stringify({ error: "Gmail OAuth not configured. Set GOOGLE_CLIENT_ID and GMAIL_OAUTH_REDIRECT_URI secrets." }), {
      status: 503,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData.user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  // state = userId.random so callback can attribute tokens without a session cookie
  const state = `${userData.user.id}.${crypto.randomUUID()}`;
  const scope = encodeURIComponent("https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/userinfo.email");
  const url =
    `https://accounts.google.com/o/oauth2/v2/auth?client_id=${encodeURIComponent(clientId)}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&response_type=code&access_type=offline&prompt=consent&scope=${scope}&state=${encodeURIComponent(state)}`;

  return new Response(JSON.stringify({ url }), {
    headers: { ...cors, "Content-Type": "application/json" },
  });
});
