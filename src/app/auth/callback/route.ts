import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Landing point for the PKCE `?code=` flow — social sign-in and the email
 * confirmation link both come back here. `next` is allow-listed so a hand-made
 * link can't bounce a student somewhere off-site.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next");
  const destination =
    next === "/auth/reset" || next === "/onboarding" || next === "/auth/verified"
      ? next
      : "/dashboard";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(destination, url.origin));
    console.error("[auth/callback] code exchange failed:", error.message);
  }

  // Failed social sign-in, expired link, or a direct visit. The sign-in page
  // explains it and offers the email route — landing on "your link expired"
  // was misleading for anything that wasn't an email link.
  return NextResponse.redirect(new URL("/auth?notice=oauth-failed", url.origin));
}
