"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import dynamic from "next/dynamic";
import { ArrowLeft, ArrowRight, Flag, Grid2X2, BookOpen, X, Calculator, Check } from "lucide-react";
import type { DigitalExam } from "@/lib/digital-practice";
import { createClient } from "@/lib/supabase/client";
import { useDialog } from "@/lib/use-dialog";

const DesmosCalculator = dynamic(() => import("./DesmosCalculator"));
type Progress = { phase: "intro" | "exam" | "review" | "results"; moduleIndex: number; questionIndex: number;
  answers: Record<string, string>; marked: string[]; formats: Record<string, string>; deadline: number | null };
const fresh = (): Progress => ({ phase: "intro", moduleIndex: 0, questionIndex: 0, answers: {}, marked: [], formats: {}, deadline: null });

export default function DigitalPracticeExam({ exam, userId }: { exam: DigitalExam; userId: string }) {
  const [progress, setProgress] = useState<Progress>(fresh);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [navigator, setNavigator] = useState(false);
  const [sourcePage, setSourcePage] = useState<number | null>(null);
  const [calculator, setCalculator] = useState(false);
  const [confirmFinish, setConfirmFinish] = useState(false);
  const saveQueue=useRef<Promise<void>>(Promise.resolve());
  const [retry,setRetry]=useState(0);
  const navigatorRef=useDialog(navigator,()=>setNavigator(false));
  const sourceRef=useDialog(sourcePage!==null,()=>setSourcePage(null));
  const confirmRef=useDialog(confirmFinish,()=>setConfirmFinish(false));
  const storageKey = `digital-exam:${userId}:${exam.id}`;
  const questions = useMemo(() => new Map(exam.questions.map((question) => [question.id, question])), [exam.questions]);
  const currentModule = exam.modules[progress.moduleIndex];
  const question = questions.get(currentModule?.questionIds[progress.questionIndex]);
  const seconds = progress.deadline ? Math.max(0, Math.ceil((progress.deadline-now)/1000)) : 0;
  const locked = progress.phase === "results" || seconds === 0;
  const imageUrl = (asset: string) => `/dashboard/test/images/${exam.id}/${asset}.webp`;

  useEffect(() => {
    if (progress.phase !== "exam") return;
    const nextId = exam.modules[progress.moduleIndex]?.questionIds[progress.questionIndex+1];
    if (!nextId) return;
    const nextImage = new window.Image();
    nextImage.src = `/dashboard/test/images/${exam.id}/${nextId}.webp`;
  }, [exam.id, exam.modules, progress.phase, progress.moduleIndex, progress.questionIndex]);
  useEffect(() => {
    let active=true;
    async function restore() {
      let saved;
      try { saved=JSON.parse(localStorage.getItem(storageKey) ?? "null"); } catch {}
      try {
        const {data,error}=await createClient().from("digital_test_progress").select("progress,updated_at").eq("user_id",userId).eq("test_id",exam.id).maybeSingle();
        if(error)throw error;
        if(data && Date.parse(data.updated_at)>(saved?._savedAt ?? 0))saved=data.progress;
      }catch {if(active)setError("Cloud progress is unavailable. Your browser copy will be used.");}
      if(!active)return;
      if(saved && ["intro","exam","review","results"].includes(saved.phase)
        && Number.isInteger(saved.moduleIndex) && saved.moduleIndex>=0 && saved.moduleIndex<exam.modules.length
        && Number.isInteger(saved.questionIndex) && saved.questionIndex>=0 && saved.questionIndex<exam.modules[saved.moduleIndex].questionIds.length
        && saved.answers && Array.isArray(saved.marked) && saved.formats
        && (saved.deadline===null || Number.isFinite(saved.deadline)))setProgress(saved);
      setReady(true);
    }
    void restore();
    return ()=>{active=false;};
  },[storageKey,userId,exam.id,exam.modules]);
  useEffect(()=>{
    if(!ready)return;
    const savedAt=Date.now();
    try {localStorage.setItem(storageKey,JSON.stringify({...progress,_savedAt:savedAt}));} catch {}
    const timer=window.setTimeout(()=>{
      saveQueue.current=saveQueue.current.catch(()=>{}).then(async()=>{
        const {error}=await createClient().from("digital_test_progress").upsert({user_id:userId,test_id:exam.id,progress,updated_at:new Date(savedAt).toISOString()});
        if(error)setError("Progress could not sync. Check your connection and retry.");
        else setError(null);
      }).catch(()=>setError("Progress could not sync. Check your connection and retry."));
    },350);
    return ()=>window.clearTimeout(timer);
  },[progress,ready,storageKey,userId,exam.id,retry]);
  useEffect(() => {
    if (progress.phase !== "exam" && progress.phase !== "review") return;
    const interval = window.setInterval(() => {
      const time = Date.now();
      setNow(time);
      if (progress.deadline && time >= progress.deadline) {
        setProgress((previous) => previous.phase === "exam" ? { ...previous, phase: "review" } : previous);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [progress.phase, progress.deadline]);

  function start(reset: boolean) {
    const time = Date.now();
    setNow(time);
    setProgress((previous) => {
      const base = reset ? fresh() : previous;
      return { ...base, phase: "exam", deadline: reset || !base.deadline ? time + exam.modules[base.moduleIndex].minutes*60000 : base.deadline };
    });
  }
  function goto(index: number) {
    setProgress((previous) => ({ ...previous, questionIndex: index, phase: "exam" }));
    setNavigator(false);
  }
  function answer(value: string) {
    if (!question || locked) return;
    setProgress((previous) => ({ ...previous, answers: { ...previous.answers, [question.id]: value } }));
  }
  function finishModule() {
    const nextIndex = progress.moduleIndex+1;
    setConfirmFinish(false);
    setNow(Date.now());
    setProgress((previous) => nextIndex < exam.modules.length
      ? { ...previous, moduleIndex: nextIndex, questionIndex: 0, phase: "exam", deadline: Date.now()+exam.modules[nextIndex].minutes*60000 }
      : { ...previous, phase: "results", deadline: null });
  }
  const answered = exam.questions.filter((item) => progress.answers[item.id]?.trim()).length;
  const moduleUnanswered = currentModule?.questionIds.filter((id) => !progress.answers[id]?.trim()).length ?? 0;
  const format = question ? progress.formats[question.id] ?? question.kind : "multiple_choice";

  if (!exam.questions.length || !currentModule) return <p role="status">No question records are available for this test yet.</p>;
  return <div className="digital-exam">
    <div className="dash-head"><h1 className="pdf-title">{exam.title}</h1><Link className="btn btn-ghost" href="/dashboard/test">All tests</Link></div>
    {error && <p role="alert">{error} <button className="btn btn-ghost" onClick={()=>setRetry(n=>n+1)}>Retry sync</button></p>}
    {progress.phase === "intro" ? <>
      <div className="exam-modules">{exam.modules.map((item) => <div key={item.id} className="exam-module"><span className="exam-module-label">{item.label}</span><span className="exam-module-meta">{item.questionIds.length} questions &middot; {item.minutes} min</span></div>)}</div>
      <p className="dash-sub">{exam.questions.length} questions</p>
      {exam.issues.length > 0 && <p role="status">Source import needs review: {exam.issues.length} items.</p>}
      <button className="btn btn-primary" disabled={!ready} onClick={() => start(true)}>Start test</button>
    </> : progress.phase === "results" ? <>
      <h2 className="dash-section-title">Test complete</h2>
      <p>{answered}/{exam.questions.length} answered</p>
      <p className="dash-sub">Not graded: a verified answer key has not been imported.</p>
      <div className="digital-result-list">{exam.questions.map((item) => <div key={item.id}><span>{exam.modules.find((m) => m.id === item.moduleId)?.label} &middot; {item.number}</span><strong>{progress.answers[item.id] || "Unanswered"}</strong><button className="dash-tool" title="View question" aria-label={`View question ${item.number}`} onClick={() => setSourcePage(item.page)}><BookOpen size={18} /></button></div>)}</div>
      <button className="btn btn-ghost" onClick={() => start(true)}>Retake test</button>
    </> : <>
      <header className="exam-bar"><span className="exam-module-title">{currentModule.label}</span><span className="exam-timer">{Math.floor(seconds/60).toString().padStart(2,"0")}:{(seconds%60).toString().padStart(2,"0")}</span>
        <button className="dash-tool" title="Question navigator" aria-label="Question navigator" onClick={() => setNavigator(true)}><Grid2X2 size={20} /></button>
        {currentModule.section === "math" && <button className="dash-tool" title="Calculator" aria-label="Calculator" onClick={() => setCalculator(true)}><Calculator size={20} /></button>}
      </header>
      {progress.phase === "review" ? <div className="exam-review">
        <h2 className="dash-section-title">Review module</h2><p>{moduleUnanswered} unanswered</p>
        <div className="exam-nav-grid">{currentModule.questionIds.map((id,index) => <button key={id} className={`exam-nav-btn ${progress.answers[id] ? "answered" : "unanswered"}${progress.marked.includes(id) ? " forreview" : ""}`} onClick={() => goto(index)}>{questions.get(id)?.number}</button>)}</div>
        <button className="btn btn-primary" onClick={() => setConfirmFinish(true)}>{progress.moduleIndex === exam.modules.length-1 ? "Submit test" : "Next module"}</button>
      </div> : question && <>
        <div className="exam-qhead"><strong>Question {question.number}</strong><span>{progress.questionIndex+1}/{currentModule.questionIds.length}</span>
          <button className="dash-tool" title="Mark for review" aria-label="Mark for review" aria-pressed={progress.marked.includes(question.id)} onClick={() => setProgress((previous) => ({ ...previous, marked: previous.marked.includes(question.id) ? previous.marked.filter((id) => id !== question.id) : [...previous.marked, question.id] }))}><Flag size={18} /></button>
          <button className="dash-tool" title="Source passage and page" aria-label="Source passage and page" onClick={() => setSourcePage(question.page)}><BookOpen size={18} /></button>
        </div>
        <div key={question.id} className="digital-question-scan"><Image unoptimized src={imageUrl(question.id)} width={1000} height={1600} alt={`Question ${question.number}, including original text, figures and printed choices`} /></div>
        <div className="digital-answer-bar">
          <label>Answer format <select value={format} disabled={locked} onChange={(event) => setProgress((previous) => ({ ...previous, formats: { ...previous.formats, [question.id]: event.target.value }, answers: { ...previous.answers, [question.id]: "" } }))}><option value="multiple_choice">Multiple choice</option><option value="grid_in">Numeric</option></select></label>
          {format === "grid_in" ? <input className="field-input exam-input" aria-label="Numeric answer" disabled={locked} value={progress.answers[question.id] ?? ""} onChange={(event) => answer(event.target.value)} />
            : <div className="digital-choice-row">{["A","B","C","D"].map((label) => <button key={label} className={`exam-choice${progress.answers[question.id] === label ? " selected" : ""}`} aria-label={`Answer ${label}`} aria-pressed={progress.answers[question.id] === label} disabled={locked} onClick={() => answer(label)}>{label}</button>)}</div>}
        </div>
        <footer className="exam-footer"><button className="dash-tool" title="Previous question" aria-label="Previous question" disabled={progress.questionIndex===0} onClick={() => goto(progress.questionIndex-1)}><ArrowLeft size={20}/></button>
          <button className="btn btn-ghost" onClick={() => setProgress((previous) => ({...previous,phase:"review"}))}>Review module</button>
          <button className="dash-tool" title="Next question" aria-label="Next question" onClick={() => progress.questionIndex<currentModule.questionIds.length-1 ? goto(progress.questionIndex+1) : setProgress((previous) => ({...previous,phase:"review"}))}><ArrowRight size={20}/></button></footer>
      </>}
    </>}
    {navigator && <div className="exam-nav-overlay" onClick={() => setNavigator(false)}><div className="exam-nav" ref={navigatorRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label="Question navigator" onClick={(event) => event.stopPropagation()}><button className="dash-tool" aria-label="Close navigator" title="Close navigator" onClick={() => setNavigator(false)}><X size={18}/></button><div className="exam-nav-grid">{currentModule.questionIds.map((id,index) => <button key={id} className={`exam-nav-btn ${progress.answers[id] ? "answered" : "unanswered"}${progress.marked.includes(id) ? " forreview" : ""}`} onClick={() => goto(index)}>{questions.get(id)?.number}</button>)}</div></div></div>}
    {sourcePage !== null && <div className="exam-nav-overlay"><div className="digital-source" ref={sourceRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label="Source pages"><div className="pdf-controls"><button className="dash-tool" title="Previous source page" aria-label="Previous source page" disabled={sourcePage===0} onClick={() => setSourcePage(sourcePage-1)}><ArrowLeft size={18}/></button><span>Page {sourcePage+1}/{exam.pageCount}</span><button className="dash-tool" title="Next source page" aria-label="Next source page" disabled={sourcePage===exam.pageCount-1} onClick={() => setSourcePage(sourcePage+1)}><ArrowRight size={18}/></button><button className="dash-tool" title="Close source pages" aria-label="Close source pages" onClick={() => setSourcePage(null)}><X size={18}/></button></div><Image unoptimized src={imageUrl(`page-${sourcePage}`)} width={1500} height={2000} alt={`Original source page ${sourcePage+1}`} /></div></div>}
    {confirmFinish && <div className="exam-nav-overlay"><div className="exam-nav" ref={confirmRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label="Confirm module submission"><h2 className="dash-section-title">Submit module?</h2><p>{moduleUnanswered} unanswered</p><div className="pdf-controls"><button className="btn btn-ghost" onClick={() => setConfirmFinish(false)}>Cancel</button><button className="btn btn-primary" onClick={finishModule}><Check size={18}/>Submit</button></div></div></div>}
    {calculator && <DesmosCalculator open onClose={() => setCalculator(false)} />}
  </div>;
}
