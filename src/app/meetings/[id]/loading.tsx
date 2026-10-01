// The hour-long meeting has hundreds of transcript lines; show the page's shape while it loads.
export default function Loading() {
  return (
    <div className="animate-pulse space-y-5" aria-busy="true" aria-label="Loading meeting">
      <div className="space-y-2">
        <div className="h-4 w-24 rounded bg-surface-2" />
        <div className="h-7 w-72 rounded bg-surface-2" />
        <div className="h-4 w-56 rounded bg-surface-2" />
      </div>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_420px] lg:gap-x-6">
        <div className="space-y-4">
          <div className="aspect-[16/7] rounded-xl bg-surface-2" />
          <div className="h-48 rounded-xl bg-surface-2" />
        </div>
        <div className="space-y-3 rounded-xl border border-border bg-surface p-4">
          {[80, 95, 60, 90, 70, 85].map((w, i) => (
            <div key={i} className="space-y-1.5">
              <div className="h-3 w-20 rounded bg-surface-2" />
              <div className="h-3 rounded bg-surface-2" style={{ width: `${w}%` }} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
