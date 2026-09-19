import { notFound } from "next/navigation";
import { getPracticeTests } from "@/lib/practice-tests";
import { getCurrentUser } from "@/lib/supabase/auth";
import PDFPractice from "@/components/dashboard/PDFPractice";
import DigitalPracticeExam from "@/components/dashboard/DigitalPracticeExam";
import { getDigitalExam } from "@/lib/digital-practice";

export default async function PracticePDFPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [tests, user] = await Promise.all([getPracticeTests(), getCurrentUser()]);
  const test = tests.find((test) => test.id === id);
  if (!test) notFound();
  if (!user) return null;
  if (test.answerKey) return <PDFPractice id={id} title={test.title} userId={user.id} answerKey />;
  const exam = await getDigitalExam(id);
  if (!exam) return <div className="dash-page"><h1 className="dash-title">{test.title}</h1><p role="status">Digital import is not ready yet.</p></div>;
  return <DigitalPracticeExam key={id} exam={exam} userId={user.id} />;
}
