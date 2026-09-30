import { db } from "@/lib/supabase";

const MAX_BYTES = 50 * 1024 * 1024; // the media bucket's per-file limit

// POST {title, fileName, mime, size, durationMs} -> {meetingId, uploadUrl}
// Creates the meeting in "processing" and a signed URL the browser uploads to
// directly (Vercel functions can't take request bodies this large).
export async function POST(request: Request) {
  const body = (await request.json()) as {
    title?: string;
    fileName?: string;
    mime?: string;
    size?: number;
    durationMs?: number;
  };
  const mime = body.mime ?? "";
  if (!/^(audio|video)\//.test(mime)) return Response.json({ error: "Upload an audio or video file" }, { status: 400 });
  if (!body.size || body.size > MAX_BYTES) return Response.json({ error: "Files can be at most 50 MB" }, { status: 400 });

  const client = db();
  const now = new Date();
  const durationMs = Number.isFinite(body.durationMs) ? Math.round(body.durationMs!) : null;
  const { data: meeting, error } = await client
    .from("meetings")
    .insert({
      title: body.title?.trim().slice(0, 120) || (body.fileName ?? "Uploaded recording").replace(/\.[^.]+$/, ""),
      platform: "upload",
      status: "processing",
      started_at: now.toISOString(),
      ended_at: durationMs ? new Date(now.getTime() + durationMs).toISOString() : null,
      duration_ms: durationMs,
    })
    .select("id")
    .single();
  if (error) return Response.json({ error: error.message }, { status: 500 });

  const ext = (body.fileName?.match(/\.([a-z0-9]+)$/i)?.[1] ?? mime.split("/")[1]).toLowerCase();
  const path = `uploads/${meeting.id}.${ext}`;
  const signed = await client.storage.from("media").createSignedUploadUrl(path);
  if (signed.error) return Response.json({ error: signed.error.message }, { status: 500 });

  const { error: mediaError } = await client.from("media_assets").insert({
    meeting_id: meeting.id,
    kind: mime.startsWith("video/") ? "video" : "audio",
    storage_path: path,
    mime,
    duration_ms: durationMs,
    size_bytes: body.size,
  });
  if (mediaError) return Response.json({ error: mediaError.message }, { status: 500 });

  return Response.json({ meetingId: meeting.id, uploadUrl: signed.data.signedUrl }, { status: 201 });
}
