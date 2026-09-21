/**
 * Study-plan engine.
 *
 * Pure functions that turn a user's goals (current score, target score, test
 * date) and their per-domain accuracy into a week-by-week study plan. Used by
 * both the dashboard preview and the full Study plan page, so the two always
 * stay in sync.
 */

import { daysUntil } from "./exam-date";

export const DOMAIN_ORDER = [
  "Algebra",
  "Advanced Math",
  "Problem-Solving and Data Analysis",
  "Geometry and Trigonometry",
  "Information and Ideas",
  "Craft and Structure",
  "Expression of Ideas",
  "Standard English Conventions",
] as const;

export type DomainStat = { domain: string; correct: number; total: number };

export type PlanTask = {
  id: string;
  week: number; // 1-based
  title: string;
  domain: string | null;
  difficulty: "easy" | "medium" | "hard" | null;
  minutes: number;
  questionCount: number;
  kind: "learn" | "practice" | "review" | "test" | "diagnostic";
  day: number;
  phase: PlanPhase;
};

export type PlanPhase = "foundation" | "skill-building" | "test-readiness" | "taper";

export type FocusDomain = {
  domain: string;
  section: "math" | "reading_writing";
  accuracy: number | null;
  total: number;
};

export type StudyPlan = {
  weeks: number;
  daysLeft: number | null;
  targetScore: number;
  currentScore: number | null;
  gap: number | null;
  focusDomains: FocusDomain[];
  weeklyMinutes: number;
  studyDaysPerWeek: number;
  dailyMinutes: number;
  tasks: PlanTask[];
};

const MATH = new Set(["Algebra", "Advanced Math", "Problem-Solving and Data Analysis", "Geometry and Trigonometry"]);

export function sectionOf(domain: string): "math" | "reading_writing" {
  return MATH.has(domain) ? "math" : "reading_writing";
}

export function accuracyOf(s: DomainStat | undefined): number | null {
  if (!s || s.total === 0) return null;
  return Math.round((s.correct / s.total) * 100);
}

/**
 * Rank domains from weakest (most urgent) to strongest. Domains with no data
 * yet are treated as unexplored and placed first so the plan builds a baseline.
 */
export function rankDomains(stats: Map<string, DomainStat>): FocusDomain[] {
  const list: FocusDomain[] = DOMAIN_ORDER.map((domain) => {
    const s = stats.get(domain);
    return {
      domain,
      section: sectionOf(domain),
      accuracy: accuracyOf(s),
      total: s?.total ?? 0,
    };
  });

  return list.sort((a, b) => {
    // Unexplored first, then lowest accuracy, then most attempted first as tiebreak.
    const aScore = a.accuracy ?? -1;
    const bScore = b.accuracy ?? -1;
    if (aScore !== bScore) return aScore - bScore;
    return b.total - a.total;
  });
}

export function buildPlan(input: {
  targetScore: number;
  currentScore: number | null;
  testDate: string | null;
  stats: Map<string, DomainStat>;
}): StudyPlan {
  const target = input.targetScore;
  const current = input.currentScore;

  let daysLeft: number | null = null;
  if (input.testDate) {
    // Local calendar days (src/lib/exam-date.ts) — never UTC, so the week count
    // doesn't slip by one in western timezones.
    daysLeft = Math.max(0, daysUntil(input.testDate) ?? 0);
  }

  const weeks = daysLeft !== null ? Math.max(1, Math.ceil(daysLeft / 7)) : 8;
  const focus = rankDomains(input.stats);
  const gap = current !== null ? target - current : null;
  const urgencyDays = daysLeft ?? 56;
  const studyDaysPerWeek = urgencyDays <= 14 ? 6 : urgencyDays <= 45 ? 5 : 4;
  const gapBoost = gap === null ? 0 : gap >= 300 ? 10 : gap >= 150 ? 5 : 0;
  const dailyMinutes = Math.min(75, (urgencyDays <= 14 ? 55 : urgencyDays <= 45 ? 45 : 35) + gapBoost);

  const tasks: PlanTask[] = [];
  let uid = 0;
  const nextId = () => `task-${++uid}`;

  const phaseFor = (week: number): PlanPhase => {
    if (week === weeks && daysLeft !== null) return "taper";
    const progress = week / Math.max(weeks, 1);
    if (progress <= 0.3) return "foundation";
    if (progress <= 0.72) return "skill-building";
    return "test-readiness";
  };

  const addTask = (
    week: number,
    day: number,
    phase: PlanPhase,
    task: Omit<PlanTask, "id" | "week" | "day" | "phase">,
  ) => tasks.push({ id: nextId(), week, day, phase, ...task });

  for (let w = 1; w <= weeks; w++) {
    const primary = focus[(w - 1) % focus.length];
    const oppositeSection = focus.find((item, index) => index !== ((w - 1) % focus.length) && item.section !== primary.section);
    const secondary = oppositeSection ?? focus[w % focus.length];
    const isFinal = w === weeks;
    const phase = phaseFor(w);
    const fullTestWeek = !isFinal && (phase === "test-readiness" || w % 2 === 0);
    let day = 1;
    const nextDay = () => Math.min(day++, studyDaysPerWeek);

    if (w === 1 && current === null) {
      addTask(w, nextDay(), phase, {
        title: "Take the diagnostic",
        domain: null,
        difficulty: null,
        minutes: 60,
        questionCount: 22,
        kind: "diagnostic",
      });
    }

    addTask(w, nextDay(), phase, {
      title: `Learn the core moves: ${primary.domain}`,
      domain: primary.domain,
      difficulty: null,
      minutes: Math.max(20, dailyMinutes - 10),
      questionCount: 0,
      kind: "learn",
    });

    addTask(w, nextDay(), phase, {
      title: `Targeted drill: ${primary.domain}`,
      domain: primary.domain,
      difficulty: phase === "foundation" ? "easy" : "medium",
      minutes: dailyMinutes,
      questionCount: phase === "foundation" ? 12 : 16,
      kind: "practice",
    });

    addTask(w, nextDay(), phase, {
      title: `Balance drill: ${secondary.domain}`,
      domain: secondary.domain,
      difficulty: phase === "foundation" ? "easy" : "medium",
      minutes: Math.max(25, dailyMinutes - 5),
      questionCount: phase === "foundation" ? 10 : 14,
      kind: "practice",
    });

    addTask(w, nextDay(), phase, {
      title: phase === "foundation" ? `Mixed practice: ${primary.section === "math" ? "Math" : "Reading & Writing"}` : "Timed mixed set",
      domain: primary.domain,
      difficulty: phase === "foundation" ? "medium" : "hard",
      minutes: dailyMinutes,
      questionCount: phase === "test-readiness" ? 20 : 15,
      kind: "practice",
    });

    addTask(w, nextDay(), phase, {
      title: "Review every miss in your error log",
      domain: null,
      difficulty: null,
      minutes: Math.max(20, dailyMinutes - 15),
      questionCount: 0,
      kind: "review",
    });

    if (fullTestWeek) {
      addTask(w, nextDay(), phase, {
        title: "Full-length timed SAT simulation",
        domain: null,
        difficulty: null,
        minutes: 134,
        questionCount: 98,
        kind: "test",
      });
    }

    if (isFinal) {
      addTask(w, nextDay(), phase, {
        title: "Light confidence review — no cramming",
        domain: primary.domain,
        difficulty: "easy",
        minutes: 25,
        questionCount: 8,
        kind: "practice",
      });
    }
  }

  const weeklyMinutes = Math.round(
    tasks.reduce((sum, t) => (t.week === 1 ? sum + t.minutes : sum), 0)
  );

  return {
    weeks,
    daysLeft,
    targetScore: target,
    currentScore: current,
    gap,
    focusDomains: focus,
    weeklyMinutes,
    studyDaysPerWeek,
    dailyMinutes,
    tasks,
  };
}

/**
 * Stable identity for a task across plan regenerations, so ticking a task off
 * survives the plan being rebuilt (AI re-run, new test date, new data).
 */
export function taskKey(task: Pick<PlanTask, "week" | "kind" | "title">): string {
  const slug = task.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `w${task.week}-${task.kind}-${slug}`;
}

/** Where a task sends the student when they start it. */
export function taskHref(task: PlanTask): string {
  switch (task.kind) {
    case "practice": {
      const params = new URLSearchParams();
      if (task.domain) params.set("domain", task.domain);
      if (task.difficulty) params.set("difficulty", task.difficulty);
      return `/dashboard/session?${params.toString()}`;
    }
    case "learn":
      return task.domain
        ? `/dashboard/lesson?domain=${encodeURIComponent(task.domain)}`
        : "/dashboard/lesson";
    case "review":
      return "/dashboard/review";
    case "test":
      return "/dashboard/test";
    case "diagnostic":
    default:
      return "/dashboard/diagnostic";
  }
}
