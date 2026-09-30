import { initials } from "@/lib/format";
import { speakerColor } from "@/lib/speakers";

export function AvatarStack({
  people,
  max = 5,
}: {
  people: { id: string; name: string; color: string | null }[];
  max?: number;
}) {
  const shown = people.slice(0, max);
  const extra = people.length - shown.length;
  return (
    <div className="flex -space-x-1.5" aria-label={people.map((p) => p.name).join(", ")}>
      {shown.map((p, i) => (
        <span
          key={p.id}
          title={p.name}
          className="grid h-7 w-7 place-items-center rounded-full text-[10px] font-semibold text-white ring-2 ring-surface"
          style={{ background: speakerColor(p.color, i) }}
        >
          {initials(p.name)}
        </span>
      ))}
      {extra > 0 && (
        <span className="grid h-7 w-7 place-items-center rounded-full bg-surface-2 text-[10px] font-semibold text-muted ring-2 ring-surface">
          +{extra}
        </span>
      )}
    </div>
  );
}
