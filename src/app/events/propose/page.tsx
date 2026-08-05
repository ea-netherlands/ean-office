import { redirect } from "next/navigation";
import { and, gte, lte, ne } from "drizzle-orm";
import { getCurrentUser, isActiveMember } from "@/lib/auth";
import { Nav } from "@/components/nav";
import { Page, H1, Sub } from "@/components/ui";
import { ProposeForm } from "./propose-form";
import { db, events } from "@/db";
import { addDays, todayAms } from "@/lib/dates";
import type { Availability } from "./availability-calendar";

export const dynamic = "force-dynamic";

const LOOKAHEAD_WEEKS = 8;

async function getAvailability(): Promise<Availability[]> {
  const from = todayAms();
  const to = addDays(from, LOOKAHEAD_WEEKS * 7);

  const upcoming = await db
    .select({
      date: events.date,
      title: events.title,
      status: events.status,
    })
    .from(events)
    .where(and(gte(events.date, from), lte(events.date, to), ne(events.status, "declined")));

  // Proposed events stay invisible to other members until an admin confirms
  // them, so we only ever surface a generic "pending" marker for those dates
  // — never the title or who proposed it.
  const byDate = new Map<string, Availability>();
  for (const e of upcoming) {
    const status = e.status === "confirmed" ? "confirmed" : "pending";
    const existing = byDate.get(e.date);
    if (!existing || (status === "confirmed" && existing.status !== "confirmed")) {
      byDate.set(e.date, {
        date: e.date,
        status,
        title: status === "confirmed" ? e.title : null,
      });
    }
  }
  return Array.from(byDate.values());
}

export default async function ProposeEventPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/events/propose");
  if (user.status === "imported") redirect("/welcome");
  if (!isActiveMember(user)) redirect("/");

  const availability = await getAvailability();

  return (
    <>
      <Nav user={user} />
      <Page>
        <H1>Propose an event</H1>
        <Sub>
          Members can host EA-aligned events at the office outside office hours
          — reading groups, discussions, workshops, talks, socials. Tell us
          what you have in mind and an admin will come back to you.
        </Sub>
        <ProposeForm availability={availability} />
      </Page>
    </>
  );
}
