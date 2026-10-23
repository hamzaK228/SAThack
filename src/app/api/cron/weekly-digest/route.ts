import { createClient } from "@supabase/supabase-js";
import { siteUrl } from "@/lib/site-url";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Recipient = {
  user_id: string;
  email: string;
  username: string | null;
  xp: number;
  questions: number;
  accuracy: number;
  active_days: number;
  last_practised: string | null;
};

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function digestHtml(recipient: Recipient, weekOf: string): string {
  const name = escapeHtml(recipient.username?.trim() || "there");
  const link = `${siteUrl.replace(/\/$/, "")}/dashboard`;
  return `<!doctype html><html><body style="margin:0;background:#060705;color:#eef2e6;font-family:ui-monospace,Menlo,monospace">
  <div style="max-width:560px;margin:0 auto;padding:32px 24px">
    <p style="color:#c6ff4a;letter-spacing:.08em;font-size:12px;margin:0 0 8px">SATHACK · WEEK OF ${weekOf}</p>
    <h1 style="font-size:26px;margin:0 0 8px">Your week, ${name}</h1>
    <p style="color:#9aa08e;margin:0 0 24px">A short look at what you practised and what is next.</p>
    <table style="width:100%;border-collapse:collapse;margin:0 0 24px">
      <tr><td style="padding:10px 0;color:#9aa08e">Questions</td><td style="padding:10px 0;text-align:right;font-weight:700">${recipient.questions}</td></tr>
      <tr><td style="padding:10px 0;color:#9aa08e">Accuracy</td><td style="padding:10px 0;text-align:right;font-weight:700">${recipient.accuracy}%</td></tr>
      <tr><td style="padding:10px 0;color:#9aa08e">Active days</td><td style="padding:10px 0;text-align:right;font-weight:700">${recipient.active_days}</td></tr>
      <tr><td style="padding:10px 0;color:#9aa08e">XP</td><td style="padding:10px 0;text-align:right;font-weight:700">${recipient.xp.toLocaleString("en-US")}</td></tr>
    </table>
    <a href="${link}" style="display:inline-block;background:#c6ff4a;color:#0a0c05;padding:12px 18px;border-radius:8px;text-decoration:none;font-weight:700">Open today&apos;s mission →</a>
    <p style="color:#5f6554;font-size:12px;margin-top:24px">You opted in to this digest in Settings. Turn it off there any time.</p>
  </div></body></html>`;
}

async function sendEmail(to: string, subject: string, html: string): Promise<"sent" | "skipped" | "failed"> {
  const resendKey = process.env.RESEND_API_KEY;
  if (resendKey) {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: process.env.DIGEST_FROM || "SAThack <onboarding@resend.dev>",
        to,
        subject,
        html,
      }),
    });
    return response.ok ? "sent" : "failed";
  }

  const webhook = process.env.DIGEST_WEBHOOK_URL;
  if (webhook) {
    const response = await fetch(webhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ to, subject, html }),
    });
    return response.ok ? "sent" : "failed";
  }

  return "skipped";
}

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return Response.json({ ok: false, error: "CRON_SECRET is not configured" }, { status: 503 });
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    return Response.json(
      { ok: false, error: "SUPABASE_SERVICE_ROLE_KEY is not configured" },
      { status: 503 }
    );
  }

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await admin.rpc("digest_recipients");
  if (error) {
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }

  const recipients = (data ?? []) as Recipient[];
  const weekOf = new Date().toISOString().slice(0, 10);
  let sent = 0;
  let skipped = 0;
  let failed = 0;

  for (const recipient of recipients) {
    if (!recipient.email) {
      skipped += 1;
      continue;
    }
    // Don't email someone who has drifted away for more than a month; the
    // in-app mission is the re-entry point, not a mailbox reminder.
    if (recipient.last_practised) {
      const days = (Date.now() - new Date(recipient.last_practised).getTime()) / 86_400_000;
      if (days > 30) {
        skipped += 1;
        continue;
      }
    }
    const name = recipient.username?.trim() || "there";
    const subject = `${name}: ${recipient.questions} questions, ${recipient.accuracy}% accuracy this week`;
    const result = await sendEmail(recipient.email, subject, digestHtml(recipient, weekOf));
    if (result === "sent") {
      sent += 1;
      await admin.from("profiles").update({ digest_last_sent_at: new Date().toISOString() }).eq("id", recipient.user_id);
    } else if (result === "failed") {
      failed += 1;
    } else {
      skipped += 1;
    }
  }

  return Response.json({ ok: true, recipients: recipients.length, sent, skipped, failed });
}
