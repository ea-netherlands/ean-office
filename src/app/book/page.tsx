import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser, isActiveMember } from "@/lib/auth";
import { Nav } from "@/components/nav";
import { Page, H1, Sub, Icon } from "@/components/ui";
import { capacityForRange, desksLeftFor, flexLeftFor } from "@/lib/booking";
import { asSlot, SLOTS } from "@/lib/slots";
import { getSettings } from "@/lib/settings";
import { db, bookings, events } from "@/db";
import { and, eq, gte, lte, inArray } from "drizzle-orm";
import { todayAms, monthName, isoWeekday, addDays } from "@/lib/dates";
import { coworkingSpotCount, isCoworkingDay } from "@/lib/coworking";
import { BookGrid, DayInfo } from "./book-grid";

export const dynamic = "force-dynamic";

export default async function BookPage({
  searchParams,
}: {
  searchParams: Promise<{ m?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/book");
  if (user.status === "imported") redirect("/welcome");
  if (!isActiveMember(user)) redirect("/");

  const { m } = await searchParams;
  const today = todayAms();
  const month = /^\d{4}-\d{2}$/.test(m || "") ? m! : today.slice(0, 7);
  const [year, mon] = [parseInt(month.slice(0, 4)), parseInt(month.slice(5, 7))];

  const first = `${month}-01`;
  const daysInMonth = new Date(Date.UTC(year, mon, 0)).getUTCDate();
  const last = `${month}-${String(daysInMonth).padStart(2, "0")}`;

  const cfg = await getSettings();
  const capMap = await capacityForRange(first, last);

  const mine = await db
    .select()
    .from(bookings)
    .where(
      and(
        eq(bookings.userId, user.id),
        gte(bookings.date, first),
        lte(bookings.date, last),
        inArray(bookings.status, ["booked", "waitlisted"])
      )
    );
  const mineByDate = new Map<string, typeof mine>();
  for (const b of mine) {
    mineByDate.set(b.date, [...(mineByDate.get(b.date) ?? []), b]);
  }

  const monthEvents = await db
    .select()
    .from(events)
    .where(
      and(
        gte(events.date, first),
        lte(events.date, last),
        eq(events.status, "confirmed")
      )
    );
  // Co-working days close their whole day to general booking; the panel needs
  // the hours and how much of the room is left so it can say more than "shut".
  const spotsTotal = coworkingSpotCount(cfg);
  const themedByDate = new Map(
    monthEvents
      .filter((e) => isCoworkingDay(e.type))
      .map((e) => {
        const cap = capMap.get(e.date);
        const taken = cap
          ? Math.max(
              cap.am.desksBooked + cap.am.flexBooked,
              cap.pm.desksBooked + cap.pm.flexBooked
            )
          : 0;
        return [
          e.date,
          {
            id: e.id,
            title: e.title,
            url: e.url,
            startsAt: e.startsAt,
            endsAt: e.endsAt,
            spotsTotal,
            spotsLeft: Math.max(0, spotsTotal - taken),
          },
        ] as const;
      })
  );

  const blockCap = Math.floor(cfg.desk_count * cfg.block_max_share);
  const days: DayInfo[] = [];
  for (let d = first; d <= last; d = addDays(d, 1)) {
    if (isoWeekday(d) >= 6) continue; // office is Mon–Fri
    const cap = capMap.get(d)!;
    const my = mineByDate.get(d) ?? [];
    const themed = themedByDate.get(d) ?? null;
    // Seats left per bookable slot, so the day panel can label each option.
    const desksLeft = Object.fromEntries(
      SLOTS.map((s) => [s, desksLeftFor(cap, s)])
    ) as DayInfo["desksLeft"];
    const flexLeft = Object.fromEntries(
      SLOTS.map((s) => [s, flexLeftFor(cap, s)])
    ) as DayInfo["flexLeft"];
    days.push({
      date: d,
      weekday: isoWeekday(d),
      closed: cap.closed || !!themed,
      past: d < today,
      desksLeft,
      flexLeft,
      full: cap.full,
      waitlistCount: cap.waitlistCount,
      people: cap.people.map((p) => ({
        id: p.id,
        name: p.name,
        seatType: p.seatType,
        deskNumber: p.deskNumber,
        slot: p.slot,
        isYou: p.id === user.id,
        avatarUrl: p.avatarUrl,
        profile: p.profile,
      })),
      // A member can hold a morning and an afternoon on the same day.
      mine: my.map((b) => ({
        bookingId: b.id,
        status: b.status as "booked" | "waitlisted",
        seatType: b.seatType,
        slot: asSlot(b.slot),
        seriesId: b.seriesId,
      })),
      blockCapReached: cap.am.blockDesks >= blockCap && cap.pm.blockDesks >= blockCap,
      themedEvent: themed,
    });
  }

  const prevMonth = mon === 1 ? `${year - 1}-12` : `${year}-${String(mon - 1).padStart(2, "0")}`;
  const nextMonth = mon === 12 ? `${year + 1}-01` : `${year}-${String(mon + 1).padStart(2, "0")}`;

  return (
    <>
      <Nav user={user} />
      <Page>
        <H1>Book the office</H1>
        <BookingKinds />
        <Sub>
          {cfg.desk_count} desks and {cfg.flex_count} lunch-table spots per day,
          bookable for the whole day or just a morning or afternoon. Tap a day
          to book — cancelling later takes one tap too.
        </Sub>
        <BookGrid
          days={days}
          month={month}
          monthLabel={monthName(year, mon)}
          prevMonth={prevMonth}
          nextMonth={nextMonth}
          today={today}
          flexWindow={cfg.flex_unavailable_window}
          amWindow={cfg.am_window}
          pmWindow={cfg.pm_window}
          horizonWeeks={cfg.block_horizon_weeks}
          hasProfile={!!user.causeArea}
          deskCount={cfg.desk_count}
        />
      </Page>
    </>
  );
}

/**
 * The three ways to book the office, side by side. A desk is what most
 * people come for, so it's this page; the other two kept getting missed when
 * they only lived at the bottom of Today.
 */
function BookingKinds() {
  const kinds = [
    { href: null, icon: "armchair", label: "A desk", note: "Office hours" },
    {
      href: "/events/propose",
      icon: "calendar-event",
      label: "An event",
      note: "Evenings and weekends",
    },
    {
      href: "/coworking/propose",
      icon: "target-arrow",
      label: "A co-working day",
      note: "The whole office",
    },
  ] as const;
  return (
    <nav aria-label="What to book" className="grid grid-cols-3 gap-2 mt-3 mb-4">
      {kinds.map((k) => {
        const body = (
          <>
            <Icon name={k.icon} className="text-lg" />
            <span className="block text-sm font-medium mt-1">{k.label}</span>
            <span
              className={`block text-[11px] ${k.href ? "text-slate-500" : "text-teal-700"}`}
            >
              {k.note}
            </span>
          </>
        );
        return k.href ? (
          <Link
            key={k.label}
            href={k.href}
            className="btn-key-subtle rounded-xl border border-slate-200 bg-white hover:bg-slate-50 px-2 py-2.5 text-center text-slate-700"
          >
            {body}
          </Link>
        ) : (
          <div
            key={k.label}
            aria-current="page"
            className="rounded-xl border border-teal-600 bg-teal-50 ring-1 ring-teal-600 px-2 py-2.5 text-center text-teal-800"
          >
            {body}
          </div>
        );
      })}
    </nav>
  );
}
