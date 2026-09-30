import Link from "next/link";
import { connection } from "next/server";
import { SetupNotice } from "@/components/setup-notice";
import { listHighlights } from "@/lib/data";
import { clipTitle, formatDuration, formatMeetingDate, formatTimestamp } from "@/lib/format";
import { isConfigured } from "@/lib/supabase";

export default async function HighlightsPage() {
  await connection();
  if (!isConfigured()) return <SetupNotice />;
  const highlights = await listHighlights();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Highlights</h1>
        <p className="text-sm text-muted">Moments people marked across every meeting, newest first.</p>
      </div>

      {highlights.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border bg-surface p-10 text-center text-sm text-muted">
          No highlights yet. Open a meeting and press H while it plays, or select lines in the transcript.
        </p>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {highlights.map((h) => (
            <li key={h.id}>
              <Link
                href={`/meetings/${h.meeting_id}?clip=${h.id}`}
                className="flex h-full flex-col rounded-xl border border-border bg-surface p-4 transition hover:border-amber-400"
              >
                <div className="flex items-center gap-2 text-xs text-muted">
                  <span className="rounded bg-amber-300 px-1.5 py-px font-mono text-[11px] text-[#1a1a18]">
                    {formatDuration(h.end_ms - h.start_ms)}
                  </span>
                  <span className="truncate">{h.meeting_title}</span>
                  <span className="ml-auto shrink-0 font-mono">{formatTimestamp(h.start_ms)}</span>
                </div>
                <p className="mt-3 font-medium">{clipTitle(h)}</p>
                {h.excerpt && <p className="mt-1 line-clamp-3 text-sm text-muted">“{h.excerpt}”</p>}
                {h.note && <p className="mt-2 text-sm">{h.note}</p>}
                <p className="mt-auto pt-3 text-xs text-muted">
                  {h.created_by_name} · {formatMeetingDate(h.created_at)}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
