"use client";

import { useState } from "react";
import { formatDuration, formatTimestamp } from "@/lib/format";
import { speakerColor } from "@/lib/speakers";
import type { ActionItem, Chapter, Highlight } from "@/lib/types";
import type { ViewParticipant } from "./meeting-view";

type Tab = "chapters" | "actions" | "highlights" | "speakers";

export function Panels({
  ms,
  durationMs,
  participants,
  chapters,
  actionItems,
  highlights,
  onSeek,
}: {
  ms: number;
  durationMs: number;
  participants: ViewParticipant[];
  chapters: Chapter[];
  actionItems: ActionItem[];
  highlights: Highlight[];
  onSeek: (ms: number, play?: boolean) => void;
}) {
  const [tab, setTab] = useState<Tab>("chapters");
  const tabs: { key: Tab; label: string; count: number }[] = [
    { key: "chapters", label: "Chapters", count: chapters.length },
    { key: "actions", label: "Action items", count: actionItems.length },
    { key: "highlights", label: "Highlights", count: highlights.length },
    { key: "speakers", label: "Speakers", count: participants.length },
  ];
  const current = chapters.findLast((c) => c.start_ms <= ms);
  const totalTalk = participants.reduce((s, p) => s + p.talk_time_ms, 0) || 1;

  return (
    <section className="rounded-xl border border-border bg-surface">
      <div role="tablist" className="flex gap-1 overflow-x-auto border-b border-border px-2">
        {tabs.map((t) => (
          <button
            key={t.key}
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => setTab(t.key)}
            className={`-mb-px shrink-0 border-b-2 px-3 py-2.5 text-sm ${
              tab === t.key ? "border-accent font-medium text-text" : "border-transparent text-muted hover:text-text"
            }`}
          >
            {t.label}
            <span className="ml-1.5 text-xs text-muted">{t.count}</span>
          </button>
        ))}
      </div>

      <div className="p-2">
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
            <ul>
              {actionItems.map((a) => (
                <Row key={a.id} onClick={() => a.source_ms != null && onSeek(a.source_ms, true)} time={a.source_ms}>
                  <span className="flex-1">
                    {a.text}
                    <span className="block text-xs text-muted">
                      {[a.assignee_name, a.due_hint].filter(Boolean).join(" · ")}
                    </span>
                  </span>
                </Row>
              ))}
            </ul>
          ) : (
            <Empty>No action items from this meeting.</Empty>
          ))}

        {tab === "highlights" &&
          (highlights.length ? (
            <ul>
              {highlights.map((h) => (
                <Row key={h.id} onClick={() => onSeek(h.start_ms, true)} time={h.start_ms}>
                  <span className="flex-1">
                    {h.title ?? "Untitled highlight"}
                    <span className="block text-xs text-muted">
                      {formatDuration(h.end_ms - h.start_ms)} · {h.created_by_name}
                    </span>
                  </span>
                </Row>
              ))}
            </ul>
          ) : (
            <Empty>No highlights yet.</Empty>
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
