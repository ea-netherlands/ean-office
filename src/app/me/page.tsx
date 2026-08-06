import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { Nav } from "@/components/nav";
import { Page, H1, Sub, Card, Badge, Icon } from "@/components/ui";
import { db, bookings, events, eventGuests, eventAttendance } from "@/db";
import { CancelEventButton } from "@/components/cancel-event-button";
import { and, eq, gte, inArray, asc } from "drizzle-orm";
import { todayAms, formatDay, formatDayLong } from "@/lib/dates";
import { COWORKING_TYPE } from "@/lib/coworking";
import { asSlot } from "@/lib/slots";
import { MeClient } from "./me-client";

export const dynamic = "force-dynamic";

export default async function MePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/me");

  const upcoming = await db
    .select()
    .from(bookings)
    .where(
      and(
        eq(bookings.userId, user.id),
        gte(bookings.date, todayAms()),
        inArray(bookings.status, ["booked", "waitlisted"])
      )
    )
    .orderBy(asc(bookings.date));

  // Anything they're running — co-working days and evening events alike.
  // Without this the only route to your own event is a link in an email, and
  // there'd be nowhere to call one off from.
  const organising = await db
    .select()
    .from(events)
    .where(
      and(
        eq(events.createdBy, user.id),
        gte(events.date, todayAms()),
        inArray(events.status, ["proposed", "confirmed"])
      )
    )
    .orderBy(asc(events.date));
  // How many people would need telling if they called one off.
  const organisingIds = organising.map((e) => e.id);
  const signups = new Map<string, number>();
  if (organisingIds.length > 0) {
    const bump = (id: string) => signups.set(id, (signups.get(id) ?? 0) + 1);
    for (const g of await db
      .select({ eventId: eventGuests.eventId })
      .from(eventGuests)
      .where(
        and(
          inArray(eventGuests.eventId, organisingIds),
          inArray(eventGuests.status, ["pending", "approved"])
        )
      ))
      bump(g.eventId);
    for (const r of await db
      .select({ eventId: eventAttendance.eventId })
      .from(eventAttendance)
      .where(
        and(
          inArray(eventAttendance.eventId, organisingIds),
          eq(eventAttendance.source, "rsvp")
        )
      ))
      bump(r.eventId);
  }

  const joining = (
    await db
      .select({ g: eventGuests, e: events })
      .from(eventGuests)
      .innerJoin(events, eq(events.id, eventGuests.eventId))
      .where(
        and(
          eq(eventGuests.userId, user.id),
          gte(events.date, todayAms()),
          inArray(eventGuests.status, ["pending", "approved"])
        )
      )
      .orderBy(asc(events.date))
  ).filter((r) => r.e.createdBy !== user.id);

  const yearAgo = new Date();
  yearAgo.setFullYear(yearAgo.getFullYear() - 1);
  const profileStale =
    !user.profileUpdatedAt || user.profileUpdatedAt < yearAgo;

  return (
    <>
      <Nav user={user} />
      <Page>
        <H1>Your bookings</H1>
        <Sub>
          {user.name} · {user.email}
          {user.status === "trial" && user.trialEndsAt && (
            <> · <Badge tone="teal">trial until {formatDayLong(user.trialEndsAt)}</Badge></>
          )}
        </Sub>
        {(organising.length > 0 || joining.length > 0) && (
          <Card className="mb-4 space-y-3">
            <h2>What you&apos;re running</h2>
            {organising.map((e) => (
              <OrganiserRow
                key={e.id}
                event={{
                  id: e.id,
                  title: e.title,
                  dateLabel: formatDay(e.date),
                  status: e.status,
                  coworking: e.type === COWORKING_TYPE,
                  signedUp: signups.get(e.id) ?? 0,
                }}
              />
            ))}
            {joining.map(({ g, e }) => (
              <div
                key={g.id}
                className="flex items-center justify-between gap-3 flex-wrap text-sm"
              >
                <span>
                  {e.title} · {formatDay(e.date)}{" "}
                  {g.status === "approved" ? (
                    <Badge tone="teal">you&apos;re in</Badge>
                  ) : (
                    <Badge>waiting on the organiser</Badge>
                  )}
                </span>
                <Link href={`/events/${e.id}/rsvp`} className="text-teal-700 underline">
                  Details
                </Link>
              </div>
            ))}
          </Card>
        )}

        <MeClient
          upcoming={upcoming.map((b) => ({
            id: b.id,
            date: b.date,
            dateLabel: formatDayLong(b.date),
            seatType: b.seatType,
            slot: asSlot(b.slot),
            status: b.status as "booked" | "waitlisted",
            seriesId: b.seriesId,
          }))}
          user={{
            name: user.name,
            noshowEmailOptOut: user.noshowEmailOptOut,
            community: {
              profileVisible: user.profileVisible,
              bio: user.bio ?? user.about, // prefill from intake, editable before publishing
              expertise: user.expertise,
              publicCauseAreas: user.publicCauseAreas,
              publicLink: user.publicLink ?? user.profileUrl,
            },
            profile: {
              causeArea: user.causeArea,
              roleCategory: user.roleCategory,
              experienceLevel: user.experienceLevel,
              eaFunding: user.eaFunding,
              gender: user.gender,
              funders: user.funders,
            },
            profileStale,
          }}
        />
      </Page>
    </>
  );
}

/**
 * One thing the member is running. Confirmed ones can be called off from
 * here — the organiser shouldn't have to find an admin to do it.
 */
function OrganiserRow({
  event,
}: {
  event: {
    id: string;
    title: string;
    dateLabel: string;
    status: string;
    coworking: boolean;
    signedUp: number;
  };
}) {
  return (
    <div className="text-sm border-b border-slate-100 last:border-0 pb-3 last:pb-0">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <span>
          {event.coworking && (
            <Icon name="target-arrow" className="mr-1 text-teal-700" />
          )}
          {event.title} · {event.dateLabel}{" "}
          {event.status === "proposed" ? (
            <Badge>awaiting confirmation</Badge>
          ) : (
            <Badge tone="teal">yours to run</Badge>
          )}
        </span>
        {event.status === "confirmed" && event.coworking && (
          <Link href={`/events/${event.id}/guests`} className="text-teal-700 underline">
            Manage guests
          </Link>
        )}
      </div>
      {event.status === "confirmed" && (
        <div className="mt-2">
          <CancelEventButton
            eventId={event.id}
            title={event.title}
            date={event.dateLabel}
            coworking={event.coworking}
            signedUp={event.signedUp}
            label="Cancel it"
          />
        </div>
      )}
    </div>
  );
}
