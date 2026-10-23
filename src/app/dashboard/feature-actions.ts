"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/supabase/auth";
import { generateShareToken } from "@/lib/share-token";
import { siteUrl } from "@/lib/site-url";
import type { DuelState } from "@/app/dashboard/duel/actions";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const REASONS = new Set(["content_gap", "process_slip", "misread", "time_pressure"]);
const REPORT_REASONS = new Set(["wrong_answer", "broken_media", "typo", "other"]);

function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

function cleanNote(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim().slice(0, 500);
  return text || null;
}

/** Save/replace the one reason a student attaches to a missed question. */
export async function saveAttemptNote(input: {
  question_id: string;
  reason: string;
  note?: string;
}): Promise<{ ok: boolean; error?: string }> {
  if (!isUuid(input.question_id) || !REASONS.has(input.reason)) {
    return { ok: false, error: "Choose a valid reason." };
  }
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Please sign in again." };
  const supabase = await createClient();
  const { error } = await supabase.from("attempt_notes").upsert(
    {
      user_id: user.id,
      question_id: input.question_id,
      reason: input.reason,
      note: cleanNote(input.note),
    },
    { onConflict: "user_id,question_id" }
  );
  if (error) return { ok: false, error: "Could not save that note. Please retry." };
  revalidatePath("/dashboard/review");
  revalidatePath("/dashboard/analytics");
  return { ok: true };
}

/**
 * Reveal the explanation only after the student has actually attempted the
 * question. The check is deliberately on the server so opening the network
 * panel does not hand out an unattempted key.
 */
export async function explainAttempt(questionId: string): Promise<{
  ok: boolean;
  explanation?: string | null;
  error?: string;
}> {
  if (!isUuid(questionId)) return { ok: false, error: "Unknown question." };
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Please sign in again." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("reveal_answer", { p_question_id: questionId });
  if (error) return { ok: false, error: "Could not load the explanation." };
  const row = (Array.isArray(data) ? data[0] : data) as { explanation?: string | null } | null;
  if (!row) return { ok: false, error: "Answer it once first, then the explanation unlocks." };
  return { ok: true, explanation: row.explanation ?? null };
}

/** Same unlock rule, but for the saved list where the answer itself is useful. */
export async function revealAnswer(questionId: string): Promise<{
  ok: boolean;
  correctAnswer?: string | null;
  explanation?: string | null;
  error?: string;
}> {
  if (!isUuid(questionId)) return { ok: false, error: "Unknown question." };
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Please sign in again." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("reveal_answer", { p_question_id: questionId });
  if (error) return { ok: false, error: "Could not load the answer." };
  const row = (Array.isArray(data) ? data[0] : data) as
    | { correct_answer?: string | null; explanation?: string | null }
    | null;
  if (!row) return { ok: false, error: "Answer it once first, then the answer unlocks." };
  return { ok: true, correctAnswer: row.correct_answer ?? null, explanation: row.explanation ?? null };
}

/** Student content flag; one open report per question per student. */
export async function reportQuestion(input: {
  question_id: string;
  reason: string;
  note?: string;
}): Promise<{ ok: boolean; error?: string }> {
  if (!isUuid(input.question_id) || !REPORT_REASONS.has(input.reason)) {
    return { ok: false, error: "Choose a valid reason." };
  }
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Please sign in again." };
  const supabase = await createClient();
  const { error } = await supabase.from("question_reports").insert({
    user_id: user.id,
    question_id: input.question_id,
    reason: input.reason,
    note: cleanNote(input.note),
  });
  if (error?.code === "23505") return { ok: true };
  if (error) return { ok: false, error: "Could not send that report. Please retry." };
  return { ok: true };
}

export async function createShareLink(days = 7): Promise<{
  ok: boolean;
  url?: string;
  id?: string;
  expiresAt?: string;
  error?: string;
}> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Please sign in again." };
  const window = Math.min(90, Math.max(1, Math.floor(days)));
  const supabase = await createClient();
  const token = generateShareToken();
  const expiresAt = new Date(Date.now() + window * 86_400_000).toISOString();
  const { data, error } = await supabase
    .from("share_tokens")
    .insert({ user_id: user.id, token, expires_at: expiresAt })
    .select("id")
    .single();
  if (error || !data) return { ok: false, error: "Could not create a link. Please retry." };
  revalidatePath("/dashboard/settings");
  return {
    ok: true,
    id: data.id as string,
    url: `${siteUrl.replace(/\/$/, "")}/share/${token}`,
    expiresAt,
  };
}

export async function revokeShareLink(id: string): Promise<{ ok: boolean; error?: string }> {
  if (!isUuid(id)) return { ok: false, error: "Unknown link." };
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Please sign in again." };
  const supabase = await createClient();
  const { error } = await supabase
    .from("share_tokens")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) return { ok: false, error: "Could not revoke that link." };
  revalidatePath("/dashboard/settings");
  return { ok: true };
}

export async function setDigestOptIn(enabled: boolean): Promise<{ ok: boolean; error?: string }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Please sign in again." };
  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({ digest_opt_in: Boolean(enabled) })
    .eq("id", user.id);
  if (error) return { ok: false, error: "Could not save that preference." };
  revalidatePath("/dashboard/settings");
  return { ok: true };
}

/**
 * Create a fresh private room with the same mode/subject as the finished
 * match. The old opponent can rejoin with the new code; this is an async
 * challenge rather than silently pulling the same two players into a match.
 */
export async function rematchDuel(matchId: string): Promise<{
  ok: boolean;
  state?: DuelState;
  error?: string;
}> {
  if (!isUuid(matchId)) return { ok: false, error: "Unknown duel." };
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Please sign in again." };
  const supabase = await createClient();

  const { data: old, error: oldError } = await supabase.rpc("duel_get_state", { match_uuid: matchId });
  if (oldError || !old) return { ok: false, error: "That duel is no longer available." };
  const previous = old as DuelState;

  const { data: created, error } = await supabase.rpc("duel_create_private", {
    chosen_mode: previous.mode,
    chosen_subject: previous.subject,
  });
  const row = (Array.isArray(created) ? created[0] : created) as { match_id?: string } | null;
  if (error || !row?.match_id) return { ok: false, error: "Could not create the rematch." };

  const { data: next, error: stateError } = await supabase.rpc("duel_get_state", {
    match_uuid: row.match_id,
  });
  if (stateError || !next) return { ok: false, error: "Could not open the rematch." };
  revalidatePath("/dashboard/duel");
  return { ok: true, state: next as DuelState };
}
