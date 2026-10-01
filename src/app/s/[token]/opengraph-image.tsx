import { ImageResponse } from "next/og";
import { getSharePage } from "@/lib/data";
import { clipTitle, formatDuration } from "@/lib/format";
import { excerptText, languageBadge } from "@/lib/script";
import { isConfigured } from "@/lib/supabase";

export const alt = "A shared moment from a meeting on Undertone";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// The preview card is in English: the default image font has no Devanagari,
// and an English preview reads for anyone the link is pasted to.
const DEVANAGARI = /[ऀ-ॿ]/;
const latinOnly = (s: string) => (DEVANAGARI.test(s) ? "" : s);

export default async function Image({ params }: { params: Promise<{ token: string }> }) {
  const page = isConfigured() ? await getSharePage((await params).token, false) : null;

  const kicker = !page ? "Undertone" : page.kind === "highlight" ? `Clip · ${formatDuration(page.highlight.end_ms - page.highlight.start_ms)}` : "Meeting notes";
  const title = !page
    ? "This link has expired"
    : page.kind === "highlight"
      ? latinOnly(clipTitle({ title: page.highlight.title, excerpt: excerptText(page.highlight, "english") })) ||
        clipTitle({ title: null, excerpt: excerptText(page.highlight, "english") })
      : page.meeting.title;
  const quote = page?.kind === "highlight" ? latinOnly(excerptText(page.highlight, "english") ?? "") : "";
  const footer = page ? latinOnly(page.meeting.title) : "";
  const badge = page ? languageBadge(page.meeting) : null;

  return new ImageResponse(
    (
      <div style={{ display: "flex", flexDirection: "column", width: "100%", height: "100%", padding: 72, background: "#111110", color: "#ededea" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16, fontSize: 28, color: "#9b9b95" }}>
          <div style={{ display: "flex", width: 44, height: 44, borderRadius: 10, background: "#4f46e5", color: "white", alignItems: "center", justifyContent: "center", fontSize: 26 }}>
            u
          </div>
          <span>Undertone</span>
          <span style={{ marginLeft: "auto", color: "#fcd34d" }}>{kicker}</span>
        </div>
        <div style={{ display: "flex", marginTop: 56, fontSize: 60, fontWeight: 700, lineHeight: 1.15 }}>{title.slice(0, 90)}</div>
        {quote && (
          <div style={{ display: "flex", marginTop: 28, fontSize: 32, lineHeight: 1.4, color: "#c9c9c3" }}>
            “{quote.length > 170 ? `${quote.slice(0, 170)}…` : quote}”
          </div>
        )}
        <div style={{ display: "flex", marginTop: "auto", alignItems: "center", gap: 20, fontSize: 26, color: "#9b9b95" }}>
          <span>{footer}</span>
          {badge && (
            <span style={{ display: "flex", padding: "6px 16px", borderRadius: 999, background: "#431407", color: "#fed7aa" }}>{badge}</span>
          )}
        </div>
      </div>
    ),
    size,
  );
}
