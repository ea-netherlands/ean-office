import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { Nav } from "@/components/nav";
import { Page, H1, Sub, Card, Badge, Icon } from "@/components/ui";
import { db, bookings, events, eventGuests } from "@/db";
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

  // Co-working days they're running, and ones they've asked to join. The
  // organiser's guest list is otherwise only reachable from an email.
  const organising = await db
    .select()
    .from(events)
    .where(
      and(
        eq(events.createdBy, user.id),
        eq(events.type, COWORKING_TYPE),
        gte(events.date, todayAms()),
        inArray(events.status, ["proposed", "confirmed"])
      )
    )
    .orderBy(asc(events.date));
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
          <Card className="mb-4 space-y-2">
            <h2>Co-working days</h2>
            {organising.map((e) => (
              <div
                key={e.id}
                className="flex items-center justify-between gap-3 flex-wrap text-sm"
              >
                <span>
                  <Icon name="target-arrow" className="mr-1 text-teal-700" />
                  {e.title} · {formatDay(e.date)}{" "}
                  {e.status === "proposed" ? (
                    <Badge>awaiting confirmation</Badge>
                  ) : (
                    <Badge tone="teal">yours to run</Badge>
                  )}
                </span>
                {e.status === "confirmed" && (
                  <Link
                    href={`/events/${e.id}/guests`}
                    className="text-teal-700 underline"
                  >
                    Manage guests
                  </Link>
                )}
              </div>
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
