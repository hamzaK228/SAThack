"use client";

import Link from "next/link";
import { useState } from "react";
import {
  ArrowRight,
  BookOpen,
  Brain,
  Check,
  CheckCircle2,
  Clock3,
  Lightbulb,
  RotateCcw,
  Sparkles,
  Target,
  TriangleAlert,
  X,
} from "lucide-react";
import MathText from "@/components/MathText";
import type { LessonDefinition } from "@/lib/lesson-content";

export type LessonProfile = {
  attempts: number;
  accuracy: number | null;
  band: "starting" | "repair" | "building" | "mastery";
  difficulty: "easy" | "medium" | "hard";
  focusSkill: string;
  trend: number | null;
  recommendedMinutes: number;
};

type SourceNote = { book: string; page: number; chunk: number; text: string };

const BAND_COPY: Record<LessonProfile["band"], { label: string; message: string }> = {
  starting: { label: "Foundation", message: "Build the method slowly, then prove it with an untimed check." },
  repair: { label: "Repair mode", message: "Your recent results show a gap here. Focus on the decision process, not speed." },
  building: { label: "Skill building", message: "You know the basics. Explain each choice and start adding time pressure." },
  mastery: { label: "Mastery", message: "You are strong here. Hunt subtle traps and practice at hard difficulty." },
};

export default function AdaptiveLesson({
  lesson,
  profile,
  sourceNotes,
  practiceHref,
}: {
  lesson: LessonDefinition;
  profile: LessonProfile;
  sourceNotes: SourceNote[];
  practiceHref: string;
}) {
  const [current, setCurrent] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [correct, setCorrect] = useState(0);
  const [finished, setFinished] = useState(false);
  const check = lesson.checks[current];
  const answered = selected !== null;
  const band = BAND_COPY[profile.band];

  function choose(index: number) {
    if (answered) return;
    setSelected(index);
    if (index === check.answer) setCorrect((value) => value + 1);
  }

  function next() {
    if (current === lesson.checks.length - 1) {
      setFinished(true);
      return;
    }
    setCurrent((value) => value + 1);
    setSelected(null);
  }

  function restart() {
    setCurrent(0);
    setSelected(null);
    setCorrect(0);
    setFinished(false);
  }

  return (
    <div className="adaptive-lesson">
      <section className="lesson-hero">
        <div className="lesson-hero-copy">
          <p className="eyebrow">{lesson.section} · adaptive lesson</p>
          <h1>{lesson.domain}</h1>
          <p>{lesson.description}</p>
          <div className="lesson-skill-row" aria-label="Skills in this lesson">
            {lesson.skills.map((skill) => <span key={skill}>{skill}</span>)}
          </div>
        </div>
        <div className="lesson-prescription">
          <div className="lesson-prescription-head"><Sparkles size={17} /><span>Your prescription</span></div>
          <strong>{band.label}</strong>
          <p>{band.message}</p>
          <dl>
            <div><dt><Target size={14} /> Focus</dt><dd>{profile.focusSkill}</dd></div>
            <div><dt><Clock3 size={14} /> Session</dt><dd>{profile.recommendedMinutes} min</dd></div>
            <div><dt><Brain size={14} /> Practice</dt><dd>{profile.difficulty}</dd></div>
          </dl>
        </div>
      </section>

      <nav className="lesson-jump" aria-label="Lesson sections">
        <a href="#method">1. Method</a>
        <a href="#example">2. Example</a>
        <a href="#traps">3. Traps</a>
        <a href="#check">4. Mastery check</a>
      </nav>

      <section className="lesson-personal-stats" aria-label="Your performance in this domain">
        <div><span>Accuracy</span><strong>{profile.accuracy === null ? "New" : `${profile.accuracy}%`}</strong></div>
        <div><span>Questions seen</span><strong>{profile.attempts}</strong></div>
        <div><span>Recent trend</span><strong>{profile.trend === null ? "Build baseline" : profile.trend > 0 ? `+${profile.trend} pts` : `${profile.trend} pts`}</strong></div>
        <p>{profile.attempts < 5 ? "Complete a short drill after this lesson to unlock stronger personalization." : `Your next drill will start at ${profile.difficulty} difficulty and prioritize ${profile.focusSkill}.`}</p>
      </section>

      <section className="lesson-section" id="method">
        <div className="lesson-section-head"><span>01</span><div><p className="eyebrow">Learn the system</p><h2>The repeatable method</h2></div></div>
        <div className="lesson-method-grid">
          {lesson.method.map((step, index) => (
            <article key={step.title} className={index === 0 ? "priority" : ""}>
              <span>{index + 1}</span>
              <div><h3>{step.title}</h3><p><MathText text={step.detail} /></p></div>
            </article>
          ))}
        </div>
      </section>

      <section className="lesson-section" id="example">
        <div className="lesson-section-head"><span>02</span><div><p className="eyebrow">Watch it work</p><h2>{lesson.example.label}</h2></div></div>
        <article className="lesson-example">
          <div className="lesson-example-prompt"><span>Question</span><p><MathText text={lesson.example.prompt} /></p></div>
          <ol>
            {lesson.example.steps.map((step, index) => (
              <li key={step}><span>{index + 1}</span><MathText text={step} /></li>
            ))}
          </ol>
          <div className="lesson-example-answer"><CheckCircle2 size={19} /><div><span>Answer</span><p><MathText text={lesson.example.answer} /></p></div></div>
        </article>
      </section>

      <section className="lesson-section" id="traps">
        <div className="lesson-section-head"><span>03</span><div><p className="eyebrow">Protect your points</p><h2>Traps to recognize instantly</h2></div></div>
        <div className="lesson-trap-grid">
          {lesson.traps.map((trap) => (
            <article key={trap.title}><TriangleAlert size={18} /><div><h3>{trap.title}</h3><p><MathText text={trap.detail} /></p></div></article>
          ))}
        </div>
      </section>

      <section className="lesson-section" id="check">
        <div className="lesson-section-head"><span>04</span><div><p className="eyebrow">Active recall</p><h2>Mastery check</h2></div></div>
        <div className="lesson-quiz">
          {!finished ? (
            <>
              <div className="lesson-quiz-top">
                <span>Question {current + 1} of {lesson.checks.length}</span>
                <div className="lesson-quiz-progress" role="progressbar" aria-valuenow={current + (answered ? 1 : 0)} aria-valuemin={0} aria-valuemax={lesson.checks.length}>
                  <i style={{ width: `${((current + (answered ? 1 : 0)) / lesson.checks.length) * 100}%` }} />
                </div>
              </div>
              <h3><MathText text={check.question} /></h3>
              <div className="lesson-options">
                {check.options.map((option, index) => {
                  const className = answered
                    ? index === check.answer ? "correct" : index === selected ? "wrong" : "muted"
                    : "";
                  return (
                    <button key={option} className={className} onClick={() => choose(index)} disabled={answered}>
                      <span>{String.fromCharCode(65 + index)}</span><MathText text={option} />
                      {answered && index === check.answer ? <Check size={17} /> : answered && index === selected ? <X size={17} /> : null}
                    </button>
                  );
                })}
              </div>
              {answered && (
                <div className={`lesson-feedback ${selected === check.answer ? "correct" : "wrong"}`} role="status">
                  <Lightbulb size={18} />
                  <div><strong>{selected === check.answer ? "Exactly right." : "Not quite—use the rule."}</strong><p><MathText text={check.explanation} /></p></div>
                </div>
              )}
              <div className="lesson-quiz-actions">
                <span>{correct} correct so far</span>
                {answered && <button className="btn btn-primary" onClick={next}>{current === lesson.checks.length - 1 ? "See result" : "Next question"}<ArrowRight size={16} /></button>}
              </div>
            </>
          ) : (
            <div className="lesson-result">
              <span className="lesson-result-icon"><CheckCircle2 size={30} /></span>
              <p className="eyebrow">Lesson complete</p>
              <h3>{correct}/{lesson.checks.length} correct</h3>
              <p>{correct === lesson.checks.length ? "Clean work. Move into targeted practice while the method is fresh." : correct >= 2 ? "Good foundation. Review the missed rule once, then apply it in practice." : "Repeat the method slowly, then retry before starting a drill."}</p>
              <div><button className="btn btn-ghost" onClick={restart}><RotateCcw size={15} /> Retry check</button><Link className="btn btn-primary" href={practiceHref}>Start adaptive practice <ArrowRight size={16} /></Link></div>
            </div>
          )}
        </div>
      </section>

      {sourceNotes.length > 0 && (
        <details className="lesson-sources">
          <summary><BookOpen size={17} /> Source notes from your SAT library <span>{sourceNotes.length}</span></summary>
          <div>
            {sourceNotes.map((source) => (
              <article key={`${source.book}-${source.page}-${source.chunk}`}><span>{source.book} · p.{source.page}</span><p><MathText text={source.text} /></p></article>
            ))}
          </div>
        </details>
      )}

      <div className="lesson-sticky-cta">
        <div><strong>Ready to apply it?</strong><span>{profile.difficulty} · {profile.focusSkill}</span></div>
        <Link className="btn btn-primary" href={practiceHref}>Practice now <ArrowRight size={16} /></Link>
      </div>
    </div>
  );
}
