import { db, settings, ensureMigrated } from "@/db";
import { eq } from "drizzle-orm";

// Everything configurable lives here, editable from /admin/settings.
export type Settings = {
  desk_count: number;
  flex_count: number;
  flex_unavailable_window: string; // "12:00–13:00", informational
  arrival_slots: string[]; // first-visit arrival options
  host_coverage_days: number[]; // ISO weekdays with host coverage, 1=Mon
  block_horizon_weeks: number;
  block_max_share: number; // fraction of desks block bookings may hold per day
  max_future_bookings: number;
  noshow_threshold: number;
  noshow_window_days: number;
  noshow_email_cooldown_days: number;
  checkin_rate_target: number;
  request_expiry_days: number; // "awaiting reply" auto-expiry
  profile_skip_limit: number; // skips allowed before M&E profile is required
  checkin_retention_months: number; // GDPR purge horizon
  trial_months: number;
  office_address: string;
  wifi_password: string;
  luma_ics_url: string; // public ICS feed of the EAN Luma calendar
  info_public_md: string; // /info content everyone can see (markdown)
  info_members_md: string; // /info content shown only to logged-in members
};

export const DEFAULT_SETTINGS: Settings = {
  desk_count: 8,
  flex_count: 5,
  flex_unavailable_window: "12:00–13:00",
  arrival_slots: ["11:00", "13:00"],
  host_coverage_days: [1, 2, 3, 4], // Monday–Thursday
  block_horizon_weeks: 12,
  block_max_share: 0.5,
  max_future_bookings: 12,
  noshow_threshold: 3,
  noshow_window_days: 60,
  noshow_email_cooldown_days: 60,
  checkin_rate_target: 0.8,
  request_expiry_days: 14,
  profile_skip_limit: 2,
  checkin_retention_months: 24,
  trial_months: 3,
  office_address: "EA Netherlands office, Amsterdam",
  wifi_password: "ask your host",
  luma_ics_url: "https://api.lu.ma/ics/get?entity=calendar&id=cal-akaE66Y0BQlrCVY",
  info_public_md: `## Where

{{office_address}}

The space is hosted by Effective Altruism Netherlands, Doneer Effectief and the Existential Risk Observatory.

## The space

8 proper desks plus a lunch table with 5 workable spots. The lunch table is used for lunch from {{flex_window}} — if you're working there, you'll need to pack up for that hour. Lounge seats are informal overflow: no booking needed, just sit. There are phone booths for calls.

## Lunch

Communal lunch around 12:00–13:00 at the lunch table. Bring your own or buy it at the café in the building.

## Checking in

Scan the QR code by the door (or on the lunch table) when you arrive. Two taps, and it's how we show funders the office is being used — which keeps it free. Nobody is ever turned away for not checking in.

## House guidelines

- Calls in the phone booths or lounge, not at the desks.
- Cancel bookings you won't use — with eight desks, one tap makes a real difference.
- Leave your desk as you found it.
- Newcomers get priority for a warm welcome — say hi.

The full [code of conduct is on our website](https://effectiefaltruisme.nl/en/legal/code-of-conduct).`,
  info_members_md: `## Getting in & office hours

_Paste the door instructions, key box details and opening hours here (from the old Notion page)._

## Wifi

Network password: **{{wifi_password}}**

## Meeting places & phone booths

_Paste the meeting-room and phone-booth details here, including how to book rooms in the building._

## Food and drinks

Free coffee, tea and snacks. _Add anything else worth knowing._

## Facilities in the building

_Gym, showers, bike parking — paste from Notion._

## Health and safety

_First-aid kit location, emergency exits, house rules — paste from Notion._

## Contact

Something broken, someone to praise, or feedback? Email office@effectiefaltruisme.nl — or tell any admin in the room.`,
};

export async function getSettings(): Promise<Settings> {
  await ensureMigrated();
  const rows = await db.select().from(settings);
  const merged: Record<string, unknown> = { ...DEFAULT_SETTINGS };
  for (const row of rows) {
    try {
      merged[row.key] = JSON.parse(row.value);
    } catch {
      merged[row.key] = row.value;
    }
  }
  return merged as Settings;
}

export async function setSetting<K extends keyof Settings>(
  key: K,
  value: Settings[K]
): Promise<void> {
  await ensureMigrated();
  const json = JSON.stringify(value);
  const existing = await db.select().from(settings).where(eq(settings.key, key));
  if (existing.length > 0) {
    await db.update(settings).set({ value: json }).where(eq(settings.key, key));
  } else {
    await db.insert(settings).values({ key, value: json });
  }
}
