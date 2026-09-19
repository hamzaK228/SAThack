import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

let warned = false;

/** Log once per server instance — this runs on every request. */
function warnOnce(message: string, error?: unknown) {
  if (warned) return;
  warned = true;
  console.error(message, error ?? "");
}

export async function proxy(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // This proxy covers every non-asset route, so anything that throws in here
  // returns "Internal Server Error" for the whole site — a missing or blank
  // env var is enough to do it (@supabase/ssr throws on both). Degrade to an
  // unauthenticated pass-through instead: the landing pages keep rendering, and
  // the auth-gated pages fail closed on their own.
  if (!supabaseUrl || !supabaseKey) {
    warnOnce(
      "[proxy] NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY must both be set " +
        "— skipping the Supabase session refresh, so signed-in users may appear logged out. " +
        "Set them in Vercel → Project → Settings → Environment Variables (Production), then redeploy."
    );
    return supabaseResponse;
  }

  try {
    const supabase = createServerClient(supabaseUrl, supabaseKey, {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    });

    // Refreshes the auth token and sets refreshed cookies.
    await supabase.auth.getClaims();
  } catch (error) {
    // Malformed URL, unreachable project, etc. — still don't take the site down.
    warnOnce("[proxy] Supabase session refresh failed; continuing without it.", error);
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|icon.svg|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
