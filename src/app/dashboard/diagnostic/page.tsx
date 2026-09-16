import { createClient } from "@/lib/supabase/server";
import DiagnosticExam from "@/components/dashboard/DiagnosticExam";

export const dynamic = "force-dynamic";

const COLS =
  "id, section, domain, skill, difficulty, is_grid_in, question_text, passage, choices, correct_answer";

export default async function DiagnosticPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: rw } = await supabase
    .from("questions")
    .select(COLS)
    .eq("is_official", true)
    .eq("section", "reading_writing")
    .limit(11);

  const { data: math } = await supabase
    .from("questions")
    .select(COLS)
    .eq("is_official", true)
    .eq("section", "math")
    .limit(11);

  const questions = [...(rw ?? []), ...(math ?? [])] as never;

  return (
    <div className="dash-page">
      <div className="dash-head">
        <div>
          <h1 className="dash-title">Diagnostic</h1>
          <p className="dash-sub">
            A short, untimed baseline — 11 Reading &amp; Writing + 11 Math. We&apos;ll score it and
            build your plan around it.
          </p>
        </div>
      </div>
      <DiagnosticExam questions={questions} />
    </div>
  );
}
