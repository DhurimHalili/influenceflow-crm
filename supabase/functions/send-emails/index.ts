import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
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
    const userId = userData.user.id;
    const { job_id } = await req.json();
    if (!job_id) {
      return new Response(JSON.stringify({ error: "job_id required" }), {
        status: 400,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(supabaseUrl, serviceKey);
    const { data: job } = await admin.from("send_jobs").select("*").eq("id", job_id).eq("user_id", userId).maybeSingle();
    if (!job) {
      return new Response(JSON.stringify({ error: "Job not found" }), {
        status: 404,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const { data: tokenRow } = await admin.from("gmail_tokens").select("*").eq("user_id", userId).maybeSingle();
    if (!tokenRow?.refresh_token) {
      return new Response(JSON.stringify({ error: "Gmail not connected" }), {
        status: 400,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    // Refresh access token
    const clientId = Deno.env.get("GOOGLE_CLIENT_ID")!;
    const clientSecret = Deno.env.get("GOOGLE_CLIENT_SECRET")!;
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: tokenRow.refresh_token,
        grant_type: "refresh_token",
      }),
    });
    const tokenJson = await tokenRes.json();
    if (!tokenJson.access_token) {
      return new Response(JSON.stringify({ error: "Failed to refresh Gmail token", detail: tokenJson }), {
        status: 400,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const { data: profile } = await admin.from("profiles").select("*").eq("id", userId).single();
    const delayMin = profile?.send_delay_min ?? 60;
    const delayMax = profile?.send_delay_max ?? 150;

    await admin.from("send_jobs").update({ status: "running", started_at: new Date().toISOString() }).eq("id", job_id);

    const { data: items } = await admin
      .from("send_job_items")
      .select("*")
      .eq("job_id", job_id)
      .eq("status", "queued")
      .order("sort_order");

    let sent = 0;
    let failed = 0;
    for (const item of items || []) {
      try {
        const raw = [
          `To: ${item.email}`,
          `Subject: ${item.subject}`,
          "MIME-Version: 1.0",
          'Content-Type: text/plain; charset="UTF-8"',
          "",
          item.body_text,
        ].join("\r\n");
        const encoded = btoa(unescape(encodeURIComponent(raw)))
          .replace(/\+/g, "-")
          .replace(/\//g, "_")
          .replace(/=+$/, "");

        const sendRes = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${tokenJson.access_token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ raw: encoded }),
        });
        const sendJson = await sendRes.json();
        if (!sendRes.ok) throw new Error(JSON.stringify(sendJson));

        const messageId = sendJson.id || sendJson.threadId || null;
        await admin
          .from("send_job_items")
          .update({ status: "sent", message_id: messageId, sent_at: new Date().toISOString() })
          .eq("id", item.id);

        await admin.from("outreach_events").insert({
          user_id: userId,
          target_type: item.target_type,
          target_id: item.target_id,
          email: item.email,
          mode: item.send_mode,
          subject: item.subject,
          message_id: messageId,
        });

        if (item.target_type === "brand_contact") {
          const { data: contact } = await admin.from("brand_contacts").select("*").eq("id", item.target_id).maybeSingle();
          const rb = item.send_mode === "reach_back" ? (contact?.reach_back_count || 0) + 1 : 0;
          const status =
            item.send_mode === "new" ? "contacted" : rb === 1 ? "reach_back_1" : rb === 2 ? "reach_back_2" : "reach_back_3";
          await admin
            .from("brand_contacts")
            .update({
              last_sent_at: new Date().toISOString(),
              reach_back_count: rb,
              pipeline_status: status,
              message_id: messageId,
              date_contacted: contact?.date_contacted || new Date().toISOString().slice(0, 10),
            })
            .eq("id", item.target_id)
            .eq("user_id", userId);
        } else {
          const { data: creator } = await admin.from("creators").select("*").eq("id", item.target_id).maybeSingle();
          const rb = item.send_mode === "reach_back" ? (creator?.reach_back_count || 0) + 1 : 0;
          const status =
            item.send_mode === "new" ? "contacted" : rb === 1 ? "reach_back_1" : rb === 2 ? "reach_back_2" : "reach_back_3";
          await admin
            .from("creators")
            .update({
              last_sent_at: new Date().toISOString(),
              reach_back_count: rb,
              pipeline_status: status,
              message_id: messageId,
              date_contacted: creator?.date_contacted || new Date().toISOString().slice(0, 10),
            })
            .eq("id", item.target_id)
            .eq("user_id", userId);
        }

        sent++;
        await admin.from("send_jobs").update({ sent }).eq("id", job_id);

        if (items && items.indexOf(item) < items.length - 1) {
          const delay = delayMin + Math.floor(Math.random() * Math.max(1, delayMax - delayMin));
          await new Promise((r) => setTimeout(r, delay * 1000));
        }
      } catch (e) {
        failed++;
        await admin
          .from("send_job_items")
          .update({ status: "failed", error: String(e) })
          .eq("id", item.id);
        await admin.from("send_jobs").update({ failed }).eq("id", job_id);
      }
    }

    await admin
      .from("send_jobs")
      .update({ status: "completed", finished_at: new Date().toISOString(), sent, failed })
      .eq("id", job_id);

    return new Response(JSON.stringify({ ok: true, sent, failed }), {
      headers: { ...cors, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
