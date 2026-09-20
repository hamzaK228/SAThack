import AssessmentExam from "@/components/dashboard/AssessmentExam";
import { assessmentAction } from "../assessment-actions";

export const dynamic = "force-dynamic";
export default async function DiagnosticPage() {
  const initial = await assessmentAction("resume", null, { kind: "diagnostic" });
  return <div className="dash-page"><AssessmentExam kind="diagnostic" initial={initial} /></div>;
}
