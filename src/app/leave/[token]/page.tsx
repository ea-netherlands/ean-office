import { verifyToken } from "@/lib/tokens";
import { db, eventGuests, events, users, ensureMigrated } from "@/db";
import { eq } from "drizzle-orm";
import { formatDayLong, todayAms } from "@/lib/dates";
import { isCoworkingDay } from "@/lib/coworking";
import { Icon } from "@/components/ui";
import { LeaveConfirm } from "./leave-confirm";

export const dynamic = "force-dynamic";

/**
 * No-login "I can't make it" target from sign-up emails. One confirmation tap
 * — an email scanner prefetching links must not be able to drop someone from
 * an event — and then they're off the list and the organiser is told.
 */
export default async function LeaveEventPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  await ensureMigrated();
  const { token } = await params;
  const verified = verifyToken(token, "unrsvp");

  if (!verified) {
    return (
      <Shell>
        <h1 className="text-xl">This link has expired</h1>
        <p className="text-slate-500 mt-2 text-sm">
          The day has probably passed. If you need to change something,
          replying to the email reaches the organiser.
        </p>
      </Shell>
    );
  }

  const [guest] = await db
    .select()
    .from(eventGuests)
    .where(eq(eventGuests.id, verified.subject));
  if (!guest) {
    return (
      <Shell>
        <h1 className="text-xl">We couldn&apos;t find that sign-up</h1>
      </Shell>
    );
  }
  const [event] = await db.select().from(events).where(eq(events.id, guest.eventId));
  const [person] = await db.select().from(users).where(eq(users.id, guest.userId));
  if (!event) {
    return (
      <Shell>
        <h1 className="text-xl">We couldn&apos;t find that event</h1>
      </Shell>
    );
  }

  const coworking = isCoworkingDay(event.type);

  if (event.status === "cancelled") {
    return (
      <Shell>
        <Icon name="calendar-off" className="text-5xl text-slate-400 mb-2" />
        <h1 className="text-xl">That one was called off anyway</h1>
        <p className="text-slate-500 mt-2 text-sm">
          Nothing to leave — <strong>{event.title}</strong> isn&apos;t
          happening. Nobody is expecting you.
        </p>
      </Shell>
    );
  }

  if (guest.status === "declined") {
    return (
      <Shell>
        <Icon name="circle-check" className="text-5xl text-teal-600 mb-2" />
        <h1 className="text-xl">You&apos;re already off the list</h1>
        <p className="text-slate-500 mt-2 text-sm">
          Nobody is expecting you at <strong>{event.title}</strong>. Changed
          your mind again?{" "}
          <a href={`/events/${event.id}/rsvp`} className="text-teal-700">
            Sign up again
          </a>
          .
        </p>
      </Shell>
    );
  }

  if (event.date < todayAms()) {
    return (
      <Shell>
        <h1 className="text-xl">That one has already happened</h1>
        <p className="text-slate-500 mt-2 text-sm">
          <strong>{event.title}</strong> was on {formatDayLong(event.date)},
          so there&apos;s nothing left to cancel.
        </p>
      </Shell>
    );
  }

  return (
    <Shell>
      <h1 className="text-xl">
        {guest.status === "pending" ? "Withdraw your request?" : "Can't make it?"}
      </h1>
      <p className="text-slate-600 mt-2 mb-5 text-sm">
        {person?.name} · <strong>{event.title}</strong>
        <br />
        {formatDayLong(event.date)}
        {event.startsAt
          ? `, ${event.startsAt}${event.endsAt ? `–${event.endsAt}` : ""}`
          : ""}
      </p>
      <LeaveConfirm token={token} pending={guest.status === "pending"} />
      <p className="text-xs text-slate-400 mt-4">
        {coworking && guest.status === "approved"
          ? "No reason needed — it hands your desk back for someone else that day."
          : "No reason needed. We'll let the organiser know so they're not expecting you."}
      </p>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center text-center px-6 max-w-sm mx-auto">
      {children}
    </main>
  );
}
