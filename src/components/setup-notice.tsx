export function SetupNotice() {
  return (
    <div className="rounded-xl border border-dashed border-border bg-surface p-6 text-sm">
      <p className="font-medium">Supabase isn&apos;t connected yet.</p>
      <p className="mt-1 text-muted">
        Set <code className="font-mono">NEXT_PUBLIC_SUPABASE_URL</code> and{" "}
        <code className="font-mono">SUPABASE_SERVICE_ROLE_KEY</code> (see <code className="font-mono">.env.example</code>),
        then run the migration and seed in <code className="font-mono">supabase/</code>.
      </p>
    </div>
  );
}
