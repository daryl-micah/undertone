"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { formatTimestamp } from "@/lib/format";
import type { Summary, SummaryTemplate } from "@/lib/types";

type Job = { key: string; progress: string; startedAt: number } | null;

export function SummaryPanel({
  meetingId,
  templates,
  initialSummaries,
  onSeek,
}: {
  meetingId: string;
  templates: SummaryTemplate[];
  initialSummaries: Summary[];
  onSeek: (ms: number, play?: boolean) => void;
}) {
  const keyOf = (templateId: string) => templates.find((t) => t.id === templateId)?.key ?? "";
  const [summaries, setSummaries] = useState<Record<string, Summary>>(() =>
    Object.fromEntries(initialSummaries.filter((s) => s.status === "ready").map((s) => [keyOf(s.template_id), s])),
  );
  const [selected, setSelected] = useState(templates[0]?.key ?? "general");
  const [job, setJob] = useState<Job>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [copied, setCopied] = useState(false);
  const running = useRef(false);

  const generate = useCallback(
    async (key: string, force = false) => {
      if (running.current) return;
      running.current = true;
      setErrors((e) => ({ ...e, [key]: "" }));
      setJob({ key, progress: "Starting", startedAt: Date.now() });
      try {
        const res = await fetch(`/api/meetings/${meetingId}/summaries`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ template: key, force }),
        });
        if (!res.body) throw new Error(`Request failed (${res.status})`);
        const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
        let buffer = "";
        let finished = false;
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += value;
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          for (const line of lines.filter(Boolean)) {
            const msg = JSON.parse(line) as { progress?: string; summary?: Summary; error?: string };
            if (msg.progress) setJob((j) => j && { ...j, progress: msg.progress! });
            if (msg.summary) {
              finished = true;
              setSummaries((s) => ({ ...s, [key]: msg.summary! }));
            }
            if (msg.error) throw new Error(msg.error);
          }
        }
        // A cut-off stream (timeout, dropped connection) has no result. Without an
        // error here, the "generate on open" effect would start over, forever.
        if (!finished) throw new Error("The summary didn't finish. Try again.");
      } catch (e) {
        setErrors((errs) => ({ ...errs, [key]: e instanceof Error ? e.message : String(e) }));
      } finally {
        running.current = false;
        setJob(null);
      }
    },
    [meetingId],
  );

  // Generate the selected template the first time it's opened.
  useEffect(() => {
    if (!summaries[selected] && !errors[selected] && !job) void generate(selected);
  }, [selected, summaries, errors, job, generate]);

  const template = templates.find((t) => t.key === selected);
  const summary = summaries[selected];
  const busy = job?.key === selected;

  function copy() {
    if (!summary?.content || !template) return;
    const md = [
      `## ${template.name} summary`,
      ...summary.content.sections
        .filter((s) => s.bullets.length)
        .flatMap((s) => [``, `### ${s.title}`, ...s.bullets.map((b) => `- ${b.text}`)]),
    ].join("\n");
    void navigator.clipboard.writeText(md).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  return (
    <div>
      <div className="flex gap-1.5 overflow-x-auto px-2 pb-3 pt-1" role="radiogroup" aria-label="Summary template">
        {templates.map((t) => (
          <button
            key={t.key}
            role="radio"
            aria-checked={t.key === selected}
            disabled={Boolean(job) && t.key !== selected}
            onClick={() => setSelected(t.key)}
            title={t.description}
            className={`shrink-0 rounded-full border px-3 py-1 text-sm transition disabled:opacity-40 ${
              t.key === selected
                ? "border-accent bg-accent-soft text-accent"
                : "border-border text-muted hover:border-text/30 hover:text-text"
            }`}
          >
            {t.name}
            {summaries[t.key] && t.key !== selected && <span className="ml-1.5 text-[10px] opacity-60">●</span>}
          </button>
        ))}
      </div>

      {template && <p className="px-2 pb-3 text-xs text-muted">{template.description}</p>}

      {busy ? (
        <Generating progress={job.progress} startedAt={job.startedAt} />
      ) : errors[selected] ? (
        <div className="mx-2 rounded-lg border border-border p-4 text-sm">
          <p className="font-medium">Couldn&apos;t write this summary.</p>
          <p className="mt-1 break-words text-xs text-muted">{errors[selected]}</p>
          <button onClick={() => generate(selected, true)} className="mt-3 rounded-md bg-accent px-3 py-1.5 text-xs text-white">
            Try again
          </button>
        </div>
      ) : summary?.content ? (
        <div className="space-y-5 px-2 pb-2">
          {summary.content.sections.map((section) => (
            <section key={section.key}>
              <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted">{section.title}</h3>
              {section.bullets.length ? (
                <ul className="space-y-1">
                  {section.bullets.map((b, i) => (
                    <li key={i} className="group flex gap-2 text-sm leading-relaxed">
                      <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-text/40" aria-hidden />
                      <span className="flex-1">
                        {b.text}
                        {b.source_ms != null && (
                          <button
                            onClick={() => onSeek(b.source_ms!, true)}
                            className="ml-1.5 rounded bg-surface-2 px-1.5 py-px align-baseline font-mono text-[11px] text-muted hover:bg-accent-soft hover:text-accent"
                            aria-label={`Play from ${formatTimestamp(b.source_ms)}`}
                          >
                            {formatTimestamp(b.source_ms)}
                          </button>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted">Not discussed.</p>
              )}
            </section>
          ))}
          <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3 text-xs text-muted">
            <button onClick={copy} className="rounded-md border border-border px-2.5 py-1 text-text hover:bg-surface-2">
              {copied ? "Copied" : "Copy"}
            </button>
            <button
              onClick={() => generate(selected, true)}
              className="rounded-md border border-border px-2.5 py-1 text-text hover:bg-surface-2"
            >
              Regenerate
            </button>
            <span className="ml-auto">AI-generated · check the timestamps</span>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Generating({ progress, startedAt }: { progress: string; startedAt: number }) {
  const [now, setNow] = useState(startedAt);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const secs = Math.max(0, Math.floor((now - startedAt) / 1000));
  return (
    <div className="px-2 pb-2" aria-live="polite">
      <p className="flex items-center gap-2 text-sm">
        <span className="h-2 w-2 animate-pulse rounded-full bg-accent" />
        {progress}…<span className="font-mono text-xs text-muted">{secs}s</span>
      </p>
      {secs > 8 && (
        <p className="mt-1 text-xs text-muted">
          Long meetings are read section by section the first time. Other templates are much faster after this.
        </p>
      )}
      <div className="mt-4 space-y-2.5">
        {[88, 72, 94, 60, 80].map((w, i) => (
          <div key={i} className="h-3 animate-pulse rounded bg-surface-2" style={{ width: `${w}%` }} />
        ))}
      </div>
    </div>
  );
}
