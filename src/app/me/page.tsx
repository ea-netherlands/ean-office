import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { Nav } from "@/components/nav";
import { Page, H1, Sub, Card, Badge } from "@/components/ui";
import { db, bookings } from "@/db";
import { and, eq, gte, inArray, asc } from "drizzle-orm";
import { todayAms, formatDayLong } from "@/lib/dates";
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
        <MeClient
          upcoming={upcoming.map((b) => ({
            id: b.id,
            date: b.date,
            dateLabel: formatDayLong(b.date),
            seatType: b.seatType,
            status: b.status as "booked" | "waitlisted",
            seriesId: b.seriesId,
          }))}
          user={{
            name: user.name,
            noshowEmailOptOut: user.noshowEmailOptOut,
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
