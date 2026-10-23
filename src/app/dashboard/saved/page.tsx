import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/supabase/auth";
import SavedQuestions from "@/components/dashboard/SavedQuestions";

export const dynamic = "force-dynamic";

export default async function SavedPage() {
  const supabase = await createClient();
  const user = await getCurrentUser();
  if (!user) return null;

  const { data: saved } = await supabase
    .from("saved_questions")
    .select("question_id, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  const qids = (saved ?? []).map((s) => s.question_id);
  // Chunked: one `.in()` with hundreds of uuids exceeds the REST gateway's URL
  // length and comes back 400, which would silently blank the whole page.
  type SavedRow = {
    id: string;
    question_text: string;
    question_text_html: string | null;
    passage: string | null;
    passage_html: string | null;
    domain: string | null;
    difficulty: string | null;
  };
  const qmap = new Map<string, SavedRow>();
  for (let index = 0; index < qids.length; index += 500) {
    const { data: qs } = await supabase
      .from("questions")
      .select("id, question_text, question_text_html, passage, passage_html, domain, difficulty")
      .in("id", qids.slice(index, index + 500));
    for (const question of (qs ?? []) as SavedRow[]) qmap.set(question.id, question);
  }
  const ordered = qids
    .map((id) => qmap.get(id))
    .filter((q): q is SavedRow => Boolean(q));

  return (
    <div className="dash-page">
      <SavedQuestions questions={ordered} />
    </div>
  );
}
