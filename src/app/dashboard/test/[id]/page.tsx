import { notFound } from "next/navigation";
import AssessmentExam from "@/components/dashboard/AssessmentExam";
import { assessmentAction } from "../../assessment-actions";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export default async function DigitalPracticePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: form } = await supabase.from("practice_forms").select("id,title").eq("id", id).eq("published", true).maybeSingle();
  if (!form) notFound();
  const initial = await assessmentAction("resume", null, { kind: "practice", formId: id });
  return <div className="dash-page"><AssessmentExam kind="practice" formId={id} title={form.title} initial={initial} /></div>;
}
