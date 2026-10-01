import { initials } from "@/lib/format";
import { speakerColor } from "@/lib/speakers";
import type { ViewParticipant } from "./meeting-view";

// Audio-only recordings get a speaker grid instead of video: one tile per person,
// lit while the transcript says they're talking.
export function Stage({
  participants,
  speakingId,
  playing,
}: {
  participants: ViewParticipant[];
  speakingId: string | null;
  playing: boolean;
}) {
  const crowded = participants.length > 4;

  return (
    <div className="bg-[#101014] p-3">
      <div className={`grid gap-2 ${crowded ? "grid-cols-4" : "grid-cols-2"}`}>
        {participants.map((p) => {
          const speaking = p.id === speakingId;
          const color = speakerColor(p.color, p.index);
          return (
            <div
              key={p.id}
              className={`relative flex flex-col items-center justify-center rounded-lg bg-[#1c1c22] transition-shadow duration-150 ${
                crowded ? "aspect-square sm:aspect-[16/9]" : "aspect-[16/9]"
              }`}
              style={{ boxShadow: speaking ? `inset 0 0 0 2px ${color}, 0 0 24px -6px ${color}` : undefined }}
            >
              <span
                className="-mt-3 grid h-9 w-9 place-items-center rounded-full text-xs font-semibold text-on-spk sm:h-11 sm:w-11 sm:text-sm"
                style={{ background: color }}
              >
                {initials(p.name)}
              </span>
              <span className="absolute bottom-1.5 left-2 right-2 flex items-center gap-1.5 truncate text-[11px] text-white/85">
                {speaking && playing && <SpeakingBars />}
                <span className="truncate sm:hidden">{p.name.split(" ")[0]}</span>
                <span className="hidden truncate sm:inline">{p.name}</span>
                {p.is_external && <span className="hidden shrink-0 text-white/65 sm:inline">· external</span>}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SpeakingBars() {
  return (
    <span className="flex h-2.5 items-end gap-px" aria-label="speaking">
      {[0, 150, 300].map((delay) => (
        <span
          key={delay}
          className="w-0.5 animate-pulse rounded-full bg-white"
          style={{ height: "100%", animationDelay: `${delay}ms`, animationDuration: "700ms" }}
        />
      ))}
    </span>
  );
}
