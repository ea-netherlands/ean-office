import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { Nav } from "@/components/nav";
import { Page, H1, Sub, Card, Badge, Icon, btnPrimary, btnSecondary } from "@/components/ui";
import { PeopleList } from "@/components/people";
import { capacityForDay } from "@/lib/booking";
import { isCoworkingDay } from "@/lib/coworking";
import { db, checkins, events, eventAttendance, eventGuests, ensureMigrated } from "@/db";
import { and, eq, gte, lte, asc } from "drizzle-orm";
import { addDays, formatDayLong, todayAms, formatDay } from "@/lib/dates";
import { TodayActions, RsvpButton } from "./today-actions";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  await ensureMigrated();
  const user = await getCurrentUser();
  if (user?.status === "imported") redirect("/welcome");
  const today = todayAms();

  if (!user) {
    return (
      <>
        <Nav user={null} />
        <Page>
          <div className="max-w-lg mx-auto mt-10 text-center">
            <h1 className="text-3xl">
              EA Netherlands Office
            </h1>
            <p className="text-slate-500 mt-3 mb-8">
              A small coworking space in Amsterdam for people working on the
              world&apos;s most pressing problems. Eight desks, one lunch
              table, good company.
            </p>
            <div className="flex gap-3 justify-center">
              <Link href="/join" className={btnPrimary}>
                Request a first visit
              </Link>
              <Link href="/login" className={btnSecondary}>
                Member log in
              </Link>
            </div>
          </div>
        </Page>
      </>
    );
  }

  const cap = await capacityForDay(today);
  const myBooking = cap.people.find((p) => p.id === user.id);
  const [myCheckin] = await db
    .select()
    .from(checkins)
    .where(and(eq(checkins.userId, user.id), eq(checkins.date, today)));

  const upcomingEvents = await db
    .select()
    .from(events)
    .where(
      and(
        gte(events.date, today),
        lte(events.date, addDays(today, 21)),
        eq(events.status, "confirmed")
      )
    )
    .orderBy(asc(events.date));
  const myRsvps = new Set(
    (
      await db
        .select()
        .from(eventAttendance)
        .where(and(eq(eventAttendance.userId, user.id), eq(eventAttendance.source, "rsvp")))
    ).map((r) => r.eventId)
  );
  // Co-working days are curated, not RSVP'd — this is where each one stands
  // for the person looking at it.
  const myGuestStatus = new Map(
    (
      await db
        .select()
        .from(eventGuests)
        .where(eq(eventGuests.userId, user.id))
    ).map((g) => [g.eventId, g.status])
  );

  const others = cap.people.filter((p) => p.id !== user.id);
  // A co-working day owns the whole office, so today's card has to lead with
  // it rather than offering a desk that isn't going to exist.
  const coworkingToday = upcomingEvents.find(
    (e) => e.date === today && isCoworkingDay(e.type)
  );

  return (
    <>
      <Nav user={user} />
      <Page>
        <H1>Today</H1>
        <Sub>{formatDayLong(today)}</Sub>

        <Card className="mb-4">
          {cap.closed ? (
            <p className="text-slate-600">
              The office is closed today (weekend or public holiday). See you
              next working day!
            </p>
          ) : coworkingToday ? (
            <>
              <p className="text-sm text-teal-700 mb-2">
                <Icon name="target-arrow" className="mr-1" />
                {coworkingToday.title}
                {coworkingToday.startsAt
                  ? ` · ${coworkingToday.startsAt}${coworkingToday.endsAt ? `–${coworkingToday.endsAt}` : ""}`
                  : ""}
              </p>
              {myBooking ? (
                <TodayActions
                  booked
                  checkedIn={!!myCheckin}
                  seatType={myBooking.seatType}
                  deskNumber={myBooking.deskNumber ?? undefined}
                  slot={myBooking.slot}
                  full={cap.full}
                />
              ) : (
                <>
                  <p className="text-slate-600 text-sm">
                    A co-working day has the office today, so there&apos;s no
                    general desk booking. Still want to come? Ask the
                    organiser — they answer quickly.
                  </p>
                  <Link
                    href={`/events/${coworkingToday.id}/rsvp`}
                    className={`${btnPrimary} mt-3 inline-flex`}
                  >
                    Ask to join
                  </Link>
                </>
              )}
            </>
          ) : (
            <TodayActions
              booked={!!myBooking}
              checkedIn={!!myCheckin}
              seatType={myBooking?.seatType}
              deskNumber={myBooking?.deskNumber ?? undefined}
              slot={myBooking?.slot}
              full={cap.full}
            />
          )}
        </Card>

        {!cap.closed && (
          <Card className="mb-4">
            <div className="flex items-center justify-between mb-3">
              <h2>Who&apos;s coming today</h2>
              <span className="text-sm text-slate-500">
                {cap.desksFreeAllDay} desk
                {cap.desksFreeAllDay === 1 ? "" : "s"} ·{" "}
                {cap.flexFreeAllDay} lunch-table spot
                {cap.flexFreeAllDay === 1 ? "" : "s"} left
                {/* Whole-day seats can be gone while a half is still free. */}
                {cap.desksFreeAllDay === 0 && cap.pm.desksLeft > 0 && (
                  <> · {cap.pm.desksLeft} free this afternoon</>
                )}
              </span>
            </div>
            {others.length === 0 && !myBooking ? (
              <p className="text-sm text-slate-500">
                Nobody yet — be the first to book.
              </p>
            ) : (
              <PeopleList
                people={cap.people.map((p) => ({
                  id: p.id,
                  name: p.name,
                  seatType: p.seatType,
                  deskNumber: p.deskNumber,
                  slot: p.slot,
                  isYou: p.id === user.id,
                  profile: p.profile,
                }))}
              />
            )}
          </Card>
        )}

        <Card className="mb-4 space-y-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <p className="text-sm text-slate-600">
              Got something you&apos;d like to run here? Reading groups, talks,
              socials — the office is yours outside office hours.
            </p>
            <Link href="/events/propose" className={btnSecondary}>
              Propose an event
            </Link>
          </div>
          <div className="rule-dashed-y" />
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <p className="text-sm text-slate-600">
              Or take the whole office for a day — a cause area, a sprint, a
              visiting team. You pick who comes.
            </p>
            <Link href="/coworking/propose" className={btnSecondary}>
              Organise a co-working day
            </Link>
          </div>
        </Card>

        {upcomingEvents.length > 0 && (
          <Card>
            <h2 className="mb-3">Coming up</h2>
            <ul className="space-y-3">
              {upcomingEvents.map((e) => (
                <li key={e.id} className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium text-sm">
                      {e.title}{" "}
                      {/* Most of these are called "<something> co-working
                          day" already — don't say it twice. */}
                      {isCoworkingDay(e.type) &&
                        !/co-?working/i.test(e.title) && (
                          <Badge tone="indigo">co-working day</Badge>
                        )}
                    </p>
                    <p className="text-xs text-slate-500">
                      {formatDay(e.date)}
                      {e.startsAt ? ` · ${e.startsAt}` : ""}
                      {e.endsAt ? `–${e.endsAt}` : ""}
                    </p>
                  </div>
                  {isCoworkingDay(e.type) ? (
                    <CoworkingLink
                      eventId={e.id}
                      status={myGuestStatus.get(e.id)}
                    />
                  ) : e.url ? (
                    <a
                      href={e.url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs border border-slate-300 rounded-full px-3 py-1 hover:bg-slate-50 whitespace-nowrap"
                    >
                      RSVP on Luma
                    </a>
                  ) : (
                    <RsvpButton eventId={e.id} rsvped={myRsvps.has(e.id)} />
                  )}
                </li>
              ))}
            </ul>
          </Card>
        )}
      </Page>
    </>
  );
}

/** Where a member stands on a co-working day: in, waiting, or free to ask. */
function CoworkingLink({
  eventId,
  status,
}: {
  eventId: string;
  status?: string;
}) {
  const label =
    status === "approved"
      ? "You're in"
      : status === "pending"
        ? "Asked"
        : status === "declined"
          ? "Full"
          : "Ask to join";
  return (
    <Link
      href={`/events/${eventId}/rsvp`}
      className={`text-xs rounded-full px-3 py-1 whitespace-nowrap border ${
        status === "approved"
          ? "border-teal-300 bg-teal-50 text-teal-800"
          : "border-slate-300 hover:bg-slate-50"
      }`}
    >
      {label}
    </Link>
  );
}
