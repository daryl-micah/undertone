import { db } from "@/lib/supabase";

// PATCH {status: "recording" | "processing"}: advance the simulated notetaker.
// joining -> recording (admitted to the call) -> processing (recording stopped).
const NEXT: Record<string, string> = { joining: "recording", recording: "processing" };

export async function PATCH(request: Request, ctx: RouteContext<"/api/meetings/[id]/notetaker">) {
  const { id } = await ctx.params;
  const { status } = (await request.json()) as { status?: string };
  const client = db();
  const { data: meeting } = await client.from("meetings").select("status, started_at").eq("id", id).maybeSingle();
  if (!meeting) return Response.json({ error: "meeting not found" }, { status: 404 });
  if (NEXT[meeting.status] !== status) {
    return Response.json({ error: `can't go from ${meeting.status} to ${status}` }, { status: 409 });
  }

  const now = new Date();
  const update =
    status === "recording"
      ? { status, started_at: now.toISOString() }
      : {
          status,
          ended_at: now.toISOString(),
          duration_ms: meeting.started_at ? now.getTime() - Date.parse(meeting.started_at) : null,
        };
  const { data, error } = await client.from("meetings").update(update).eq("id", id).select("*").single();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data);
}
