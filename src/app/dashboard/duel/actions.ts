"use server";

import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/supabase/auth";

export type DuelMode = "quick" | "rush";
export type DuelSubject = "math" | "reading_writing";

export type DuelQuestion = {
  id: string;
  section: string;
  domain: string;
  skill: string | null;
  difficulty: string;
  is_grid_in: boolean;
  question_text: string;
  question_text_html: string | null;
  passage: string | null;
  passage_html: string | null;
  choices: { label: string; text: string; html?: string | null }[] | null;
};

export type DuelPlayer = {
  id: string;
  name: string;
  score: number;
  questionIndex: number;
  rating: number;
};

export type DuelState = {
  id: string;
  roomCode: string | null;
  matchType: "ranked" | "private";
  mode: DuelMode;
  subject: DuelSubject;
  status: "waiting" | "active" | "paused" | "sudden_death" | "completed" | "cancelled";
  startsAt: string | null;
  endsAt: string | null;
  disconnectDeadline: string | null;
  winnerId: string | null;
  me: DuelPlayer;
  opponent: DuelPlayer | null;
  question: DuelQuestion | null;
};

type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

function settingsAreValid(mode: string, subject: string): mode is DuelMode {
  return (mode === "quick" || mode === "rush") && (subject === "math" || subject === "reading_writing");
}

function friendlyError(message?: string) {
  if (message?.toLowerCase().includes("room not found")) return "That room does not exist or has already started.";
  if (message?.toLowerCase().includes("not enough questions")) return "There are not enough questions in that subject yet.";
  if (message?.toLowerCase().includes("not accepting")) return "The duel is paused or already finished.";
  return "Something went wrong. Please try again.";
}

async function requireUser() {
  const user = await getCurrentUser();
  if (!user) throw new Error("Authentication required");
  return user;
}

export async function getDuelState(matchId: string): Promise<ActionResult<DuelState>> {
  await requireUser();
  if (!/^[0-9a-f-]{36}$/i.test(matchId)) return { ok: false, error: "Invalid duel." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("duel_get_state", { match_uuid: matchId });
  if (error || !data) return { ok: false, error: friendlyError(error?.message) };
  return { ok: true, data: data as DuelState };
}

export async function findRankedDuel(mode: DuelMode, subject: DuelSubject): Promise<ActionResult<DuelState>> {
  await requireUser();
  if (!settingsAreValid(mode, subject)) return { ok: false, error: "Choose a valid mode and subject." };
  const supabase = await createClient();
  const { data: matchId, error } = await supabase.rpc("duel_find_ranked", { chosen_mode: mode, chosen_subject: subject });
  if (error || !matchId) return { ok: false, error: friendlyError(error?.message) };
  return getDuelState(matchId as string);
}

export async function createPrivateDuel(mode: DuelMode, subject: DuelSubject): Promise<ActionResult<DuelState>> {
  await requireUser();
  if (!settingsAreValid(mode, subject)) return { ok: false, error: "Choose a valid mode and subject." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("duel_create_private", { chosen_mode: mode, chosen_subject: subject });
  const row = Array.isArray(data) ? data[0] : data;
  if (error || !row?.match_id) return { ok: false, error: friendlyError(error?.message) };
  return getDuelState(row.match_id as string);
}

export async function joinPrivateDuel(code: string): Promise<ActionResult<DuelState>> {
  await requireUser();
  const clean = code.trim().toUpperCase();
  if (!/^[A-Z2-9]{6}$/.test(clean)) return { ok: false, error: "Enter the six-character room code." };
  const supabase = await createClient();
  const { data: matchId, error } = await supabase.rpc("duel_join_private", { join_code: clean });
  if (error || !matchId) return { ok: false, error: friendlyError(error?.message) };
  return getDuelState(matchId as string);
}

export async function submitDuelAnswer(matchId: string, answer: string): Promise<ActionResult<{ correct: boolean; state: DuelState }>> {
  await requireUser();
  const clean = answer.trim();
  if (!clean || clean.length > 200) return { ok: false, error: "Choose or enter an answer." };
  const supabase = await createClient();
  const { data: correct, error } = await supabase.rpc("duel_submit_answer", { match_uuid: matchId, answer: clean });
  if (error) return { ok: false, error: friendlyError(error.message) };
  const next = await getDuelState(matchId);
  if (!next.ok) return next;
  return { ok: true, data: { correct: Boolean(correct), state: next.data } };
}

export async function cancelDuel(matchId: string): Promise<ActionResult<null>> {
  await requireUser();
  const supabase = await createClient();
  const { error } = await supabase.rpc("duel_cancel", { match_uuid: matchId });
  if (error) return { ok: false, error: friendlyError(error.message) };
  return { ok: true, data: null };
}
