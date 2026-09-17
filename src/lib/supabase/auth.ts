import { cache } from "react";
import { createClient } from "./server";

/**
 * Request-scoped current user.
 *
 * `supabase.auth.getUser()` is a network round trip to the Supabase Auth
 * server, and a single dashboard render asks for the user in the layout, in the
 * page and again inside the data loaders — three round trips before any page
 * data is even fetched. React's `cache()` collapses those into one call per
 * request (and per server action).
 */
export const getCurrentUser = cache(async () => {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error) return null;
  return user;
});
