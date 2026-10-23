"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/supabase/auth";

export type FriendResult = { ok: boolean; error?: string };

const cleanHandle = (handle: string) => handle.trim().replace(/^@/, "").toLowerCase();

/**
 * Invite a student by handle. Handles resolve through the community search RPC
 * because another student's `profiles` row is not readable directly (RLS keeps
 * it to its owner), and the pair index refuses a second row in either direction.
 */
export async function requestFriend(handle: string): Promise<FriendResult> {
  const supabase = await createClient();
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Sign in first." };

  const wanted = cleanHandle(handle);
  if (wanted.length < 3) return { ok: false, error: "Enter a handle — three characters or more." };

  const { data: found, error: searchError } = await supabase.rpc("search_community_users", {
    search_query: wanted,
  });
  if (searchError) return { ok: false, error: "Couldn't look up that handle." };

  const target = ((found ?? []) as { id: string; username: string | null }[]).find(
    (row) => (row.username ?? "").toLowerCase() === wanted
  );
  if (!target) return { ok: false, error: "No student with that handle." };
  if (target.id === user.id) return { ok: false, error: "That's your own handle." };

  const { error } = await supabase
    .from("friendships")
    .insert({ requester_id: user.id, addressee_id: target.id });
  if (error) {
    if (error.code === "23505") return { ok: false, error: `You already have a request with @${wanted}.` };
    return { ok: false, error: "Couldn't send the request." };
  }

  revalidatePath("/dashboard/community");
  return { ok: true };
}

/** Accept or decline a request that was sent to me. */
export async function respondFriendRequest(id: string, accept: boolean): Promise<FriendResult> {
  const supabase = await createClient();
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Sign in first." };

  const { error } = await supabase
    .from("friendships")
    .update({ status: accept ? "accepted" : "declined", responded_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { ok: false, error: "Couldn't answer that request." };

  revalidatePath("/dashboard/community");
  return { ok: true };
}

/** End a friendship, or withdraw an invitation that hasn't been answered. */
export async function removeFriend(id: string): Promise<FriendResult> {
  const supabase = await createClient();
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Sign in first." };

  const { error } = await supabase.from("friendships").delete().eq("id", id);
  if (error) return { ok: false, error: "Couldn't remove that." };

  revalidatePath("/dashboard/community");
  return { ok: true };
}
