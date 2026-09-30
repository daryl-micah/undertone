import { db } from "@/lib/supabase";

export async function DELETE(_request: Request, ctx: RouteContext<"/api/highlights/[id]">) {
  const { id } = await ctx.params;
  const { data, error } = await db().from("highlights").delete().eq("id", id).select("id").maybeSingle();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  if (!data) return Response.json({ error: "not found" }, { status: 404 });
  return new Response(null, { status: 204 });
}
