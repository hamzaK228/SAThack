import { cache } from "react";
import { createClient } from "./server";

/**
 * Request-scoped current user.
 *
 * Backed by `getClaims()`, which verifies the session JWT **locally** against
 * the cached JWKS instead of calling the Auth server like `getUser()` does.
 * The proxy refreshes the token on every request, so claims are always fresh —
 * and each render/action saves a ~200ms network round trip to Supabase
 * (the project lives in ap-northeast-2). React `cache()` collapses the call to
 * once per request across layout, page and loaders.
 *
 * Callers only ever need `id`, `email` and `app_metadata` — the claims carry
 * all three. Extend CurrentUser (not this comment) if a caller needs more.
 */
export type CurrentUser = {
  id: string;
  email: string | null;
  app_metadata: Record<string, unknown>;
};

export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data) return null;
  // supabase-js wraps the payload in `claims`; be defensive about the shape.
  const claims = (data as { claims?: Record<string, unknown> }).claims ?? (data as Record<string, unknown>);
  const sub = typeof claims.sub === "string" ? claims.sub : null;
  if (!sub) return null;
  return {
    id: sub,
    email: typeof claims.email === "string" ? claims.email : null,
    app_metadata: (claims.app_metadata as Record<string, unknown> | undefined) ?? {},
  };
});
