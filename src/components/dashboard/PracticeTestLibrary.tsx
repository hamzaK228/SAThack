import Link from "next/link";
import { ArrowRight, Check, Clock3, FileCheck2, Monitor, Play, Sparkles } from "lucide-react";
import { createClient } from "@/lib/supabase/server";

export default async function PracticeTestLibrary() {
  const supabase = await createClient();
  const [{ data: tests, error }, { data: sessions }] = await Promise.all([
    supabase.from("practice_forms").select("id,title,sequence").eq("published", true).order("sequence"),
    supabase.from("assessments").select("form_id,status,started_at,module_index,question_index,result").eq("kind", "practice").order("started_at", { ascending: false }),
  ]);
  if (error) throw new Error("Could not load practice tests.");
  const latest = new Map<string, NonNullable<typeof sessions>[number]>();
  for (const session of sessions ?? []) if (session.form_id && !latest.has(session.form_id)) latest.set(session.form_id, session);
  const completed = [...latest.values()].filter((session) => session.status === "completed").length;
  const active = [...latest.values()].find((session) => session.status === "in_progress");
  const activeTest = (tests ?? []).find((test) => test.id === active?.form_id);
  return <>
    <div className="practice-library-head"><div><p className="eyebrow">Full-length simulation</p><h1 className="dash-title">Practice Tests</h1>
      <p className="dash-sub">Ten digital SAT forms with timed, adaptive Reading &amp; Writing and Math modules.</p>
    </div><Link className="btn btn-ghost" href="/dashboard/test?mode=adaptive"><Sparkles size={16} /> Adaptive practice</Link></div>
    <div className="practice-overview" aria-label="Practice test overview">
      <div><FileCheck2 size={19} /><span><strong>{tests?.length ?? 0}</strong> full tests</span></div>
      <div><Clock3 size={19} /><span><strong>134</strong> minutes</span></div>
      <div><Monitor size={19} /><span><strong>98</strong> questions</span></div>
      <div><Check size={19} /><span><strong>{completed}</strong> completed</span></div>
    </div>
    {active && activeTest && <Link href={`/dashboard/test/${activeTest.id}`} className="practice-resume">
      <span className="practice-resume-icon"><Play size={20} fill="currentColor" /></span>
      <div><small>Continue where you left off</small><strong>{activeTest.title}</strong><span>Module {active.module_index + 1} &middot; Question {active.question_index + 1}</span></div>
      <span className="practice-resume-action">Resume <ArrowRight size={17} /></span>
    </Link>}
    {!tests?.length && <p role="status">No practice tests available.</p>}
    <section className="practice-library-section">
      <div className="practice-section-head"><div><h2 className="dash-section-title">Choose a test</h2><p>Each form uses a different question set.</p></div><span>{completed}/{tests?.length ?? 0} complete</span></div>
      <div className="practice-test-grid">{(tests ?? []).map((test) => {
        const session = latest.get(test.id);
        const status = session?.status;
        const result = session?.result;
        const score = status === "completed" && result && typeof result === "object" && "total" in result ? Number(result.total) : null;
        return <Link key={test.id} href={`/dashboard/test/${test.id}`} className={`practice-test-card ${status ?? "new"}`}>
          <div className="practice-test-number">{String(test.sequence).padStart(2, "0")}</div>
          <div className="practice-test-card-body"><span className="practice-test-kicker">Digital SAT</span><h3>Practice Test {test.sequence}</h3><p>4 modules &middot; adaptive difficulty</p></div>
          <div className="practice-test-card-foot">
            <span className={`practice-status ${status ?? "new"}`}>{status === "in_progress" ? `Module ${(session?.module_index ?? 0) + 1}` : status === "completed" ? `${score ?? "Done"}` : "Ready"}</span>
            <span>{status === "in_progress" ? "Continue" : status === "completed" ? "Review result" : "Start"} <ArrowRight size={15} /></span>
          </div>
        </Link>;
      })}</div>
    </section>
  </>;
}
