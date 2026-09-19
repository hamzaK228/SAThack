"use server";
import { createClient } from "@/lib/supabase/server";
import type { Assessment, AssessmentKind } from "@/lib/assessment";

export async function assessmentAction(action: "start" | "resume" | "save" | "advance", id: string | null,
  payload: { kind?: AssessmentKind; formId?: string; moduleIndex?: number; questionIndex?: number; answers?: Record<string,string>; marked?: string[] }) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("assessment", { p_action: action, p_id: id, p_payload: payload });
  if (error) {
    console.error("[assessment]", { action, code: error.code });
    throw new Error("Could not save your test. Check your connection and try again.");
  }
  return data as Assessment | null;
}
