import PracticeTestLibrary from "@/components/dashboard/PracticeTestLibrary";
import AssessmentExam from "@/components/dashboard/AssessmentExam";
import { assessmentAction } from "../assessment-actions";

export const dynamic = "force-dynamic";
export default async function TestPage({ searchParams }: { searchParams: Promise<{ mode?: string }> }) {
  if ((await searchParams).mode !== "adaptive") return <div className="dash-page"><PracticeTestLibrary /></div>;
  const initial = await assessmentAction("resume", null, { kind: "adaptive" });
  return <div className="dash-page"><AssessmentExam kind="adaptive" initial={initial} /></div>;
}
