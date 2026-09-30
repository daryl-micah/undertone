import Link from "next/link";
import { connection } from "next/server";
import { SearchForm } from "@/components/search-form";
import { SetupNotice } from "@/components/setup-notice";
import { listSpeakers, search, type SearchFilters, type TranscriptHit } from "@/lib/data";
import { clipTitle, formatMeetingDate, formatTimestamp } from "@/lib/format";
import { speakerColor } from "@/lib/speakers";
import { isConfigured } from "@/lib/supabase";
import type { MeetingPlatform } from "@/lib/types";

const PLATFORM_LABEL: Record<MeetingPlatform, string> = { zoom: "Zoom", meet: "Google Meet", teams: "Teams", upload: "Upload" };
const SHOWN_PER_MEETING = 4;

export default async function SearchPage(props: PageProps<"/search">) {
  await connection();
  if (!isConfigured()) return <SetupNotice />;

  const sp = await props.searchParams;
  const str = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : "");
  const q = str("q").trim();
  const platform = str("platform");
  const filters: SearchFilters = {
    speaker: str("speaker") || undefined,
    platform: platform in PLATFORM_LABEL ? (platform as MeetingPlatform) : undefined,
    from: /^\d{4}-\d{2}-\d{2}$/.test(str("from")) ? str("from") : undefined,
    to: /^\d{4}-\d{2}-\d{2}$/.test(str("to")) ? str("to") : undefined,
  };

  const [speakers, results] = await Promise.all([listSpeakers(), q ? search(q, filters) : null]);

  // Group hits by meeting; the meeting with the most matches first.
  const groups = new Map<string, TranscriptHit[]>();
  for (const hit of results?.transcripts ?? []) groups.set(hit.meeting_id, [...(groups.get(hit.meeting_id) ?? []), hit]);
  const ordered = [...groups.values()].sort(
    (a, b) => b.length - a.length || (b[0].meeting_started_at ?? "").localeCompare(a[0].meeting_started_at ?? ""),
  );
  const link = (meetingId: string, ms: number) =>
    `/meetings/${meetingId}?t=${Math.floor(ms / 1000)}&q=${encodeURIComponent(q)}`;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Search</h1>
      <SearchForm
        initial={{ q, speaker: filters.speaker ?? "", platform: filters.platform ?? "", from: filters.from ?? "", to: filters.to ?? "" }}
        speakers={speakers}
      />

      {!results ? (
        <p className="text-sm text-muted">Search what anyone said in any meeting. Results link to the exact moment.</p>
      ) : results.transcripts.length === 0 && results.highlights.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border bg-surface p-10 text-center text-sm text-muted">
          Nothing matches “{q}”{filters.speaker || filters.platform || filters.from || filters.to ? " with these filters" : ""}.
        </p>
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-muted">
            {results.transcripts.length} {results.transcripts.length === 1 ? "moment" : "moments"} in {ordered.length}{" "}
            {ordered.length === 1 ? "meeting" : "meetings"}
            {results.highlights.length > 0 && ` · ${results.highlights.length} highlights`}
          </p>

          {results.highlights.length > 0 && (
            <section className="rounded-xl border border-amber-300 bg-surface">
              <h2 className="border-b border-border px-4 py-3 text-sm font-medium">Highlights</h2>
              <ul className="p-2">
                {results.highlights.map((h) => (
                  <li key={h.id}>
                    <Link
                      href={`/meetings/${h.meeting_id}?clip=${h.id}`}
                      className="flex gap-3 rounded-lg px-2 py-2 text-sm hover:bg-surface-2"
                    >
                      <span className="w-14 shrink-0 pt-0.5 font-mono text-xs text-muted">{formatTimestamp(h.start_ms)}</span>
                      <span className="flex-1">
                        {clipTitle(h)}
                        <span className="block text-xs text-muted">
                          {h.meeting_title} · {h.created_by_name}
                        </span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {ordered.map((hits) => {
            const m = hits[0];
            const rest = hits.slice(SHOWN_PER_MEETING);
            return (
              <section key={m.meeting_id} className="rounded-xl border border-border bg-surface">
                <div className="flex flex-wrap items-baseline gap-x-3 border-b border-border px-4 py-3">
                  <Link href={`/meetings/${m.meeting_id}?q=${encodeURIComponent(q)}`} className="font-medium hover:text-accent">
                    {m.meeting_title}
                  </Link>
                  <span className="text-xs text-muted">
                    {formatMeetingDate(m.meeting_started_at)} · {PLATFORM_LABEL[m.platform]}
                  </span>
                  <span className="ml-auto text-xs text-muted">
                    {hits.length} {hits.length === 1 ? "match" : "matches"}
                  </span>
                </div>
                <ul className="p-2">
                  {hits.slice(0, SHOWN_PER_MEETING).map((h) => (
                    <Hit key={h.seq} hit={h} href={link(h.meeting_id, h.start_ms)} />
                  ))}
                </ul>
                {rest.length > 0 && (
                  <details className="group border-t border-border">
                    <summary className="cursor-pointer list-none px-4 py-2 text-xs text-muted hover:text-text">
                      <span className="group-open:hidden">Show {rest.length} more</span>
                      <span className="hidden group-open:inline">Show fewer</span>
                    </summary>
                    <ul className="p-2 pt-0">
                      {rest.map((h) => (
                        <Hit key={h.seq} hit={h} href={link(h.meeting_id, h.start_ms)} />
                      ))}
                    </ul>
                  </details>
                )}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Hit({ hit, href }: { hit: TranscriptHit; href: string }) {
  return (
    <li>
      <Link href={href} className="flex gap-3 rounded-lg px-2 py-2 text-sm hover:bg-surface-2">
        <span className="w-14 shrink-0 pt-0.5 font-mono text-xs text-muted">{formatTimestamp(hit.start_ms)}</span>
        <span className="min-w-0 flex-1">
          <span className="text-xs font-semibold" style={{ color: speakerColor(hit.speaker_color) }}>
            {hit.speaker_name}
          </span>
          <span className="block leading-relaxed">
            <Marks text={hit.headline} />
          </span>
          {hit.headline_english && (
            <span className="mt-0.5 block text-xs leading-relaxed text-muted">
              <span className="mr-1 font-medium">EN</span>
              <Marks text={hit.headline_english} />
            </span>
          )}
        </span>
      </Link>
    </li>
  );
}

function Marks({ text }: { text: string }) {
  return text.split(/[«»]/).map((part, i) =>
    i % 2 ? (
      <mark key={i} className="rounded-sm bg-amber-200 px-0.5 text-[#1a1a18]">
        {part}
      </mark>
    ) : (
      part
    ),
  );
}
