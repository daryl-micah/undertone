import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-md rounded-xl border border-dashed border-border bg-surface p-10 text-center">
      <p className="font-medium">There&apos;s nothing here.</p>
      <p className="mt-1 text-sm text-muted">The meeting may have been deleted, or the link is mistyped.</p>
      <Link href="/" className="mt-5 inline-flex rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-white">
        Back to meetings
      </Link>
    </div>
  );
}
