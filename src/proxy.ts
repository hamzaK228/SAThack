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
        setAll(cookiesToSet, headersToSet) {
          // NEVER write empty-value cookies from here. Sign-out happens
          // client-side, so a server-side clear is always the refresh race
          // losing — its sibling request just rotated the tokens and this
          // response would otherwise land afterwards and wipe the fresh
          // session (the "randomly signed out" bug).
          const keep = cookiesToSet.filter(({ value }) => Boolean(value));
          keep.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          keep.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
          Object.entries(headersToSet).forEach(([name, value]) =>
            supabaseResponse.headers.set(name, value)
          );
        },
      },
    });

    // Refreshes the auth token and sets refreshed cookies.
    const { error } = await supabase.auth.getClaims();
    if (error) warnOnce("[proxy] Supabase session validation failed; continuing as signed out.", error);
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
