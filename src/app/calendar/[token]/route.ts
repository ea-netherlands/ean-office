import { db, bookings, ensureMigrated } from "@/db";
import { and, asc, eq, inArray } from "drizzle-orm";
import { verifyToken } from "@/lib/tokens";
import { getSettings } from "@/lib/settings";
import { bookingIcs } from "@/lib/booking-calendar";

export const dynamic = "force-dynamic";

/**
 * The "add to your calendar" link in booking emails. The .ics is also
 * attached to those emails, but phone mail clients hide attachments often
 * enough that the link is the one that actually gets used.
 *
 * The token is single-purpose, as everywhere else here: it hands back one
 * calendar file and never a session. Safe for email scanners to prefetch —
 * a GET here reads and changes nothing.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  await ensureMigrated();
  const { token: raw } = await params;
  // Next matches the whole segment, so the ".ics" that makes clients treat
  // this as a calendar file arrives glued to the token.
  const token = raw.replace(/\.ics$/, "");
  const verified = verifyToken(token, "calendar");
  if (!verified) {
    return new Response("This calendar link has expired.", {
      status: 410,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }

  const [kind, id] = [verified.subject.slice(0, 1), verified.subject.slice(2)];
  const rows =
    kind === "s"
      ? await db
          .select()
          .from(bookings)
          .where(and(eq(bookings.seriesId, id), inArray(bookings.status, ["booked", "waitlisted"])))
          .orderBy(asc(bookings.date))
      : await db.select().from(bookings).where(eq(bookings.id, id));

  const live = rows.filter((b) => b.status !== "cancelled");
  if (live.length === 0) {
    return new Response("That booking has been cancelled.", {
      status: 404,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }

  const cfg = await getSettings();
  return new Response(bookingIcs(live, cfg), {
    headers: {
      "content-type": "text/calendar; charset=utf-8",
      "content-disposition": `attachment; filename="ea-office.ics"`,
      "cache-control": "no-store",
    },
  });
}
