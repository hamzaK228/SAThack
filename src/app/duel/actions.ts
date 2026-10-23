"use server";

import { createClient } from "@/lib/supabase/server";

/**
 * Server-side grading for the anonymous guest trial. The question list no
 * longer carries the answer key, so every locked answer is checked here
 * through the definer RPC — the stored answer never leaves the database.
 */
export async function checkGuestAnswer(questionId: string, answer: string): Promise<boolean> {
  if (!/^[0-9a-f-]{36}$/i.test(questionId)) return false;
  const clean = answer.trim();
  if (!clean || clean.length > 200) return false;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("guest_duel_check_answer", {
    p_question_id: questionId,
    p_answer: clean,
  });
  if (error) return false;
  return data === true;
}
