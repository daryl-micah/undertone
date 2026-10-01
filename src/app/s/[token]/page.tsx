import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { connection } from "next/server";
import { ClipPlayer } from "@/components/clip-player";
import { LanguageBadge } from "@/components/language-badge";
import { SetupNotice } from "@/components/setup-notice";
import { getSharePage, type SharePage } from "@/lib/data";
import { clipTitle, formatDuration, formatMeetingDate, formatTimestamp } from "@/lib/format";
import { excerptText, parseScriptMode } from "@/lib/script";
import { speakerColor } from "@/lib/speakers";
import { isConfigured } from "@/lib/supabase";

// Link unfurlers (Slack, WhatsApp, iMessage…) fetch the page to build a preview;
// they shouldn't count as someone watching the clip.
const PREVIEW_BOT =
  /bot|crawl|spider|preview|facebookexternalhit|slack|whatsapp|telegram|discord|linkedin|skype|embedly|vercel-screenshot/i;

function englishTitle(page: SharePage) {
  if (page.kind === "meeting") return page.meeting.title;
  return clipTitle({ title: page.highlight.title, excerpt: excerptText(page.highlight, "english") });
}

export async function generateMetadata(props: PageProps<"/s/[token]">): Promise<Metadata> {
  if (!isConfigured()) return {};
  const page = await getSharePage((await props.params).token, false);
  if (!page) return { title: "Link expired · Undertone", robots: { index: false } };
  const description =
    page.kind === "highlight"
      ? `“${(excerptText(page.highlight, "english") ?? "").slice(0, 180)}” — from ${page.meeting.title}`
      : `Summary and action items from ${page.meeting.title}`;
  const title = `${englishTitle(page)} · Undertone`;
  return {
    title,
    description,
    robots: { index: false, follow: false },
    openGraph: { title, description, type: "website", siteName: "Undertone" },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default async function SharedPage(props: PageProps<"/s/[token]">) {
  await connection();
  if (!isConfigured()) return <SetupNotice />;

  const { token } = await props.params;
  const isBot = PREVIEW_BOT.test((await headers()).get("user-agent") ?? "");
  const page = await getSharePage(token, !isBot);
  const mode = parseScriptMode((await props.searchParams).script);

  if (!page) {
    return (
      <div className="mx-auto max-w-md rounded-xl border border-dashed border-border bg-surface p-10 text-center">
        <p className="font-medium">This link has expired or doesn&apos;t exist.</p>
        <p className="mt-1 text-sm text-muted">Ask whoever sent it for a new one.</p>
      </div>
    );
  }

  const { meeting, participants, share } = page;
  const hinglish = meeting.language_mix !== "en";
  const byId = new Map(participants.map((p, i) => [p.id, { name: p.name, color: speakerColor(p.color, i) }]));
  const scriptParam = mode !== "mixed" ? `&script=${mode}` : "";

  return (
    <article className="mx-auto max-w-2xl space-y-5">
      <p className="text-sm text-muted">
        <span className="text-text">
          {share.created_by_name ?? (page.kind === "highlight" ? page.highlight.created_by_name : null) ?? "Someone"}
        </span>{" "}
        shared{" "}
        {page.kind === "highlight" ? "a clip from a meeting" : "a meeting"} with you
      </p>

      <header>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">
            {page.kind === "highlight"
              ? clipTitle({ title: page.highlight.title, excerpt: excerptText(page.highlight, mode) })
              : meeting.title}
          </h1>
          <LanguageBadge meeting={meeting} />
        </div>
        <p className="mt-1 text-sm text-muted">
          {page.kind === "highlight" ? `From “${meeting.title}” · ` : ""}
          {formatMeetingDate(meeting.started_at)} ·{" "}
          {page.kind === "highlight"
            ? `${formatDuration(page.highlight.end_ms - page.highlight.start_ms)} clip at ${formatTimestamp(page.highlight.start_ms)}`
            : `${formatDuration(meeting.duration_ms)} · ${participants.length} people`}
        </p>
      </header>

      {page.kind === "highlight" ? (
        <>
          {page.highlight.note && (
            <blockquote className="rounded-lg border-l-4 border-amber-300 bg-surface px-4 py-3 text-sm">
              {page.highlight.note}
              <span className="mt-1 block text-xs text-muted">— {page.highlight.created_by_name}</span>
            </blockquote>
          )}
          <ClipPlayer
            media={page.media && { url: page.media.url, kind: page.media.kind }}
            start={page.highlight.start_ms}
            end={page.highlight.end_ms}
            hinglish={hinglish}
            initialScript={mode}
            lines={page.segments.map((s) => ({
              id: s.id,
              start_ms: s.start_ms,
              end_ms: s.end_ms,
              text: s.text,
              text_romanized: s.text_romanized,
              text_english: s.text_english,
              speaker: byId.get(s.participant_id ?? "")?.name ?? s.speaker_label,
              color: byId.get(s.participant_id ?? "")?.color ?? speakerColor(null),
            }))}
          />
          {share.allow_full_meeting ? (
            <Link
              href={`/meetings/${meeting.id}?clip=${page.highlight.id}${scriptParam}`}
              className="inline-flex rounded-md border border-border bg-surface px-3 py-1.5 text-sm font-medium hover:bg-surface-2"
            >
              Open the full meeting →
            </Link>
          ) : (
            <p className="text-xs text-muted">Only this clip was shared, not the full meeting.</p>
          )}
        </>
      ) : (
        <>
          <section className="rounded-xl border border-border bg-surface p-5">
            <h2 className="mb-3 text-sm font-medium">Summary</h2>
            {page.summary?.content ? (
              <div className="space-y-4">
                {page.summary.content.sections
                  .filter((s) => s.bullets.length)
                  .map((s) => (
                    <section key={s.key}>
                      <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">{s.title}</h3>
                      <ul className="space-y-1 text-sm leading-relaxed">
                        {s.bullets.map((b, i) => (
                          <li key={i}>
                            {b.text}
                            {b.source_ms != null && (
                              <Link
                                href={`/meetings/${meeting.id}?t=${Math.floor(b.source_ms / 1000)}${scriptParam}`}
                                className="ml-1.5 rounded bg-surface-2 px-1.5 py-px font-mono text-[11px] text-muted hover:text-accent"
                              >
                                {formatTimestamp(b.source_ms)}
                              </Link>
                            )}
                          </li>
                        ))}
                      </ul>
                    </section>
                  ))}
              </div>
            ) : (
              <p className="text-sm text-muted">No summary yet. Open the recording to read the full transcript.</p>
            )}
          </section>

          {page.actionItems.length > 0 && (
            <section className="rounded-xl border border-border bg-surface p-5">
              <h2 className="mb-2 text-sm font-medium">Action items</h2>
              <ul>
                {page.actionItems.map((a) => (
                  <li key={a.id} className="flex items-start gap-3 py-1.5 text-sm">
                    {/* Read-only here: people outside the meeting don't tick off the team's tasks. */}
                    <span
                      aria-label={a.completed_at ? "Done" : "Open"}
                      className={`mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded border text-[10px] ${
                        a.completed_at ? "border-accent bg-accent text-white" : "border-border"
                      }`}
                    >
                      {a.completed_at ? "✓" : ""}
                    </span>
                    <span className={`flex-1 ${a.completed_at ? "text-muted line-through" : ""}`}>
                      {a.text}
                      <span className="block text-xs text-muted">
                        {[a.assignee_name, a.due_hint].filter(Boolean).join(" · ")}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <Link
            href={`/meetings/${meeting.id}${mode !== "mixed" ? `?script=${mode}` : ""}`}
            className="inline-flex rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90"
          >
            Watch the recording →
          </Link>
        </>
      )}
    </article>
  );
}
