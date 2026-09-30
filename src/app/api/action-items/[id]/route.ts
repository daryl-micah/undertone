import { db } from "@/lib/supabase";

// PATCH {completed: boolean} -> the updated action item.
export async function PATCH(request: Request, ctx: RouteContext<"/api/action-items/[id]">) {
  const { id } = await ctx.params;
  const { completed } = (await request.json()) as { completed?: boolean };
  if (typeof completed !== "boolean") return Response.json({ error: "completed must be a boolean" }, { status: 400 });

  const { data, error } = await db()
    .from("action_items")
    .update({ completed_at: completed ? new Date().toISOString() : null })
    .eq("id", id)
    .select("*")
    .maybeSingle();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  if (!data) return Response.json({ error: "not found" }, { status: 404 });
  return Response.json(data);
}
