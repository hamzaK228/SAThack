import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getIsAdmin } from "@/lib/admin";
import { createClient } from "@/lib/supabase/server";
import { setQuestionDifficulty } from "@/app/admin/actions";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Question calibration | SAThack admin",
  robots: { index: false, follow: false },
};

type Row = {
  question_id: string;
  source_id: string | null;
  domain: string | null;
  skill: string | null;
  difficulty: string;
  attempts: number;
  correct: number;
  p_correct: number;
  suggested: string;
};

async function applyDifficulty(formData: FormData) {
  "use server";
  const id = String(formData.get("id") ?? "");
  const difficulty = String(formData.get("difficulty") ?? "");
  if (difficulty === "easy" || difficulty === "medium" || difficulty === "hard") {
    await setQuestionDifficulty(id, difficulty);
  }
  redirect("/admin/calibration");
}

export default async function CalibrationPage() {
  if (!(await getIsAdmin())) notFound();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_question_calibration");
  if (error) throw new Error("Could not load calibration.");
  const rows = (data ?? []) as Row[];

  return (
    <div className="admin-console">
      <div className="admin-section-heading">
        <div>
          <p className="eyebrow">Content quality</p>
          <h2>Difficulty calibration</h2>
          <p>
            Questions with at least 10 graded attempts whose observed accuracy is far from the
            label. Apply a suggested label only after reading the question.
          </p>
        </div>
        <Link href="/admin/questions">← Question library</Link>
      </div>

      <div className="admin-list-card">
        <header>
          <strong>Outliers</strong>
          <span>{rows.length}</span>
        </header>
        {rows.length === 0 ? (
          <p className="admin-empty">
            No outliers yet. Each question needs at least 10 attempts before it can be calibrated.
          </p>
        ) : (
          <div className="admin-user-table admin-calibration-table">
            {rows.map((row) => (
              <article key={row.question_id}>
                <div>
                  <strong>{row.source_id ?? row.question_id.slice(0, 8)}</strong>
                  <p>{row.domain ?? "—"} · {row.skill ?? "—"}</p>
                </div>
                <span className="admin-role">{row.difficulty}</span>
                <span>{row.attempts} tries</span>
                <span>p={Number(row.p_correct).toFixed(2)}</span>
                <span className={`admin-role ${row.suggested === row.difficulty ? "" : "admin"}`}>
                  → {row.suggested}
                </span>
                <div className="admin-row-actions">
                  <Link className="btn btn-ghost" href={`/admin/questions/${row.question_id}`}>Read</Link>
                  {row.suggested !== row.difficulty && (
                    <form action={applyDifficulty}>
                      <input type="hidden" name="id" value={row.question_id} />
                      <input type="hidden" name="difficulty" value={row.suggested} />
                      <button type="submit">Apply</button>
                    </form>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
