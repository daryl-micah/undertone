import "server-only";
import { formatTimestamp } from "./format";
import { chatJson, SUMMARY_MODEL } from "./groq";
import { db } from "./supabase";
import type { Chapter, Participant, Summary, SummaryContent, SummaryTemplate, TranscriptSegment } from "./types";

// Long meetings don't fit Groq's free-tier token budget in one request, so:
//   1. condense: groups of chapters -> dense notes that cite transcript line numbers,
//      stored once per meeting in chapters.summary;
//   2. summarize: one request per template over those notes (or over the raw
//      transcript when the meeting is short enough).
// The model cites line numbers ("L123"); we map them to timestamps ourselves.

const DIRECT_LIMIT_CHARS = 14_000; // ~3.5k tokens of transcript: summarize directly
const GROUP_LIMIT_CHARS = 11_000; // per condense request

export type Progress = (message: string) => void;

interface Loaded {
  meetingTitle: string;
  participants: Participant[];
  segments: TranscriptSegment[];
  chapters: Chapter[];
}

async function load(meetingId: string): Promise<Loaded> {
  const client = db();
  const [meeting, participants, chapters] = await Promise.all([
    client.from("meetings").select("title").eq("id", meetingId).single(),
    client.from("participants").select("*").eq("meeting_id", meetingId),
    client.from("chapters").select("*").eq("meeting_id", meetingId).order("start_ms"),
  ]);
  for (const r of [meeting, participants, chapters]) if (r.error) throw r.error;

  const segments: TranscriptSegment[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await client
      .from("transcript_segments")
      .select("id, meeting_id, seq, participant_id, speaker_label, start_ms, end_ms, text")
      .eq("meeting_id", meetingId)
      .order("seq")
      .range(from, from + 999);
    if (error) throw error;
    segments.push(...(data as TranscriptSegment[]));
    if (data.length < 1000) break;
  }
  return {
    meetingTitle: meeting.data!.title,
    participants: participants.data as Participant[],
    segments,
    chapters: chapters.data as Chapter[],
  };
}

function transcriptLines(m: Loaded, segs: TranscriptSegment[]) {
  const name = new Map(m.participants.map((p) => [p.id, p.name]));
  return segs
    .map((s) => `L${s.seq} [${formatTimestamp(s.start_ms)}] ${name.get(s.participant_id ?? "") ?? s.speaker_label}: ${s.text}`)
    .join("\n");
}

function attendees(m: Loaded) {
  return m.participants
    .map((p) => `${p.name}${p.is_host ? " (host)" : ""}${p.is_external ? " (external)" : ""}`)
    .join(", ");
}

// --- 1. condense ---------------------------------------------------------------

const NOTES_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["chapters"],
  properties: {
    chapters: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["index", "notes"],
        properties: {
          index: { type: "integer" },
          notes: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["text", "line"],
              properties: { text: { type: "string" }, line: { type: "integer" } },
            },
          },
        },
      },
    },
  },
};

async function condense(m: Loaded, progress: Progress) {
  const pending = m.chapters.map((c, i) => ({ c, i })).filter(({ c }) => !c.summary);
  if (!pending.length) return;

  const segsOf = (c: Chapter) => m.segments.filter((s) => s.start_ms >= c.start_ms && s.start_ms < c.end_ms);

  // Pack consecutive chapters into requests that fit the token budget.
  const groups: { c: Chapter; i: number; text: string }[][] = [];
  let size = Infinity;
  for (const { c, i } of pending) {
    const text = transcriptLines(m, segsOf(c));
    if (size + text.length > GROUP_LIMIT_CHARS) {
      groups.push([]);
      size = 0;
    }
    groups.at(-1)!.push({ c, i, text });
    size += text.length;
  }

  for (const [g, group] of groups.entries()) {
    progress(`Reading the meeting (part ${g + 1} of ${groups.length})`);
    const out = await chatJson<{ chapters: { index: number; notes: { text: string; line: number }[] }[] }>({
      schemaName: "chapter_notes",
      schema: NOTES_SCHEMA,
      maxTokens: 3000,
      system:
        "You take precise notes on sections of a meeting transcript so they can be summarized later without the transcript. " +
        "For each chapter, write 3 to 8 short factual notes: decisions, numbers, disagreements, commitments with owner and due date, risks, and notable quotes. " +
        "Name the people involved. Keep exact figures. Each note cites the single most relevant transcript line number (the N in LN).",
      user:
        `Meeting: ${m.meetingTitle}\nAttendees: ${attendees(m)}\n\n` +
        group.map(({ c, i, text }) => `### Chapter ${i}: ${c.title}\n${text}`).join("\n\n"),
    });

    for (const ch of out.chapters) {
      const target = group.find((x) => x.i === ch.index);
      if (!target) continue;
      const summary = ch.notes.map((n) => `- ${n.text} [L${n.line}]`).join("\n");
      const { error } = await db().from("chapters").update({ summary }).eq("id", target.c.id);
      if (error) throw error;
      target.c.summary = summary;
    }
  }
}

// --- 2. summarize with a template -------------------------------------------

function contentSchema(template: SummaryTemplate) {
  return {
    type: "object",
    additionalProperties: false,
    required: ["sections"],
    properties: {
      sections: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["key", "bullets"],
          properties: {
            key: { type: "string", enum: template.sections.map((s) => s.key) },
            bullets: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                required: ["text", "line"],
                properties: { text: { type: "string" }, line: { type: "integer" } },
              },
            },
          },
        },
      },
    },
  };
}

export async function generateSummary(
  meetingId: string,
  templateKey: string,
  progress: Progress,
): Promise<Summary> {
  const client = db();
  const { data: template, error } = await client.from("summary_templates").select("*").eq("key", templateKey).single();
  if (error) throw new Error(`Unknown template ${templateKey}`);

  const upsert = (row: Partial<Summary> & { status: Summary["status"] }) =>
    client
      .from("summaries")
      .upsert(
        { meeting_id: meetingId, template_id: template.id, updated_at: new Date().toISOString(), ...row },
        { onConflict: "meeting_id,template_id" },
      )
      .select("*")
      .single();

  await upsert({ status: "generating", error: null });
  try {
    progress("Loading transcript");
    const m = await load(meetingId);
    const full = transcriptLines(m, m.segments);

    let source: string;
    if (full.length <= DIRECT_LIMIT_CHARS || !m.chapters.length) {
      source = `Transcript:\n${full}`;
    } else {
      await condense(m, progress);
      source =
        "Notes per chapter (each note ends with the transcript line it came from):\n\n" +
        m.chapters.map((c) => `### ${formatTimestamp(c.start_ms)} ${c.title}\n${c.summary}`).join("\n\n");
    }

    progress(`Writing the ${template.name} summary`);
    const out = await chatJson<{ sections: { key: string; bullets: { text: string; line: number }[] }[] }>({
      schemaName: "summary",
      schema: contentSchema(template as SummaryTemplate),
      system:
        `${template.prompt} ` +
        "Write for someone who missed the meeting: specific, concise, no filler. Leave out jokes and small talk. " +
        "Use people's names and keep exact numbers. Keep dates exactly as spoken (\"next Thursday\"); never convert them to calendar dates. " +
        "Each bullet is one short sentence and cites the transcript line number (N from LN) that best supports it. " +
        "Include every section, in order, following its instructions; use an empty list if the meeting didn't cover it. Sections:\n" +
        (template as SummaryTemplate).sections
          .map((s) => `- ${s.key} (${s.title}): ${s.instructions ?? ""}`)
          .join("\n"),
      user: `Meeting: ${m.meetingTitle}\nAttendees: ${attendees(m)}\n\n${source}`,
    });

    const startBySeq = new Map(m.segments.map((s) => [s.seq, s.start_ms]));
    const titleByKey = new Map((template as SummaryTemplate).sections.map((s) => [s.key, s.title]));
    const content: SummaryContent = {
      sections: (template as SummaryTemplate).sections.map((sec) => ({
        key: sec.key,
        title: titleByKey.get(sec.key)!,
        bullets: (out.sections.find((s) => s.key === sec.key)?.bullets ?? []).map((b) => ({
          text: b.text,
          source_ms: startBySeq.get(b.line) ?? null,
        })),
      })),
    };

    const saved = await upsert({ status: "ready", content, model: SUMMARY_MODEL, error: null });
    if (saved.error) throw saved.error;
    return saved.data as Summary;
  } catch (e) {
    await upsert({ status: "failed", error: e instanceof Error ? e.message : String(e) });
    throw e;
  }
}
