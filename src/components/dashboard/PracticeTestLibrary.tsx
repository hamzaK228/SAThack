import Link from "next/link";
import { ArrowRight, Monitor } from "lucide-react";
import { createClient } from "@/lib/supabase/server";

export default async function PracticeTestLibrary() {
  const supabase = await createClient();
  const [{ data: tests, error }, { data: sessions }] = await Promise.all([
    supabase.from("practice_forms").select("id,title,sequence").eq("published", true).order("sequence"),
    supabase.from("assessments").select("form_id,status,started_at").eq("kind", "practice").order("started_at", { ascending: false }),
  ]);
  if (error) throw new Error("Could not load practice tests.");
  const latest = new Map<string, string>();
  for (const session of sessions ?? []) if (session.form_id && !latest.has(session.form_id)) latest.set(session.form_id, session.status);
  return <>
    <div className="dash-head"><div><h1 className="dash-title">Practice Tests</h1>
      <p className="dash-sub">{tests?.length ?? 0} native digital tests &middot; 98 questions each &middot; adaptive modules</p>
    </div><Link className="btn btn-ghost" href="/dashboard/test?mode=adaptive">Adaptive practice <ArrowRight size={16} /></Link></div>
    {!tests?.length && <p role="status">No practice tests available.</p>}
    <section>
      <h2 className="dash-section-title">Full-length digital practice</h2>
      <div className="practice-file-list">{(tests ?? []).map((test) =>
        <Link key={test.id} href={`/dashboard/test/${test.id}`} className="practice-file-row">
          <Monitor size={20} aria-hidden="true" /><span>{test.title}</span>
          <small>{latest.get(test.id) === "in_progress" ? "Continue" : latest.get(test.id) === "completed" ? "Completed" : "Not started"}</small><ArrowRight size={18} aria-hidden="true" />
        </Link>)}</div>
    </section>
  </>;
}
