import Link from "next/link";
import { FileText, ArrowRight } from "lucide-react";
import { getPracticeTests } from "@/lib/practice-tests";
import { getDigitalExam } from "@/lib/digital-practice";

export default async function PracticeTestLibrary() {
  const tests = await getPracticeTests();
  const digital = new Map(await Promise.all(tests.filter((test) => !test.answerKey).map(async (test) => [test.id, await getDigitalExam(test.id)] as const)));
  return <>
    <div className="dash-head"><div><h1 className="dash-title">Practice Tests</h1>
      <p className="dash-sub">{tests.filter((test) => !test.answerKey).length} tests &middot; {tests.filter((test) => test.answerKey).length} answer keys</p>
    </div><Link className="btn btn-ghost" href="/dashboard/test?mode=adaptive">Adaptive practice <ArrowRight size={16} /></Link></div>
    {!tests.length && <p role="status">No practice tests available.</p>}
    {[...new Set(tests.map((test) => test.year))].map((year) => <section key={year}>
      <h2 className="dash-section-title">{year}</h2>
      <div className="practice-file-list">{tests.filter((test) => test.year === year).map((test) =>
        <Link key={test.id} href={`/dashboard/test/${test.id}`} className="practice-file-row">
          <FileText size={20} aria-hidden="true" /><span>{test.title}</span>
          <small>{test.answerKey ? "Answer key" : digital.get(test.id)?.questions.length
            ? `${digital.get(test.id)!.questions.length} questions${digital.get(test.id)!.issues.length ? " - Needs review" : ""}` : "Import pending"}</small><ArrowRight size={18} aria-hidden="true" />
        </Link>)}</div>
    </section>)}
  </>;
}
