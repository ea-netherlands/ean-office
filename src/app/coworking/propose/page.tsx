import Link from "next/link";
import { redirect } from "next/navigation";
import { and, gte, inArray, lte } from "drizzle-orm";
import { getCurrentUser, isActiveMember } from "@/lib/auth";
import { Nav } from "@/components/nav";
import { Page, H1, Sub } from "@/components/ui";
import { db, events } from "@/db";
import { capacityForRange } from "@/lib/booking";
import { getSettings } from "@/lib/settings";
import { addDays, isWorkingDay, todayAms } from "@/lib/dates";
import { COWORKING_TYPE, coworkingSpotCount } from "@/lib/coworking";
import { CoworkingForm } from "./coworking-form";
import type { CoworkingDayInfo } from "./day-picker";

export const dynamic = "force-dynamic";

/**
 * Which working days are actually available, and what a co-working day would
 * displace: a day with six desks already booked is a different proposition
 * from an empty one, and the organiser should see that before picking.
 *
 * The window is `coworking_horizon_weeks` (admin-editable) — long enough that
 * a visiting team's day next season is pickable rather than an email.
 */
async function getDays(): Promise<CoworkingDayInfo[]> {
  const cfg = await getSettings();
  const from = todayAms();
  const to = addDays(from, cfg.coworking_horizon_weeks * 7);

  const upcoming = await db
    .select({
      date: events.date,
      title: events.title,
      type: events.type,
      status: events.status,
    })
    .from(events)
    // Declined and cancelled events don't block a date.
    .where(
      and(
        gte(events.date, from),
        lte(events.date, to),
        inArray(events.status, ["proposed", "confirmed"])
      )
    );

  const capMap = await capacityForRange(from, to, cfg);
  const total = coworkingSpotCount(cfg);

  const days: CoworkingDayInfo[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) {
    if (!isWorkingDay(d)) continue;
    const cap = capMap.get(d)!;
    // Proposed events stay invisible to other members until an admin confirms
    // them — the date is flagged, never the title or who proposed it.
    const onDay = upcoming.filter((e) => e.date === d);
    const coworking = onDay.find((e) => e.type === COWORKING_TYPE);
    const other = onDay.find((e) => e.type !== COWORKING_TYPE);
    days.push({
      date: d,
      booked: Math.max(
        cap.am.desksBooked + cap.am.flexBooked,
        cap.pm.desksBooked + cap.pm.flexBooked
      ),
      total,
      coworking: coworking
        ? {
            status: coworking.status === "confirmed" ? "confirmed" : "pending",
            title: coworking.status === "confirmed" ? coworking.title : null,
          }
        : null,
      eveningEvent: other
        ? other.status === "confirmed"
          ? other.title
          : "an event awaiting confirmation"
        : null,
    });
  }
  return days;
}

export default async function ProposeCoworkingDayPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/coworking/propose");
  if (user.status === "imported") redirect("/welcome");
  if (!isActiveMember(user)) redirect("/");

  const days = await getDays();

  return (
    <>
      <Nav user={user} />
      <Page>
        <H1>Organise a co-working day</H1>
        <Sub>
          A day where the whole office works on one thing together — a cause
          area, a sprint, a visiting team. It runs during office hours, and an
          admin confirms it before anyone else sees it.
        </Sub>
        <CoworkingForm days={days} />
        <p className="text-sm text-slate-500 mt-6">
          Something in the evening instead — a reading group, a talk, a social?{" "}
          <Link href="/events/propose" className="text-teal-700 underline">
            Propose an event
          </Link>
          .
        </p>
      </Page>
    </>
  );
}
