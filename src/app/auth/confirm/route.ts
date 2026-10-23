import { NextResponse } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

/**
 * Email link landings: confirmation, password recovery and magic links.
 *
 * Unlike the PKCE `?code=` handshake in /auth/callback, verifyOtp needs no
 * code_verifier from the browser that started the flow — so a student can sign
 * up on a laptop and open the link on their phone and still land signed in.
 */
const ALLOWED_NEXT = new Set(["/onboarding", "/auth/reset", "/auth/verified", "/dashboard"]);

export async function GET(request: Request) {
  const url = new URL(request.url);
  const tokenHash = url.searchParams.get("token_hash");
  const type = (url.searchParams.get("type") ?? "signup") as EmailOtpType;
  const requestedNext = url.searchParams.get("next");
  const next = requestedNext && ALLOWED_NEXT.has(requestedNext) ? requestedNext : "/dashboard";

  if (!tokenHash) {
    return NextResponse.redirect(new URL("/auth?notice=link-missing", url.origin));
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
  if (error) {
    return NextResponse.redirect(new URL("/auth?notice=link-expired", url.origin));
  }
  return NextResponse.redirect(new URL(next, url.origin));
}
