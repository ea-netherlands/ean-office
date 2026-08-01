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
  office_address:
    "HNK Houthavens, Van Diemenstraat 92, 1013 CN Amsterdam (ground floor — ask for 'Effectief Altruïsme Nederland', or walk towards the elevators, turn right through the connecting doors, first office on the right with the EA logos)",
  wifi_password: "EA7654321!",
  luma_ics_url: "https://api.lu.ma/ics/get?entity=calendar&id=cal-akaE66Y0BQlrCVY",
  info_public_md: `## Where

{{office_address}}

The space is hosted by Effective Altruism Netherlands, Doneer Effectief and the Existential Risk Observatory.

**Getting here:** 22 minutes' walk from Amsterdam Central Station, 7 minutes by bike, or 10 minutes by bus (2 stops) plus a 3-minute walk.

## Office hours

Monday–Friday, 9:00–19:00. Events outside office hours are possible — and encouraged (see the members section below).

## The space

8 proper desks plus a lunch table with 5 workable spots. The lunch table is used for lunch from {{flex_window}} — if you're working there, you'll need to pack up for that hour. Lounge seats are informal overflow: no booking needed, just sit.

## Lunch

Most people have lunch together between 12:00 and 13:00. Bring your own (there's a fridge and microwave) or buy it in the building — the ground-floor restaurant is open 9:00–17:00.

## Checking in

Scan the QR code by the door (or on the lunch table) when you arrive. Two taps, and it's how we show funders the office is being used — which keeps it free. Nobody is ever turned away for not checking in.

## House guidelines

The basic use of the office during office hours (9–17) is quiet work; during lunch and after hours you're welcome to chit-chat in the lounge or anywhere else.

- **The 5-minute rule** — conversations up to 5 minutes are fine at the desks. Longer? Please continue outside, in the lounge or a phone booth.
- **The main rule: talk to each other.** Need the window open or closed? Say it. Too much chatter nearby? Let people know.
- **Be nice and be respectful.** We want a supportive, deeply caring, encouraging environment. Be considerate of other people's boundaries; harmful or thoughtless behaviour — unwanted attention, unkindness, talking over people — doesn't belong here.
- **Cancel bookings you won't use** — with eight desks, one tap makes a real difference.
- **Tidiness** — clean up after yourself; if something's broken or lost, tell us straight away.
- **Dress code** — wear what you find comfortable.
- **Alcohol** — permitted after office hours in the social area (not at the desks); don't disturb people still working.

If you feel unwelcome or uncomfortable for any reason, please let us know — it's important to us. The full [code of conduct is on our website](https://effectiefaltruisme.nl/en/legal/code-of-conduct). We reserve the right to revoke access — for endangering people's health or safety, not helping build a supportive community, or repeatedly breaking or losing property.`,
  info_members_md: `## Wifi

In our office — network **Doing wifi better**, password **{{wifi_password}}**.

In the HNK building — network **HNK Public** (a pop-up asks for your name and email, every time, sorry).

## Meeting places & phone booths

For a quick online meeting, any spot in the common area on the ground floor works. For quiet, there are **5 phone booths on the same floor as the office**.

Meeting rooms can be booked at a discount through our HNK app — ask a host in advance and they'll book it and pass the bill on. About €17.50/hour ex BTW for the 6-person room, €30/hour ex BTW for the larger rooms (16–20 people).

## Food and drinks

Snacks, tea and coffee are free in our office; there's a fridge and a microwave, and appropriate bins for waste. The building restaurant (ground floor) is open 9:00–17:00 Mon–Fri. Nearby: Ramon's coffee kiosk (2 min walk, vegan sandwiches), Vooges for fancier lunches (4 min, some vegan options), and Niemandsland for coffee and drinks (4 min). Ordering in? Our favourite is the Lebanese sajeria — really nice wraps with plenty of vegan options.

## Facilities in the building

There's a full gym on floor −1 (plus a shower) — access is limited to people who donate to cover its rent. Interested? Ask someone from the EAN team.

## Package delivery

Please don't use the office for package delivery — align with EAN first if you need to.

## Hosting your own event

You can host EA-aligned events at the office outside office hours (meetings, book clubs, discussion evenings, workshops, film screenings…) — we're excited to help make it happen. Follow the checklist at [tinyurl.com/checklist-office-events](https://tinyurl.com/checklist-office-events). Two things to know: the **alarm is active from 22:00** (deactivatable if you have a tag — instructions in the checklist), and the **connecting doors to the main area close at 18:00** — keep one open with a chair so people can reach the toilet. Check the [booking calendar](/book) for what's on.

## Health and safety

- **Urgent:** dial 112 and exit the building as soon as possible.
- **Time-sensitive but not 112-urgent:** go to the main desk/restaurant of the building, or contact us.
- **Not urgent:** use the anonymous feedback form below.

## Inviting someone

Never-been-before guests should [sign up for a first visit](/join) — we respond within one working day. Meeting someone in the common areas of the building is always fine.

## Contact & feedback

There's always a host in the office to talk to. Otherwise: [info@effectiefaltruisme.nl](mailto:info@effectiefaltruisme.nl), or use the [anonymous feedback form](https://airtable.com/shrPaWBNeHIB7ewvt) — for concerns, requests, or an example of the office having a positive impact.`,
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
