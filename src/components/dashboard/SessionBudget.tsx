import Link from "next/link";

const OPTIONS = [15, 25, 40, 60];

export default function SessionBudget({ active }: { active?: number }) {
  return (
    <div className="session-budget" aria-label="Short session">
      <div>
        <strong>Short on time?</strong>
        <span>Build a set that fits the minutes you actually have.</span>
      </div>
      <div className="session-budget-options">
        {OPTIONS.map((minutes) => (
          <Link
            key={minutes}
            href={`/dashboard/session?minutes=${minutes}`}
            className={`session-budget-link${active === minutes ? " active" : ""}`}
          >
            {minutes} min
          </Link>
        ))}
        {active && (
          <Link href="/dashboard/session" className="session-budget-clear">
            Clear
          </Link>
        )}
      </div>
    </div>
  );
}
