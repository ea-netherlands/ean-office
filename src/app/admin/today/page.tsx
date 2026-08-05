import { db, bookings, checkins, users } from "@/db";
import { and, eq, inArray } from "drizzle-orm";
import { Page, H1, Sub, Card, Badge, Avatar } from "@/components/ui";
import { todayAms, formatDayLong, formatInstant } from "@/lib/dates";
import { asSlot, halves, SLOT_LABEL } from "@/lib/slots";
import { getSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

export default async function AdminTodayPage() {
  const today = todayAms();
  const cfg = await getSettings();

  const rows = await db
    .select({ b: bookings, u: users })
    .from(bookings)
    .innerJoin(users, eq(users.id, bookings.userId))
    .where(
      and(eq(bookings.date, today), inArray(bookings.status, ["booked", "waitlisted"]))
    );
  const todayCheckins = await db
    .select({ c: checkins, u: users })
    .from(checkins)
    .innerJoin(users, eq(users.id, checkins.userId))
    .where(eq(checkins.date, today));

  const checkinByUser = new Map(todayCheckins.map((c) => [c.c.userId, c.c]));
  const booked = rows.filter((r) => r.b.status === "booked");
  const waitlisted = rows.filter((r) => r.b.status === "waitlisted");
  // Morning and afternoon fill up independently, so report them that way.
  const desksIn = (half: "am" | "pm") =>
    booked.filter(
      (r) => r.b.seatType === "desk" && halves(asSlot(r.b.slot)).includes(half)
    ).length;
  const splitDesks = desksIn("am") !== desksIn("pm");
  // Two half bookings by one person are one body in the room.
  const peopleBooked = new Set(booked.map((r) => r.b.userId));
  const checkedInCount = new Set(
    booked.filter((r) => checkinByUser.has(r.b.userId)).map((r) => r.b.userId)
  ).size;

  return (
    <Page wide>
      <H1>Today</H1>
      <Sub>{formatDayLong(today)}</Sub>

      <div className="grid grid-cols-3 gap-3 mb-5">
        <Stat
          label={splitDesks ? "Desks booked (AM · PM)" : "Desks booked"}
          value={
            splitDesks
              ? `${desksIn("am")} · ${desksIn("pm")}/${cfg.desk_count}`
              : `${desksIn("am")}/${cfg.desk_count}`
          }
        />
        <Stat label="Checked in" value={`${checkedInCount}/${peopleBooked.size}`} />
        <Stat label="Waitlist" value={String(waitlisted.length)} />
      </div>

      <Card>
        <h2 className="mb-3">Who&apos;s in</h2>
        {booked.length === 0 ? (
          <p className="text-sm text-slate-500">No bookings today.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {booked.map((r) => {
              const ci = checkinByUser.get(r.b.userId);
              return (
                <li key={r.b.id} className="py-2.5 flex items-center gap-3">
                  <Avatar name={r.u.name} />
                  <div className="flex-1">
                    <p className="text-sm font-medium">
                      {r.u.name}{" "}
                      {r.b.seatType === "flex" ? (
                        <Badge tone="amber">lunch table</Badge>
                      ) : r.b.deskNumber ? (
                        <Badge tone="teal">desk {r.b.deskNumber}</Badge>
                      ) : null}
                      {asSlot(r.b.slot) !== "day" && (
                        <Badge tone="stone">{SLOT_LABEL[asSlot(r.b.slot)]}</Badge>
                      )}
                      {r.b.source === "walkin" && <Badge tone="indigo">walk-in</Badge>}
                      {r.b.source === "block" && <Badge>repeating</Badge>}
                    </p>
                    <p className="text-xs text-slate-400">{r.u.email}</p>
                  </div>
                  {ci ? (
                    <Badge tone="green">
                      in at {formatInstant(ci.checkedInAt).split(", ").pop()}
                    </Badge>
                  ) : (
                    <Badge tone="stone">not yet</Badge>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        {waitlisted.length > 0 && (
          <>
            <h3 className="font-medium text-sm mt-4 mb-2 text-slate-500">Waitlist</h3>
            <ul className="text-sm text-slate-600">
              {waitlisted.map((r) => (
                <li key={r.b.id}>{r.u.name}</li>
              ))}
            </ul>
          </>
        )}
      </Card>
    </Page>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-3 text-center">
      <p className="text-2xl font-bold">{value}</p>
      <p className="text-xs text-slate-500">{label}</p>
    </div>
  );
}
