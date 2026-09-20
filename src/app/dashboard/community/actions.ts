"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/supabase/auth";

type Result = { ok: boolean; error?: string };
export type CommunityUserResult = { id: string; username: string; full_name: string };

async function communityClient() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth");
  return { user, supabase: await createClient() };
}

function clean(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function isUuid(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function refreshCommunity() {
  revalidatePath("/dashboard/community");
}

export async function createCommunityGroup(input: {
  name: string;
  description: string;
}): Promise<Result> {
  const name = clean(input.name, 48);
  const description = clean(input.description, 240);
  if (name.length < 3) return { ok: false, error: "Group names need at least 3 characters." };
  const slugBase = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 42) || "study-group";
  const slug = `${slugBase}-${crypto.randomUUID().slice(0, 6)}`;
  const { user, supabase } = await communityClient();
  const { error } = await supabase.from("community_groups").insert({
    name,
    description,
    slug,
    owner_id: user.id,
    owner_name: "SAT Student",
  });
  if (error) return { ok: false, error: "Could not create that group. Please try again." };
  refreshCommunity();
  return { ok: true };
}

export async function setCommunityMembership(groupId: string, joined: boolean): Promise<Result> {
  if (!isUuid(groupId) || typeof joined !== "boolean") return { ok: false, error: "Invalid group." };
  const { user, supabase } = await communityClient();
  const query = joined
    ? supabase.from("community_group_members").insert({ group_id: groupId, user_id: user.id, role: "member" })
    : supabase.from("community_group_members").delete().eq("group_id", groupId).eq("user_id", user.id);
  const { error } = await query;
  if (error) return { ok: false, error: joined ? "Could not join this group." : "Could not leave this group." };
  refreshCommunity();
  return { ok: true };
}

export async function createCommunityPost(input: {
  title: string;
  body: string;
  kind: string;
  groupId: string | null;
}): Promise<Result> {
  const title = clean(input.title, 120);
  const body = clean(input.body, 3000);
  const kind = ["discussion", "question", "resource"].includes(input.kind) ? input.kind : "discussion";
  if (title.length < 4) return { ok: false, error: "Add a short title so people can find the discussion." };
  if (!body) return { ok: false, error: "Write a message before posting." };
  if (input.groupId !== null && !isUuid(input.groupId)) return { ok: false, error: "Invalid group." };
  const { user, supabase } = await communityClient();
  const { error } = await supabase.from("community_posts").insert({
    author_id: user.id,
    author_name: "SAT Student",
    group_id: input.groupId,
    title,
    body,
    kind,
  });
  if (error) return { ok: false, error: "Could not publish this post. Join the group first and try again." };
  refreshCommunity();
  return { ok: true };
}

export async function addCommunityComment(postId: string, bodyValue: string): Promise<Result> {
  if (!isUuid(postId)) return { ok: false, error: "Invalid post." };
  const body = clean(bodyValue, 1200);
  if (!body) return { ok: false, error: "Write a reply first." };
  const { user, supabase } = await communityClient();
  const { error } = await supabase.from("community_comments").insert({
    post_id: postId,
    author_id: user.id,
    author_name: "SAT Student",
    body,
  });
  if (error) return { ok: false, error: "Could not send your reply." };
  refreshCommunity();
  return { ok: true };
}

export async function toggleCommunityReaction(postId: string, active: boolean): Promise<Result> {
  if (!isUuid(postId) || typeof active !== "boolean") return { ok: false, error: "Invalid post." };
  const { user, supabase } = await communityClient();
  const query = active
    ? supabase.from("community_reactions").delete().eq("post_id", postId).eq("user_id", user.id)
    : supabase.from("community_reactions").insert({ post_id: postId, user_id: user.id });
  const { error } = await query;
  if (error) return { ok: false, error: "Could not update your reaction." };
  refreshCommunity();
  return { ok: true };
}

export async function deleteCommunityPost(postId: string): Promise<Result> {
  if (!isUuid(postId)) return { ok: false, error: "Invalid post." };
  const { user, supabase } = await communityClient();
  const { error } = await supabase.from("community_posts").delete().eq("id", postId).eq("author_id", user.id);
  if (error) return { ok: false, error: "Could not delete this post." };
  refreshCommunity();
  return { ok: true };
}

export async function deleteCommunityComment(commentId: string): Promise<Result> {
  if (!isUuid(commentId)) return { ok: false, error: "Invalid reply." };
  const { user, supabase } = await communityClient();
  const { error } = await supabase.from("community_comments").delete().eq("id", commentId).eq("author_id", user.id);
  if (error) return { ok: false, error: "Could not delete this reply." };
  refreshCommunity();
  return { ok: true };
}

export async function reportCommunityPost(postId: string): Promise<Result> {
  if (!isUuid(postId)) return { ok: false, error: "Invalid post." };
  const { user, supabase } = await communityClient();
  const { error } = await supabase.from("community_reports").insert({
    reporter_id: user.id,
    post_id: postId,
    reason: "other",
  });
  if (error?.code === "23505") return { ok: true };
  if (error) return { ok: false, error: "Could not send the report." };
  return { ok: true };
}

export async function searchCommunityUsers(queryValue: string): Promise<{
  ok: boolean;
  users: CommunityUserResult[];
  error?: string;
}> {
  const query = clean(queryValue, 24).toLowerCase().replace(/^@/, "");
  if (!/^[a-z0-9_]{2,24}$/.test(query)) {
    return { ok: false, users: [], error: "Enter at least 2 letters, numbers, or underscores." };
  }
  const { supabase } = await communityClient();
  const { data, error } = await supabase.rpc("search_community_users", { search_query: query });
  if (error) return { ok: false, users: [], error: "Could not search students." };
  return { ok: true, users: (data ?? []) as CommunityUserResult[] };
}
