/**
 * Seed realistic fake data so the app can be demoed before anyone real uses it.
 *
 *   npm run db:seed        (wipes and reseeds — stop the dev server first,
 *                           PGlite allows one process at a time)
 *
 * Creates: 3 admins (James, Ricardo, Merlijn), ~28 members with M&E profiles
 * roughly matching the 2025 survey distributions, ~4 months of bookings with
 * ~80% check-in, block series, walk-ins, no-shows, events (incl. themed
 * coworking days), and a couple of pending visit requests.
 */
import { db, ensureMigrated } from "../db";
import {
  users,
  bookings,
  bookingSeries,
  checkins,
  noShowEvents,
  events,
  eventAttendance,
  visitRequests,
  emailLog,
  sessions,
  loginTokens,
  settings,
} from "../db/schema";
import { newId } from "../lib/ids";
import { addDays, isWorkingDay, isoWeekday, todayAms } from "../lib/dates";

// Deterministic RNG so reseeding gives the same demo data.
let rngState = 42;
function rand(): number {
  rngState = (rngState * 1103515245 + 12345) % 2 ** 31;
  return rngState / 2 ** 31;
}
function pick<T>(arr: T[]): T {
  return arr[Math.floor(rand() * arr.length)];
}
function chance(p: number): boolean {
  return rand() < p;
}

const CAUSES = [
  "Existential Risk Reduction",
  "Global Health and Development",
  "Animal Welfare",
  "Effective Giving",
  "Community Building",
  "Other",
];
const ROLES = ["Research", "Policy", "Management", "Entrepreneurship", "Operations", "Communications", "Student", "Other"];
const EXP = ["Beginner (0–2 years)", "Intermediate (2–5 years)", "Advanced (5–10 years)", "Expert (10+ years)"];

function weightedCause(): string {
  const r = rand();
  if (r < 0.39) return CAUSES[0]; // x-risk ~39%
  if (r < 0.58) return CAUSES[1];
  if (r < 0.7) return CAUSES[2];
  if (r < 0.8) return CAUSES[3];
  if (r < 0.93) return CAUSES[4];
  return CAUSES[5];
}
function weightedExp(): string {
  const r = rand();
  if (r < 0.25) return EXP[0];
  if (r < 0.7) return EXP[1];
  if (r < 0.92) return EXP[2];
  return EXP[3];
}
function weightedFunding(): "direct" | "employer" | "none" | "undisclosed" {
  const r = rand();
  if (r < 0.3) return "direct";
  if (r < 0.78) return "employer";
  if (r < 0.95) return "none";
  return "undisclosed";
}

const FIRST_F = ["Sanne", "Lotte", "Emma", "Fleur", "Anouk", "Iris", "Nina", "Julia", "Sophie", "Mila", "Eva"];
const FIRST_M = ["Daan", "Sem", "Lucas", "Milan", "Thijs", "Bram", "Jesse", "Tim", "Ruben", "Koen", "Floris", "Pieter"];
const LAST = ["de Vries", "Jansen", "Bakker", "Visser", "Smit", "Meijer", "Mulder", "Bos", "Vos", "Peters", "Hendriks", "van Dijk", "Kuipers", "Dekker", "Brouwer", "van den Berg"];

async function main() {
  console.log("Migrating…");
  await ensureMigrated();

  console.log("Wiping…");
  await db.delete(eventAttendance);
  await db.delete(events);
  await db.delete(noShowEvents);
  await db.delete(checkins);
  await db.delete(bookings);
  await db.delete(bookingSeries);
  await db.delete(visitRequests);
  await db.delete(emailLog);
  await db.delete(sessions);
  await db.delete(loginTokens);
  await db.delete(users);
  await db.delete(settings);

  const today = todayAms();
  const seedStart = addDays(today, -120); // ~4 months of history

  // ---------- admins ----------
  console.log("Admins…");
  // Fictional demo accounts — real admins are created with `npm run admin:add`.
  const admins = [
    { name: "Sanne Bakker", email: "sanne.bakker@example.org" },
    { name: "Daan Visser", email: "daan.visser@example.org" },
    { name: "Merel Jansen", email: "merel.jansen@example.org" },
  ];
  const adminIds: string[] = [];
  for (const a of admins) {
    const id = newId("usr");
    adminIds.push(id);
    await db.insert(users).values({
      id,
      name: a.name,
      email: a.email,
      role: "admin",
      status: "active",
      approvedAt: new Date(Date.parse(seedStart) - 200 * 86400000),
      causeArea: "Community Building",
      roleCategory: pick(["Management", "Operations"]),
      experienceLevel: weightedExp(),
      eaFunding: "employer",
      funders: ["EAIF"],
      gender: pick(["M", "F"]),
      profileUpdatedAt: new Date(),
    });
  }

  // ---------- members ----------
  console.log("Members…");
  type Member = { id: string; name: string; email: string; heaviness: number };
  const members: Member[] = [];
  const usedNames = new Set<string>();
  for (let i = 0; i < 28; i++) {
    const female = chance(0.39);
    let name = "";
    do {
      name = `${pick(female ? FIRST_F : FIRST_M)} ${pick(LAST)}`;
    } while (usedNames.has(name));
    usedNames.add(name);
    const id = newId("usr");
    const isTrial = i >= 24; // a few recent trial members
    const approvedDaysAgo = isTrial ? Math.floor(rand() * 40) : 60 + Math.floor(rand() * 300);
    const approvedAt = new Date(Date.now() - approvedDaysAgo * 86400000);
    const hasProfile = chance(0.85);
    const funding = weightedFunding();
    await db.insert(users).values({
      id,
      name,
      email: `${name.toLowerCase().replace(/[^a-z]+/g, ".")}@example.org`,
      role: "member",
      status: isTrial ? "trial" : "active",
      trialEndsAt: isTrial
        ? addDays(today, 90 - approvedDaysAgo)
        : null,
      descriptor: pick([
        "Works at an EA-aligned org",
        "Independent research or self-directed project",
        "Job hunting or career change",
        "Student",
      ]),
      about: "Working on things that matter.",
      profileUrl: "https://linkedin.com/in/example",
      expectedFrequency: pick(["Weekly", "Several days a week", "Monthly"]),
      guidelinesAcceptedAt: approvedAt,
      approvedAt,
      approvedBy: pick(adminIds),
      ...(chance(0.6)
        ? {
            profileVisible: true,
            bio: pick([
              "Researching AI governance and what the EU AI Act means for frontier labs.",
              "Building a global health charity — currently piloting in Malawi.",
              "Working on alternative protein policy in the Netherlands.",
              "Independent researcher on farmed animal welfare metrics.",
              "Figuring out my career switch into biosecurity — happy to chat!",
              "Community building for the Dutch EA network.",
              "Earning to give; software engineer by day.",
            ]),
            expertise: pick([
              "grant applications, EU policy",
              "statistics, cost-effectiveness analysis",
              "operations, event organising",
              "machine learning, technical AI safety",
              "fundraising, charity entrepreneurship",
              "career planning, coaching",
            ]),
            publicCauseAreas: [weightedCause()].filter((c) => c !== "Other"),
            publicLink: "https://linkedin.com/in/example",
          }
        : {}),
      ...(hasProfile
        ? {
            causeArea: weightedCause(),
            roleCategory: pick(ROLES),
            experienceLevel: weightedExp(),
            eaFunding: funding,
            funders:
              funding === "direct" || funding === "employer"
                ? [pick(["Open Philanthropy", "CEA", "EAIF", "LTFF", "SFF"])]
                : null,
            gender: female ? "F" : "M",
            profileUpdatedAt: new Date(Date.now() - Math.floor(rand() * 200) * 86400000),
          }
        : {}),
    });
    // heaviness: how often this member comes (regulars vs occasionals)
    members.push({ id, name, email: "", heaviness: 0.1 + rand() * 0.55 });
  }
  const everyone = [
    ...members,
    ...adminIds.map((id, i) => ({ id, name: admins[i].name, email: "", heaviness: 0.35 })),
  ];

  // ---------- block series for a few regulars ----------
  console.log("Block series…");
  const regulars = [...members].sort((a, b) => b.heaviness - a.heaviness).slice(0, 4);
  const seriesInfo: { userId: string; weekdays: number[]; start: string; end: string; seriesId: string }[] = [];
  for (const [i, reg] of regulars.entries()) {
    const weekdays = [[2], [2, 4], [3], [1, 3]][i];
    const start = addDays(seedStart, 14);
    const end = addDays(today, 35);
    const seriesId = newId("ser");
    await db.insert(bookingSeries).values({
      id: seriesId,
      userId: reg.id,
      weekdays,
      startDate: start,
      endDate: end,
    });
    seriesInfo.push({ userId: reg.id, weekdays, start, end, seriesId });
  }

  // ---------- bookings + check-ins, day by day ----------
  console.log("Bookings & check-ins…");
  const CHECKIN_RATE = 0.82;
  let bookingCount = 0;
  let checkinCount = 0;

  for (let d = seedStart; d <= addDays(today, 21); d = addDays(d, 1)) {
    if (!isWorkingDay(d)) continue;
    const isPast = d < today;
    const isFuture = d >= today;
    const wd = isoWeekday(d);
    const bookedToday = new Set<string>();
    let desksUsed = 0;
    let flexUsed = 0;

    // block-series bookings first (max 4 desks by construction)
    for (const s of seriesInfo) {
      if (d < s.start || d > s.end || !s.weekdays.includes(wd)) continue;
      if (desksUsed >= 8) break;
      const cancelled = chance(0.08);
      const id = newId("bk");
      const attended = !cancelled && isPast && chance(0.92);
      const checkedIn = attended && chance(CHECKIN_RATE);
      await db.insert(bookings).values({
        id,
        userId: s.userId,
        date: d,
        seriesId: s.seriesId,
        seatType: "desk",
        deskNumber: cancelled ? null : desksUsed + 1,
        status: cancelled ? "cancelled" : "booked",
        source: "block",
        noShow: false, // set by the no-show pass below
        createdAt: new Date(Date.parse(s.start)),
        cancelledAt: cancelled ? new Date(Date.parse(d) - 86400000) : null,
      });
      if (!cancelled) {
        bookedToday.add(s.userId);
        desksUsed++;
        bookingCount++;
        if (checkedIn) {
          await db.insert(checkins).values({
            id: newId("ci"),
            userId: s.userId,
            bookingId: id,
            date: d,
            checkedInAt: new Date(`${d}T0${8 + Math.floor(rand() * 2)}:${10 + Math.floor(rand() * 49)}:00+02:00`),
            isRetroactive: false,
          });
          checkinCount++;
        }
        // past bookings without a check-in are handled by the no-show pass below
      }
    }

    // individual bookings — busier midweek
    const busyness = [0.55, 0.75, 0.8, 0.7, 0.4][wd - 1];
    for (const m of everyone) {
      if (bookedToday.has(m.id)) continue;
      if (!chance(m.heaviness * busyness * (isFuture ? 0.55 : 1))) continue;
      const seatType = desksUsed < 8 ? "desk" : flexUsed < 5 ? "flex" : null;
      if (!seatType) continue;
      const cancelled = isPast && chance(0.07);
      const id = newId("bk");
      const isWalkin = isPast && chance(0.06);
      const checkedIn = !cancelled && isPast && (isWalkin || chance(CHECKIN_RATE));
      await db.insert(bookings).values({
        id,
        userId: m.id,
        date: d,
        seatType,
        deskNumber: !cancelled && seatType === "desk" ? desksUsed + 1 : null,
        status: cancelled ? "cancelled" : "booked",
        source: isWalkin ? "walkin" : "self",
        noShow: false,
        createdAt: new Date(Date.parse(d) - Math.floor(rand() * 14 + 1) * 86400000),
        cancelledAt: cancelled ? new Date(Date.parse(d) - 86400000) : null,
      });
      if (cancelled) continue;
      bookedToday.add(m.id);
      if (seatType === "desk") desksUsed++;
      else flexUsed++;
      bookingCount++;
      if (checkedIn) {
        const retro = chance(0.06);
        await db.insert(checkins).values({
          id: newId("ci"),
          userId: m.id,
          bookingId: id,
          date: d,
          checkedInAt: retro
            ? new Date(`${addDays(d, 1)}T10:00:00+02:00`)
            : new Date(`${d}T${String(8 + Math.floor(rand() * 3)).padStart(2, "0")}:${10 + Math.floor(rand() * 49)}:00+02:00`),
          isRetroactive: retro,
        });
        checkinCount++;
      }
      // past bookings without a check-in are handled by the no-show pass below
    }
  }

  // mark no-shows properly: any past booked booking without a matching check-in
  console.log("No-show pass…");
  const allBookings = await db.select().from(bookings);
  const allCheckins = await db.select().from(checkins);
  const ciSet = new Set(allCheckins.map((c) => `${c.userId}:${c.date}`));
  const { eq } = await import("drizzle-orm");
  for (const b of allBookings) {
    if (b.status !== "booked" || b.date >= today) continue;
    if (ciSet.has(`${b.userId}:${b.date}`)) continue;
    await db.update(bookings).set({ noShow: true }).where(eq(bookings.id, b.id));
    const existing = await db.select().from(noShowEvents).where(eq(noShowEvents.bookingId, b.id));
    if (existing.length === 0) {
      await db.insert(noShowEvents).values({
        id: newId("ns"),
        userId: b.userId,
        bookingId: b.id,
        date: b.date,
      });
    }
  }

  // ---------- events ----------
  console.log("Events…");
  const eventTitles: [string, string][] = [
    ["AI Safety Reading Group", "reading_group"],
    ["Intro to EA — open evening", "talk"],
    ["Alternative Proteins talk", "talk"],
    ["Community borrel", "social"],
    ["Biosecurity workshop", "workshop"],
    ["Giving season social", "social"],
    ["Forecasting workshop", "workshop"],
  ];
  let eventCount = 0;
  for (let d = seedStart; d <= addDays(today, 14); d = addDays(d, 1)) {
    if (!isWorkingDay(d)) continue;
    const isPast = d < today;
    // ~3 events + ~1.5 themed days per month across working days (~21/mo)
    if (chance(0.14)) {
      const themed = chance(0.35);
      const [title, type] = themed
        ? ([`${pick(["AI Safety", "Animal Welfare", "Global Health", "Biosecurity"])} coworking day`, "themed_coworking"] as [string, string])
        : eventTitles[eventCount % eventTitles.length];
      const evId = newId("ev");
      const expected = 8 + Math.floor(rand() * 18);
      await db.insert(events).values({
        id: evId,
        title,
        date: d,
        startsAt: themed ? "09:30" : "18:30",
        endsAt: themed ? "17:00" : "20:30",
        type: type as "talk",
        causeArea: themed ? title.replace(" coworking day", "") : null,
        organiser: chance(0.8) ? "ean" : "hosted",
        expectedAttendance: expected,
        headcount: isPast ? Math.max(3, Math.floor(expected * (0.6 + rand() * 0.7))) : null,
        createdBy: pick(adminIds),
      });
      if (isPast) {
        // some QR-based attendance on top of the headcount
        const attendees = [...members].filter(() => chance(themed ? 0.25 : 0.15));
        for (const a of attendees) {
          await db.insert(eventAttendance).values({
            id: newId("ea"),
            eventId: evId,
            userId: a.id,
            source: "checkin",
          });
        }
      }
      eventCount++;
    }
  }

  // ---------- pending visit requests ----------
  console.log("Visit requests…");
  const applicants = [
    {
      name: "Tessa van Leeuwen",
      about: "PhD student researching pandemic preparedness at Utrecht; met some of you at EAGx Rotterdam.",
      descriptor: "Student",
      daysAgo: 0,
    },
    {
      name: "Oskar Lindqvist",
      about: "Independent alignment researcher, recently moved to Amsterdam. Looking for a focused place to work.",
      descriptor: "Independent research or self-directed project",
      daysAgo: 3, // stale — shows the amber flag
    },
  ];
  for (const a of applicants) {
    const uid = newId("usr");
    const created = new Date(Date.now() - a.daysAgo * 86400000);
    await db.insert(users).values({
      id: uid,
      name: a.name,
      email: `${a.name.toLowerCase().replace(/[^a-z]+/g, ".")}@example.org`,
      role: "visitor",
      status: "pending",
      descriptor: a.descriptor,
      about: a.about,
      profileUrl: "https://linkedin.com/in/example",
      expectedFrequency: "Weekly",
      guidelinesAcceptedAt: created,
      causeArea: weightedCause(),
      roleCategory: pick(ROLES),
      experienceLevel: weightedExp(),
      eaFunding: weightedFunding(),
      gender: chance(0.5) ? "F" : "M",
      profileUpdatedAt: created,
      createdAt: created,
    });
    // next Tuesday-ish covered day
    let reqDate = addDays(today, 3);
    while (!isWorkingDay(reqDate) || isoWeekday(reqDate) > 4) reqDate = addDays(reqDate, 1);
    await db.insert(visitRequests).values({
      id: newId("vr"),
      userId: uid,
      requestedDate: reqDate,
      requestedArrival: chance(0.5) ? "11:00" : "13:00",
      status: "pending",
      createdAt: created,
    });
  }

  console.log(
    `Done: ${everyone.length} members+admins, ${bookingCount} bookings, ${checkinCount} check-ins, ${eventCount} events.`
  );
  console.log(`Log in at /login as ${admins[0].email} (admin) to look around.`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
