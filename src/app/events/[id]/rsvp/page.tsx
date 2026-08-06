import { notFound } from "next/navigation";
import { db, events, eventGuests, bookings } from "@/db";
import { eq, and } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth";
import { Nav } from "@/components/nav";
import { Page, H1, Sub, Card, Icon } from "@/components/ui";
import { formatDayLong, todayAms } from "@/lib/dates";
import { describeSeat } from "@/lib/booking";
import { coworkingSpots } from "@/lib/coworking-guests";
import { RsvpForm } from "./rsvp-form";

export const dynamic = "force-dynamic";

export default async function EventRsvpPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [event] = await db.select().from(events).where(eq(events.id, id));
  if (!event) notFound();

  const user = await getCurrentUser();

  let body: React.ReactNode;
  if (event.type !== "themed_coworking" || event.status !== "confirmed") {
    body = (
      <Card className="text-center py-8">
        <Icon name="calendar-off" className="text-4xl text-slate-400 mb-2" />
        <p className="text-slate-500">This one isn&apos;t open for requests.</p>
      </Card>
    );
  } else if (event.date < todayAms()) {
    body = (
      <Card className="text-center py-8">
        <Icon name="calendar-off" className="text-4xl text-slate-400 mb-2" />
        <p className="text-slate-500">This one&apos;s already happened.</p>
      </Card>
    );
  } else {
    const mine = user
      ? (
          await db
            .select()
            .from(eventGuests)
            .where(and(eq(eventGuests.eventId, id), eq(eventGuests.userId, user.id)))
        )[0]
      : undefined;

    const spots = await coworkingSpots(event.date);
    const [seat] = user
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
              ? "You're confirmed — see you there!"
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
        </Card>
      );
    } else {
      body = (
        <>
          <p className="text-sm text-slate-600 mb-4">
            A co-working day: the whole office works on this together, so the
            day is closed to general desk booking and the organiser decides
            who&apos;s in. Open to anyone, first time or not —{" "}
            {spots.left > 0
              ? `${spots.left} of ${spots.total} spots are still free.`
              : `all ${spots.total} spots are taken, but you can still ask.`}
          </p>
          <RsvpForm eventId={id} defaultName={user?.name} defaultEmail={user?.email} />
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
