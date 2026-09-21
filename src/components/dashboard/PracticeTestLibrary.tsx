import Link from "next/link";
import { ArrowRight, Check, Clock3, FileCheck2, Monitor, Play, RotateCcw, Sparkles, Target } from "lucide-react";
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
  const totalTests = tests?.length ?? 0;
  const completion = totalTests ? Math.round((completed / totalTests) * 100) : 0;
  return <>
    <section className="practice-hero" aria-labelledby="practice-library-title">
      <div className="practice-hero-copy">
        <p className="eyebrow"><span className="practice-live-dot" /> Full-length simulation</p>
        <h1 className="dash-title" id="practice-library-title">Practice like test day.</h1>
        <p className="dash-sub">Timed, adaptive Digital SAT forms with the same four-module rhythm you need to master.</p>
        <div className="practice-library-actions"><Link className="btn btn-primary" href={activeTest ? `/dashboard/test/${activeTest.id}` : totalTests ? `/dashboard/test/${tests?.[0]?.id}` : "/dashboard/test"}><Play size={16} fill="currentColor" /> {activeTest ? "Resume test" : "Start a test"}</Link><Link className="btn btn-ghost" href="/dashboard/test/review"><RotateCcw size={16} /> Review mistakes</Link><Link className="btn btn-ghost" href="/dashboard/test?mode=adaptive"><Sparkles size={16} /> Adaptive drill</Link></div>
      </div>
      <div className="practice-hero-progress" aria-label={`${completion}% of tests completed`}>
        <span className="practice-progress-label"><Target size={16} /> Test readiness</span>
        <strong>{String(completion).padStart(2, "0")}<small>%</small></strong>
        <div className="practice-progress-track"><span style={{ width: `${completion}%` }} /></div>
        <p>{completed} of {totalTests} forms completed</p>
      </div>
    </section>
    <div className="practice-overview" aria-label="Practice test overview">
      <div><FileCheck2 size={19} /><span><small>Library</small><strong>{totalTests} forms</strong></span></div>
      <div><Clock3 size={19} /><span><small>Test time</small><strong>134 min</strong></span></div>
      <div><Monitor size={19} /><span><small>Test length</small><strong>98 questions</strong></span></div>
      <div><Check size={19} /><span><small>Your record</small><strong>{completed} completed</strong></span></div>
    </div>
    {active && activeTest && <Link href={`/dashboard/test/${activeTest.id}`} className="practice-resume">
      <span className="practice-resume-icon"><Play size={20} fill="currentColor" /></span>
      <div><small>Continue where you left off</small><strong>{activeTest.title}</strong><span>Module {active.module_index + 1} &middot; Question {active.question_index + 1}</span></div>
      <span className="practice-resume-action">Resume <ArrowRight size={17} /></span>
    </Link>}
    {!tests?.length && <p role="status">No practice tests available.</p>}
    <section className="practice-library-section">
      <div className="practice-section-head"><div><p className="eyebrow">Test library</p><h2 className="dash-section-title">Choose your next form</h2><p>Each form uses a different question set and adapts after Module 1.</p></div><span>{completed}/{totalTests} complete</span></div>
      <div className="practice-test-grid">{(tests ?? []).map((test) => {
        const session = latest.get(test.id);
        const status = session?.status;
        const result = session?.result;
        const score = status === "completed" && result && typeof result === "object" && "total" in result ? Number(result.total) : null;
        return <Link key={test.id} href={`/dashboard/test/${test.id}`} className={`practice-test-card ${status ?? "new"}`}>
          <div className="practice-test-number"><small>FORM</small>{String(test.sequence).padStart(2, "0")}</div>
          <div className="practice-test-card-body"><span className="practice-test-kicker">Digital SAT &middot; Full length</span><h3>{test.title || `Practice Test ${test.sequence}`}</h3><p>R&amp;W × 2 <span /> Math × 2 <span /> Adaptive</p></div>
          <div className="practice-test-card-foot">
            <span className={`practice-status ${status ?? "new"}`}>{status === "in_progress" ? `Module ${(session?.module_index ?? 0) + 1}` : status === "completed" ? `${score ?? "Done"}` : "Ready"}</span>
            <span>{status === "in_progress" ? "Continue" : status === "completed" ? "Review result" : "Start"} <ArrowRight size={15} /></span>
          </div>
        </Link>;
      })}</div>
    </section>
  </>;
}
