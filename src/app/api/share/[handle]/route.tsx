import { ImageResponse } from "next/og";
import { createClient } from "@supabase/supabase-js";
import { levelFor } from "@/lib/gamification";

type ShareCard = {
  username: string | null;
  xp: number;
  questions: number;
  accuracy: number;
  activeDays: number;
};

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ handle: string }> },
) {
  const { handle } = await params;
  // No cookies on this public image: it is the same aggregate for everyone and
  // can be cached at the edge. The RPC is anon-granted and returns no PII.
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
  const { data } = await supabase.rpc("public_share_card", {
    p_handle: decodeURIComponent(handle),
  });
  const card = (data ?? null) as ShareCard | null;
  if (!card) return new Response("Not found", { status: 404 });

  const xp = Number(card.xp) || 0;
  const level = levelFor(xp);
  const name = card.username?.trim() || "Student";

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "#060705",
          color: "#eef2e6",
          padding: "64px 72px",
          fontFamily: "monospace",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ color: "#c6ff4a", fontSize: 28, letterSpacing: "-0.03em" }}>&gt; SAThack</span>
          <span style={{ color: "#9aa08e", fontSize: 20 }}>DIGITAL SAT PREP</span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 40 }}>
          <div
            style={{
              width: 148,
              height: 148,
              borderRadius: 28,
              background: "#c6ff4a",
              color: "#0a0c05",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 76,
              fontWeight: 800,
            }}
          >
            {level.level}
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <span style={{ color: "#c6ff4a", fontSize: 24 }}>@{name}</span>
            <span style={{ fontSize: 58, fontWeight: 800, letterSpacing: "-0.04em", lineHeight: 1.05 }}>
              {level.title}
            </span>
            <span style={{ color: "#9aa08e", fontSize: 24, marginTop: 10 }}>
              {xp.toLocaleString("en-US")} XP · {Number(card.questions).toLocaleString("en-US")} questions practised
            </span>
          </div>
        </div>

        <div style={{ display: "flex", gap: 22 }}>
          {[
            { label: "ACCURACY", value: `${card.accuracy}%` },
            { label: "ACTIVE DAYS", value: `${card.activeDays}` },
            { label: "QUESTIONS", value: Number(card.questions).toLocaleString("en-US") },
          ].map((stat) => (
            <div
              key={stat.label}
              style={{
                flex: 1,
                display: "flex",
                flexDirection: "column",
                border: "1px solid #22261b",
                borderRadius: 18,
                padding: "24px 28px",
                background: "#0a0b08",
              }}
            >
              <span style={{ color: "#5f6554", fontSize: 16 }}>{stat.label}</span>
              <span style={{ color: "#eef2e6", fontSize: 38, fontWeight: 700 }}>{stat.value}</span>
            </div>
          ))}
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", color: "#5f6554", fontSize: 18 }}>
          <span>Practice progress, not an official score</span>
          <span>sathack-smoky.vercel.app</span>
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
      headers: {
        // Public, aggregate-only image; cache it at the edge so anon traffic
        // cannot turn the leaderboard aggregate into a per-request scan.
        "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
      },
    }
  );
}
