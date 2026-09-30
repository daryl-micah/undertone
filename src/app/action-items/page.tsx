import Link from "next/link";
import { connection } from "next/server";
import { ActionItemCheck } from "@/components/action-item-check";
import { SetupNotice } from "@/components/setup-notice";
import { listActionItems } from "@/lib/data";
import { formatTimestamp } from "@/lib/format";
import { isConfigured } from "@/lib/supabase";

const FILTERS = { open: "Open", done: "Done", all: "All" } as const;
type Filter = keyof typeof FILTERS;

export default async function ActionItemsPage(props: PageProps<"/action-items">) {
  await connection();
  if (!isConfigured()) return <SetupNotice />;

  const raw = (await props.searchParams).show;
  const filter: Filter = raw === "done" || raw === "all" ? raw : "open";
  const items = (await listActionItems()).filter((a) =>
    filter === "all" ? true : filter === "done" ? a.completed_at : !a.completed_at,
  );

  // Group by owner; people with the most open work first.
  const groups = new Map<string, typeof items>();
  for (const a of items) {
    const owner = a.assignee_name ?? "Unassigned";
    groups.set(owner, [...(groups.get(owner) ?? []), a]);
  }
  const ordered = [...groups.entries()].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-4">
        <div className="flex-1">
          <h1 className="text-2xl font-semibold tracking-tight">Action items</h1>
          <p className="text-sm text-muted">Every commitment from every meeting, by owner.</p>
        </div>
        <nav className="flex rounded-lg border border-border bg-surface p-0.5 text-sm">
          {(Object.keys(FILTERS) as Filter[]).map((f) => (
            <Link
              key={f}
              href={f === "open" ? "/action-items" : `/action-items?show=${f}`}
              className={`rounded-md px-3 py-1 ${f === filter ? "bg-accent-soft text-accent" : "text-muted hover:text-text"}`}
            >
              {FILTERS[f]}
            </Link>
          ))}
        </nav>
      </div>

      {ordered.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border bg-surface p-10 text-center text-sm text-muted">
          {filter === "open" ? "Nothing open. Everyone's caught up." : "No action items here."}
        </p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {ordered.map(([owner, list]) => (
            <section key={owner} className="rounded-xl border border-border bg-surface">
              <h2 className="flex items-baseline justify-between border-b border-border px-4 py-3 text-sm font-medium">
                {owner}
                <span className="text-xs text-muted">{list.length}</span>
              </h2>
              <ul className="p-2">
                {list.map((a) => (
                  <li key={a.id} className="flex items-start gap-3 rounded-lg px-2 py-2 text-sm hover:bg-surface-2">
                    <ActionItemCheck id={a.id} completedAt={a.completed_at} label={a.text} />
                    <span className="flex-1 peer-checked:text-muted peer-checked:line-through">
                      {a.text}
                      <Link
                        href={`/meetings/${a.meeting_id}${a.source_ms != null ? `?t=${Math.floor(a.source_ms / 1000)}` : ""}`}
                        className="block text-xs text-muted no-underline hover:text-accent"
                      >
                        {[a.due_hint, a.meeting_title, a.source_ms != null && formatTimestamp(a.source_ms)]
                          .filter(Boolean)
                          .join(" · ")}
                      </Link>
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
