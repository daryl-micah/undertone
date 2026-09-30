import { processLanguage } from "@/lib/hinglish.mjs";
import { transcribeCodemix } from "@/lib/sarvam.mjs";
import { SPEAKER_COLORS } from "@/lib/speakers";
import { db } from "@/lib/supabase";

// Batch transcription of a few minutes of audio takes a minute or two.
export const maxDuration = 300;

const PART_MS = 5 * 60_000;

// POST -> NDJSON stream of {"progress"} lines, then {"done": true} or {"error"}.
// Transcribes the uploaded file (saaras:v3, codemix, diarization), stores the
// segments, then runs the same Hinglish step as the seeded meetings.
export async function POST(_request: Request, ctx: RouteContext<"/api/uploads/[id]/process">) {
  const { id } = await ctx.params;
  const client = db();
  const { data: meeting } = await client.from("meetings").select("id, status, duration_ms").eq("id", id).maybeSingle();
  if (!meeting) return Response.json({ error: "meeting not found" }, { status: 404 });
  if (meeting.status !== "processing") return Response.json({ error: `meeting is ${meeting.status}` }, { status: 409 });

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: object) => controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));
      const progress = (message: string) => send({ progress: message });
      try {
        const { data: media } = await client.from("media_assets").select("*").eq("meeting_id", id).single();
        progress("Reading the recording");
        const file = await client.storage.from("media").download(media.storage_path);
        if (file.error) throw new Error(`The upload didn't arrive: ${file.error.message}`);

        const { entries } = await transcribeCodemix({
          audio: new Uint8Array(await file.data.arrayBuffer()),
          fileName: media.storage_path.split("/").pop(),
          progress,
        });
        const lines = entries
          .map((e) => ({
            speakerId: String(e.speaker_id),
            start: Math.round(e.start_time_seconds * 1000),
            end: Math.round(e.end_time_seconds * 1000),
            text: (e.transcript ?? "").trim(),
          }))
          .filter((e) => e.text && e.end > e.start);
        if (!lines.length) throw new Error("No speech was found in this recording");

        progress("Saving transcript");
        // Diarized speakers become "Speaker 1..N" in order of first appearance.
        const order = [...new Set(lines.map((l) => l.speakerId))];
        const talk = new Map<string, number>();
        lines.forEach((l) => talk.set(l.speakerId, (talk.get(l.speakerId) ?? 0) + l.end - l.start));
        const { data: people, error: pErr } = await client
          .from("participants")
          .insert(
            order.map((sid, i) => ({
              meeting_id: id,
              name: `Speaker ${i + 1}`,
              color: SPEAKER_COLORS[i % SPEAKER_COLORS.length],
              is_host: i === 0,
              talk_time_ms: talk.get(sid) ?? 0,
            })),
          )
          .select("id, name");
        if (pErr) throw pErr;
        const idOf = new Map(order.map((sid, i) => [sid, people.find((p) => p.name === `Speaker ${i + 1}`)!.id]));

        const { error: sErr } = await client.from("transcript_segments").insert(
          lines.map((l, i) => ({
            meeting_id: id,
            seq: i + 1,
            participant_id: idOf.get(l.speakerId),
            speaker_label: `SPEAKER_${l.speakerId}`,
            start_ms: l.start,
            end_ms: l.end,
            text: l.text,
          })),
        );
        if (sErr) throw sErr;

        const durationMs = Math.max(meeting.duration_ms ?? 0, lines.at(-1)!.end);
        // Long recordings get time-based chapters so summaries can condense them.
        if (durationMs > 2 * PART_MS) {
          const parts = Math.ceil(durationMs / PART_MS);
          const { error: cErr } = await client.from("chapters").insert(
            Array.from({ length: parts }, (_, i) => ({
              meeting_id: id,
              title: `Part ${i + 1}`,
              start_ms: i * PART_MS,
              end_ms: Math.min((i + 1) * PART_MS, durationMs),
            })),
          );
          if (cErr) throw cErr;
        }

        await processLanguage(client, id, progress);

        const { error: mErr } = await client.from("meetings").update({ status: "ready", duration_ms: durationMs }).eq("id", id);
        if (mErr) throw mErr;
        send({ done: true });
      } catch (e) {
        await client.from("meetings").update({ status: "failed" }).eq("id", id);
        send({ error: e instanceof Error ? e.message : String(e) });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, { headers: { "content-type": "application/x-ndjson", "cache-control": "no-store" } });
}
