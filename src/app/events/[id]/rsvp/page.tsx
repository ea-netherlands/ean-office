import { notFound } from "next/navigation";
import { db, events, eventGuests } from "@/db";
import { eq, and } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth";
import { Nav } from "@/components/nav";
import { Page, H1, Sub, Card, Icon } from "@/components/ui";
import { formatDayLong, todayAms } from "@/lib/dates";
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
        </Card>
      );
    } else {
      body = (
        <>
          <p className="text-sm text-slate-600 mb-4">
            The office is closed to general desk booking that day — this is
            how you ask the organiser for a spot. Open to anyone, first time
            or not.
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
