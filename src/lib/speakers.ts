// Speaker colors map to --spk-* tokens in globals.css.
export const SPEAKER_COLORS = [
  "violet",
  "teal",
  "amber",
  "rose",
  "sky",
  "lime",
  "orange",
  "fuchsia",
  "slate",
  "emerald",
] as const;

export function speakerColor(color: string | null | undefined, fallbackIndex = 0) {
  const key = color && (SPEAKER_COLORS as readonly string[]).includes(color)
    ? color
    : SPEAKER_COLORS[fallbackIndex % SPEAKER_COLORS.length];
  return `var(--spk-${key})`;
}
