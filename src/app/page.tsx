import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { Nav } from "@/components/nav";
import { Page, H1, Sub, Card, Badge, btnPrimary, btnSecondary } from "@/components/ui";
import { PeopleList } from "@/components/people";
import { capacityForDay } from "@/lib/booking";
import { db, checkins, events, eventAttendance, ensureMigrated } from "@/db";
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
            <h1 className="text-3xl font-bold tracking-tight">
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

  const others = cap.people.filter((p) => p.id !== user.id);

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
              <h2 className="font-semibold">Who&apos;s coming today</h2>
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

        <Card className="mb-4 flex items-center justify-between gap-3 flex-wrap">
          <p className="text-sm text-slate-600">
            Got something you&apos;d like to run here? Reading groups, talks,
            socials — the office is yours outside office hours.
          </p>
          <Link href="/events/propose" className={btnSecondary}>
            Propose an event
          </Link>
        </Card>

        {upcomingEvents.length > 0 && (
          <Card>
            <h2 className="font-semibold mb-3">Coming up</h2>
            <ul className="space-y-3">
              {upcomingEvents.map((e) => (
                <li key={e.id} className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium text-sm">
                      {e.title}{" "}
                      {e.type === "themed_coworking" && (
                        <Badge tone="indigo">themed coworking day</Badge>
                      )}
                    </p>
                    <p className="text-xs text-slate-500">
                      {formatDay(e.date)}
                      {e.startsAt ? ` · ${e.startsAt}` : ""}
                      {e.endsAt ? `–${e.endsAt}` : ""}
                    </p>
                  </div>
                  {e.url ? (
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
