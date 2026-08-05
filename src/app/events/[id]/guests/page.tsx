import { redirect, notFound } from "next/navigation";
import { db, events, eventGuests, users } from "@/db";
import { eq, desc } from "drizzle-orm";
import { getCurrentUser, isAdmin } from "@/lib/auth";
import { Nav } from "@/components/nav";
import { Page, H1, Sub } from "@/components/ui";
import { formatDayLong } from "@/lib/dates";
import { GuestsClient, GuestRow } from "./guests-client";

export const dynamic = "force-dynamic";

export default async function EventGuestsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=/events/${id}/guests`);

  const [event] = await db.select().from(events).where(eq(events.id, id));
  if (!event) notFound();

  const canManage = isAdmin(user) || event.createdBy === user.id;
  if (!canManage) redirect("/");

  const rows = await db
    .select({ g: eventGuests, u: users })
    .from(eventGuests)
    .innerJoin(users, eq(users.id, eventGuests.userId))
    .where(eq(eventGuests.eventId, id))
    .orderBy(desc(eventGuests.createdAt));

  const guests: GuestRow[] = rows.map((r) => ({
    id: r.g.id,
    name: r.u.name,
    email: r.u.email,
    status: r.g.status,
    accessibilityNotes: r.g.accessibilityNotes,
    createdAt: r.g.createdAt.toISOString(),
  }));

  return (
    <>
      <Nav user={user} />
      <Page>
        <H1>{event.title}</H1>
        <Sub>
          {formatDayLong(event.date)} · requests to join — approve who&apos;s
          coming, decline the rest.
        </Sub>
        <GuestsClient guests={guests} />
      </Page>
    </>
  );
}
