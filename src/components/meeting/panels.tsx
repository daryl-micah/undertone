"use client";

import { useState } from "react";
import { ActionItemCheck } from "@/components/action-item-check";
import { clipTitle, formatDuration, formatTimestamp } from "@/lib/format";
import { speakerColor } from "@/lib/speakers";
import type { ActionItem, Chapter, Highlight, Summary, SummaryTemplate } from "@/lib/types";
import type { ViewParticipant } from "./meeting-view";
import { SummaryPanel } from "./summary-panel";

type Tab = "summary" | "chapters" | "actions" | "highlights" | "speakers";

export function Panels({
  meetingId,
  templates,
  summaries,
  ms,
  durationMs,
  participants,
  chapters,
  actionItems,
  highlights,
  excerptOf,
  onSeek,
  onPlayClip,
  onDeleteHighlight,
}: {
  meetingId: string;
  templates: SummaryTemplate[];
  summaries: Summary[];
  ms: number;
  durationMs: number;
  participants: ViewParticipant[];
  chapters: Chapter[];
  actionItems: ActionItem[];
  highlights: Highlight[];
  excerptOf: (h: Highlight) => string | null;
  onSeek: (ms: number, play?: boolean) => void;
  onPlayClip: (h: Highlight) => void;
  onDeleteHighlight: (h: Highlight) => void;
}) {
  const [tab, setTab] = useState<Tab>("summary");
  const [copied, setCopied] = useState(false);
  const tabs: { key: Tab; label: string; count?: number }[] = [
    { key: "summary", label: "Summary" },
    { key: "chapters", label: "Chapters", count: chapters.length },
    { key: "actions", label: "Action items", count: actionItems.length },
    { key: "highlights", label: "Highlights", count: highlights.length },
    { key: "speakers", label: "Speakers", count: participants.length },
  ];
  const current = chapters.findLast((c) => c.start_ms <= ms);
  const totalTalk = participants.reduce((s, p) => s + p.talk_time_ms, 0) || 1;

  return (
    <section className="rounded-xl border border-border bg-surface">
      <div role="tablist" className="flex gap-1 overflow-x-auto px-2 shadow-[inset_0_-1px_0_var(--border)]">
        {tabs.map((t) => (
          <button
            key={t.key}
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => setTab(t.key)}
            className={`shrink-0 border-b-2 px-3 py-2.5 text-sm ${
              tab === t.key ? "border-accent font-medium text-text" : "border-transparent text-muted hover:text-text"
            }`}
          >
            {t.label}
            {t.count != null && <span className="ml-1.5 text-xs text-muted">{t.count}</span>}
          </button>
        ))}
      </div>

      <div className="p-2">
        {tab === "summary" && (
          <SummaryPanel meetingId={meetingId} templates={templates} initialSummaries={summaries} onSeek={onSeek} />
        )}

        {tab === "chapters" && (
          <ul>
            {chapters.map((c) => (
              <Row key={c.id} onClick={() => onSeek(c.start_ms, true)} active={c.id === current?.id} time={c.start_ms}>
                <span className="flex-1">{c.title}</span>
                <span className="text-xs text-muted">{formatDuration(c.end_ms - c.start_ms)}</span>
              </Row>
            ))}
          </ul>
        )}

        {tab === "actions" &&
          (actionItems.length ? (
            <>
              <ul>
                {actionItems.map((a) => (
                  <li key={a.id} className="flex items-start gap-3 rounded-lg px-2 py-2 text-sm hover:bg-surface-2">
                    <ActionItemCheck id={a.id} completedAt={a.completed_at} label={a.text} />
                    <span className="flex-1 peer-checked:text-muted peer-checked:line-through">
                      {a.text}
                      <span className="block text-xs text-muted no-underline">
                        {[a.assignee_name, a.due_hint].filter(Boolean).join(" · ")}
                      </span>
                    </span>
                    {a.source_ms != null && (
                      <button
                        onClick={() => onSeek(a.source_ms!, true)}
                        className="shrink-0 font-mono text-xs text-muted hover:text-accent"
                        aria-label={`Play from ${formatTimestamp(a.source_ms)}`}
                      >
                        {formatTimestamp(a.source_ms)}
                      </button>
                    )}
                  </li>
                ))}
              </ul>
              <div className="flex justify-end border-t border-border px-2 pt-2">
                <button
                  onClick={() => {
                    const text = actionItems
                      .map((a) => `- [ ] ${a.assignee_name ? `${a.assignee_name}: ` : ""}${a.text}${a.due_hint ? ` (${a.due_hint})` : ""}`)
                      .join("\n");
                    void navigator.clipboard.writeText(text).then(() => {
                      setCopied(true);
                      setTimeout(() => setCopied(false), 1500);
                    });
                  }}
                  className="rounded-md border border-border px-2.5 py-1 text-xs hover:bg-surface-2"
                >
                  {copied ? "Copied" : "Copy list"}
                </button>
              </div>
            </>
          ) : (
            <Empty>No action items from this meeting.</Empty>
          ))}

        {tab === "highlights" &&
          (highlights.length ? (
            <ul>
              {highlights.map((h) => (
                <li key={h.id} className="group flex items-start gap-3 rounded-lg px-2 py-2 text-sm hover:bg-surface-2">
                  <button
                    onClick={() => onPlayClip(h)}
                    aria-label={`Play clip: ${clipTitle({ title: h.title, excerpt: excerptOf(h) })}`}
                    className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-amber-300 text-[10px] text-[#1a1a18] hover:bg-amber-400"
                  >
                    ▶
                  </button>
                  <button onClick={() => onPlayClip(h)} className="min-w-0 flex-1 text-left">
                    <span className="font-medium">{clipTitle({ title: h.title, excerpt: excerptOf(h) })}</span>
                    {excerptOf(h) && <span className="mt-0.5 line-clamp-2 block text-xs text-muted">“{excerptOf(h)}”</span>}
                    {h.note && <span className="mt-1 block text-xs">{h.note}</span>}
                    <span className="mt-1 block font-mono text-[11px] text-muted">
                      {formatTimestamp(h.start_ms)}–{formatTimestamp(h.end_ms)} · {formatDuration(h.end_ms - h.start_ms)} ·{" "}
                      <span className="font-sans">{h.created_by_name}</span>
                    </span>
                  </button>
                  <button
                    onClick={() => confirm("Delete this highlight?") && onDeleteHighlight(h)}
                    aria-label={`Delete highlight: ${clipTitle({ title: h.title, excerpt: excerptOf(h) })}`}
                    className="shrink-0 rounded px-1.5 text-muted opacity-0 hover:text-rose-600 focus:opacity-100 group-hover:opacity-100"
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <Empty>
              No highlights yet. Press <kbd className="rounded border border-border px-1 font-mono text-xs">H</kbd> while
              watching, or select lines in the transcript.
            </Empty>
          ))}

        {tab === "speakers" && (
          <ul className="space-y-3 p-2">
            {participants.map((p) => {
              const share = p.talk_time_ms / totalTalk;
              return (
                <li key={p.id} className="text-sm">
                  <div className="flex items-baseline justify-between gap-2">
                    <span>
                      {p.name}
                      {p.is_host && <span className="ml-1.5 text-xs text-muted">host</span>}
                      {p.is_external && <span className="ml-1.5 text-xs text-muted">external</span>}
                    </span>
                    <span className="font-mono text-xs text-muted">
                      {formatDuration(p.talk_time_ms)} · {Math.round(share * 100)}%
                    </span>
                  </div>
                  <div className="mt-1 h-1.5 rounded-full bg-surface-2">
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${share * 100}%`, background: speakerColor(p.color, p.index) }}
                    />
                  </div>
                </li>
              );
            })}
            <li className="pt-1 text-xs text-muted">Total speaking time {formatDuration(totalTalk)} of {formatDuration(durationMs)}.</li>
          </ul>
        )}
      </div>
    </section>
  );
}

function Row({
  onClick,
  active,
  time,
  children,
}: {
  onClick: () => void;
  active?: boolean;
  time: number | null;
  children: React.ReactNode;
}) {
  return (
    <li>
      <button
        onClick={onClick}
        className={`flex w-full items-start gap-3 rounded-lg px-2 py-2 text-left text-sm hover:bg-surface-2 ${
          active ? "bg-accent-soft" : ""
        }`}
      >
        <span className="w-14 shrink-0 pt-0.5 font-mono text-xs text-muted">{time != null ? formatTimestamp(time) : ""}</span>
        {children}
      </button>
    </li>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="px-2 py-6 text-center text-sm text-muted">{children}</p>;
}
