import { db } from "@/lib/supabase";
import { badBody, isUuid, notFound, readJson } from "@/lib/http";

// PATCH {auto_record: boolean}: whether the notetaker joins this event.
export async function PATCH(request: Request, ctx: RouteContext<"/api/calendar/events/[id]">) {
  const { id } = await ctx.params;
  if (!isUuid(id)) return notFound();
  const body = await readJson<{ auto_record: boolean }>(request);
  if (!body) return badBody();
  const { auto_record } = body;
  if (typeof auto_record !== "boolean") return Response.json({ error: "auto_record must be a boolean" }, { status: 400 });
  const { data, error } = await db().from("calendar_events").update({ auto_record }).eq("id", id).select("*").maybeSingle();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  if (!data) return Response.json({ error: "not found" }, { status: 404 });
  return Response.json(data);
}
