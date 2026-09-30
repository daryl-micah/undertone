import { languageBadge } from "@/lib/script";

export function LanguageBadge({ meeting }: { meeting: { language_mix: string; hindi_ratio: number } }) {
  const label = languageBadge(meeting);
  if (!label) return null;
  return (
    <span className="inline-flex shrink-0 items-center rounded-full bg-orange-100 px-2 py-0.5 text-xs font-medium text-orange-800 dark:bg-orange-950 dark:text-orange-200">
      {label}
    </span>
  );
}
