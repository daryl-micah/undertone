"use client";

import { useState } from "react";

// Checkbox that saves immediately and rolls back if the save fails.
export function ActionItemCheck({ id, completedAt, label }: { id: string; completedAt: string | null; label: string }) {
  const [done, setDone] = useState(Boolean(completedAt));
  const [saving, setSaving] = useState(false);

  async function toggle() {
    const next = !done;
    setDone(next);
    setSaving(true);
    try {
      const res = await fetch(`/api/action-items/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ completed: next }),
      });
      if (!res.ok) throw new Error();
    } catch {
      setDone(!next);
    } finally {
      setSaving(false);
    }
  }

  return (
    <input
      type="checkbox"
      checked={done}
      onChange={toggle}
      disabled={saving}
      aria-label={`${done ? "Reopen" : "Complete"}: ${label}`}
      className="peer mt-0.5 h-4 w-4 shrink-0 cursor-pointer accent-[var(--accent)]"
    />
  );
}
