"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useCallback } from "react";

const STATUSES = [
  { value: "unsolved", label: "Unsolved" },
  { value: "solved", label: "Solved" },
  { value: "missed", label: "Missed" },
  { value: "all", label: "All" },
];

const DIFFICULTIES = [
  { value: "", label: "Difficulty · All" },
  { value: "easy", label: "Easy" },
  { value: "medium", label: "Medium" },
  { value: "hard", label: "Hard" },
];

export default function BankFilters({
  status,
  difficulty,
  collection = "",
  collections = [],
}: {
  status: string;
  difficulty: string;
  collection?: string;
  collections?: { id: string; title: string; count: number }[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const apply = useCallback(
    (patch: Record<string, string>) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [k, v] of Object.entries(patch)) {
        if (v) params.set(k, v);
        else params.delete(k);
      }
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname);
    },
    [router, pathname, searchParams]
  );

  return (
    <div className="bank-filters">
      <select className="qb-select" aria-label="Question collection" value={collection}
        onChange={(event) => apply({ collection: event.target.value })}>
        <option value="">All collections</option>
        {collections.map((item) => <option key={item.id} value={item.id}>{item.title} ({item.count})</option>)}
      </select>
      <div className="bank-status" role="radiogroup" aria-label="Which questions to practice">
        {STATUSES.map((s) => (
          <button
            key={s.value}
            role="radio"
            aria-checked={status === s.value}
            className={`bank-status-btn${status === s.value ? " active" : ""}`}
            onClick={() => apply({ status: s.value })}
          >
            {s.label}
          </button>
        ))}
      </div>

      <select
        className="qb-select"
        value={difficulty}
        onChange={(e) => apply({ difficulty: e.target.value })}
        aria-label="Difficulty"
      >
        {DIFFICULTIES.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}
