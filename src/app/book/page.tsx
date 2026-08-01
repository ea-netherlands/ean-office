import { redirect } from "next/navigation";
import { getCurrentUser, isActiveMember } from "@/lib/auth";
import { Nav } from "@/components/nav";
import { Page, H1, Sub } from "@/components/ui";
import { capacityForRange } from "@/lib/booking";
import { getSettings } from "@/lib/settings";
import { db, bookings, events } from "@/db";
import { and, eq, gte, lte, inArray } from "drizzle-orm";
import { todayAms, monthName, isoWeekday, addDays } from "@/lib/dates";
import { BookGrid, DayInfo } from "./book-grid";

export const dynamic = "force-dynamic";

export default async function BookPage({
  searchParams,
}: {
  searchParams: Promise<{ m?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/book");
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
  const mineByDate = new Map(mine.map((b) => [b.date, b]));

  const monthEvents = await db
    .select()
    .from(events)
    .where(and(gte(events.date, first), lte(events.date, last)));
  const themedByDate = new Map(
    monthEvents
      .filter((e) => e.type === "themed_coworking")
      .map((e) => [e.date, e.title])
  );

  const blockCap = Math.floor(cfg.desk_count * cfg.block_max_share);
  const days: DayInfo[] = [];
  for (let d = first; d <= last; d = addDays(d, 1)) {
    if (isoWeekday(d) >= 6) continue; // office is Mon–Fri
    const cap = capMap.get(d)!;
    const my = mineByDate.get(d);
    days.push({
      date: d,
      weekday: isoWeekday(d),
      closed: cap.closed,
      past: d < today,
      desksLeft: cap.desksLeft,
      flexLeft: cap.flexLeft,
      full: cap.full,
      waitlistCount: cap.waitlistCount,
      people: cap.people.map((p) => ({
        id: p.id,
        name: p.name,
        seatType: p.seatType,
        isYou: p.id === user.id,
        profile: p.profile,
      })),
      mine: my
        ? {
            bookingId: my.id,
            status: my.status as "booked" | "waitlisted",
            seatType: my.seatType,
            seriesId: my.seriesId,
          }
        : null,
      blockCapReached: cap.blockDesks >= blockCap,
      themedEvent: themedByDate.get(d) ?? null,
    });
  }

  const prevMonth = mon === 1 ? `${year - 1}-12` : `${year}-${String(mon - 1).padStart(2, "0")}`;
  const nextMonth = mon === 12 ? `${year + 1}-01` : `${year}-${String(mon + 1).padStart(2, "0")}`;

  return (
    <>
      <Nav user={user} />
      <Page>
        <H1>Book a desk</H1>
        <Sub>
          {cfg.desk_count} desks and {cfg.flex_count} lunch-table spots per day.
          Tap a day to book — cancelling later takes one tap too.
        </Sub>
        <BookGrid
          days={days}
          month={month}
          monthLabel={monthName(year, mon)}
          prevMonth={prevMonth}
          nextMonth={nextMonth}
          today={today}
          flexWindow={cfg.flex_unavailable_window}
          horizonWeeks={cfg.block_horizon_weeks}
          hasProfile={!!user.causeArea}
        />
      </Page>
    </>
  );
}
