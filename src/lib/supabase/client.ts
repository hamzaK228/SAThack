import { createBrowserClient } from "@supabase/ssr";

/**
 * Supabase browser client (client components). Uses cookies via @supabase/ssr.
 */
export function createClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in Vercel, then redeploy."
    );
  }

  return createBrowserClient(supabaseUrl, supabaseAnonKey);
}
