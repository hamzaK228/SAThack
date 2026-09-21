import { cache } from "react";
import { getCurrentUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";

/** Server-only admin check. app_metadata is issuer-controlled; user_metadata is intentionally ignored. */
export const getIsAdmin = cache(async (): Promise<boolean> => {
  const user = await getCurrentUser();
  if (!user) return false;
  if (user.app_metadata?.role === "admin" || user.app_metadata?.is_admin === true) return true;

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("is_admin");
  return !error && data === true;
});
