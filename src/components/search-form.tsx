"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

const PLATFORMS = { zoom: "Zoom", meet: "Google Meet", teams: "Teams", upload: "Upload" } as const;

export function SearchForm({
  initial,
  speakers,
}: {
  initial: { q: string; speaker: string; platform: string; from: string; to: string };
  speakers: string[];
}) {
  const router = useRouter();
  const [v, setV] = useState(initial);
  const first = useRef(true);

  // Search as you type: the URL is the state, so results are server-rendered and shareable.
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const t = setTimeout(() => {
      const params = new URLSearchParams();
      for (const [k, val] of Object.entries(v)) if (val.trim()) params.set(k, val.trim());
      router.replace(`/search${params.size ? `?${params}` : ""}`, { scroll: false });
    }, 250);
    return () => clearTimeout(t);
  }, [v, router]);

  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setV((prev) => ({ ...prev, [k]: e.target.value }));
  const field = "rounded-md border border-border bg-surface px-2.5 py-1.5 text-sm outline-none focus:border-accent";

  return (
    <div className="space-y-3">
      <input
        type="search"
        value={v.q}
        onChange={set("q")}
        autoFocus
        placeholder="Search every meeting — try “SSO”, “churn” or “pricing”"
        className="w-full rounded-xl border border-border bg-surface px-4 py-3 text-base outline-none focus:border-accent"
      />
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <select value={v.speaker} onChange={set("speaker")} className={field} aria-label="Said by">
          <option value="">Said by anyone</option>
          {speakers.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
        <select value={v.platform} onChange={set("platform")} className={field} aria-label="Platform">
          <option value="">Any platform</option>
          {Object.entries(PLATFORMS).map(([k, label]) => (
            <option key={k} value={k}>
              {label}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-1.5 text-muted">
          From <input type="date" value={v.from} onChange={set("from")} className={field} />
        </label>
        <label className="flex items-center gap-1.5 text-muted">
          to <input type="date" value={v.to} onChange={set("to")} className={field} />
        </label>
        {(v.speaker || v.platform || v.from || v.to) && (
          <button
            onClick={() => setV((prev) => ({ ...prev, speaker: "", platform: "", from: "", to: "" }))}
            className="text-muted underline-offset-2 hover:text-text hover:underline"
          >
            Clear filters
          </button>
        )}
      </div>
    </div>
  );
}
