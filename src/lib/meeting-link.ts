import type { MeetingPlatform } from "./types";

/**
 * The platform behind a pasted meeting link, or null if it isn't a Zoom, Google
 * Meet or Microsoft Teams meeting URL.
 */
export function parseMeetingLink(input: string): { platform: Exclude<MeetingPlatform, "upload">; url: string } | null {
  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(input.trim()) ? input.trim() : `https://${input.trim()}`);
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase();
  const path = url.pathname;
  if ((host === "zoom.us" || host.endsWith(".zoom.us")) && /^\/(j|my|wc|s)\//.test(path)) {
    return { platform: "zoom", url: url.toString() };
  }
  if (host === "meet.google.com" && /^\/[a-z]{3}-[a-z]{4}-[a-z]{3}/i.test(path)) {
    return { platform: "meet", url: url.toString() };
  }
  if (host === "teams.microsoft.com" || host === "teams.live.com") {
    return { platform: "teams", url: url.toString() };
  }
  return null;
}
