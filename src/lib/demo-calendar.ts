import type { MeetingPlatform } from "./types";

// Calendar connect is stubbed: "Connect Google Calendar" loads these sample events,
// placed relative to now so the demo always has something upcoming, plus one event
// happening right now so the notetaker can be sent in immediately.

const IST_OFFSET_MS = 5.5 * 3_600_000;

/** A UTC Date for an IST wall-clock time `dayOffset` days from today (IST). */
function ist(now: Date, dayOffset: number, hour: number, minute = 0) {
  const istNow = new Date(now.getTime() + IST_OFFSET_MS);
  const midnightIst = Date.UTC(istNow.getUTCFullYear(), istNow.getUTCMonth(), istNow.getUTCDate() + dayOffset);
  return new Date(midnightIst + (hour * 60 + minute) * 60_000 - IST_OFFSET_MS);
}

const people = {
  neha: { name: "Neha Kulkarni", email: "neha@mandi.app" },
  karthik: { name: "Karthik Rao", email: "karthik@mandi.app" },
  ayesha: { name: "Ayesha Khan", email: "ayesha@mandi.app" },
  rahul: { name: "Rahul Verma", email: "rahul@mandi.app" },
  sneha: { name: "Sneha Iyer", email: "sneha@mandi.app" },
  meera: { name: "Meera Iyer", email: "meera@ledgerline.in" },
  arjun: { name: "Arjun Mehta", email: "arjun@ledgerline.in" },
  rohan: { name: "Rohan Kapoor", email: "rohan@ledgerline.in" },
  sunita: { name: "Sunita Verma", email: "sunita.verma@horizonretail.in" },
  kabir: { name: "Kabir Malhotra", email: "kabir@kitestudio.co" },
};

export function demoEvents(now = new Date()) {
  const join = (platform: MeetingPlatform, code: string) =>
    platform === "zoom"
      ? `https://zoom.us/j/${code}`
      : platform === "teams"
        ? `https://teams.microsoft.com/l/meetup-join/${code}`
        : `https://meet.google.com/${code}`;

  const events: {
    key: string;
    title: string;
    start: Date;
    minutes: number;
    platform: MeetingPlatform | null;
    attendees: { name: string; email: string }[];
    auto_record?: boolean;
  }[] = [
    {
      key: "design-crit",
      title: "Offline review badge — design crit",
      start: new Date(now.getTime() - 5 * 60_000),
      minutes: 30,
      platform: "meet",
      attendees: [people.neha, people.ayesha, people.rahul, people.sneha],
    },
    { key: "standup", title: "Platform stand-up", start: ist(now, 1, 9, 45), minutes: 15, platform: "teams", attendees: [people.arjun, people.karthik, people.sneha] },
    {
      key: "horizon-pilot",
      title: "Horizon Retail — pilot results",
      start: ist(now, 1, 11, 30),
      minutes: 45,
      platform: "zoom",
      attendees: [people.rohan, people.ayesha, people.sunita],
    },
    { key: "one-on-one", title: "Meera / Arjun 1:1", start: ist(now, 1, 15, 0), minutes: 30, platform: "meet", attendees: [people.meera, people.arjun] },
    {
      key: "sprint-24",
      title: "Sprint 24 planning",
      start: ist(now, 2, 10, 30),
      minutes: 60,
      platform: "meet",
      attendees: [people.neha, people.karthik, people.ayesha, people.rahul, people.sneha],
    },
    { key: "lunch", title: "Lunch with Kabir (Koramangala)", start: ist(now, 2, 13, 0), minutes: 60, platform: null, attendees: [people.meera, people.kabir] },
    {
      key: "all-hands",
      title: "Company all-hands",
      start: ist(now, 2, 17, 0),
      minutes: 45,
      platform: "zoom",
      attendees: Object.values(people),
      auto_record: false,
    },
  ];

  return events.map((e, i) => ({
    provider: "google",
    external_id: `demo-${e.key}`,
    title: e.title,
    starts_at: e.start.toISOString(),
    ends_at: new Date(e.start.getTime() + e.minutes * 60_000).toISOString(),
    join_url: e.platform ? join(e.platform, `demo-${1000 + i}`) : null,
    platform: e.platform,
    attendees: e.attendees,
    auto_record: e.auto_record ?? Boolean(e.platform),
  }));
}
