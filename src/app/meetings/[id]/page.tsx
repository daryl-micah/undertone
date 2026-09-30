import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { SetupNotice } from "@/components/setup-notice";
import { getMeeting } from "@/lib/data";
import { formatDuration, formatMeetingDate, formatTimestamp } from "@/lib/format";
import { speakerColor } from "@/lib/speakers";
import { isConfigured } from "@/lib/supabase";

// Phase 1: a server-rendered read of every entity for one meeting. Synced playback,
// click-to-seek and the speaker timeline arrive in Phase 3.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function MeetingPage(props: PageProps<"/meetings/[id]">) {
  await connection();
  if (!isConfigured()) return <SetupNotice />;

  const { id } = await props.params;
  if (!UUID.test(id)) notFound();
  const detail = await getMeeting(id);
  if (!detail) notFound();

  const { meeting, participants, segments, chapters, actionItems, highlights, media } = detail;
  const byId = new Map(participants.map((p, i) => [p.id, { ...p, index: i }]));
  const playable = media.find((m) => m.kind === "video") ?? media.find((m) => m.kind === "audio");
  const totalTalk = participants.reduce((sum, p) => sum + p.talk_time_ms, 0) || 1;

  return (
    <div className="space-y-6">
      <div>
        <Link href="/" className="text-sm text-muted hover:text-text">
          ← Meetings
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">{meeting.title}</h1>
        <p className="text-sm text-muted">
          {formatMeetingDate(meeting.started_at)} · {formatDuration(meeting.duration_ms)} · {participants.length} people
        </p>
      </div>

      {playable ? (
        playable.kind === "video" ? (
          <video src={playable.url} controls className="w-full rounded-xl bg-black" />
        ) : (
          <audio src={playable.url} controls className="w-full" />
        )
      ) : (
        <p className="text-sm text-muted">No recording attached.</p>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <section className="rounded-xl border border-border bg-surface">
          <h2 className="border-b border-border px-4 py-3 text-sm font-medium">Transcript</h2>
          <ol className="divide-y divide-border">
            {segments.map((s) => {
              const p = s.participant_id ? byId.get(s.participant_id) : undefined;
              return (
                <li key={s.id} className="flex gap-3 px-4 py-3">
                  <span className="w-12 shrink-0 pt-0.5 font-mono text-xs text-muted">{formatTimestamp(s.start_ms)}</span>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold" style={{ color: speakerColor(p?.color, p?.index) }}>
                      {p?.name ?? s.speaker_label}
                    </p>
                    <p className="text-sm leading-relaxed">{s.text}</p>
                  </div>
                </li>
              );
            })}
          </ol>
        </section>

        <aside className="space-y-4">
          <Panel title="Speakers">
            <ul className="space-y-2.5">
              {participants.map((p, i) => {
                const pct = Math.round((p.talk_time_ms / totalTalk) * 100);
                return (
                  <li key={p.id} className="text-sm">
                    <div className="flex justify-between">
                      <span>
                        {p.name}
                        {p.is_external && <span className="ml-1.5 text-xs text-muted">external</span>}
                      </span>
                      <span className="text-muted">{pct}%</span>
                    </div>
                    <div className="mt-1 h-1.5 rounded-full bg-surface-2">
                      <div className="h-full rounded-full" style={{ width: `${pct}%`, background: speakerColor(p.color, i) }} />
                    </div>
                  </li>
                );
              })}
            </ul>
          </Panel>

          <Panel title="Chapters">
            <ul className="space-y-1.5 text-sm">
              {chapters.map((c) => (
                <li key={c.id} className="flex gap-2">
                  <span className="w-12 shrink-0 font-mono text-xs text-muted">{formatTimestamp(c.start_ms)}</span>
                  {c.title}
                </li>
              ))}
            </ul>
          </Panel>

          <Panel title="Action items">
            <ul className="space-y-2 text-sm">
              {actionItems.map((a) => (
                <li key={a.id}>
                  {a.text}
                  <p className="text-xs text-muted">
                    {[a.assignee_name, a.due_hint, a.source_ms != null && formatTimestamp(a.source_ms)]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </li>
              ))}
            </ul>
          </Panel>

          <Panel title="Highlights">
            <ul className="space-y-2 text-sm">
              {highlights.map((h) => (
                <li key={h.id}>
                  <p className="font-medium">{h.title ?? "Untitled highlight"}</p>
                  <p className="text-xs text-muted">
                    {formatTimestamp(h.start_ms)}–{formatTimestamp(h.end_ms)} · {h.created_by_name}
                  </p>
                </li>
              ))}
            </ul>
          </Panel>
        </aside>
      </div>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-border bg-surface p-4">
      <h2 className="mb-3 text-sm font-medium">{title}</h2>
      {children}
    </section>
  );
}
