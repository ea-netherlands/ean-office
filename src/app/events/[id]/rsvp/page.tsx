import Link from "next/link";
import { notFound } from "next/navigation";
import { db, events, eventGuests, bookings } from "@/db";
import { eq, and } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth";
import { Nav } from "@/components/nav";
import { Page, H1, Sub, Card, Icon, btnPrimary } from "@/components/ui";
import { formatDayLong, todayAms } from "@/lib/dates";
import { describeSeat } from "@/lib/booking";
import { coworkingSpots } from "@/lib/coworking-guests";
import { isCoworkingDay } from "@/lib/coworking";
import { acceptsSignups } from "@/lib/event-join";
import { SELF_WITHDRAWN } from "@/lib/leave-event";
import { getSettings } from "@/lib/settings";
import { RsvpForm } from "./rsvp-form";
import { LeaveButton } from "./leave-button";

export const dynamic = "force-dynamic";

/**
 * The page behind the one link an organiser shares.
 *
 * Two shapes, and the difference is desks. A **co-working day** takes the
 * whole office, so this is a request the organiser decides on. An **evening
 * event** runs after hours with nothing to ration, so signing up is signing
 * up and the organiser just gets a list.
 */
export default async function EventRsvpPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [event] = await db.select().from(events).where(eq(events.id, id));
  if (!event) notFound();

  const user = await getCurrentUser();
  const coworking = isCoworkingDay(event.type);

  let body: React.ReactNode;
  if (event.status === "cancelled") {
    body = (
      <Card className="text-center py-8">
        <Icon name="calendar-off" className="text-4xl text-slate-400 mb-2" />
        <p className="text-slate-600">
          This one has been called off — sorry.
          {event.cancelReason ? ` ${event.cancelReason}` : ""}
        </p>
        <p className="text-sm text-slate-500 mt-2">
          The office is open as usual that day, so you can{" "}
          <Link href="/book" className="text-teal-700 underline">
            book a desk
          </Link>{" "}
          instead.
        </p>
      </Card>
    );
  } else if (event.status !== "confirmed") {
    body = (
      <Card className="text-center py-8">
        <Icon name="calendar-off" className="text-4xl text-slate-400 mb-2" />
        <p className="text-slate-500">
          This one isn&apos;t open for sign-ups{event.status === "proposed" ? " yet — it's still waiting to be confirmed" : ""}.
        </p>
      </Card>
    );
  } else if (event.date < todayAms()) {
    body = (
      <Card className="text-center py-8">
        <Icon name="calendar-off" className="text-4xl text-slate-400 mb-2" />
        <p className="text-slate-500">This one&apos;s already happened.</p>
      </Card>
    );
  } else if (!acceptsSignups(event)) {
    // Hiding the link isn't enough — the URL is guessable and gets forwarded.
    body = (
      <Card className="text-center py-8">
        <Icon name="lock" className="text-4xl text-slate-400 mb-2" />
        <p className="text-slate-600">This one isn&apos;t open for sign-ups.</p>
        <p className="text-sm text-slate-500 mt-2">
          Invited? The organiser will have told you how to come. The office is
          open as usual that day, so you can{" "}
          <Link href="/book" className="text-teal-700 underline">
            book a desk
          </Link>{" "}
          if you&apos;re a member.
        </p>
      </Card>
    );
  } else {
    const row = user
      ? (
          await db
            .select()
            .from(eventGuests)
            .where(and(eq(eventGuests.eventId, id), eq(eventGuests.userId, user.id)))
        )[0]
      : undefined;
    // Someone who took their own name off is back to being a stranger to this
    // event: they get the form again, not a card telling them what they
    // already know. Only an organiser's decline is a standing answer.
    const mine =
      row && row.status === "declined" && row.decidedBy === SELF_WITHDRAWN
        ? undefined
        : row;

    // Only a co-working day rations seats, so only it needs the count.
    const spots = coworking ? await coworkingSpots(event.date) : null;
    const [seat] = user && coworking
      ? await db
          .select()
          .from(bookings)
          .where(
            and(
              eq(bookings.userId, user.id),
              eq(bookings.date, event.date),
              eq(bookings.status, "booked")
            )
          )
      : [];

    if (mine) {
      body = (
        <Card className="text-center py-8">
          <Icon
            name={
              mine.status === "approved"
                ? "circle-check"
                : mine.status === "declined"
                  ? "circle-x"
                  : "clock"
            }
            className={`text-4xl mb-2 ${mine.status === "approved" ? "text-teal-600" : "text-slate-400"}`}
          />
          <p className="text-slate-600">
            {mine.status === "approved"
              ? "You're on the list — see you there!"
              : mine.status === "declined"
                ? "The organiser wasn't able to fit you in this time."
                : "Request sent — the organiser will get back to you."}
          </p>
          {mine.status === "approved" && seat && (
            <p className="text-sm text-slate-500 mt-1">
              You&apos;ve got {describeSeat(seat)}. Scan the QR code by the
              door when you arrive.
            </p>
          )}
          {/* Plans change. Undoing a sign-up is one tap here and one tap from
              the confirmation email — a room set out for twelve with six
              people in it is the thing this prevents. */}
          {mine.status !== "declined" && (
            <LeaveButton eventId={id} pendingRequest={mine.status === "pending"} />
          )}
        </Card>
      );
    } else if (event.url) {
      // It takes its RSVPs on Luma, so this form would be a second guest list
      // nobody reads. Old links and emails still land here.
      body = (
        <Card className="text-center py-8">
          <Icon name="calendar-event" className="text-4xl text-teal-600 mb-2" />
          <p className="text-slate-600">
            This one takes sign-ups on its event page — that&apos;s where the
            organiser keeps the guest list.
          </p>
          <a
            href={event.url}
            target="_blank"
            rel="noreferrer"
            className={`${btnPrimary} mt-4 inline-flex`}
          >
            RSVP on Luma
          </a>
        </Card>
      );
    } else if (coworking) {
      body = (
        <>
          <p className="text-sm text-slate-600 mb-4">
            A co-working day: the whole office works on this together, so the
            day is closed to general desk booking and the organiser decides
            who&apos;s in. Open to anyone, first time or not —{" "}
            {spots!.left > 0
              ? `${spots!.left} of ${spots!.total} spots are still free.`
              : `all ${spots!.total} spots are taken, but you can still ask.`}
          </p>
          <RsvpForm eventId={id} defaultName={user?.name} defaultEmail={user?.email} />
        </>
      );
    } else {
      const cfg = await getSettings();
      body = (
        <>
          <p className="text-sm text-slate-600 mb-4">
            An evening at the office, open to anyone — you don&apos;t need an
            account or a desk booking. Put your name down and the organiser
            knows to expect you.
          </p>
          <RsvpForm
            eventId={id}
            open
            defaultName={user?.name}
            defaultEmail={user?.email}
          />
          <p className="text-xs text-slate-500 mt-4">
            {cfg.office_address}
          </p>
        </>
      );
    }
  }

  return (
    <>
      <Nav user={user} />
      <Page>
        <H1>{event.title}</H1>
        <Sub>
          {formatDayLong(event.date)}
          {event.startsAt ? ` · ${event.startsAt}${event.endsAt ? `–${event.endsAt}` : ""}` : ""}
        </Sub>
        {body}
      </Page>
    </>
  );
}
