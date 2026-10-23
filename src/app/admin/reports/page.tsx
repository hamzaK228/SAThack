import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getIsAdmin } from "@/lib/admin";
import { createClient } from "@/lib/supabase/server";
import { resolveQuestionReport } from "@/app/admin/actions";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Question reports | SAThack admin",
  robots: { index: false, follow: false },
};

type ReportRow = {
  id: string;
  question_id: string;
  reason: string;
  note: string | null;
  status: string;
  created_at: string;
  questions: { question_text: string | null; domain: string | null; skill: string | null } | null;
};

async function resolveReport(formData: FormData) {
  "use server";
  const id = String(formData.get("id") ?? "");
  const resolution = String(formData.get("resolution") ?? "");
  if (resolution === "resolved" || resolution === "dismissed") {
    await resolveQuestionReport(id, resolution);
  }
  redirect("/admin/reports");
}

const REASON_LABEL: Record<string, string> = {
  wrong_answer: "Answer key",
  broken_media: "Broken media",
  typo: "Typo",
  other: "Other",
};

export default async function QuestionReportsPage() {
  if (!(await getIsAdmin())) notFound();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("question_reports")
    .select("id, question_id, reason, note, status, created_at, questions(question_text, domain, skill)")
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) throw new Error("Could not load question reports.");
  const reports = (data ?? []) as unknown as ReportRow[];
  const open = reports.filter((report) => report.status === "open");
  const closed = reports.filter((report) => report.status !== "open");

  return (
    <div className="admin-console">
      <div className="admin-section-heading">
        <div>
          <p className="eyebrow">Content quality</p>
          <h2>Question reports</h2>
          <p>Student flags from drills and saved questions. Resolve the content, then mark the report.</p>
        </div>
        <Link href="/admin/questions">← Question library</Link>
      </div>

      <div className="admin-list-card">
        <header>
          <strong>Open</strong>
          <span>{open.length}</span>
        </header>
        {open.length === 0 ? (
          <p className="admin-empty">No open reports. Nice.</p>
        ) : (
          <div className="admin-review-list">
            {open.map((report) => (
              <article key={report.id}>
                <div>
                  <strong>{REASON_LABEL[report.reason] ?? report.reason}</strong>
                  <span>{new Date(report.created_at).toLocaleDateString()}</span>
                  <p>{report.questions?.question_text?.slice(0, 220) ?? "Question unavailable"}</p>
                  <small>{report.questions?.domain ?? "—"} · {report.questions?.skill ?? "—"}</small>
                  {report.note && <p><em>{report.note}</em></p>}
                </div>
                <div className="admin-user-actions">
                  <form action={resolveReport}>
                    <input type="hidden" name="id" value={report.id} />
                    <button className="approve" name="resolution" value="resolved">Resolve</button>
                    <button name="resolution" value="dismissed">Dismiss</button>
                  </form>
                  <Link className="btn btn-ghost" href={`/admin/questions/${report.question_id}`}>Open</Link>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>

      <div className="admin-list-card" style={{ marginTop: "1.25rem" }}>
        <header>
          <strong>Recently closed</strong>
          <span>{closed.length}</span>
        </header>
        {closed.length === 0 ? (
          <p className="admin-empty">Nothing closed yet.</p>
        ) : (
          <div className="admin-review-list">
            {closed.slice(0, 20).map((report) => (
              <article key={report.id}>
                <div>
                  <strong>{REASON_LABEL[report.reason] ?? report.reason}</strong>
                  <span>{report.status}</span>
                  <p>{report.questions?.question_text?.slice(0, 160) ?? "Question unavailable"}</p>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
