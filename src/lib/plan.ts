/**
 * Study-plan engine.
 *
 * Pure functions that turn a user's goals (current score, target score, test
 * date) and their per-domain accuracy into a week-by-week study plan. Used by
 * both the dashboard preview and the full Study plan page, so the two always
 * stay in sync.
 */

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
};

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
    const diff = new Date(input.testDate).getTime() - Date.now();
    daysLeft = Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
  }

  const weeks = daysLeft !== null ? Math.max(1, Math.ceil(daysLeft / 7)) : 8;
  const focus = rankDomains(input.stats);
  const gap = current !== null ? target - current : null;

  const tasks: PlanTask[] = [];
  let uid = 0;
  const nextId = () => `task-${++uid}`;

  for (let w = 1; w <= weeks; w++) {
    const domain = focus[(w - 1) % focus.length];
    const isFinal = w === weeks;

    if (w === 1 && current === null) {
      tasks.push({
        id: nextId(),
        week: w,
        title: "Take the diagnostic",
        domain: null,
        difficulty: null,
        minutes: 60,
        questionCount: 22,
        kind: "diagnostic",
      });
    }

    tasks.push({
      id: nextId(),
      week: w,
      title: `Learn: ${domain.domain}`,
      domain: domain.domain,
      difficulty: null,
      minutes: 25,
      questionCount: 0,
      kind: "learn",
    });
    tasks.push({
      id: nextId(),
      week: w,
      title: `Drill: ${domain.domain} (easy)`,
      domain: domain.domain,
      difficulty: "easy",
      minutes: 15,
      questionCount: 8,
      kind: "practice",
    });
    tasks.push({
      id: nextId(),
      week: w,
      title: `Drill: ${domain.domain} (medium)`,
      domain: domain.domain,
      difficulty: "medium",
      minutes: 20,
      questionCount: 10,
      kind: "practice",
    });
    tasks.push({
      id: nextId(),
      week: w,
      title: `Drill: ${domain.domain} (hard)`,
      domain: domain.domain,
      difficulty: "hard",
      minutes: 25,
      questionCount: 10,
      kind: "practice",
    });
    tasks.push({
      id: nextId(),
      week: w,
      title: "Review every miss in your error log",
      domain: null,
      difficulty: null,
      minutes: 15,
      questionCount: 0,
      kind: "review",
    });

    if (w % 2 === 0 || isFinal) {
      tasks.push({
        id: nextId(),
        week: w,
        title: "Full-length practice test",
        domain: null,
        difficulty: null,
        minutes: 90,
        questionCount: 44,
        kind: "test",
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

