import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getIsAdmin } from "@/lib/admin";
import { updateQuestion } from "@/app/admin/actions";
import { DOMAIN_ORDER } from "@/lib/plan";
import QuestionText from "@/components/QuestionText";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Edit question | SAThack admin",
  robots: { index: false, follow: false },
};

type Choice = { label: string; text: string; html: string | null };

type AdminQuestion = {
  id: string;
  source_id: string | null;
  section: string;
  domain: string;
  skill: string | null;
  difficulty: string;
  question_text: string;
  question_text_html: string | null;
  passage: string | null;
  passage_html: string | null;
  choices: Choice[] | null;
  correct_answer: string | null;
  explanation: string | null;
  is_official: boolean;
  usable: boolean;
};

const LETTERS = ["A", "B", "C", "D"] as const;

/**
 * React's form action must resolve to void, while updateQuestion reports a
 * result — so the wrapper turns that result into a redirect the page can show.
 */
async function saveQuestion(form: FormData) {
  "use server";
  const id = String(form.get("id") ?? "");
  const result = await updateQuestion(form);
  redirect(result.ok ? `/admin/questions/${id}?saved=1` : `/admin/questions/${id}?error=1`);
}

export default async function EditQuestionPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const { id } = await params;
  const { saved, error } = await searchParams;
  if (!(await getIsAdmin())) notFound();

  const supabase = await createClient();
  // Full rows (including the key) are admin-only now; the table itself no
  // longer exposes correct_answer/explanation to ordinary authenticated users.
  const { data: rawQuestion } = await supabase.rpc("admin_question", { p_id: id }).maybeSingle();
  const question = rawQuestion as unknown as AdminQuestion | null;
  if (!question) notFound();

  const choices: Choice[] = LETTERS.map((label) => {
    const found = ((question.choices ?? []) as Choice[]).find((choice) => choice.label === label);
    return { label, text: found?.text ?? "", html: found?.html ?? null };
  });

  return (
    <div className="admin-console">
      <div className="admin-section-heading">
        <div>
          <p className="eyebrow">Content library</p>
          <h2>Edit question</h2>
          <p>
            {question.is_official ? "Official question" : "Practice-test question"}
            {question.source_id ? ` · ${question.source_id}` : ""}
          </p>
        </div>
        <Link href="/admin/questions">← All questions</Link>
      </div>

      {saved && (
        <p className="admin-notice ok" role="status">
          Saved. Reload the library to see it in the list.
        </p>
      )}
      {error && (
        <p className="admin-notice bad" role="alert">
          Nothing was saved — the form needs a question, a skill, four choices and a correct answer.
        </p>
      )}

      <form action={saveQuestion} className="admin-edit">
        <input type="hidden" name="id" value={question.id} />

        <div className="admin-edit-row">
          <label>
            <span>Section</span>
            <select name="section" defaultValue={question.section ?? "reading_writing"}>
              <option value="reading_writing">Reading &amp; Writing</option>
              <option value="math">Math</option>
            </select>
          </label>
          <label>
            <span>Domain</span>
            <select name="domain" defaultValue={question.domain ?? DOMAIN_ORDER[0]}>
              {DOMAIN_ORDER.map((domain) => (
                <option key={domain} value={domain}>
                  {domain}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Skill</span>
            <input name="skill" defaultValue={question.skill ?? ""} maxLength={120} />
          </label>
          <label>
            <span>Difficulty</span>
            <select name="difficulty" defaultValue={question.difficulty ?? "medium"}>
              <option value="easy">easy</option>
              <option value="medium">medium</option>
              <option value="hard">hard</option>
            </select>
          </label>
          <label>
            <span>Correct</span>
            <select name="correct" defaultValue={question.correct_answer ?? "A"}>
              {LETTERS.map((letter) => (
                <option key={letter} value={letter}>
                  {letter}
                </option>
              ))}
            </select>
          </label>
          <label className="admin-edit-check">
            <input type="checkbox" name="usable" defaultChecked={question.usable !== false} />
            <span>Usable in practice</span>
          </label>
        </div>

        <label>
          <span>Passage</span>
          <textarea name="passage" rows={6} defaultValue={question.passage ?? ""} />
        </label>

        <label>
          <span>Question</span>
          <textarea name="question" rows={4} defaultValue={question.question_text ?? ""} required />
        </label>

        <fieldset className="admin-edit-choices">
          <legend>Choices</legend>
          {choices.map((choice) => (
            <label key={choice.label}>
              <span>{choice.label}</span>
              <input name={`choice_${choice.label}`} defaultValue={choice.text} maxLength={1200} required />
            </label>
          ))}
        </fieldset>

        <label>
          <span>Explanation</span>
          <textarea name="explanation" rows={3} defaultValue={question.explanation ?? ""} />
        </label>

        <p className="admin-edit-note">
          Text is the source of truth. Any graph or table image attached to this question is kept exactly where it
          was, and a choice&rsquo;s stored formula is kept unless you rewrite that choice.
        </p>

        <div className="admin-edit-actions">
          <button className="admin-primary" type="submit">
            Save changes
          </button>
          <Link href="/admin/questions">Cancel</Link>
        </div>
      </form>

      <section className="admin-edit-preview">
        <h3>How it renders now</h3>
        <QuestionText html={question.question_text_html} text={question.question_text ?? ""} />
        <ul>
          {choices.map((choice) => (
            <li key={choice.label}>
              <strong>{choice.label}</strong> <QuestionText html={choice.html} text={choice.text} />
            </li>
          ))}
        </ul>
        <p className="admin-edit-note">Saved changes appear after you reload this page.</p>
      </section>

      <p className="admin-edit-back">
        <Link className="btn btn-ghost" href="/admin/questions">
          <ArrowLeft size={17} /> Back to the library
        </Link>
      </p>
    </div>
  );
}
