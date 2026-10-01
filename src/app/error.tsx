"use client";

import Link from "next/link";
import { useEffect } from "react";

export default function Error({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="mx-auto max-w-md rounded-xl border border-border bg-surface p-8 text-center">
      <p className="font-medium">Something went wrong loading this page.</p>
      <p className="mt-1 text-sm text-muted">It&apos;s usually temporary. Try again, or head back to your meetings.</p>
      <div className="mt-5 flex justify-center gap-2">
        <button onClick={() => retry()} className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-white">
          Try again
        </button>
        <Link href="/" className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-surface-2">
          Meetings
        </Link>
      </div>
      {error.digest && <p className="mt-4 font-mono text-[11px] text-muted">Reference {error.digest}</p>}
    </div>
  );
}
