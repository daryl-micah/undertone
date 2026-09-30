"use client";

import Link from "next/link";
import { SCRIPT_MODES } from "@/lib/script";
import type { ScriptMode } from "@/lib/types";

const base = "rounded-md px-2.5 py-1 text-xs font-medium transition";
const on = "bg-surface text-text shadow-sm";
const off = "text-muted hover:text-text";

/**
 * Mixed / Romanized / English. Pass onChange for in-page state, or basePath to
 * render links to basePath?script=… (server pages can't pass functions).
 */
export function ScriptToggle({
  mode,
  onChange,
  basePath,
}: {
  mode: ScriptMode;
  onChange?: (m: ScriptMode) => void;
  basePath?: string;
}) {
  const hrefFor = (m: ScriptMode) => (m === "mixed" ? basePath! : `${basePath}?script=${m}`);
  return (
    <div role="radiogroup" aria-label="Transcript script" className="inline-flex shrink-0 rounded-lg bg-surface-2 p-0.5">
      {SCRIPT_MODES.map(({ key, label }) =>
        basePath ? (
          <Link
            key={key}
            href={hrefFor(key)}
            role="radio"
            aria-checked={mode === key}
            scroll={false}
            className={`${base} ${mode === key ? on : off}`}
          >
            {label}
          </Link>
        ) : (
          <button
            key={key}
            role="radio"
            aria-checked={mode === key}
            onClick={() => onChange?.(key)}
            className={`${base} ${mode === key ? on : off}`}
          >
            {label}
          </button>
        ),
      )}
    </div>
  );
}
