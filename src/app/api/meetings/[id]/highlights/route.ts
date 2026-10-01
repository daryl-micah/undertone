import { db } from "@/lib/supabase";
import { badBody, isUuid, notFound, readJson } from "@/lib/http";

const MAX_CLIP_MS = 5 * 60_000;

// POST {start_ms, end_ms, title?, note?, created_by_name?} -> the new highlight.
// The excerpt is taken from the transcript here, not trusted from the client.
export async function POST(request: Request, ctx: RouteContext<"/api/meetings/[id]/highlights">) {
  const { id } = await ctx.params;
  if (!isUuid(id)) return notFound("meeting not found");
  const body = await readJson<{
    start_ms: number;
    end_ms: number;
    title: string;
    note: string;
    created_by_name: string;
  }>(request);
  if (!body) return badBody();
  const start = Math.round(Number(body.start_ms));
  const end = Math.round(Number(body.end_ms));
  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end <= start) {
    return Response.json({ error: "start_ms and end_ms must describe a range" }, { status: 400 });
  }
  if (end - start > MAX_CLIP_MS) return Response.json({ error: "Highlights can be at most 5 minutes" }, { status: 400 });

  const client = db();
  const { data: meeting } = await client.from("meetings").select("duration_ms").eq("id", id).maybeSingle();
  if (!meeting) return Response.json({ error: "meeting not found" }, { status: 404 });
  if (meeting.duration_ms != null && end > meeting.duration_ms + 1000) {
    return Response.json({ error: "Range is past the end of the recording" }, { status: 400 });
  }

  const { data: segments, error: segError } = await client
    .from("transcript_segments")
    .select("text, text_romanized, text_english")
    .eq("meeting_id", id)
    .lt("start_ms", end)
    .gt("end_ms", start)
    .order("seq");
  if (segError) return Response.json({ error: segError.message }, { status: 500 });

  const clean = (s?: string, max = 200) => s?.trim().slice(0, max) || null;
  const { data, error } = await client
    .from("highlights")
    .insert({
      meeting_id: id,
      start_ms: start,
      end_ms: end,
      title: clean(body.title, 120),
      note: clean(body.note, 1000),
      excerpt: segments.map((s) => s.text).join(" ") || null,
      excerpt_romanized: segments.map((s) => s.text_romanized ?? s.text).join(" ") || null,
      excerpt_english: segments.map((s) => s.text_english ?? s.text).join(" ") || null,
      created_by_name: clean(body.created_by_name, 60) ?? "Guest",
    })
    .select("*")
    .single();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data, { status: 201 });
}
